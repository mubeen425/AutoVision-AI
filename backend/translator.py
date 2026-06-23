"""Translate English listing / error JSON to Thai via Gemini."""
from __future__ import annotations

import copy
import json
from typing import Any

from backend.gemini_client import generate_json

TRANSLATION_PROMPT = """You are a professional English-to-Thai translator for a car listing app in Thailand.

You will receive a JSON object (vehicle listing or error response). Translate all user-facing English text into natural Thai.

RULES:
1. Respond with ONLY valid JSON (no markdown fences). Keep the exact same JSON structure and keys as the input.
2. NEVER translate vehicle brand names or model names — keep them in English exactly as given (e.g. Toyota, Honda, BMW, Civic, Corolla, Altis, M Sport, X5).
3. NEVER translate trim badges that are proper names (e.g. LX, Touring, M Sport, AMG) — keep in English.
4. Translate descriptive fields into Thai: body_style, exterior_color, fuel_type, transmission, drivetrain, engine_displacement (units may stay like "2.0 L"), door_count labels if words, seat_count labels if words, notes, error_message.
5. Keep numeric fields unchanged: year (if digits), estimated_price_thb, estimated_price_min_thb, estimated_price_max_thb, confidence values ("confirmed", "estimated", "unknown"), error codes.
6. For "features" object with "safety" and "comfort" arrays: for EACH item add "feature_en" with the original English feature name (copy verbatim from input), and set "feature" to the Thai translation of that name.
7. If input has "error" and "error_message", translate only error_message to Thai; keep "error" code unchanged.
8. make and model values stay in English. trim may stay English if it is a badge/name.
9. Write "notes" as fluent Thai (3–6 sentences when present).

Input JSON:
"""

FEATURE_TRANSLATION_MAP = {
    # Safety Features
    "Anti-lock Braking System (ABS)": "ระบบเบรกป้องกันล้อล็อก (ABS)",
    "Electronic Stability Control": "ระบบควบคุมเสถียรภาพการทรงตัว (ESC)",
    "Traction Control": "ระบบป้องกันล้อหมุนฟรี (Traction Control)",
    "Front Airbags": "ถุงลมนิรภัยคู่หน้า",
    "Side Airbags": "ถุงลมนิรภัยด้านข้าง",
    "Curtain Airbags": "ม่านถุงลมนิรภัย",
    "Tire Pressure Monitoring System": "ระบบตรวจวัดแรงดันลมยาง (TPMS)",
    "ISOFIX Child Seat Anchors": "จุดยึดเบาะนั่งสำหรับเด็ก (ISOFIX)",
    "Hill Start Assist": "ระบบช่วยออกตัวบนทางลาดชัน (HSA)",
    "Lane Departure Warning": "ระบบเตือนเมื่อรถออกนอกเลน (LDW)",
    "Lane Keeping Assist": "ระบบช่วยควบคุมรถให้อยู่ในเลน (LKA)",
    "Blind Spot Monitoring": "ระบบเตือนจุดอับสายตา (BSM)",
    "Forward Collision Warning": "ระบบเตือนการชนด้านหน้า (FCW)",
    "Autonomous Emergency Braking": "ระบบช่วยเบรกฉุกเฉินอัตโนมัติ (AEB)",
    "Adaptive Cruise Control": "ระบบควบคุมความเร็วอัตโนมัติแบบแปรผัน (Adaptive Cruise Control)",
    "Parking Sensors": "เซนเซอร์กะระยะจอด",
    "Rearview Camera": "กล้องมองหลัง",
    "360-degree Camera": "กล้องมองภาพรอบทิศทาง (360 องศา)",

    # Comfort Features
    "Air Conditioning": "ระบบปรับอากาศ",
    "Automatic Climate Control": "ระบบปรับอากาศอัตโนมัติ",
    "Rear AC Vents": "ช่องปรับอากาศตอนหลัง",
    "Leather Seats": "เบาะหนัง",
    "Heated Seats": "ระบบอุ่นเบาะ",
    "Ventilated Seats": "ระบบระบายอากาศเบาะนั่ง",
    "Power Adjustable Seats": "เบาะปรับไฟฟ้า",
    "Sunroof": "ซันรูฟ",
    "Panoramic Roof": "หลังคาพาโนรามิค",
    "Keyless Entry": "ระบบกุญแจอัจฉริยะ (Keyless Entry)",
    "Push Button Start": "ปุ่มสตาร์ทเครื่องยนต์ (Push Button Start)",
    "Cruise Control": "ระบบควบคุมความเร็วอัตโนมัติ (Cruise Control)",
    "Touchscreen Infotainment": "หน้าจอสัมผัสขนาดใหญ่",
    "Apple CarPlay / Android Auto": "รองรับ Apple CarPlay / Android Auto",
    "Navigation System": "ระบบนำทาง (Navigation System)",
    "Bluetooth Connectivity": "ระบบเชื่อมต่อ Bluetooth",
    "Premium Sound System": "เครื่องเสียงระดับพรีเมียม",
    "Wireless Phone Charging": "ระบบชาร์จโทรศัพท์แบบไร้สาย (Wireless Charger)",
    "Power Windows": "กระจกไฟฟ้า",
    "Ambient Interior Lighting": "ไฟสร้างบรรยากาศภายในห้องโดยสาร (Ambient Light)",
}


def translate_features_to_thai(en_features: Any) -> Any:
    """Translate features list deterministically using the static mapping."""
    if not isinstance(en_features, dict):
        return en_features

    th_features = {}
    for key, items in en_features.items():
        if isinstance(items, list):
            th_list = []
            for item in items:
                if isinstance(item, dict) and "feature" in item:
                    en_name = item["feature"]
                    th_name = FEATURE_TRANSLATION_MAP.get(en_name, en_name)
                    th_item = copy.deepcopy(item)
                    th_item["feature"] = th_name
                    th_item["feature_en"] = en_name
                    th_list.append(th_item)
                else:
                    th_list.append(item)
            th_features[key] = th_list
        else:
            th_features[key] = items
    return th_features


def align_translated_json(listing: dict, result: dict) -> dict:
    """Ensure translated keys match English keys exactly, handling Gemini translations of keys."""
    aligned_result = {}

    KEY_TRANSLATION_MAP = {
        "make": ["ยี่ห้อ", "แบรนด์", "make"],
        "model": ["รุ่น", "model"],
        "year": ["ปี", "year"],
        "trim": ["รุ่นย่อย", "trim"],
        "body_style": ["ประเภทตัวถัง", "ตัวถัง", "body_style"],
        "exterior_color": ["สีภายนอก", "สี", "exterior_color", "exterior_colour"],
        "fuel_type": ["ประเภทเชื้อเพลิง", "เชื้อเพลิง", "fuel_type"],
        "transmission": ["เกียร์", "ระบบเกียร์", "transmission"],
        "drivetrain": ["ระบบขับเคลื่อน", "drivetrain"],
        "engine_displacement": ["ขนาดเครื่องยนต์", "เครื่องยนต์", "engine_displacement"],
        "door_count": ["จำนวนประตู", "door_count"],
        "seat_count": ["จำนวนที่นั่ง", "ที่นั่ง", "seat_count"],
        "vin": ["เลขตัวถัง", "vin"],
        "asking_price_thb": ["ราคาตั้งขาย", "ราคา", "asking_price_thb"],
        "mileage_km": ["เลขไมล์", "mileage_km"],
        "estimated_price_thb": ["ราคาประเมิน", "estimated_price_thb"],
        "estimated_price_min_thb": ["ราคาประเมินขั้นต่ำ", "estimated_price_min_thb"],
        "estimated_price_max_thb": ["ราคาประเมินสูงสุด", "estimated_price_max_thb"],
        "notes": ["บันทึก", "หมายเหตุ", "notes"],
        "confidence": ["ความมั่นใจ", "confidence"],
    }

    for key, val in listing.items():
        if key == "features":
            continue

        # 1. Direct match
        if key in result:
            aligned_result[key] = result[key]
            continue

        # 2. Check translated key variations
        found = False
        variations = KEY_TRANSLATION_MAP.get(key, [])
        for var in variations:
            if var in result:
                aligned_result[key] = result[var]
                found = True
                break

        if found:
            continue

        # 3. Fallback to original value
        aligned_result[key] = val

    # Handle confidence dictionary specifically if present
    if "confidence" in listing and isinstance(listing["confidence"], dict):
        orig_conf = listing["confidence"]
        res_conf = result.get("confidence", {})
        if not isinstance(res_conf, dict):
            res_conf = {}
        aligned_conf = {}
        for c_key, c_val in orig_conf.items():
            if c_key in res_conf:
                aligned_conf[c_key] = res_conf[c_key]
            else:
                # Check variations for confidence keys
                found_c = False
                variations_c = KEY_TRANSLATION_MAP.get(c_key, [])
                for var_c in variations_c:
                    if var_c in res_conf:
                        aligned_conf[c_key] = res_conf[var_c]
                        found_c = True
                        break
                if not found_c:
                    aligned_conf[c_key] = c_val
        aligned_result["confidence"] = aligned_conf

    return aligned_result


def translate_listing_to_thai(listing: dict) -> dict:
    """Return a Thai copy of an English listing or error payload."""
    if not isinstance(listing, dict):
        return {"error": "PARSE_ERROR", "error_message": "Invalid listing payload."}

    # Translate with Gemini
    prompt = TRANSLATION_PROMPT + json.dumps(listing, ensure_ascii=False)
    result = generate_json(prompt, [], json_mode=True)

    if not isinstance(result, dict) or result.get("error") and result["error"] not in (
        "unclear_image",
        "partial_car",
        "multiple_cars",
        "not_a_car",
        "no_match",
        "unsupported_format",
    ):
        # Fall back to deepcopy
        result = copy.deepcopy(listing)

    # Align the JSON keys with the English structure
    result = align_translated_json(listing, result)

    # Deterministically translate and align the features
    if "features" in listing:
        result["features"] = translate_features_to_thai(listing["features"])

    return result
