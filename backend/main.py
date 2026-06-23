"""
Car Vision API — Vertex AI Gemini (GCP).

Runs with Application Default Credentials (ADC):
  - Cloud Run: service account attached to the service (no API key).
  - Local: `gcloud auth application-default login` and set project/region in .env.

Run from repo root: python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
"""
from __future__ import annotations
import os

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from backend.gemini_client import (  # noqa: E402
    DEFAULT_MODEL,
    AnalyzeBody,
    collect_image_parts,
    ensure_vertex_initialized,
    generate_json,
    model_ids,
    vertex_location,
    vertex_project_id,
)
from backend.image_enhancer import enhance_images  # noqa: E402
from backend.app_config import app_config  # noqa: E402
from backend.feature_detection import (  # noqa: E402
    DEFAULT_CONFIDENCE_THRESHOLD,
    PredictFeaturesRequest,
    predict_features,
)
from backend.translator import translate_listing_to_thai  # noqa: E402

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

Use no_match ONLY when you truly cannot identify the vehicle's make or model from the photo(s) at all. Do NOT use no_match when you HAVE identified the car but cannot estimate a Thailand price (e.g. regional models like Suzuki Mehran, Pakistan/India-market-only cars, rare imports, or vehicles not officially sold in Thailand). In those cases return the successful identification JSON with estimated_price_thb set to null and confidence.estimated_price_thb set to "unknown", and explain in notes that no reliable Thailand used-car price exists.

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
  "estimated_price_thb": number or null (Thailand used-car point estimate in THB; null when no reliable Thailand market price exists)",
  "estimated_price_min_thb": number or null (optional low end of rough range; null if giving only a point estimate)",
  "estimated_price_max_thb": number or null (optional high end of rough range; null if giving only a point estimate)",
  "notes": "REQUIRED non-empty string — see NOTES rules below",
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

CONFIDENCE RULES — a field is "confirmed" when EITHER (a) it is directly supported by what is visible in the image(s), OR (b) it is a standard, well-known specification that is uniquely determined by the vehicle you have identified. Use the manufacturer/spec knowledge you have about the identified car the way an expert would: once make, model, and the relevant generation/trim are identified with high confidence, specs that are fixed for that exact model are KNOWN facts, not guesses, so mark them "confirmed".
Guardrails:
- Knowledge-based "confirmed" REQUIRES that make and model (and the generation/trim the spec depends on) are themselves "confirmed" or high-confidence. If the car itself is only "estimated", do NOT confirm its specs — use "estimated".
- If the identified model/generation was offered in MULTIPLE variants for that spec (e.g. a model sold as both 5- and 7-seat, or in petrol/diesel/hybrid, or auto/manual) and neither the photo nor visible badges pin down which one, use "estimated" — do not pick one and call it "confirmed".
- Use "unknown" only when you can neither see it nor reliably derive it from the identified vehicle.
Per-field guidance:
- door_count: "confirmed" when countable in the photo OR fixed for the identified body style/model (e.g. a 2-door coupe, or a model that only ships as a 4-door).
- seat_count: "confirmed" when seats are visible OR the identified model/trim has a single standard seating capacity (e.g. this generation is always a 5-seater). Use "estimated" if that model offers multiple seating layouts and the photo does not show the interior.
- fuel_type: "confirmed" from visual evidence (EV charge port / no exhaust / closed-off grille, or a badge such as "Hybrid", "Plug-in", "TDI", "e-tron", "EV", "BEV") OR when the identified model/trim is only sold with one powertrain. If that model is offered in several powertrains and there is no badge/visual cue, use "estimated".
- transmission, drivetrain, engine_displacement: "confirmed" from visible cues (shifter/paddles, quattro/4MATIC/xDrive badge, displacement badge) OR when standard/unique for the identified trim; otherwise "estimated", and prefer "unknown" for transmission when it is genuinely indeterminable.
- body_style, exterior_color: "confirmed" when plainly visible.
Infer remaining values from the identified make/model/year for the Thailand used-car market when neither the photo nor model knowledge pins them down.

PRICING (THB):
- When the identified model is commonly sold or has clear used-car comparables in Thailand, provide estimated_price_thb as a point estimate in Thai Baht (THB). Optionally set estimated_price_min_thb and estimated_price_max_thb to a plausible range when uncertain.
- When the car is clearly identified but NOT sold in Thailand or has no reliable Thailand used-car benchmark (e.g. Suzuki Mehran, other Pakistan/India-only models, very rare imports, grey-market one-offs), set estimated_price_thb, estimated_price_min_thb, and estimated_price_max_thb to null and set their confidence to "unknown". Still return the full successful listing — identification success does NOT depend on price.
- Never refuse identification or return no_match solely because Thailand pricing is unavailable.
- Never output Pakistani Rupee (PKR), "Rs", or any field named estimated_price_pkr / estimated_price_min_pkr / estimated_price_max_pkr. All price numbers must be plain THB only (typical used-car baht amounts in Thailand).

NOTES (CRITICAL — every successful response MUST include "notes"):
- "notes" MUST be a non-empty string. Never omit it, never set it to null, never leave it blank or whitespace-only. A successful JSON without notes is INVALID.
- Write 3–6 sentences in plain English. Cover ALL of the following that apply:
  1. Vehicle summary — weave year/era, make, model, trim, exterior color, and body style into a natural description of the car.
  2. Visible details — badges, wheels, condition, damage, interior/exterior features, plate region, aftermarket parts, or anything notable seen in the photo(s).
  3. Photo context — how many images were analyzed and what each shows (front, rear, side, interior, engine bay, etc.). For one photo, describe the angle and visible parts of the car.
  4. Same vs different cars — if multiple images were sent, state clearly whether they all show the SAME vehicle or call out any image that shows a DIFFERENT car (give image number and describe that other vehicle).
  5. Uncertainty — briefly mention important fields that remain estimated or unknown from the available views.

Example (single image): "One exterior photo showing the front 3/4 of a white 2019-2021 Toyota Corolla Altis sedan. Chrome grille and Altis badge visible; alloy wheels, no obvious damage. Rear and interior not shown so transmission and exact trim are estimated."

Example (multi, same car): "Four photos of the same red Honda Civic hatchback (2020-2022) — front, rear, driver side, and dashboard. Leather interior and sunroof visible in image 4. All angles match one vehicle."

Example (multi, mixed): "Primary vehicle: silver 2018 Mazda 3 sedan (images 1, 2, 4). Image 3 appears to show a different car — a black Toyota Fortuner SUV. Listing fields below describe the Mazda only."

Example (identified, no Thailand price): "One exterior photo of a white Suzuki Mehran hatchback (approx. 2005–2012 generation). Badging and body shape clearly match Mehran. This model is sold in Pakistan/India and is not officially marketed in Thailand, so no reliable used-car price in THB is available; price fields are left blank."""


MULTI_IMAGE_INSTRUCTION = """The user uploaded MULTIPLE photos in one request. They want ONE combined listing for a SINGLE vehicle, using every angle to improve accuracy.

You MUST return the successful identification JSON shape (one vehicle only). NEVER return error code "multiple_cars" for this request — even if one photo shows a different car, a background vehicle, or angles that do not match.

How to handle mismatch or mixed content:
- Pick the PRIMARY vehicle: prefer the clearest image, the subject that appears across most images, or the vehicle that is centered / largest in frame.
- Merge fields where images agree; when they conflict, choose the best-supported value and set confidence to "estimated" or "unknown" for that field.

NOTES for multi-image uploads (REQUIRED — follow the NOTES rules in the system prompt):
- Always write 3–6 sentences. Start by stating the total number of photos analyzed.
- Describe what each image shows (use "image 1", "image 2", etc. in upload order).
- Summarize the PRIMARY vehicle in detail: year/era, make, model, trim, color, body style, and notable visible features across all matching photos.
- If ANY image shows a clearly DIFFERENT vehicle, you MUST call it out by image number and describe that other car. Still return one merged JSON for the primary vehicle only.
- If all images are the same car from different angles, explicitly confirm that (e.g. "All 5 images show the same vehicle from front, rear, sides, and interior").

Raise field confidence toward "confirmed" when make/model/trim/badge/plate or interior details are clear in any image."""


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


def _ensure_notes(data: dict, image_count: int) -> None:
    """Guarantee a non-empty notes string; synthesize from fields if the model omitted it."""
    existing = data.get("notes")
    if isinstance(existing, str) and existing.strip():
        data["notes"] = existing.strip()
        return

    parts: list[str] = []
    if image_count == 1:
        parts.append("Analysis based on 1 uploaded photo.")
    else:
        parts.append(
            f"Analysis based on {image_count} uploaded photos merged into one listing."
        )

    identity = " ".join(
        str(data[k]).strip()
        for k in ("year", "make", "model", "trim")
        if data.get(k) and str(data[k]).strip()
    )
    if identity:
        parts.append(f"Identified vehicle: {identity}.")

    detail_bits: list[str] = []
    for label, key in (
        ("color", "exterior_color"),
        ("body style", "body_style"),
        ("fuel", "fuel_type"),
        ("transmission", "transmission"),
        ("drivetrain", "drivetrain"),
        ("engine", "engine_displacement"),
    ):
        val = data.get(key)
        if val and str(val).strip():
            detail_bits.append(f"{label} {val}")
    if detail_bits:
        parts.append("Visible or inferred details: " + ", ".join(detail_bits) + ".")

    price = data.get("estimated_price_thb")
    if isinstance(price, (int, float)):
        parts.append(f"Estimated Thailand used-car value: approximately {price:,.0f} THB.")
    elif data.get("make") and data.get("model"):
        parts.append(
            "No reliable Thailand used-car price estimate is available for this model; price fields are left blank."
        )

    conf = data.get("confidence")
    if isinstance(conf, dict):
        uncertain = [
            k.replace("_", " ")
            for k, v in conf.items()
            if v == "unknown" and k in ("make", "model", "year", "trim", "transmission")
        ]
        if uncertain:
            parts.append(
                "Could not confirm from the photo(s): " + ", ".join(uncertain) + "."
            )

    data["notes"] = " ".join(parts)


app = FastAPI(title="Car Vision API")
# Allow any browser origin (e.g. Vercel, Netlify, localhost, custom domains) to call
# this API from the deployed Render URL. Do not set allow_credentials=True with "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


_VERTEX_CONFIG_MISSING = {
    "error": "VERTEX_CONFIG_MISSING",
    "error_message": (
        "Set GCP project id: VERTEX_AI_PROJECT_ID or GOOGLE_CLOUD_PROJECT (Cloud Run sets this). "
        "Optionally set VERTEX_AI_LOCATION (default us-central1). "
        "Use Application Default Credentials (Cloud Run SA or gcloud auth application-default login)."
    ),
}


class AnalyzeRequest(AnalyzeBody):
    """Vehicle analysis input plus optional inline feature detection."""

    include_features: bool = Field(
        default=False,
        description="Also detect safety/comfort features and attach under 'features'.",
    )
    feature_threshold: float = Field(
        default=DEFAULT_CONFIDENCE_THRESHOLD,
        ge=0.0,
        le=1.0,
        description="Confidence threshold used when include_features is true.",
    )


class EnhanceRequest(AnalyzeBody):
    """Background-enhancement input: one or more car photos (same shape as analyze)."""

    car_identity: str | None = Field(
        default=None,
        description="Optional 'year make model trim' to steer the enhancement prompt.",
    )


class TranslateListingRequest(BaseModel):
    """English listing or error JSON to translate into Thai."""

    listing: dict = Field(description="English vehicle listing or error payload.")


class GenerateAdvertRequest(BaseModel):
    """Bilingual vehicle data to generate a marketplace advert."""

    vehicle: dict = Field(description="Bilingual vehicle specifications and features payload.")


class LoginRequest(BaseModel):
    """Username and password submitted from the login form."""

    username: str = Field(description="The username to verify.")
    password: str = Field(description="The plain-text password to verify.")


@app.get("/")
def root():
    """So the service URL in a browser is not a bare 404 — only /api/* are API routes."""
    return {
        "service": "Car Vision API",
        "docs": "/docs",
        "health": "GET /api/health",
        "config": "GET /api/config",
        "login": "POST /api/auth/login",
        "analyze": "POST /api/analyze",
        "translate_listing": "POST /api/translate-listing",
        "generate_advert": "POST /api/generate-advert",
        "enhance_images": "POST /api/enhance-images",
        "enhance_image": "POST /api/enhance-image",
        "predict_features": "POST /predict-features",
    }


@app.post("/api/auth/login")
def login(body: LoginRequest):
    """Verify username and password against env-var credentials (never exposed to the browser)."""
    valid_username = os.environ.get("LOGIN_USERNAME", "Demo")
    valid_password = os.environ.get("LOGIN_PASSWORD", "admin23")

    if not valid_username or not valid_password:
        return {"success": False, "error": "AUTH_NOT_CONFIGURED"}

    # Case-sensitive comparison for both username and password.
    if body.username == valid_username and body.password == valid_password:
        return {"success": True}

    return {"success": False, "error": "INVALID_CREDENTIALS"}


@app.get("/api/config")
def config():
    """Branding, upload limits, listing schema, and PWA metadata for the frontend."""
    return app_config()


@app.get("/api/health")
def health():
    cfg = ensure_vertex_initialized()
    models = model_ids()
    project = vertex_project_id()
    location = vertex_location()
    return {
        "ok": True,
        "backend": "vertex_ai",
        "has_project": bool(project),
        "project_id": project or None,
        "location": location,
        "vertex_initialized": cfg is not None,
        "primary_model": models[0] if models else DEFAULT_MODEL,
        "model_count": len(models),
    }


def _bilingual_listing_response(en: dict) -> dict:
    """Attach a Thai translation; analysis + translation complete before responding."""
    th = translate_listing_to_thai(en)
    return {"en": en, "th": th}


@app.post("/api/analyze")
def analyze(body: AnalyzeRequest):
    if ensure_vertex_initialized() is None:
        return _VERTEX_CONFIG_MISSING

    image_blobs, is_multi = collect_image_parts(body)

    prompt = SYSTEM_PROMPT + ("\n\n" + MULTI_IMAGE_INSTRUCTION if is_multi else "")

    # Run vehicle identification and feature detection in parallel to optimize latency.
    import concurrent.futures

    features_future = None

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        data_future = pool.submit(generate_json, prompt, image_blobs)
        if body.include_features:
            features_future = pool.submit(
                predict_features, image_blobs, body.feature_threshold
            )
        data = data_future.result()
        features = features_future.result() if features_future is not None else None

    if isinstance(data, dict) and data.get("error"):
        return _bilingual_listing_response(data)
    if not isinstance(data, dict):
        err = {"error": "PARSE_ERROR", "error_message": "Unexpected response shape."}
        return _bilingual_listing_response(err)

    if not isinstance(data.get("confidence"), dict):
        data["confidence"] = {}
    _strip_legacy_pkr_price_keys(data)
    _ensure_notes(data, len(image_blobs))

    if features is not None:
        if isinstance(features, dict) and features.get("error"):
            from backend.feature_detection.base import DETECTOR_REGISTRY
            features = {key: [] for key in DETECTOR_REGISTRY}
        data["features"] = features

    # Translate the complete listing (now including features) to Thai.
    th = translate_listing_to_thai(data)

    return {"en": data, "th": th}




@app.post("/api/translate-listing")
def translate_listing_endpoint(body: TranslateListingRequest):
    """Translate an English listing or error JSON into Thai (brands/models stay English)."""
    if ensure_vertex_initialized() is None:
        return _VERTEX_CONFIG_MISSING

    if not isinstance(body.listing, dict):
        return {"error": "PARSE_ERROR", "error_message": "listing must be a JSON object."}

    return translate_listing_to_thai(body.listing)


ADVERT_SYSTEM_PROMPT = """You are an expert automotive advertising copywriter for Thailand used-car listings.

Write a polished marketplace advert in English and Thai.

Rules:
- Return compact valid JSON only.
- No markdown, no explanation.
- Do not invent missing details.
- Skip any empty field.
- Do not put price or mileage inside the description.
- Safety and comfort features are displayed separately in the UI below key specs — do NOT include a feature bullet list in the description. Mention the key highlights briefly in prose only (Paragraph 2).
- Thai must read naturally for Thai buyers.
- Keep every value short and specific.

Limits:
- Title max 14 words.
- Description max 300 words.
- key_specs: The key_specs list MUST remain an empty array [] in the returned JSON structure. Do not populate it.
- short_caption should be a CTA sentence.

Formatting rules for generated text:
- Title should be a single strong headline.
- Title should follow this pattern when possible: "2024 Mercedes-Benz E 300 e Sedan – Premium Plug-in Hybrid".
- Description should be structured as follows:
  * Paragraph 1: General vehicle introduction, engine/transmission details, driving appeal.
  * Paragraph 2: Brief prose highlights of standout comfort and safety features (do NOT repeat every feature — mention only the most notable 2–4 in flowing text).
  * Paragraph 3: Concluding sentence summarizing the vehicle's value proposition.
- short_caption should be a closing call to action (e.g. "Contact now for more details or to arrange a viewing.").

Vehicle data:
{vehicle_json}

Return exactly this JSON structure:

{{
  "success": true,
  "advert": {{
    "en": {{
      "title": "",
      "description": "",
      "key_specs": [],
      "short_caption": ""
    }},
    "th": {{
      "title": "",
      "description": "",
      "key_specs": [],
      "short_caption": ""
    }}
  }}
}}
"""


def _format_price(val) -> str:
    if val is None or val == "":
        return ""
    try:
        # Strip everything except digits and decimal point
        num_str = "".join(c for c in str(val) if c.isdigit() or c == ".")
        if not num_str:
            return ""
        val_num = float(num_str)
        if val_num.is_integer():
            return f"฿{int(val_num):,}"
        return f"฿{val_num:,.2f}"
    except Exception:
        # Fallback to appending ฿ prefix if not present
        s = str(val).strip()
        if s and not s.startswith("฿"):
            return f"฿{s}"
        return s


def _format_mileage(val, unit: str) -> str:
    if val is None or val == "":
        return ""
    val_str = str(val).strip()
    if not val_str:
        return ""
    # If the unit is already in the string, return it as is
    if unit.lower() in val_str.lower() or "กม" in val_str:
        return val_str
    try:
        num_str = "".join(c for c in val_str if c.isdigit())
        if not num_str:
            return val_str
        val_int = int(num_str)
        return f"{val_int:,} {unit}"
    except Exception:
        return f"{val_str} {unit}"


def _compile_key_specs(vehicle_data: dict, is_thai: bool = False) -> list[str]:
    specs = []
    
    # 1-13. Ordered standard keys (excluding Price and Mileage which are handled separately)
    SPEC_KEYS = [
        ("year", "Year", "ปี"),
        ("make", "Make", "ยี่ห้อ"),
        ("model", "Model", "รุ่น"),
        ("model_group", "Model Group", "กลุ่มรุ่น"),
        ("trim", "Model Specific", "รุ่นย่อย"),
        ("body_style", "Body Type", "ประเภทตัวถัง"),
        ("door_count", "Doors", "จำนวนประตู"),
        ("exterior_color", "Color", "สีภายนอก"),
        ("engine", "Engine", "เครื่องยนต์"),
        ("fuel_type", "Fuel Type", "ประเภทเชื้อเพลิง"),
        ("transmission", "Transmission", "เกียร์"),
        ("drivetrain", "Drive", "ระบบขับเคลื่อน"),
        ("engine_displacement", "Engine Size", "ขนาดเครื่องยนต์"),
    ]
    
    for key, en_label, th_label in SPEC_KEYS:
        val = vehicle_data.get(key)
        if val is not None and str(val).strip():
            val_str = str(val).strip()
            label = th_label if is_thai else en_label
            specs.append(f"{label}: {val_str}")
            
    # 14. Price (asking price has priority, then estimated price)
    asking_price = vehicle_data.get("asking_price_thb")
    est_price = vehicle_data.get("estimated_price_thb")
    
    if is_thai:
        if asking_price is not None and str(asking_price).strip():
            fmt = _format_price(asking_price)
            if fmt:
                specs.append(f"ราคาตั้งขาย: {fmt}")
        elif est_price is not None and str(est_price).strip():
            fmt = _format_price(est_price)
            if fmt:
                specs.append(f"ราคาประเมิน: {fmt}")
    else:
        if asking_price is not None and str(asking_price).strip():
            fmt = _format_price(asking_price)
            if fmt:
                specs.append(f"Price: {fmt}")
        elif est_price is not None and str(est_price).strip():
            fmt = _format_price(est_price)
            if fmt:
                specs.append(f"Estimated Price: {fmt}")
                
    # 15. Mileage
    mileage = vehicle_data.get("mileage_km")
    if mileage is not None and str(mileage).strip():
        unit = "กม." if is_thai else "km"
        fmt = _format_mileage(mileage, unit)
        if fmt:
            label = "เลขไมล์" if is_thai else "Mileage"
            specs.append(f"{label}: {fmt}")
            
    return specs


@app.post("/api/generate-advert")
def generate_advert_endpoint(body: GenerateAdvertRequest):
    """Generate a used-car marketplace advertisement based on vehicle details."""
    if ensure_vertex_initialized() is None:
        return _VERTEX_CONFIG_MISSING

    import json
    prompt = ADVERT_SYSTEM_PROMPT.format(vehicle_json=json.dumps(body.vehicle, indent=2))
    res = generate_json(prompt, [], json_mode=True)

    # Inject programmatically compiled key specs to eliminate AI hallucination
    if isinstance(res, dict) and "advert" in res:
        advert = res["advert"]
        vehicle = body.vehicle or {}
        
        # Compile English Specs
        vehicle_en = vehicle.get("en") or {}
        key_specs_en = _compile_key_specs(vehicle_en, is_thai=False)
        if "en" in advert and isinstance(advert["en"], dict):
            advert["en"]["key_specs"] = key_specs_en
            
        # Compile Thai Specs
        vehicle_th = vehicle.get("th") or {}
        key_specs_th = _compile_key_specs(vehicle_th, is_thai=True)
        if "th" in advert and isinstance(advert["th"], dict):
            advert["th"]["key_specs"] = key_specs_th

    return res


@app.post("/api/enhance-images")
def enhance_images_endpoint(body: EnhanceRequest):
    """Enhance the background/lighting of car listing photos, keeping the car
    unchanged. Engine-bay, cabin interior, and non-car images are returned with 'skipped'."""
    if ensure_vertex_initialized() is None:
        return _VERTEX_CONFIG_MISSING

    image_blobs, _ = collect_image_parts(body)
    results = enhance_images(image_blobs, car_identity=body.car_identity)
    return {"results": results}


@app.post("/api/enhance-image")
def enhance_image_endpoint(body: EnhanceRequest):
    """Single-image convenience wrapper around /api/enhance-images."""
    if ensure_vertex_initialized() is None:
        return _VERTEX_CONFIG_MISSING

    image_blobs, _ = collect_image_parts(body)
    results = enhance_images(image_blobs[:1], car_identity=body.car_identity)
    return results[0] if results else {"error": "no_image"}


@app.post("/predict-features")
def predict_features_endpoint(body: PredictFeaturesRequest):
    """Detect standardized safety & comfort features from vehicle image(s)."""
    if ensure_vertex_initialized() is None:
        return _VERTEX_CONFIG_MISSING

    image_blobs, _ = collect_image_parts(body)
    return predict_features(image_blobs, threshold=body.threshold, categories=body.categories)
