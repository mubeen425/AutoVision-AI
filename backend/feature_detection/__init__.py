"""
Feature detection package.

Importing the package registers the built-in detectors. Add a new category by
creating a detector module here and importing it below (or registering it via
``@register``) — no core changes required.
"""
from __future__ import annotations

from . import comfort_detector, safety_detector  # noqa: F401  (registers detectors)
from .base import DETECTOR_REGISTRY, BaseFeatureDetector, register
from .schemas import DEFAULT_CONFIDENCE_THRESHOLD, FeaturePrediction, PredictFeaturesRequest
from .service import predict_features

__all__ = [
    "DETECTOR_REGISTRY",
    "BaseFeatureDetector",
    "register",
    "FeaturePrediction",
    "PredictFeaturesRequest",
    "DEFAULT_CONFIDENCE_THRESHOLD",
    "predict_features",
]
