"""App metadata served to the frontend via GET /api/config."""
from __future__ import annotations

import json
import os
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
_FRONTEND_PKG = _REPO_ROOT / "frontend" / "package.json"


def _read_frontend_version() -> str:
    try:
        data = json.loads(_FRONTEND_PKG.read_text(encoding="utf-8"))
        return str(data.get("version", "1.1.6"))
    except OSError:
        return "1.1.6"


def app_config() -> dict:
    version = os.getenv("APP_VERSION", _read_frontend_version())
    partner = os.getenv("APP_PARTNER_NAME", "WowCar")
    product = os.getenv("APP_PRODUCT_NAME", "PicoPost")

    return {
        "app": {
            "partnerName": partner,
            "productName": product,
            "title": os.getenv("APP_TITLE", f"{partner} – The Map to Your Next Car"),
            "version": version,
            "copyrightYear": int(os.getenv("APP_COPYRIGHT_YEAR", "2026")),
        },
        "hero": {
            "headline": os.getenv("APP_HERO_HEADLINE", "Car Listings Made Easy"),
            "headlineAccent": os.getenv("APP_HERO_ACCENT", "Made Easy"),
            "lead": os.getenv(
                "APP_HERO_LEAD",
                f"Upload your photos and let {partner}'s AI build your listing in seconds. Powered by {product}.",
            ),
        },
        "assets": {
            "logo": os.getenv("APP_LOGO_URL", "/assets/images/Inverse-Wow.png"),
            "banner": os.getenv("APP_BANNER_URL", "/assets/images/wow-car-banner.jpg"),
            "favicon": os.getenv("APP_FAVICON_URL", "/wow-icon.png"),
        },
        "upload": {
            "maxFiles": int(os.getenv("APP_MAX_UPLOAD_FILES", "20")),
            "acceptMime": ["image/jpeg", "image/png", "image/webp"],
        },
        "processingSteps": [
            {"id": 0, "label": "Scanning Image", "labelPlural": "Scanning Images"},
            {"id": 1, "label": "Locating Vehicle in Frame"},
            {"id": 2, "label": "Identifying Make & Model"},
            {"id": 3, "label": "Extracting Specs & Colour"},
            {"id": 4, "label": "Computing Market Estimate"},
        ],
        "listingFields": [
            {"key": "make", "label": "Make", "type": "text"},
            {"key": "model", "label": "Model", "type": "text"},
            {"key": "year", "label": "Year", "type": "text"},
            {"key": "trim", "label": "Model Specific", "type": "text"},
            {"key": "body_style", "label": "Body Style", "type": "text"},
            {"key": "vehicle_type", "label": "Vehicle Type", "type": "text"},
            {"key": "exterior_color", "label": "Exterior Color", "type": "text"},
            {"key": "fuel_type", "label": "Fuel Type", "type": "text"},
            {"key": "transmission", "label": "Transmission", "type": "text"},
            {"key": "drivetrain", "label": "Drivetrain", "type": "text"},
            {"key": "engine_displacement", "label": "Engine Displacement", "type": "text"},
            {"key": "door_count", "label": "Car Doors", "type": "text"},
            {"key": "vin", "label": "VIN / Ref Code", "type": "text"},
            {
                "key": "estimated_price_thb",
                "label": "Est. Price (THB)",
                "type": "price",
                "colSpan": 2,
            },
            {
                "key": "estimated_price_range",
                "label": "Est. Price Range (THB)",
                "type": "priceRange",
                "colSpan": 2,
            },
        ],
        "pwa": {
            "name": os.getenv("PWA_NAME", f"{partner} {product}"),
            "shortName": os.getenv("PWA_SHORT_NAME", product),
            "description": os.getenv(
                "PWA_DESCRIPTION",
                f"AI-powered car listing builder by {partner}. Upload photos, get specs and market estimates instantly.",
            ),
            "themeColor": os.getenv("PWA_THEME_COLOR", "#F47B20"),
            "backgroundColor": os.getenv("PWA_BG_COLOR", "#09090b"),
        },
    }
