"""
Background enhancement for car photos (Vertex AI — Gemini 3.1/3.5 Image).

Pipeline:
  1. Classify each image (cheap flash model) — enhance every car listing photo
     with a replaceable background; skip non-car, cabin interior, and engine-bay photos.
  2. Every batch uses ONE locked minimalist light photo booth (seamless off-white cyclorama, polished light-gray floor).
  3. First enhanced photo becomes a visual reference so all angles share the
     same booth, floor, walls, and lighting.
  4. Identity-locked prompt keeps the car pixel-faithful (angle, paint, plate,
     badges, wheels, damage) while only the surroundings change.

Image generation uses the google-genai SDK against Vertex AI. The vehicle-analysis
and feature-detection code keep using the older ``vertexai`` SDK untouched.

Runs with Application Default Credentials (ADC):
  - Cloud Run: service account attached to the service (no API key).
  - Local: `gcloud auth application-default login` and set project/region in .env.
"""
from __future__ import annotations

import base64
import io
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

logger = logging.getLogger(__name__)

from backend.gemini_client import (
    generate_json,
    is_transient_exception,
    vertex_location,
    vertex_project_id,
)

DEFAULT_ENHANCE_MODEL = "gemini-3-pro-image-preview"
MAX_ENHANCE_ATTEMPTS = 8
ENHANCE_BASE_DELAY_MS = 2500
RATE_LIMIT_COOLDOWN_SEC = 30.0  # How long ALL images pause after any 429 hit

# Global rate-limit gate: when ANY enhance call hits a 429, we set this to
# a future timestamp and every subsequent enhance call sleeps until it passes.
import threading as _threading
_rl_lock = _threading.Lock()
_rate_limit_until: float = 0.0  # epoch seconds


def enhance_model_id() -> str:
    return (
        os.environ.get("ENHANCE_IMAGE_MODEL")
        or os.environ.get("VERTEX_ENHANCE_IMAGE_MODEL")
        or ""
    ).strip() or DEFAULT_ENHANCE_MODEL


def enhance_location() -> str:
    """Primary region for the image model. Defaults to 'global' for Gemini models or analysis region for others."""
    env_loc = (os.environ.get("ENHANCE_IMAGE_LOCATION") or "").strip()
    if env_loc:
        return env_loc
    if enhance_model_id().startswith("gemini-"):
        return "global"
    return vertex_location()


def enhance_locations() -> list[str]:
    """All regions to spread image-enhancement load across, in order.

    Set ENHANCE_IMAGE_FALLBACK_LOCATIONS (comma-separated) to add more regions.
    Each region has its own independent Vertex AI image-generation quota pool, so
    distributing 6 images across 3 regions means only 2 requests per region —
    eliminating 429 RESOURCE_EXHAUSTED errors on large batches.

    Example env var: ENHANCE_IMAGE_FALLBACK_LOCATIONS=us-east4
    """
    primary = enhance_location()
    raw = (os.environ.get("ENHANCE_IMAGE_FALLBACK_LOCATIONS") or "").strip()
    if raw:
        fallbacks = [r.strip() for r in raw.split(",") if r.strip()]
    elif enhance_model_id().startswith("gemini-"):
        # For Gemini models, do not default to us-east4 fallback as it may not support the model.
        fallbacks = []
    else:
        fallbacks = ["us-east4"]
        
    seen: set[str] = {primary}
    regions: list[str] = [primary]
    for r in fallbacks:
        if r not in seen:
            seen.add(r)
            regions.append(r)
    return regions


def enhance_concurrency() -> int:
    """Default 2 (parallel across regions) — safe since we alternate regions.
    Set ENHANCE_CONCURRENCY=2 only after verifying quota in GCP Console."""
    try:
        n = int(os.environ.get("ENHANCE_CONCURRENCY", "2"))
    except ValueError:
        n = 2
    return max(1, min(n, 3))


def _enhance_max_input_side() -> int:
    try:
        return max(640, min(int(os.environ.get("ENHANCE_MAX_INPUT_SIDE", "1280")), 2048))
    except ValueError:
        return 1280


def _enhance_max_reference_side() -> int:
    try:
        return max(384, min(int(os.environ.get("ENHANCE_MAX_REFERENCE_SIDE", "640")), 1024))
    except ValueError:
        return 640


def _enhance_temperature() -> float:
    """Low default temperature so the edit stays faithful to the input car."""
    try:
        t = float(os.environ.get("ENHANCE_TEMPERATURE", "0.2"))
    except ValueError:
        t = 0.2
    return max(0.0, min(t, 1.0))


def _inter_enhance_delay_sec() -> float:
    """Pause between image-model calls — critical to avoid 429 RESOURCE_EXHAUSTED.
    Lowered default to 4s (was 8s). Increase via ENHANCE_INTER_REQUEST_SEC if you hit
    rate limits; decrease if you have a quota increase approved in GCP."""
    try:
        return max(1.0, float(os.environ.get("ENHANCE_INTER_REQUEST_SEC", "4")))
    except ValueError:
        return 4.0


def _preflight_delay_sec() -> float:
    """Pause after classify/plan and before the first image-model call.
    Lowered to 1s (was 3s) since classify and enhance now run in separate quota pools."""
    try:
        return max(0.0, float(os.environ.get("ENHANCE_PREFLIGHT_SEC", "1")))
    except ValueError:
        return 1.0





def _is_rate_limited(exc: BaseException) -> bool:
    msg = str(exc).upper()
    return (
        "429" in msg
        or "RESOURCE_EXHAUSTED" in msg
        or "RATE_LIMIT" in msg
        or "QUOTA" in msg
    )


def _enhance_backoff_sec(attempt: int, exc: BaseException) -> float:
    """Longer backoff for 429 — Vertex image quotas need 20-60s cooldown, not milliseconds."""
    if _is_rate_limited(exc):
        # Exponential starting at 20s: 20, 40, 60, 60, 60 ...
        return min(20.0 * (2**attempt), 60.0)
    return ENHANCE_BASE_DELAY_MS * (2**attempt) / 1000.0


def _wait_for_rate_limit_cooldown() -> None:
    """Block the calling thread until the global rate-limit cooldown expires."""
    global _rate_limit_until
    with _rl_lock:
        wait = _rate_limit_until - time.time()
    if wait > 0:
        logger.info("rate-limit gate: waiting %.1fs before next enhance call", wait)
        time.sleep(wait)


def _signal_rate_limited() -> None:
    """Record that a 429 was just hit; all threads will pause until cooldown passes."""
    global _rate_limit_until
    with _rl_lock:
        # Only extend the window, never shorten it.
        new_until = time.time() + RATE_LIMIT_COOLDOWN_SEC
        if new_until > _rate_limit_until:
            _rate_limit_until = new_until
            logger.warning("rate-limit gate set: all enhances paused for %.0fs", RATE_LIMIT_COOLDOWN_SEC)





_CLASSIFY_PROMPT = """Classify this image for a car-listing BACKGROUND enhancer (dealership uploads).

Return ONLY valid JSON (no markdown fences):
{"is_car": true, "should_enhance": true, "view": "short label"}

Rules:
- is_car: true if a car / vehicle is the main subject.
- should_enhance: true for exterior listing photos where background clutter can be replaced
  behind/around the car — front, rear, side, 3/4, wheel or badge shots with replaceable
  surroundings, partial exterior views, and slightly awkward angles. When in doubt on an
  exterior shot, set should_enhance to true.
- should_enhance: false for engine bay / under-hood / open-hood engine photos (engine,
  hoses, bay walls — keep these unchanged), pure cabin/interior shots (dashboard, seats,
  steering wheel, center console), open trunk/cargo interior, screenshots, documents,
  or images with no vehicle as the subject.
- view: short label e.g. "front_3q", "side", "rear", "engine_bay", "trunk", "detail",
  "interior", "other". Use "engine_bay" for any under-hood or engine close-up.
"""


_CLASSIFY_BATCH_PROMPT = """Classify ALL attached images (in upload order) for a car-listing BACKGROUND enhancer.

Image 1 = first attached image, image 2 = second, etc.

Return ONLY valid JSON (no markdown fences):
{"images": [
  {"index": 0, "is_car": true, "should_enhance": true, "view": "front_3q"},
  {"index": 1, "is_car": true, "should_enhance": true, "view": "rear"}
]}

Rules (same for every image):
- is_car: true if a car / vehicle is the main subject.
- should_enhance: true for exterior photos where background clutter can be replaced — front,
  rear, side, 3/4, exterior detail shots, partial exterior views. When in doubt on exterior,
  set should_enhance to true.
- should_enhance: false for engine bay / under-hood / open-hood engine photos, pure
  cabin/interior (dashboard, seats, steering wheel), trunk/cargo interior, screenshots,
  documents, or no vehicle subject.
- view: short label e.g. "front_3q", "side", "rear", "engine_bay", "interior", "other".
  Use "engine_bay" for any under-hood or engine close-up.
- Return exactly one entry per attached image with index 0 .. N-1.
"""





_ENHANCE_PROMPT_TEMPLATE = """Replace only the background.

Treat the vehicle as locked source content and generate only the background.

The car is a protected subject and must remain completely unchanged.

Do not modify, regenerate, redraw, recreate, relight, enhance, retouch, restore, repair, clean, sharpen, denoise, or alter any part of the vehicle.

Preserve all original vehicle details exactly as captured in the source image, including:

* badges and emblems
* decals and stickers
* license plates and text
* wheels and tires
* windows and glass
* mirrors and trim
* paint texture
* scratches
* dents
* damage
* dirt and dust
* imperfections

Preserve the vehicle's original appearance exactly.

Do not change:

* brightness
* exposure
* contrast
* colors
* white balance
* highlights
* reflections
* shadows
* shading gradients

No new reflections on the vehicle.

No new glare on the vehicle.

No new highlights on the vehicle.

No studio-light reflections on the vehicle.

No relighting of the vehicle.

No brightening or darkening of any part of the vehicle.

The vehicle must retain its original lighting and appearance exactly as captured in the source image, even if it appears inconsistent with the new environment.

Generate only the background outside the vehicle.

Do not modify any vehicle pixels.

Replace the existing background with a premium commercial light grey photo studio.

Studio requirements:

* seamless infinite light grey cyclorama
* completely solid light grey wall
* completely solid light grey floor
* pure light grey environment
* clean professional automotive photography studio
* no seams
* no tiles
* no grid lines
* no grout lines
* no visible light fixtures
* no visible softboxes
* no windows
* no props
* no furniture
* no wall details
* no background objects

The studio background should have soft, even illumination.

The background lighting must not affect the vehicle.

Do not cast new light onto the vehicle.

Do not alter existing reflections on the vehicle.

Add only:

* a subtle realistic contact shadow directly beneath the tires
* a very faint and highly diffused floor reflection beneath the vehicle

Keep these effects natural and minimal.

Do not create strong shadows.

Do not create strong reflections.

Maintain:

* original camera angle
* original vehicle position
* original vehicle scale
* original perspective

Keep the vehicle naturally centered and fully visible.

Do not crop the vehicle.

Do not rotate the vehicle.

Do not change the composition.

Output a photorealistic image in a strict 4:3 aspect ratio.

Final requirement:
Change the background only. Keep the vehicle completely unchanged."""

def _build_enhance_prompt() -> str:
    return _ENHANCE_PROMPT_TEMPLATE


def _parse_classify_entry(data: dict) -> dict:
    should = data.get("should_enhance")
    if should is None and data.get("is_exterior") is not None:
        should = data.get("is_exterior")
    return {
        "is_car": bool(data.get("is_car")) if data.get("is_car") is not None else None,
        "should_enhance": bool(should) if should is not None else True,
        "view": str(data.get("view") or "unknown"),
    }


def _default_classify_entry() -> dict:
    return {"is_car": None, "should_enhance": True, "view": "unknown"}


def classify_view(image_blob: tuple[bytes, str]) -> dict:
    """Return {"is_car": bool|None, "should_enhance": bool|None, "view": str}. Best-effort."""
    small = _prepare_image_blob(image_blob[0], image_blob[1], max_side=768)
    data = generate_json(_CLASSIFY_PROMPT, [small], json_mode=True)
    if not isinstance(data, dict) or data.get("error"):
        return _default_classify_entry()
    return _parse_classify_entry(data)


def classify_views(image_blobs: list[tuple[bytes, str]]) -> list[dict]:
    """Classify a batch in ONE flash call (saves quota vs per-image calls)."""
    if not image_blobs:
        return []
    if len(image_blobs) == 1:
        return [classify_view(image_blobs[0])]

    small_blobs = [
        _prepare_image_blob(raw, mime, max_side=768) for raw, mime in image_blobs
    ]
    data = generate_json(_CLASSIFY_BATCH_PROMPT, small_blobs, json_mode=True)
    if not isinstance(data, dict) or data.get("error"):
        logger.warning("batch classify failed, enhancing all images: %s", data)
        return [_default_classify_entry() for _ in image_blobs]

    entries = data.get("images")
    if not isinstance(entries, list):
        return [_default_classify_entry() for _ in image_blobs]

    by_index: dict[int, dict] = {}
    for item in entries:
        if not isinstance(item, dict):
            continue
        try:
            idx = int(item.get("index"))
        except (TypeError, ValueError):
            continue
        if 0 <= idx < len(image_blobs):
            by_index[idx] = _parse_classify_entry(item)

    return [by_index.get(i, _default_classify_entry()) for i in range(len(image_blobs))]


# Per-region genai client pool: { region_str: genai.Client }
_genai_clients: dict[str, Any] = {}
_rr_lock = _threading.Lock()
_rr_index: int = 0  # round-robin counter for region assignment


def _get_genai_client_for_region(region: str) -> Any:
    """Lazily build a google-genai Vertex client for a specific region."""
    if region in _genai_clients:
        return _genai_clients[region]

    try:
        from google import genai  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "google-genai is not installed. Add 'google-genai' to backend/requirements.txt "
            "and run: pip install google-genai"
        ) from exc

    project = vertex_project_id()
    if not project:
        raise RuntimeError("VERTEX_CONFIG_MISSING")

    client = genai.Client(vertexai=True, project=project, location=region)
    _genai_clients[region] = client
    logger.info("created genai image client for region=%s", region)
    return client


def _next_region() -> str:
    """Pick the next region in round-robin order across all enhance_locations()."""
    global _rr_index
    regions = enhance_locations()
    with _rr_lock:
        region = regions[_rr_index % len(regions)]
        _rr_index += 1
    return region


def _prepare_image_blob(
    raw: bytes,
    mime: str,
    *,
    max_side: int,
    jpeg_quality: int = 85,
) -> tuple[bytes, str]:
    """Downscale/compress for the image API; returns the original blob on failure."""
    try:
        from PIL import Image

        with Image.open(io.BytesIO(raw)) as img:
            img = img.convert("RGB")
            if max(img.size) > max_side:
                img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
            return buf.getvalue(), "image/jpeg"
    except Exception:
        return raw, mime


def _response_diagnostic(response: Any) -> str:
    """Best-effort text from a generate_content response when no image is returned."""
    bits: list[str] = []
    candidates = getattr(response, "candidates", None) or []
    for cand in candidates:
        finish = getattr(cand, "finish_reason", None)
        if finish:
            bits.append(f"finish_reason={finish}")
        content = getattr(cand, "content", None)
        parts = getattr(content, "parts", None) or []
        for part in parts:
            text = getattr(part, "text", None)
            if text and str(text).strip():
                bits.append(str(text).strip()[:240])
    prompt_feedback = getattr(response, "prompt_feedback", None)
    if prompt_feedback:
        bits.append(f"prompt_feedback={prompt_feedback}")
    return "; ".join(bits) if bits else "no diagnostic text"


def _extract_image_part(response: Any) -> tuple[bytes, str] | None:
    """Pull the first inline image (bytes, mime) out of a google-genai response."""
    candidates = getattr(response, "candidates", None) or []
    for cand in candidates:
        content = getattr(cand, "content", None)
        parts = getattr(content, "parts", None) or []
        for part in parts:
            inline = getattr(part, "inline_data", None)
            data = getattr(inline, "data", None) if inline else None
            if data:
                mime = getattr(inline, "mime_type", None) or "image/png"
                return data, mime
    return None


def _enhance_once(
    raw: bytes,
    mime: str,
    reference_image: tuple[bytes, str] | None = None,
    region: str | None = None,
) -> tuple[bytes, str]:
    from google.genai import types  # type: ignore
    from PIL import Image

    effective_region = region or enhance_location()
    client = _get_genai_client_for_region(effective_region)
    prompt = _build_enhance_prompt()
    model = enhance_model_id()

    if model.startswith("gemini-"):
        img = Image.open(io.BytesIO(raw))
        
        response = client.models.generate_content(
            model=model,
            contents=[img, prompt],
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(
                    aspect_ratio="4:3",
                    image_size="1K"
                )
            )
        )
        
        parts = getattr(response, "parts", None)
        if not parts and hasattr(response, "candidates") and response.candidates:
            parts = getattr(response.candidates[0].content, "parts", None)

        if parts:
            for part in parts:
                inline = getattr(part, "inline_data", None)
                if inline and inline.data:
                    return inline.data, inline.mime_type or "image/jpeg"
                    
        raise ValueError(f"NO_IMAGE_RETURNED: no image was returned in the response parts for model {model}")
    else:
        input_image = types.Image(image_bytes=raw, mime_type=mime)
        raw_ref = types.RawReferenceImage(reference_image=input_image, reference_id=1)
        mask_ref = types.MaskReferenceImage(
            reference_id=2,
            config=types.MaskReferenceConfig(
                mask_mode='MASK_MODE_BACKGROUND'
            )
        )

        response = client.models.edit_image(
            model=model,
            prompt=prompt,
            reference_images=[raw_ref, mask_ref],
            config=types.EditImageConfig(
                number_of_images=1,
                output_mime_type="image/jpeg",
            )
        )

        if not response.generated_images:
            raise ValueError("NO_IMAGE_RETURNED: response.generated_images is empty")

        gen_img = response.generated_images[0]
        if not gen_img.image or not gen_img.image.image_bytes:
            raise ValueError("NO_IMAGE_RETURNED: generated image has no bytes")

        return gen_img.image.image_bytes, gen_img.image.mime_type or "image/jpeg"


def enhance_image_blob(
    raw: bytes,
    mime: str,
    reference_image: tuple[bytes, str] | None = None,
    region: str | None = None,
) -> tuple[bytes, str]:
    """Enhance one car image with retries and fallbacks (drop reference / resize).

    The `region` parameter pins this image to a specific Vertex AI region so
    multi-image batches can be spread across regions to avoid 429 quota limits.
    """
    input_blob = _prepare_image_blob(
        raw, mime, max_side=_enhance_max_input_side()
    )
    ref_blob: tuple[bytes, str] | None = None
    if reference_image:
        ref_blob = _prepare_image_blob(
            reference_image[0],
            reference_image[1],
            max_side=_enhance_max_reference_side(),
            jpeg_quality=80,
        )

    # scene_only first — one image per request, lighter on quota than with_reference.
    strategies: list[tuple[str, tuple[bytes, str], tuple[bytes, str] | None]] = [
        ("scene_only", input_blob, None),
    ]
    if ref_blob and not enhance_model_id().startswith("gemini-"):
        strategies.append(("with_reference", input_blob, ref_blob))

    last_err: Exception | None = None
    saw_rate_limit = False
    for strategy_name, blob, ref in strategies:
        if saw_rate_limit:
            logger.info("cooling down %.0fs after rate limit before strategy=%s", RATE_LIMIT_COOLDOWN_SEC, strategy_name)
            time.sleep(RATE_LIMIT_COOLDOWN_SEC)
        for attempt in range(MAX_ENHANCE_ATTEMPTS):
            # Honour the global rate-limit gate before every single attempt.
            _wait_for_rate_limit_cooldown()
            try:
                result = _enhance_once(
                    blob[0],
                    blob[1],
                    ref,
                    region,
                )
                if strategy_name != "scene_only" and ref_blob:
                    logger.info("enhance succeeded via %s (scene_only did not)", strategy_name)
                return result
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                if _is_rate_limited(exc):
                    saw_rate_limit = True
                    _signal_rate_limited()  # Pause all concurrent enhance threads
                logger.warning(
                    "enhance attempt %s/%s strategy=%s failed: %s",
                    attempt + 1,
                    MAX_ENHANCE_ATTEMPTS,
                    strategy_name,
                    exc,
                )
                if not is_transient_exception(exc) and not _is_rate_limited(exc):
                    break
                if attempt == MAX_ENHANCE_ATTEMPTS - 1:
                    break
                delay = _enhance_backoff_sec(attempt, exc)
                logger.info("backing off %.1fs before retry", delay)
                time.sleep(delay)

    assert last_err is not None
    if _is_rate_limited(last_err):
        raise RuntimeError("RATE_LIMIT")
    raise last_err


def _is_engine_bay_view(view_label: str) -> bool:
    label = view_label.strip().lower()
    return label in ("engine_bay", "engine", "hood", "under_hood", "open_hood") or (
        "engine" in label and "interior" not in label
    )


def _skip_from_view(view: dict) -> dict | None:
    if view.get("is_car") is False:
        return {"skipped": "not_a_car", "view": view.get("view")}
    view_label = str(view.get("view") or "")
    if _is_engine_bay_view(view_label):
        return {"skipped": "engine_bay", "view": view.get("view")}
    if view.get("should_enhance") is False:
        skip = "interior" if view_label.strip().lower() == "interior" else view_label.strip().lower() or "skipped"
        return {"skipped": skip, "view": view.get("view")}
    return None


def _enhance_exterior(
    raw: bytes,
    mime: str,
    reference_image: tuple[bytes, str] | None,
    view: str | None,
    region: str | None = None,
) -> dict:
    try:
        out_bytes, out_mime = enhance_image_blob(
            raw,
            mime,
            reference_image,
            region=region,
        )
    except RuntimeError as exc:
        msg = str(exc)
        if msg == "VERTEX_CONFIG_MISSING":
            code = "VERTEX_CONFIG_MISSING"
        elif msg == "RATE_LIMIT":
            code = "RATE_LIMIT"
        else:
            code = "ENHANCE_FAILED"
        return {"error": code, "error_message": msg, "view": view}
    except Exception as exc:  # noqa: BLE001
        logger.error("enhance failed view=%s: %s", view, exc)
        return {"error": "ENHANCE_FAILED", "error_message": str(exc), "view": view}

    return {
        "enhanced": {
            "base64": base64.b64encode(out_bytes).decode("ascii"),
            "mimeType": out_mime,
        },
        "view": view,
    }


def enhance_images(
    image_blobs: list[tuple[bytes, str]], car_identity: str | None = None
) -> list[dict]:
    """Enhance a batch of car listing photos preserving input order.

    Multi-photo batches share one planned photo booth scene; the first enhanced
    photo becomes a visual reference for the rest so every angle matches.
    """
    if not image_blobs:
        return []

    n = len(image_blobs)
    results: list[dict | None] = [None] * n
    enhance_jobs: list[tuple[int, bytes, str, str | None, str]] = []

    views = classify_views(image_blobs)
    regions = enhance_locations()
    logger.info("enhance_images: distributing across regions=%s", regions)
    region_idx = 0
    for i, (raw, mime) in enumerate(image_blobs):
        view = views[i] if i < len(views) else _default_classify_entry()
        skip = _skip_from_view(view)
        if skip is not None:
            results[i] = {"index": i, **skip}
            continue
        assigned_region = regions[region_idx % len(regions)]
        region_idx += 1
        enhance_jobs.append((i, raw, mime, view.get("view"), assigned_region))

    if not enhance_jobs:
        return [r if r is not None else {"index": i, "error": "ENHANCE_FAILED"} for i, r in enumerate(results)]

    preflight = _preflight_delay_sec()
    if preflight > 0:
        logger.info("preflight delay %.1fs before image-model calls", preflight)
        time.sleep(preflight)

    reference_image: tuple[bytes, str] | None = None
    remaining: list[tuple[int, bytes, str, str | None, str]] = list(enhance_jobs)

    # Establish a visual reference from the first successful enhance (sequential).
    while remaining and reference_image is None:
        idx, raw, mime, view, region = remaining.pop(0)
        result = _enhance_exterior(
            raw, mime, None, view, region=region
        )
        results[idx] = {"index": idx, **result}
        enhanced = result.get("enhanced")
        if isinstance(enhanced, dict) and enhanced.get("base64"):
            reference_image = (
                base64.b64decode(enhanced["base64"]),
                enhanced.get("mimeType") or "image/png",
            )
        time.sleep(_inter_enhance_delay_sec())
    if remaining:
        workers = min(enhance_concurrency(), len(remaining))

        def _task(job: tuple[int, bytes, str, str | None, str]) -> None:
            idx, raw, mime, view, region = job
            results[idx] = {
                "index": idx,
                **_enhance_exterior(
                    raw,
                    mime,
                    reference_image,
                    view,
                    region=region,
                ),
            }
            time.sleep(_inter_enhance_delay_sec())

        if workers == 1:
            for job in remaining:
                _task(job)
        else:
            with ThreadPoolExecutor(max_workers=workers) as pool:
                list(pool.map(_task, remaining))

    # Retry non-rate-limit failures once a reference exists.
    if reference_image:
        for idx, raw, mime, view, region in enhance_jobs:
            result = results[idx]
            if not result or result.get("enhanced") or result.get("skipped"):
                continue
            if result.get("error") == "RATE_LIMIT":
                continue
            logger.info("retrying enhance for index=%s with reference region=%s", idx, region)
            time.sleep(_inter_enhance_delay_sec())
            retry = _enhance_exterior(
                raw, mime, reference_image, view, region=region
            )
            results[idx] = {"index": idx, **retry}
            time.sleep(_inter_enhance_delay_sec())

    return [r if r is not None else {"index": i, "error": "ENHANCE_FAILED"} for i, r in enumerate(results)]
