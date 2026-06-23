/**
 * Fetches app metadata from the backend. Falls back to bundled defaults when offline.
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

export const DEFAULT_CONFIG = {
  app: {
    partnerName: "WowCar",
    productName: "PicoPost",
    title: "WowCar – The Map to Your Next Car",
    version: "1.1.6",
    copyrightYear: 2026,
  },
  hero: {
    headline: "Car Listings Made Easy",
    headlineAccent: "Made Easy",
    lead: "Upload your photos and let WowCar's AI build your listing in seconds. Powered by PicoPost.",
  },
  assets: {
    logo: "/assets/images/Inverse-Wow.png",
    banner: "/assets/images/wow-car-banner.jpg",
    favicon: "/wow-icon.png",
  },
  upload: {
    maxFiles: 20,
    acceptMime: ["image/jpeg", "image/png", "image/webp"],
  },
  processingSteps: [
    { id: 0, label: "Scanning Image", labelPlural: "Scanning Images" },
    { id: 1, label: "Locating Vehicle in Frame" },
    { id: 2, label: "Identifying Make & Model" },
    { id: 3, label: "Extracting Specs & Colour" },
    { id: 4, label: "Computing Market Estimate" },
  ],
  listingFields: [
    { key: "make", label: "Make", type: "text" },
    { key: "model", label: "Model Group", type: "text" },
    { key: "year", label: "Year", type: "text" },
    { key: "trim", label: "Model Specific", type: "text" },
    { key: "body_style", label: "Body Style", type: "text" },
    { key: "exterior_color", label: "Exterior Color", type: "text" },
    { key: "fuel_type", label: "Fuel Type", type: "text" },
    { key: "transmission", label: "Transmission", type: "text" },
    { key: "drivetrain", label: "Drivetrain", type: "text" },
    { key: "engine_displacement", label: "Engine Displacement", type: "text" },
    { key: "door_count", label: "Car Doors", type: "text" },
    {
      key: "asking_price_thb",
      label: "Asking Price (THB)",
      type: "price",
      colSpan: 2,
    },
    {
      key: "mileage_km",
      label: "Mileage (KM)",
      type: "text",
      colSpan: 2,
    },
    {
      key: "estimated_price_min_thb",
      label: "Est. Price Min (THB)",
      type: "price",
    },
    {
      key: "estimated_price_max_thb",
      label: "Est. Price Max (THB)",
      type: "price",
    },
  ],
  pwa: {
    name: "WowCar PicoPost",
    shortName: "PicoPost",
    description:
      "AI-powered car listing builder by WowCar. Upload photos, get specs and market estimates instantly.",
    themeColor: "#F47B20",
    backgroundColor: "#09090b",
  },
};

function configUrl() {
  const base = apiBase();
  return `${base}/api/config`;
}

function mergeConfig(remote) {
  if (!remote || typeof remote !== "object") return { ...DEFAULT_CONFIG };
  return {
    app: { ...DEFAULT_CONFIG.app, ...remote.app },
    hero: { ...DEFAULT_CONFIG.hero, ...remote.hero },
    assets: { ...DEFAULT_CONFIG.assets, ...remote.assets },
    upload: { ...DEFAULT_CONFIG.upload, ...remote.upload },
    processingSteps: remote.processingSteps?.length
      ? remote.processingSteps
      : DEFAULT_CONFIG.processingSteps,
    listingFields: remote.listingFields?.length
      ? remote.listingFields
      : DEFAULT_CONFIG.listingFields,
    pwa: { ...DEFAULT_CONFIG.pwa, ...remote.pwa },
  };
}

let cachedConfig = null;
let inflight = null;

export async function fetchAppConfig({ force = false } = {}) {
  if (cachedConfig && !force) return cachedConfig;
  if (inflight && !force) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(configUrl(), {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`config ${res.status}`);
      const data = await res.json();
      cachedConfig = mergeConfig(data);
      return cachedConfig;
    } catch {
      cachedConfig = mergeConfig(null);
      return cachedConfig;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function getCachedAppConfig() {
  return cachedConfig ?? DEFAULT_CONFIG;
}
