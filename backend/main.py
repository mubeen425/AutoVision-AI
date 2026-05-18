"""
Gemini proxy: uses google-generativeai from your venv (same stack as scripts/test_gemini_key.py).
Run from repo root: python -m uvicorn backend.main:app --reload --port 8000
"""
from __future__ import annotations

import base64
import json
import os
import re
import time
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import google.generativeai as genai  # noqa: E402

DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_FALLBACK_MODELS = ["gemini-2.5-flash-lite"]
MAX_ATTEMPTS_PER_MODEL = 3
BASE_DELAY_MS = 900

SYSTEM_PROMPT = """You are an expert at identifying vehicles from photos. Analyze the image and respond with ONLY valid JSON (no markdown fences).

If the image is unusable or not a single car listing, use one of these error codes in this exact shape:
{"error":"unclear_image","error_message":"brief reason"}
{"error":"partial_car","error_message":"brief reason"}
{"error":"multiple_cars","error_message":"brief reason"}
{"error":"not_a_car","error_message":"brief reason"}
{"error":"no_match","error_message":"brief reason"}
{"error":"unsupported_format","error_message":"brief reason"}

Use multiple_cars ONLY when analyzing a SINGLE image where two or more unrelated vehicles are both clearly main subjects in the same frame. Do NOT use multiple_cars for multi-photo uploads: when several images are sent in one request, you must always return one merged vehicle JSON (see appended multi-image instructions).

Use partial_car when the vehicle is heavily cropped, only half (or a small part) of the car is visible, or too little of the car is shown to identify make/model/year reliably. Prefer partial_car over guessing when the subject is not sufficiently in frame.

For a successful identification, use this shape (omit unknown strings as null; numbers as numbers; confidence per field: "confirmed", "estimated", or "unknown"):
{
  "make": "string or null",
  "model": "string or null (primary nameplate / model family, e.g. Civic, Corolla, Z4)",
  "year": "string or null (single year like '2021' or range like '2019-2021')",
  "trim": "string or null (refine variant / package: e.g. LX, Touring, M Sport — from badging when visible)",
  "body_style": "string or null (e.g. Sedan, SUV, Hatchback, Coupe, Roadster, Truck)",
  "exterior_color": "string or null",
  "fuel_type": "string or null (e.g. Petrol, Diesel, Electric, Hybrid, Plug-in hybrid)",
  "transmission": "string or null (e.g. Automatic, Manual, CVT, DCT — use interior/paddles/shifter if visible; else typical for this model or unknown)",
  "engine_displacement": "string or null (e.g. '2.0 L', '1998 cc' from rear badge or typical engine for trim; else estimated or null)",
  "drivetrain": "string or null (e.g. FWD, RWD, AWD, 4WD — from badges like quattro/4MATIC/xDrive when visible; else typical or unknown)",
  "door_count": "string or null (e.g. '2', '4', '5-door' from visible doors/body style)",
  "seat_count": "string or null (e.g. '2', '5', '7' — infer from body type when interior not visible)",
  "estimated_price_thb": number,
  "estimated_price_min_thb": number or null (optional low end of rough range; null if giving only a point estimate)",
  "estimated_price_max_thb": number or null (optional high end of rough range; null if giving only a point estimate)",
  "notes": "short optional note",
  "confidence": {
    "make": "confirmed|estimated|unknown",
    "model": "confirmed|estimated|unknown",
    "year": "confirmed|estimated|unknown",
    "trim": "confirmed|estimated|unknown",
    "body_style": "confirmed|estimated|unknown",
    "exterior_color": "confirmed|estimated|unknown",
    "fuel_type": "confirmed|estimated|unknown",
    "transmission": "confirmed|estimated|unknown",
    "engine_displacement": "confirmed|estimated|unknown",
    "drivetrain": "confirmed|estimated|unknown",
    "door_count": "confirmed|estimated|unknown",
    "seat_count": "confirmed|estimated|unknown",
    "estimated_price_thb": "confirmed|estimated|unknown",
    "estimated_price_min_thb": "confirmed|estimated|unknown",
    "estimated_price_max_thb": "confirmed|estimated|unknown"
  }
}

Infer fuel_type, transmission, drivetrain, engine_displacement, door_count, and seat_count from the photo when possible; otherwise infer from the identified make/model/year for the Thailand used-car market and set confidence to "estimated" or "unknown". Transmission is often unknown from exterior-only photos — prefer "unknown" over wild guesses.

For estimated_price_thb you MUST always provide a point estimate in Thai Baht (THB) for the Thailand used-car market. Optionally set estimated_price_min_thb and estimated_price_max_thb to a plausible range when uncertain; use null for min/max when you only give a single point estimate.

Never output Pakistani Rupee (PKR), "Rs", or any field named estimated_price_pkr / estimated_price_min_pkr / estimated_price_max_pkr. All prices must be plain numbers in THB only (typical used-car baht amounts in Thailand)."""


MULTI_IMAGE_INSTRUCTION = """The user uploaded MULTIPLE photos in one request. They want ONE combined listing for a SINGLE vehicle, using every angle to improve accuracy.

You MUST return the successful identification JSON shape (one vehicle only). NEVER return error code "multiple_cars" for this request — even if one photo shows a different car, a background vehicle, or angles that do not match.

How to handle mismatch or mixed content:
- Pick the PRIMARY vehicle: prefer the clearest image, the subject that appears across most images, or the vehicle that is centered / largest in frame.
- Merge fields where images agree; when they conflict, choose the best-supported value and set confidence to "estimated" or "unknown" for that field.
- Use "notes" briefly if helpful (e.g. mixed angles or one frame that may show another car).

Raise field confidence toward "confirmed" when make/model/trim/badge/plate or interior details are clear in any image."""


def _api_keys() -> list[str]:
    """Ordered unique keys.

    Order: GEMINI_API_KEYS (comma/whitespace), then GEMINI_API_KEY, then
    VITE_GEMINI_API_KEY (same as first key — legacy / shared .env name),
    then GEMINI_API_KEY_2 … GEMINI_API_KEY_5. On 429 / quota, the next key is tried.
    """
    keys: list[str] = []
    raw = (os.environ.get("GEMINI_API_KEYS") or "").strip()
    if raw:
        for part in re.split(r"[\s,]+", raw):
            k = part.strip()
            if k and k not in keys:
                keys.append(k)
    for env_name in (
        "GEMINI_API_KEY",
        "VITE_GEMINI_API_KEY",
        "GEMINI_API_KEY_2",
        "GEMINI_API_KEY_3",
        "GEMINI_API_KEY_4",
        "GEMINI_API_KEY_5",
    ):
        k = (os.environ.get(env_name) or "").strip()
        if k and k not in keys:
            keys.append(k)
    return keys


def _model_ids() -> list[str]:
    primary = (os.environ.get("GEMINI_MODEL") or os.environ.get("VITE_GEMINI_MODEL") or "").strip() or DEFAULT_MODEL
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


def _is_rate_limit(msg: str) -> bool:
    return bool(re.search(r"\b429\b", msg) or re.search(r"Resource exhausted", msg, re.I))


def _is_transient(msg: str) -> bool:
    """Retry same key+model on these failures (backoff inside _generate_with_retries)."""
    return bool(
        re.search(r"\b503\b", msg)
        or _is_rate_limit(msg)
        or re.search(r"high demand", msg, re.I)
        or re.search(r"overloaded", msg, re.I)
        or re.search(r"unavailable", msg, re.I)
    )


def _classify(msg: str) -> str | None:
    if _is_rate_limit(msg):
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


def _extract_json(text: str) -> dict:
    t = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", t)
    raw = fence.group(1).strip() if fence else t
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("PARSE_ERROR")
    return json.loads(raw[start : end + 1])


_LEGACY_PKR_PRICE_KEYS = frozenset(
    {
        "estimated_price_pkr",
        "estimated_price_min_pkr",
        "estimated_price_max_pkr",
    }
)


def _strip_legacy_pkr_price_keys(data: dict) -> None:
    """Drop PKR field names from successful listings; API is Thailand (THB) only."""
    for k in _LEGACY_PKR_PRICE_KEYS:
        data.pop(k, None)
    conf = data.get("confidence")
    if isinstance(conf, dict):
        for k in _LEGACY_PKR_PRICE_KEYS:
            conf.pop(k, None)


def _generate_with_retries(model: genai.GenerativeModel, parts: list) -> object:
    last_err: Exception | None = None
    for attempt in range(MAX_ATTEMPTS_PER_MODEL):
        try:
            return model.generate_content(parts)
        except Exception as e:
            last_err = e
            msg = str(e)
            if not _is_transient(msg) or attempt == MAX_ATTEMPTS_PER_MODEL - 1:
                raise
            time.sleep(BASE_DELAY_MS * (2**attempt) / 1000.0)
    assert last_err is not None
    raise last_err


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


app = FastAPI(title="Car Vision API")
# Allow any browser origin (e.g. Vercel, Netlify, localhost, custom domains) to call
# this API from the deployed Render URL. Do not set allow_credentials=True with "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    """So the service URL in a browser is not a bare 404 — only /api/* are API routes."""
    return {
        "service": "Car Vision API",
        "docs": "/docs",
        "health": "GET /api/health",
        "analyze": "POST /api/analyze",
    }


@app.get("/api/health")
def health():
    keys = _api_keys()
    models = _model_ids()
    return {
        "ok": True,
        "has_key": bool(keys),
        "key_count": len(keys),
        "primary_model": models[0] if models else DEFAULT_MODEL,
        "model_count": len(models),
    }


MAX_IMAGES_PER_REQUEST = 5


def _collect_image_parts(body: AnalyzeBody) -> tuple[list[dict], bool]:
    """Return (parts, is_multi). Raises HTTPException for client errors."""
    candidates: list[AnalyzeImage] = []
    if body.images:
        candidates = list(body.images)
    elif body.base64:
        candidates = [AnalyzeImage(base64=body.base64, mimeType=body.mimeType or "image/jpeg")]
    if not candidates:
        raise HTTPException(status_code=400, detail="no_image")
    if len(candidates) > MAX_IMAGES_PER_REQUEST:
        raise HTTPException(status_code=400, detail="too_many_images")

    parts: list[dict] = []
    for img in candidates:
        try:
            raw = base64.b64decode(img.base64, validate=True)
        except Exception:
            raise HTTPException(status_code=400, detail="invalid_base64")
        mime = img.mimeType or "image/jpeg"
        parts.append({"mime_type": mime, "data": raw})
    return parts, len(parts) > 1


@app.post("/api/analyze")
def analyze(body: AnalyzeBody):
    keys = _api_keys()
    if not keys:
        return {"error": "API_KEY_MISSING", "error_message": "Set GEMINI_API_KEY (or VITE_GEMINI_API_KEY) in .env"}

    image_parts, is_multi = _collect_image_parts(body)

    prompt = SYSTEM_PROMPT + ("\n\n" + MULTI_IMAGE_INSTRUCTION if is_multi else "")
    parts: list = [prompt, *image_parts]

    last_err: Exception | None = None
    for api_key in keys:
        genai.configure(api_key=api_key)
        for model_id in _model_ids():
            try:
                model = genai.GenerativeModel(model_id)
                response = _generate_with_retries(model, parts)
                text = (response.text or "").strip()
                if not text:
                    raise ValueError("PARSE_ERROR")
                try:
                    data = _extract_json(text)
                except Exception:
                    return {"error": "PARSE_ERROR", "error_message": "Could not parse model JSON."}

                if isinstance(data, dict) and data.get("error"):
                    return data
                if isinstance(data, dict):
                    if not isinstance(data.get("confidence"), dict):
                        data["confidence"] = {}
                    _strip_legacy_pkr_price_keys(data)
                    return data
                return {"error": "PARSE_ERROR", "error_message": "Unexpected response shape."}
            except Exception as e:
                last_err = e
                msg = str(e)
                if _is_rate_limit(msg):
                    break
                if _is_transient(msg):
                    continue
                code = _classify(msg)
                if code:
                    return {"error": code, "error_message": msg}
                return {"error": "PARSE_ERROR", "error_message": msg}

    code = _classify(str(last_err)) if last_err else None
    return {
        "error": code or "SERVICE_UNAVAILABLE",
        "error_message": str(last_err) if last_err else "All models failed.",
    }
