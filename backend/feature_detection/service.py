"""
Orchestration for feature detection.

Strategy
--------
1. Make ONE combined Gemini call asking for every selected category at once
   (fast, cheap — the common path).
2. For any category the model dropped or returned in the wrong shape, make a
   targeted single-category call to fill just that gap.

This two-step approach fixes the intermittent "safety missing" / "comfort
missing" bug: a single combined prompt sometimes returns only one category, so
we never trust the combined call to be complete — every missing category is
independently re-fetched, and ``normalize`` guarantees every feature is present
in the output (detected true/false) so nothing is silently omitted.
"""
from __future__ import annotations

from backend import gemini_client

from .base import DETECTOR_REGISTRY, BaseFeatureDetector
from .schemas import DEFAULT_CONFIDENCE_THRESHOLD

_MIN_SUGGESTIONS_PER_CATEGORY = 5

_PROMPT_HEADER = """You are an expert vehicle inspector. Examine the provided vehicle image(s) and suggest which of the listed features are likely present. The user will review your suggestions and confirm or reject each one.

Rules:
- Evaluate EVERY feature in EVERY category listed below. Your JSON MUST contain every category key shown in the shape, with the full feature list for each category.
- Evaluate ONLY the exact feature names listed below; do not invent new features.
- Copy each feature name VERBATIM (same spelling and capitalization) into your output.
- For each feature set "detected" true when you have visual evidence OR strong contextual evidence (typical standard equipment for the vehicle's era, market, trim, and body style visible in the photo(s)).
- MINIMUM SUGGESTIONS: In EACH category listed below, mark at least {min_suggestions} features as "detected": true when plausible. Use interior/exterior cues, badges, trim level, and what is standard on comparable cars when photos are limited. Do not mark features you are confident are absent; spread suggestions across the most likely items in that category.
- Prefer marking features you can see (e.g. sunroof, touchscreen, parking sensors) with higher confidence; use moderate confidence (0.5–0.75) for reasonable inferences from vehicle type/year when not directly visible.
- "confidence" is a number from 0.0 to 1.0 reflecting how sure you are of the "detected" value.
- Respond with ONLY valid JSON (no markdown fences), shaped exactly as:

{categories_shape}

Features to evaluate by category:

{categories_block}
"""


def _selected_detectors(categories: list[str] | None) -> list[BaseFeatureDetector]:
    if not categories:
        return list(DETECTOR_REGISTRY.values())
    selected = [DETECTOR_REGISTRY[key] for key in categories if key in DETECTOR_REGISTRY]
    return selected or list(DETECTOR_REGISTRY.values())


def build_prompt(detectors: list[BaseFeatureDetector]) -> str:
    shape_lines = [
        f'  "{d.category_key}": [{{"feature": "string", "detected": true, "confidence": 0.0}}]'
        for d in detectors
    ]
    categories_shape = "{\n" + ",\n".join(shape_lines) + "\n}"
    categories_block = "\n\n".join(d.prompt_section() for d in detectors)
    return _PROMPT_HEADER.format(
        min_suggestions=_MIN_SUGGESTIONS_PER_CATEGORY,
        categories_shape=categories_shape,
        categories_block=categories_block,
    )


def _raw_items_for(raw: object, detector: BaseFeatureDetector) -> list | None:
    """Pull a category's list out of a model response, or None if absent/invalid."""
    if not isinstance(raw, dict):
        return None
    items = raw.get(detector.category_key)
    return items if isinstance(items, list) else None


def _empty_category(detector: BaseFeatureDetector, threshold: float) -> list[dict]:
    """Return a fully-absent (detected=false) prediction list for a category.

    Used as a safe fallback when the API completely fails for this category
    so the frontend panel always has a well-formed (albeit empty) list.
    """
    return [p.model_dump() for p in detector.normalize([], threshold)]


def _fetch_single_category(
    detector: BaseFeatureDetector,
    image_blobs: list[tuple[bytes, str]],
    threshold: float,
    max_retries: int = 2,
) -> list[dict]:
    """Re-request one category on its own, with up to *max_retries* attempts.

    Always returns a list[dict] — never raises or returns an error dict.
    If all attempts fail, returns an empty (all-false) prediction list so the
    caller always gets a valid category result.
    """
    for attempt in range(max_retries):
        raw = gemini_client.generate_json(
            build_prompt([detector]), image_blobs, json_mode=True
        )
        if isinstance(raw, dict) and raw.get("error"):
            # Transient error — wait briefly before retrying (only between attempts).
            if attempt < max_retries - 1:
                import time
                time.sleep(1.0 * (attempt + 1))
            continue
        items = _raw_items_for(raw, detector)
        if items is not None:
            return [p.model_dump() for p in detector.normalize(items, threshold)]
    # All retries exhausted — return graceful empty list rather than an error.
    return _empty_category(detector, threshold)


def predict_features(
    image_blobs: list[tuple[bytes, str]],
    threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
    categories: list[str] | None = None,
) -> dict:
    """Detect + standardize features across all (or selected) categories.

    Always returns a ``{category_key: [FeaturePrediction...]}`` mapping —
    never an error dict.  If a category completely fails (API down, parse
    error, etc.) its list will contain all features as ``detected: false``
    so the frontend panel is always well-formed and never shows the
    "unavailable for this scan" banner due to transient API issues.

    Note: this function now runs in a parallel thread alongside Thai translation
    (see main.py ThreadPoolExecutor). No artificial sleep is needed here.
    """
    detectors = _selected_detectors(categories)

    combined = gemini_client.generate_json(
        build_prompt(detectors), image_blobs, json_mode=True
    )

    # If the combined call itself returned a hard error, fall back to
    # per-category individual calls rather than giving up entirely.
    combined_failed = isinstance(combined, dict) and combined.get("error")

    result: dict[str, list[dict]] = {}
    for detector in detectors:
        raw_items = None if combined_failed else _raw_items_for(combined, detector)

        if raw_items is None:
            # Category was missing or the combined call failed — fetch it alone.
            result[detector.category_key] = _fetch_single_category(
                detector, image_blobs, threshold
            )
        else:
            predictions = detector.normalize(raw_items, threshold)
            result[detector.category_key] = [p.model_dump() for p in predictions]

    return result
