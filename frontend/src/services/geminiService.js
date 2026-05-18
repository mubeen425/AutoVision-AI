/**
 * Car analysis runs on the Python backend (venv + google-generativeai).
 * Local dev: Vite proxies /api → :8000 (relative URL, no env).
 * Production: VITE_API_BASE_URL overrides; otherwise defaults to deployed Render API.
 */

const DEFAULT_PRODUCTION_API = "https://autovision-ai-axox.onrender.com";

function apiBase() {
  const fromEnv = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (import.meta.env.PROD) return DEFAULT_PRODUCTION_API;
  return "";
}

function analyzeUrl() {
  const base = apiBase();
  return `${base}/api/analyze`;
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
      code === "RATE_LIMIT"
    ) {
      const err = new Error(code);
      if (payload.error_message) err.detail = payload.error_message;
      throw err;
    }
    return payload;
  }

  if (!res.ok) {
    const msg = payload?.detail || payload?.error_message || res.statusText;
    throw new Error(typeof msg === "string" ? msg : "PARSE_ERROR");
  }

  const data = payload;
  if (!data.confidence || typeof data.confidence !== "object") {
    data.confidence = {};
  }
  return data;
}

export async function analyzeCarImage(base64, mimeType) {
  return postAnalyze({ base64, mimeType: mimeType || "image/jpeg" });
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
    return postAnalyze({ base64: clean[0].base64, mimeType: clean[0].mimeType });
  }
  return postAnalyze({ images: clean });
}
