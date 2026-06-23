"""
Detector base class and registry.

Add a new category by subclassing ``BaseFeatureDetector`` and decorating it
with ``@register`` — the service layer then picks it up automatically with no
other changes required.
"""
from __future__ import annotations

from collections.abc import Iterable

from .feature_normalizer import normalize_predictions
from .schemas import FeaturePrediction

DETECTOR_REGISTRY: dict[str, "BaseFeatureDetector"] = {}


class BaseFeatureDetector:
    """A named category with a fixed list of standardized features."""

    category_key: str = ""
    category_label: str = ""
    features: tuple[str, ...] = ()

    def prompt_section(self) -> str:
        """Human/model-readable block listing this category's features verbatim."""
        lines = [f'Category "{self.category_key}" ({self.category_label}):']
        lines.extend(f"  - {feature}" for feature in self.features)
        return "\n".join(lines)

    def normalize(
        self, raw_items: Iterable[object], threshold: float
    ) -> list[FeaturePrediction]:
        return normalize_predictions(self.features, raw_items, threshold)


def register(cls: type[BaseFeatureDetector]) -> type[BaseFeatureDetector]:
    """Class decorator: instantiate and add the detector to the registry."""
    instance = cls()
    if not instance.category_key:
        raise ValueError(f"{cls.__name__} must define a non-empty category_key")
    DETECTOR_REGISTRY[instance.category_key] = instance
    return cls
