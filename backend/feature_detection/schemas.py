"""
Pydantic schemas and shared constants for feature detection.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from backend.gemini_client import AnalyzeBody

DEFAULT_CONFIDENCE_THRESHOLD = 0.5


class FeaturePrediction(BaseModel):
    """One standardized feature and whether it was detected."""

    feature: str
    detected: bool = False
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class PredictFeaturesRequest(AnalyzeBody):
    """Image input (single or multi) plus feature-detection options."""

    threshold: float = Field(
        default=DEFAULT_CONFIDENCE_THRESHOLD,
        ge=0.0,
        le=1.0,
        description="Minimum confidence required to mark a feature as detected.",
    )
    categories: list[str] | None = Field(
        default=None,
        description="Subset of category keys to evaluate (e.g. ['safety']); null = all.",
    )
