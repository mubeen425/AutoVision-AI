"""
Shared Vertex AI Gemini client utilities.

Holds the reusable, vehicle-agnostic plumbing (project/region resolution,
model selection, retry/backoff, JSON extraction, image collection) so that
both the vehicle-analysis endpoint and the feature-detection service can
share one battle-tested Gemini code path.

Runs with Application Default Credentials (ADC):
  - Cloud Run: service account attached to the service (no API key).
  - Local: `gcloud auth application-default login` and set project/region in .env.
"""
from __future__ import annotations

import base64
import json
import os
import random
import re
import time
from typing import Any

from fastapi import HTTPException
from google.api_core import exceptions as google_exceptions
from pydantic import BaseModel, Field

import vertexai
from vertexai.generative_models import GenerationConfig, GenerativeModel, Part

DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_FALLBACK_MODELS = ["gemini-2.5-flash-lite"]
DEFAULT_VERTEX_LOCATION = "us-central1"
# Backup regions tried in order when the primary region is overloaded.
# Override via VERTEX_AI_FALLBACK_LOCATIONS env var (comma-separated).
DEFAULT_FALLBACK_LOCATIONS = ["us-east4", "asia-northeast1"]
MAX_ATTEMPTS_PER_MODEL = 4
BASE_DELAY_MS = 1500
MAX_IMAGES_PER_REQUEST = 20

_vertex_initialized = False
_project_id_cache: str | None = None


def _project_from_metadata() -> str:
    """GCP metadata server (Cloud Run, GCE, Cloud Functions)."""
    import urllib.error
    import urllib.request

    req = urllib.request.Request(
        "http://metadata.google.internal/computeMetadata/v1/project/project-id",
        headers={"Metadata-Flavor": "Google"},
    )
    try:
        with urllib.request.urlopen(req, timeout=2) as resp:
            return resp.read().decode().strip()
    except (urllib.error.URLError, OSError, TimeoutError):
        return ""


def vertex_project_id() -> str:
    """GCP project ID: env vars, then ADC, then metadata (Cloud Run)."""
    global _project_id_cache
    if _project_id_cache:
        return _project_id_cache

    for key in (
        "VERTEX_AI_PROJECT_ID",
        "GOOGLE_CLOUD_PROJECT",
        "GCP_PROJECT",
        "GCLOUD_PROJECT",
        "PROJECT_ID",
    ):
        v = (os.environ.get(key) or "").strip()
        if v:
            _project_id_cache = v
            return v

    try:
        import google.auth

        _, project = google.auth.default()
        if project:
            _project_id_cache = project
            return project
    except Exception:
        pass

    meta = _project_from_metadata()
    if meta:
        _project_id_cache = meta
        return meta

    return ""


def vertex_location() -> str:
    loc = (os.environ.get("VERTEX_AI_LOCATION") or os.environ.get("GOOGLE_CLOUD_REGION") or "").strip()
    return loc or DEFAULT_VERTEX_LOCATION


def vertex_locations() -> list[str]:
    """Return [primary_region, *fallback_regions] to try in order.

    Set VERTEX_AI_FALLBACK_LOCATIONS (comma-separated) to override the
    fallback list, e.g. 'us-east4,europe-west1'.
    """
    primary = vertex_location()
    raw_fallbacks = (os.environ.get("VERTEX_AI_FALLBACK_LOCATIONS") or "").strip()
    if raw_fallbacks:
        fallbacks = [r.strip() for r in raw_fallbacks.split(",") if r.strip()]
    else:
        fallbacks = list(DEFAULT_FALLBACK_LOCATIONS)
    # Deduplicate while preserving order; primary is always first.
    seen: set[str] = {primary}
    ordered: list[str] = [primary]
    for loc in fallbacks:
        if loc not in seen:
            seen.add(loc)
            ordered.append(loc)
    return ordered


def ensure_vertex_initialized() -> tuple[str, str] | None:
    """Return (project_id, location) after init, or None if project is missing."""
    global _vertex_initialized
    project = vertex_project_id()
    location = vertex_location()
    if not project:
        return None
    if not _vertex_initialized:
        vertexai.init(project=project, location=location)
        _vertex_initialized = True
    return (project, location)


def model_ids() -> list[str]:
    primary = (os.environ.get("GEMINI_MODEL") or os.environ.get("VERTEX_GEMINI_MODEL") or os.environ.get("VITE_GEMINI_MODEL") or "").strip() or DEFAULT_MODEL
    extra = [
        s.strip()
        for s in (os.environ.get("GEMINI_FALLBACK_MODELS") or os.environ.get("VITE_GEMINI_FALLBACK_MODELS") or "").split(",")
        if s.strip()
    ]
    ordered = [primary, *extra, *DEFAULT_FALLBACK_MODELS]
    seen: set[str] = set()
    out: list[str] = []
    for m in ordered:
        if m not in seen:
            seen.add(m)
            out.append(m)
    return out


def is_rate_limit(msg: str) -> bool:
    return bool(re.search(r"\b429\b", msg) or re.search(r"Resource exhausted", msg, re.I))


def is_transient(msg: str) -> bool:
    """Retry same model on these failures (backoff inside generate_with_retries)."""
    return bool(
        re.search(r"\b503\b", msg)
        or is_rate_limit(msg)
        or re.search(r"high demand", msg, re.I)
        or re.search(r"overloaded", msg, re.I)
        or re.search(r"unavailable", msg, re.I)
    )


def is_transient_exception(e: BaseException) -> bool:
    if isinstance(
        e,
        (
            google_exceptions.ResourceExhausted,
            google_exceptions.ServiceUnavailable,
            google_exceptions.DeadlineExceeded,
            google_exceptions.InternalServerError,
        ),
    ):
        return True
    return is_transient(str(e))


def classify(msg: str) -> str | None:
    if is_rate_limit(msg):
        return "RATE_LIMIT"
    if re.search(r"\b503\b", msg) or re.search(r"high demand", msg, re.I) or re.search(r"overloaded", msg, re.I):
        return "SERVICE_UNAVAILABLE"
    if (
        re.search(r"\b403\b", msg)
        or re.search(r"denied access", msg, re.I)
        or re.search(r"PERMISSION_DENIED", msg)
        or re.search(r"has been denied", msg, re.I)
    ):
        return "GEMINI_ACCESS_DENIED"
    return None


def extract_json(text: str) -> dict:
    t = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", t)
    raw = fence.group(1).strip() if fence else t
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("PARSE_ERROR")
    return json.loads(raw[start : end + 1])


def generate_with_retries(model: GenerativeModel, parts: list[Any]) -> Any:
    """Retry transient errors with exponential backoff + random jitter.

    Jitter (0–500 ms random offset) prevents multiple concurrent requests
    from thundering-herding the API at the exact same retry instant.
    """
    last_err: Exception | None = None
    for attempt in range(MAX_ATTEMPTS_PER_MODEL):
        try:
            return model.generate_content(parts)
        except Exception as e:
            last_err = e
            if not is_transient_exception(e) or attempt == MAX_ATTEMPTS_PER_MODEL - 1:
                raise
            base_wait = BASE_DELAY_MS * (2**attempt) / 1000.0
            jitter = random.uniform(0, 0.5)  # up to 500 ms random offset
            time.sleep(base_wait + jitter)
    assert last_err is not None
    raise last_err


def response_text_or_error(response: Any) -> tuple[str | None, dict | None]:
    """Vertex may block content; .text can raise ValueError."""
    try:
        t = (response.text or "").strip()
        return t, None
    except ValueError as e:
        return None, {
            "error": "PARSE_ERROR",
            "error_message": f"Model output blocked or empty: {e!s}.",
        }


class AnalyzeImage(BaseModel):
    base64: str = Field(..., description="Raw base64, no data: URL prefix")
    mimeType: str = Field(default="image/jpeg")


class AnalyzeBody(BaseModel):
    # Legacy single-image fields (kept for back-compat with older frontends).
    base64: str | None = Field(default=None, description="Raw base64, no data: URL prefix")
    mimeType: str | None = Field(default=None)
    # New multi-image field: multiple photos of the SAME car.
    images: list[AnalyzeImage] | None = Field(
        default=None,
        description="Multiple photos of the same vehicle to fuse into one listing.",
    )


def collect_image_parts(body: AnalyzeBody) -> tuple[list[tuple[bytes, str]], bool]:
    """Return (list of (raw_bytes, mime_type), is_multi). Raises HTTPException for client errors."""
    candidates: list[AnalyzeImage] = []
    if body.images:
        candidates = list(body.images)
    elif body.base64:
        candidates = [AnalyzeImage(base64=body.base64, mimeType=body.mimeType or "image/jpeg")]
    if not candidates:
        raise HTTPException(status_code=400, detail="no_image")
    if len(candidates) > MAX_IMAGES_PER_REQUEST:
        raise HTTPException(status_code=400, detail="too_many_images")

    blobs: list[tuple[bytes, str]] = []
    for img in candidates:
        try:
            raw = base64.b64decode(img.base64, validate=True)
        except Exception:
            raise HTTPException(status_code=400, detail="invalid_base64")
        mime = img.mimeType or "image/jpeg"
        blobs.append((raw, mime))
    return blobs, len(blobs) > 1


def generate_json(
    prompt: str,
    image_blobs: list[tuple[bytes, str]],
    *,
    json_mode: bool = False,
    _location: str | None = None,
) -> dict:
    """Run the prompt + images through the model chain and return parsed JSON.

    On any failure returns an ``{"error": CODE, "error_message": str}`` dict so
    callers can branch on ``data.get("error")`` uniformly.

    When ``json_mode`` is true, requests structured JSON from the model (used by
    feature detection for more complete, parseable responses).

    Multi-region failover: if the primary Vertex AI region returns a transient
    error (503/overloaded), the call is automatically retried against each
    region in VERTEX_AI_FALLBACK_LOCATIONS before giving up.
    """
    parts: list[Any] = [prompt]
    for data, mime in image_blobs:
        parts.append(Part.from_data(data=data, mime_type=mime))

    generation_config = (
        GenerationConfig(response_mime_type="application/json") if json_mode else None
    )

    # Determine which regions to try.  When called recursively for a specific
    # region (_location is set) we skip the outer loop.
    locations_to_try = [_location] if _location else vertex_locations()
    project = vertex_project_id()

    last_err: Exception | None = None
    last_err_code: str | None = None

    for location in locations_to_try:
        # Re-initialise Vertex AI for this region (no-op if already initialised
        # with the same project/location, so repeated same-region calls are cheap).
        if project:
            vertexai.init(project=project, location=location)

        for model_id in model_ids():
            try:
                model = GenerativeModel(model_id, generation_config=generation_config)
                response = generate_with_retries(model, parts)
                text, block_err = response_text_or_error(response)
                if block_err is not None:
                    return block_err
                assert text is not None
                if not text:
                    raise ValueError("PARSE_ERROR")
                try:
                    return extract_json(text)
                except Exception:
                    return {"error": "PARSE_ERROR", "error_message": "Could not parse model JSON."}
            except Exception as e:
                last_err = e
                msg = str(e)
                code = classify(msg)
                if is_rate_limit(msg):
                    # Rate limits are project-wide; no point trying other models
                    # in this region, but do try fallback regions.
                    last_err_code = "RATE_LIMIT"
                    break
                if is_transient_exception(e):
                    # Transient: try next model in same region first.
                    last_err_code = "SERVICE_UNAVAILABLE"
                    continue
                if code:
                    # Non-retryable classified error (e.g. GEMINI_ACCESS_DENIED).
                    return {"error": code, "error_message": msg}
                return {"error": "PARSE_ERROR", "error_message": msg}

    # All regions and models exhausted.
    return {
        "error": last_err_code or "SERVICE_UNAVAILABLE",
        "error_message": str(last_err) if last_err else "All models and regions failed.",
    }
