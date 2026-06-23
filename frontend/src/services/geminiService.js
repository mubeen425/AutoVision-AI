/**
 * Car analysis runs on the Python backend.
 * Dev default: Vite proxy → http://127.0.0.1:8000 (local backend code).
 * Production default: Cloud Run. Override with VITE_API_BASE_URL in repo-root .env.
 */

const DEFAULT_API = "https://autovision-api-42fxwf4hka-uc.a.run.app";

function normalizeApiEnv(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\/$/, "");
}

function apiBase() {
  const fromEnv = normalizeApiEnv(import.meta.env.VITE_API_BASE_URL);
  if (fromEnv === "local") return "";
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV) return "";
  return DEFAULT_API;
}

function analyzeUrl() {
  const base = apiBase();
  return `${base}/api/analyze`;
}

function enhanceUrl() {
  const base = apiBase();
  return `${base}/api/enhance-images`;
}

function generateAdvertUrl() {
  const base = apiBase();
  return `${base}/api/generate-advert`;
}

function buildErrorBilingual(en, th) {
  return {
    en: {
      errorCode: en.error,
      errorMessage: en.error_message ?? null,
    },
    th: {
      errorCode: th?.error ?? en.error,
      errorMessage: th?.error_message ?? en.error_message ?? null,
    },
  };
}

const FEATURE_TRANSLATIONS = {
  // Safety Features
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

  // Comfort Features
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
};

function translateFeaturesToThaiLocally(enFeatures) {
  if (!enFeatures || typeof enFeatures !== "object") return enFeatures;
  const thFeatures = {};
  for (const [category, items] of Object.entries(enFeatures)) {
    if (Array.isArray(items)) {
      thFeatures[category] = items.map((item) => {
        if (item && typeof item === "object" && item.feature) {
          const enName = item.feature;
          const thName = FEATURE_TRANSLATIONS[enName] || enName;
          return {
            ...item,
            feature: thName,
            feature_en: enName,
          };
        }
        return item;
      });
    } else {
      thFeatures[category] = items;
    }
  }
  return thFeatures;
}

function alignThaiFeaturesLocally(enFeatures, thFeatures) {
  if (!enFeatures || typeof enFeatures !== "object") return thFeatures;
  if (!thFeatures || typeof thFeatures !== "object") return translateFeaturesToThaiLocally(enFeatures);

  const aligned = {};
  for (const [category, items] of Object.entries(enFeatures)) {
    if (Array.isArray(items)) {
      const thItems = thFeatures[category] || [];
      aligned[category] = items.map((enItem, idx) => {
        if (!enItem || typeof enItem !== "object" || !enItem.feature) return enItem;
        
        const enName = enItem.feature;
        const thItem = thItems[idx] || {};
        const thName = thItem.feature || FEATURE_TRANSLATIONS[enName] || enName;
        
        return {
          ...enItem,
          ...thItem,
          feature: thName,
          feature_en: enName,
          detected: thItem.detected !== undefined ? thItem.detected : enItem.detected,
          confidence: thItem.confidence !== undefined ? thItem.confidence : enItem.confidence,
        };
      });
    } else {
      aligned[category] = thFeatures[category] ?? items;
    }
  }
  return aligned;
}

function normalizeBilingualPayload(payload) {
  if (!payload?.en || !payload?.th) return null;
  const en = payload.en;
  const th = payload.th;
  if (en.error) {
    return {
      error: en.error,
      error_message: en.error_message,
      errorBilingual: buildErrorBilingual(en, th),
    };
  }
  if (!en.confidence || typeof en.confidence !== "object") {
    en.confidence = {};
  }

  // Ensure th.features is populated and translated if missing or not fully aligned
  if (en.features && (!th.features || Object.keys(th.features).length === 0)) {
    th.features = translateFeaturesToThaiLocally(en.features);
  } else if (th.features && typeof th.features === "object") {
    // If th.features exists but is missing feature_en or matching, align them
    th.features = alignThaiFeaturesLocally(en.features, th.features);
  }

  return {
    listingData: { en, th },
    en,
  };
}

async function postAnalyze(body) {
  const res = await fetch(analyzeUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error("PARSE_ERROR");
  }

  if (payload && typeof payload === "object" && payload.error) {
    const code = payload.error;
    if (
      code === "API_KEY_MISSING" ||
      code === "PARSE_ERROR" ||
      code === "SERVICE_UNAVAILABLE" ||
      code === "RATE_LIMIT" ||
      code === "GEMINI_ACCESS_DENIED"
    ) {
      const err = new Error(code);
      if (payload.error_message) err.detail = payload.error_message;
      throw err;
    }
    const bilingual = normalizeBilingualPayload(payload);
    if (bilingual) return bilingual;
    return payload;
  }

  if (!res.ok) {
    const msg = payload?.detail || payload?.error_message || res.statusText;
    throw new Error(typeof msg === "string" ? msg : "PARSE_ERROR");
  }

  const bilingual = normalizeBilingualPayload(payload);
  if (bilingual) return bilingual;

  const data = payload;
  if (!data.confidence || typeof data.confidence !== "object") {
    data.confidence = {};
  }
  return { listingData: { en: data, th: data }, en: data };
}

export async function analyzeCarImage(base64, mimeType) {
  return postAnalyze({
    base64,
    mimeType: mimeType || "image/jpeg",
    include_features: true,
  });
}

/**
 * Send multiple photos of the SAME car so the model fuses angles
 * into a single listing JSON.
 * @param {{base64: string, mimeType?: string}[]} images
 */
export async function analyzeCarPhotos(images) {
  const clean = (images || [])
    .filter((it) => it && typeof it.base64 === "string" && it.base64.length)
    .map((it) => ({
      base64: it.base64,
      mimeType: it.mimeType || "image/jpeg",
    }));
  if (!clean.length) throw new Error("PARSE_ERROR");
  if (clean.length === 1) {
    return postAnalyze({
      base64: clean[0].base64,
      mimeType: clean[0].mimeType,
      include_features: true,
    });
  }
  return postAnalyze({ images: clean, include_features: true });
}

/**
 * Enhance the background/lighting of EXTERIOR car photos while keeping the car
 * unchanged. Pure cabin interior / non-car images come back with a `skipped` reason.
 *
 * @param {{base64: string, mimeType?: string}[]} images
 * @param {string} [carIdentity] e.g. "2021 Toyota Corolla Altis"
 * @returns {Promise<Array<{index:number, enhanced?:{base64:string,mimeType:string}, skipped?:string, view?:string, error?:string, error_message?:string}>>}
 */
export async function enhanceCarPhotos(images, carIdentity) {
  const clean = (images || [])
    .filter((it) => it && typeof it.base64 === "string" && it.base64.length)
    .map((it) => ({ base64: it.base64, mimeType: it.mimeType || "image/jpeg" }));
  if (!clean.length) return [];

  const res = await fetch(enhanceUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images: clean, car_identity: carIdentity || null }),
  });

  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error("PARSE_ERROR");
  }

  // Top-level config/error (e.g. VERTEX_CONFIG_MISSING) — surface as a throw.
  if (payload && typeof payload === "object" && payload.error && !payload.results) {
    const err = new Error(payload.error);
    if (payload.error_message) err.detail = payload.error_message;
    throw err;
  }

  if (!res.ok) {
    const msg = payload?.detail || payload?.error_message || res.statusText;
    throw new Error(typeof msg === "string" ? msg : "PARSE_ERROR");
  }

  return Array.isArray(payload?.results) ? payload.results : [];
}

/**
 * Enhance a single photo using the backend's /api/enhance-image endpoint.
 *
 * @param {string} base64
 * @param {string} [mimeType]
 * @returns {Promise<{enhanced?:{base64:string,mimeType:string}, skipped?:string, view?:string, error?:string, error_message?:string}>}
 */
export async function enhanceSinglePhoto(base64, mimeType) {
  const base = apiBase();
  const url = `${base}/api/enhance-image`;
  const cleanPhoto = { base64, mimeType: mimeType || "image/jpeg" };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images: [cleanPhoto] }),
  });

  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error("PARSE_ERROR");
  }

  if (payload && typeof payload === "object" && payload.error) {
    const err = new Error(payload.error);
    if (payload.error_message) err.detail = payload.error_message;
    throw err;
  }

  if (!res.ok) {
    const msg = payload?.detail || payload?.error_message || res.statusText;
    throw new Error(typeof msg === "string" ? msg : "PARSE_ERROR");
  }

  return payload;
}


/**
 * Generate a professional bilingual car listing advertisement from vehicle details.
 *
 * @param {object} vehicleData Bilingual vehicle metadata and feature checklist
 * @returns {Promise<{success: boolean, advert: {en: object, th: object}}>}
 */
export async function generateCarAdvert(vehicleData) {
  const res = await fetch(generateAdvertUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vehicle: vehicleData }),
  });

  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error("PARSE_ERROR");
  }

  if (payload && typeof payload === "object" && payload.error) {
    const code = payload.error;
    const err = new Error(code);
    if (payload.error_message) err.detail = payload.error_message;
    throw err;
  }

  if (!res.ok) {
    const msg = payload?.detail || payload?.error_message || res.statusText;
    throw new Error(typeof msg === "string" ? msg : "PARSE_ERROR");
  }

  return payload;
}

export const TRANSLATIONS = {
  // Fuel Type
  "petrol": "เบนซิน",
  "gasoline": "เบนซิน",
  "diesel": "ดีเซล",
  "electric": "ไฟฟ้า",
  "hybrid": "ไฮบริด",
  "plug-in hybrid": "ปลั๊กอินไฮบริด",
  "plug in hybrid": "ปลั๊กอินไฮบริด",
  "phev": "ปลั๊กอินไฮบริด",
  "hev": "ไฮบริด",

  // Transmission
  "automatic": "เกียร์อัตโนมัติ",
  "manual": "เกียร์ธรรมดา",
  "cvt": "เกียร์อัตโนมัติ (CVT)",
  "dct": "เกียร์อัตโนมัติ (DCT)",
  "dual clutch": "เกียร์อัตโนมัติ (Dual Clutch)",
  "auto": "เกียร์อัตโนมัติ",

  // Drivetrain
  "fwd": "ขับเคลื่อนล้อหน้า (FWD)",
  "rwd": "ขับเคลื่อนล้อหลัง (RWD)",
  "awd": "ขับเคลื่อนสี่ล้อ (AWD)",
  "4wd": "ขับเคลื่อนสี่ล้อ (4WD)",
  "front wheel drive": "ขับเคลื่อนล้อหน้า (FWD)",
  "rear wheel drive": "ขับเคลื่อนล้อหลัง (RWD)",
  "all wheel drive": "ขับเคลื่อนสี่ล้อ (AWD)",
  "four wheel drive": "ขับเคลื่อนสี่ล้อ (4WD)",

  // Exterior Color
  "white": "ขาว",
  "black": "ดำ",
  "silver": "เงิน",
  "gray": "เทา",
  "grey": "เทา",
  "red": "แดง",
  "blue": "น้ำเงิน",
  "green": "เขียว",
  "yellow": "เหลือง",
  "gold": "ทอง",
  "bronze": "บรอนซ์",
  "brown": "น้ำตาล",
  "orange": "ส้ม",
  "beige": "ครีม",

  // Body Style
  "sedan": "รถเก๋ง",
  "suv": "รถ SUV",
  "hatchback": "รถแฮทช์แบ็ก",
  "coupe": "รถคูเป้",
  "roadster": "รถโรดสเตอร์",
  "truck": "รถบรรทุก",
  "pickup": "รถกระบะ",
  "van": "รถตู้",
  "wagon": "รถแวน",
  "convertible": "รถเปิดประทุน",
  "station wagon": "รถแวน",
};

export function translateField(value, targetLang) {
  if (!value) return "";
  const clean = String(value).trim().toLowerCase();
  
  if (targetLang === "th") {
    if (TRANSLATIONS[clean]) return TRANSLATIONS[clean];
    for (const [enKey, thVal] of Object.entries(TRANSLATIONS)) {
      if (clean.includes(enKey)) return thVal;
    }
    return value;
  } else {
    for (const [enKey, thVal] of Object.entries(TRANSLATIONS)) {
      if (thVal.toLowerCase() === clean) {
        return enKey.charAt(0).toUpperCase() + enKey.slice(1);
      }
    }
    for (const [enKey, thVal] of Object.entries(TRANSLATIONS)) {
      if (clean.includes(thVal.toLowerCase())) {
        return enKey.charAt(0).toUpperCase() + enKey.slice(1);
      }
    }
    return value;
  }
}

export async function translateListing(listing) {
  const base = apiBase();
  const res = await fetch(`${base}/api/translate-listing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listing }),
  });
  
  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error("PARSE_ERROR");
  }
  
  if (payload && typeof payload === "object" && payload.error) {
    const code = payload.error;
    const err = new Error(code);
    if (payload.error_message) err.detail = payload.error_message;
    throw err;
  }
  
  return payload;
}
