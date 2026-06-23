"""Comfort & convenience feature detector."""
from __future__ import annotations

from .base import BaseFeatureDetector, register


@register
class ComfortFeatureDetector(BaseFeatureDetector):
    category_key = "comfort"
    category_label = "Comfort & Convenience Features"
    features = (
        "Air Conditioning",
        "Automatic Climate Control",
        "Rear AC Vents",
        "Leather Seats",
        "Heated Seats",
        "Ventilated Seats",
        "Power Adjustable Seats",
        "Sunroof",
        "Panoramic Roof",
        "Keyless Entry",
        "Push Button Start",
        "Cruise Control",
        "Touchscreen Infotainment",
        "Apple CarPlay / Android Auto",
        "Navigation System",
        "Bluetooth Connectivity",
        "Premium Sound System",
        "Wireless Phone Charging",
        "Power Windows",
        "Ambient Interior Lighting",
    )
