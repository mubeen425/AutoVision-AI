"""Safety feature detector."""
from __future__ import annotations

from .base import BaseFeatureDetector, register


@register
class SafetyFeatureDetector(BaseFeatureDetector):
    category_key = "safety"
    category_label = "Safety Features"
    features = (
        "Anti-lock Braking System (ABS)",
        "Electronic Stability Control",
        "Traction Control",
        "Front Airbags",
        "Side Airbags",
        "Curtain Airbags",
        "Tire Pressure Monitoring System",
        "ISOFIX Child Seat Anchors",
        "Hill Start Assist",
        "Lane Departure Warning",
        "Lane Keeping Assist",
        "Blind Spot Monitoring",
        "Forward Collision Warning",
        "Autonomous Emergency Braking",
        "Adaptive Cruise Control",
        "Parking Sensors",
        "Rearview Camera",
        "360-degree Camera",
    )
