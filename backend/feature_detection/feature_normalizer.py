"""
Standardize raw model feature items against a fixed canonical feature list.

The model is free to omit features, reorder them, or vary their spelling. To
guarantee a stable, complete response (and so a whole category is never
silently missing), we always emit exactly one prediction per canonical
feature: matched items carry the model's value, unmatched ones default to
``detected: false``.
"""
from __future__ import annotations

import re
from collections.abc import Iterable, Sequence

from .schemas import FeaturePrediction


def _norm_key(name: str) -> str:
    """Lowercase alphanumeric key so 'Anti-lock Braking (ABS)' ~ 'antilockbrakingabs'."""
    return re.sub(r"[^a-z0-9]+", "", name.lower())


def _coerce_confidence(value: object) -> float:
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return max(0.0, min(1.0, float(value)))
    return 0.0


def normalize_predictions(
    canonical_features: Sequence[str],
    raw_items: Iterable[object],
    threshold: float,
) -> list[FeaturePrediction]:
    """Return one FeaturePrediction per canonical feature, in canonical order."""
    lookup: dict[str, dict] = {}
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        name = item.get("feature")
        if isinstance(name, str) and name.strip():
            lookup.setdefault(_norm_key(name), item)

    predictions: list[FeaturePrediction] = []
    for feature in canonical_features:
        item = lookup.get(_norm_key(feature))
        confidence = _coerce_confidence(item.get("confidence")) if item else 0.0
        raw_detected = bool(item.get("detected")) if item else False
        detected = raw_detected and confidence >= threshold
        predictions.append(
            FeaturePrediction(feature=feature, detected=detected, confidence=confidence)
        )
    return predictions
