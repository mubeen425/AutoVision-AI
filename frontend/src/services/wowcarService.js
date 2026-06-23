/**
 * wowcarService.js
 *
 * Full 4-step integration pipeline for the WowCar WordPress API.
 *
 * Step 1  – authenticate()         POST /wp-json/wowcar/v1/login
 * Step 2  – fetchDataset()         GET  /wp-json/wowcar/v1/listing-dataset
 * Step 3  – buildMappedPayload()   Normalise & match AI strings → term_ids
 * Step 4  – publishListing()       POST /wp-json/wowcar/v1/create-listing  (multipart/form-data)
 */

const WOWCAR_BASE = "https://www.wowcar.website";

// ---------------------------------------------------------------------------
// Internal dataset cache (per browser session)
// ---------------------------------------------------------------------------
let _cachedDataset = null;

// ---------------------------------------------------------------------------
// Step 1 – Authentication
// ---------------------------------------------------------------------------

/**
 * Login to WowCar and return the bearer token string.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<string>} token
 */
export async function loginToWowCar(username, password) {
  const res = await fetch(`${WOWCAR_BASE}/wp-json/wowcar/v1/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Server returned an invalid response. Please try again.");
  }

  if (!res.ok || !data.success) {
    const msg =
      data?.message ||
      data?.data?.message ||
      `Login failed (HTTP ${res.status})`;
    throw new Error(msg);
  }

  // API returns field named "token" (verified from live call)
  const token = data.token || data.api_token;
  if (!token) throw new Error("Login succeeded but no token was returned.");
  return token;
}

// ---------------------------------------------------------------------------
// Step 2 – Dataset Fetch & Cache
// ---------------------------------------------------------------------------

/**
 * Fetch the WowCar listing dataset (taxonomy term_ids).
 * Result is cached in memory for the session.
 * @param {string} token
 * @returns {Promise<object>} dataset
 */
export async function fetchDataset(token) {
  if (_cachedDataset) return _cachedDataset;

  const res = await fetch(
    `${WOWCAR_BASE}/wp-json/wowcar/v1/listing-dataset?api_token=${encodeURIComponent(token)}`,
    { method: "GET" }
  );

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Failed to parse dataset response.");
  }

  if (!res.ok || !data.success) {
    throw new Error(
      data?.message || `Dataset fetch failed (HTTP ${res.status})`
    );
  }

  _cachedDataset = data;
  return _cachedDataset;
}

/** Clear the cached dataset (e.g. after auth token expires) */
export function clearDatasetCache() {
  _cachedDataset = null;
}

/** Validate the given token by testing it against the dataset endpoint */
export async function validateToken(token) {
  if (!token) return false;
  try {
    const res = await fetch(
      `${WOWCAR_BASE}/wp-json/wowcar/v1/listing-dataset?api_token=${encodeURIComponent(token)}`,
      { method: "GET" }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.success;
  } catch {
    return false;
  }
}


// ---------------------------------------------------------------------------
// Step 3 – Normaliser & Matching Engine
// ---------------------------------------------------------------------------

/**
 * Normalise a string for fuzzy taxonomy matching.
 * lowercase → trim → collapse hyphens/underscores → collapse spaces
 * Also strips trailing "l" from engine sizes so "2.0 L", "2.0L" both → "2.0"
 * (engine size matching uses a separate helper anyway)
 */
export function normalizeStr(s) {
  if (s == null) return "";
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Synonym map: AI outputs that don't literally appear in the WowCar dataset.
 * Keys are normalised AI values; values are normalised WowCar english labels.
 * Add more synonyms here as you encounter them.
 */
const SYNONYM_MAP = {
  // Fuel type synonyms
  petrol: "gasoline",
  "plug in hybrid": "hybrid",
  "plug-in hybrid": "hybrid",
  phev: "hybrid",
  ev: "electric",
  bev: "electric",
  "battery electric": "electric",
  hev: "hybrid",
  mhev: "hybrid",
  "mild hybrid": "hybrid",
  // Body style synonyms
  "sport utility vehicle": "suv",
  "cross over": "suv",
  crossover: "suv",
  "estate wagon": "wagon",
  estate: "wagon",
  "station wagon": "wagon",
  roadster: "convertible",
  cabriolet: "convertible",
  "open top": "convertible",
  "pick up": "pickup",
  "pick-up": "pickup",
  "pickup truck": "pickup",
  truck: "pickup",
  minivan: "van",
  mpv: "van",
  "people carrier": "van",
  saloon: "sedan",
  "5-door": "hatchback",
  "3-door": "hatchback",
  // Transmission synonyms
  automatic: "automatic",
  cvt: "automatic",
  dct: "automatic",
  "dual clutch": "automatic",
  "auto": "automatic",
  manual: "manual",
  mt: "manual",
  // Drivetrain synonyms
  "all wheel drive": "awd",
  "4wd": "awd",
  "4x4": "awd",
  "four wheel drive": "awd",
  "front wheel drive": "fwd",
  "rear wheel drive": "rwd",
  "2wd": "fwd",
};

/**
 * Resolve a synonym if one exists, otherwise return the normalised value.
 */
function resolveSynonym(normalised) {
  return SYNONYM_MAP[normalised] ?? normalised;
}

/**
 * Encode a value as a create_new JSON string for unknown taxonomy entries.
 */
function createNew(originalValue) {
  return JSON.stringify({ create_new: true, name: String(originalValue).trim() });
}

function createMultilingualNew(originalValue) {
  const cleanVal = String(originalValue).trim();
  return JSON.stringify({
    create_new: true,
    english: cleanVal,
    thai: cleanVal,
    chinese: "",
    arabic: "",
  });
}

/**
 * Match an AI string against an array of taxonomy entries
 * (each entry has { term_id, english, thai }).
 *
 * Priority order:
 *   1. Exact normalised English match
 *   2. Synonym → English match
 *   3. Partial English match (AI contains dataset label or vice-versa)
 *   4. Thai match (for fields where english is empty, e.g. drivetrain)
 *   5. → create_new
 *
 * @param {string|null} aiValue
 * @param {Array<{term_id:number,english:string,thai:string}>} entries
 * @returns {number|string} term_id integer or create_new JSON string, or null if aiValue is empty
 */
export function matchTaxonomy(aiValue, entries) {
  if (!aiValue || String(aiValue).trim() === "") return null;

  const norm = normalizeStr(aiValue);
  const synResolved = resolveSynonym(norm);

  // 1. Exact English match
  for (const e of entries) {
    if (normalizeStr(e.english) === norm) return e.term_id;
  }

  // 2. Synonym → English match
  for (const e of entries) {
    if (normalizeStr(e.english) === synResolved) return e.term_id;
  }

  // 3. Partial English match
  for (const e of entries) {
    const normEn = normalizeStr(e.english);
    if (normEn && (normEn.includes(norm) || norm.includes(normEn))) {
      return e.term_id;
    }
  }

  // 4. Thai match (drivetrain field has empty english values)
  for (const e of entries) {
    const normThai = normalizeStr(e.thai);
    if (normThai && (normThai === norm || normThai === synResolved)) {
      return e.term_id;
    }
  }

  // 5. No match → create_new
  return createMultilingualNew(aiValue);
}

/**
 * Match the AI make string against the makes_models dataset.
 * Returns { termId, matchedKey } on success, or { termId: createNew, matchedKey: null }.
 *
 * @param {string|null} aiMake
 * @param {object} dataset
 * @returns {{ termId: number|string, matchedKey: string|null }}
 */
export function matchMake(aiMake, dataset) {
  if (!aiMake || String(aiMake).trim() === "") {
    return { termId: null, matchedKey: null };
  }

  const makesModels = dataset.makes_models || {};
  const norm = normalizeStr(aiMake);
  const synResolved = resolveSynonym(norm);

  // Exact match
  for (const key of Object.keys(makesModels)) {
    if (normalizeStr(key) === norm || normalizeStr(key) === synResolved) {
      return { termId: makesModels[key].term_id, matchedKey: key };
    }
  }

  // Partial match
  for (const key of Object.keys(makesModels)) {
    const normKey = normalizeStr(key);
    if (normKey.includes(norm) || norm.includes(normKey)) {
      return { termId: makesModels[key].term_id, matchedKey: key };
    }
  }

  return { termId: createNew(aiMake), matchedKey: null };
}

/**
 * Match the AI model string — STRICTLY scoped to the resolved make.
 * Never searches across all makes.
 *
 * @param {string|null} aiModel
 * @param {string|null} matchedMakeKey  — the exact key used in makes_models
 * @param {object} dataset
 * @returns {number|string|null} term_id or create_new JSON or null
 */
export function matchModel(aiModel, matchedMakeKey, dataset) {
  if (!aiModel || String(aiModel).trim() === "") return null;

  // If make itself was create_new, model must also be create_new
  if (!matchedMakeKey) return createNew(aiModel);

  const makesModels = dataset.makes_models || {};
  const makeEntry = makesModels[matchedMakeKey];

  // models can be empty array [] when no models configured
  const modelsObj =
    makeEntry?.models &&
    !Array.isArray(makeEntry.models) &&
    typeof makeEntry.models === "object"
      ? makeEntry.models
      : {};

  const norm = normalizeStr(aiModel);

  // Exact match
  for (const modelName of Object.keys(modelsObj)) {
    if (normalizeStr(modelName) === norm) {
      return modelsObj[modelName];
    }
  }

  // Partial match
  for (const modelName of Object.keys(modelsObj)) {
    const normModel = normalizeStr(modelName);
    if (normModel.includes(norm) || norm.includes(normModel)) {
      return modelsObj[modelName];
    }
  }

  return createNew(aiModel);
}

/**
 * Match engine displacement/size.
 * AI gives "2.0 L", "1998 cc", "2.0L", "3.5-litre" etc.
 * WowCar dataset has "2.0L", "3.5L" etc. as thai values.
 *
 * Strategy: extract the numeric litre value, format as "X.XL", then match.
 */
export function matchEngineSize(aiEngine, dataset) {
  if (!aiEngine || String(aiEngine).trim() === "") return null;

  const entries = (dataset.fields || {}).engine_size || [];

  // Try to extract a litre value from the AI string
  // Handles: "2.0 L", "2.0L", "2000cc", "2000 cc", "1998cc", "3.5-litre", "EV"
  const raw = String(aiEngine).trim().toLowerCase();

  // Special EV case
  if (raw === "ev" || raw === "electric" || raw === "bev") {
    const evEntry = entries.find(
      (e) => normalizeStr(e.thai) === "ev"
    );
    if (evEntry) return evEntry.term_id;
  }

  // Try to extract litres from "2.0 L", "2.0L", "3.5 L"
  const litreMatch = raw.match(/(\d+\.?\d*)\s*l(?:itre|iter)?s?\b/);
  if (litreMatch) {
    const litres = parseFloat(litreMatch[1]);
    const formatted = `${litres.toFixed(1)}l`; // "2.0l"
    for (const e of entries) {
      if (normalizeStr(e.thai) === formatted) return e.term_id;
    }
  }

  // Try cc → litres conversion (e.g. "1998 cc" → 2.0L)
  const ccMatch = raw.match(/(\d{3,5})\s*cc/);
  if (ccMatch) {
    const cc = parseInt(ccMatch[1], 10);
    const litres = Math.round(cc / 100) / 10; // 1998 → 2.0
    const formatted = `${litres.toFixed(1)}l`;
    for (const e of entries) {
      if (normalizeStr(e.thai) === formatted) return e.term_id;
    }
  }

  // Direct normalised match against thai label
  const norm = normalizeStr(aiEngine).replace(/\s/g, ""); // "2.0l"
  for (const e of entries) {
    if (normalizeStr(e.thai).replace(/\s/g, "") === norm) return e.term_id;
  }

  // No match
  return createMultilingualNew(aiEngine);
}

/**
 * Match door count.
 * AI gives "4", "4-door", "5-door hatchback" etc.
 * Dataset has thai values that are just number strings: "2", "3", "4", "5", "6".
 */
export function matchDoorCount(aiDoors, dataset) {
  if (!aiDoors || String(aiDoors).trim() === "") return null;

  const entries = (dataset.fields || {}).door_count || [];
  const raw = String(aiDoors).trim();

  // Extract the first integer from the string
  const numMatch = raw.match(/\d+/);
  if (!numMatch) return null;

  const num = numMatch[0];
  for (const e of entries) {
    if (String(e.thai).trim() === num) return e.term_id;
  }

  return createMultilingualNew(aiDoors);
}

/**
 * Match confirmed feature labels against a dataset features array.
 * Returns an array of matched term_ids (unmatched features are silently skipped).
 *
 * @param {string[]} featureLabels  — plain text feature names from the AI/UI
 * @param {Array<{term_id:number,english:string,thai:string}>} datasetFeatures
 * @returns {number[]} array of matched term_ids
 */
export function matchFeatures(featureLabels, datasetFeatures) {
  if (!Array.isArray(featureLabels) || !featureLabels.length) return [];
  const termIds = [];

  for (const label of featureLabels) {
    if (!label) continue;
    const norm = normalizeStr(label);
    const synResolved = resolveSynonym(norm);

    let matched = false;
    for (const e of datasetFeatures) {
      const normEn = normalizeStr(e.english);
      const normTh = normalizeStr(e.thai);
      if (
        normEn === norm ||
        normEn === synResolved ||
        normTh === norm ||
        normTh === synResolved ||
        (normEn && norm.includes(normEn)) ||
        (normEn && normEn.includes(norm))
      ) {
        termIds.push(e.term_id);
        matched = true;
        break;
      }
    }

    // Silently skip unmatched features (can't use create_new for array fields)
    void matched;
  }

  return termIds;
}

/**
 * Match image tag labels against the dataset image_tags array.
 * Returns an array of matched term_ids.
 *
 * @param {string[]} tagLabels  — plain text tag names
 * @param {Array<{term_id:number,english:string,thai:string}>} datasetTags
 * @returns {number[]} array of matched term_ids
 */
export function matchImageTags(tagLabels, datasetTags) {
  if (!Array.isArray(tagLabels) || !tagLabels.length) return [];
  const termIds = [];

  for (const label of tagLabels) {
    if (!label) continue;
    const norm = normalizeStr(label);
    const synResolved = resolveSynonym(norm);

    for (const e of datasetTags) {
      const normEn = normalizeStr(e.english);
      const normTh = normalizeStr(e.thai);
      if (
        normEn === norm ||
        normEn === synResolved ||
        normTh === norm ||
        normTh === synResolved ||
        (normEn && norm.includes(normEn)) ||
        (normEn && normEn.includes(norm))
      ) {
        termIds.push(e.term_id);
        break;
      }
    }
  }

  return termIds;
}

// ---------------------------------------------------------------------------
// Step 3 (continued) – Payload Builder
// ---------------------------------------------------------------------------

/**
 * Build the fully mapped WowCar payload from the current form state.
 *
 * @param {object} form               — current CarListing form state
 * @param {string[]} safetyLabels     — confirmed safety feature text labels
 * @param {string[]} comfortLabels    — confirmed comfort feature text labels
 * @param {object} dataset            — the fetched WowCar dataset
 * @param {string[]} imageTagLabels   — selected image tag labels
 * @returns {{ mapped: object, warnings: string[] }}
 *   mapped: key→value ready for FormData append
 *   warnings: list of fields that fell back to create_new
 */
export function buildMappedPayload(form, safetyLabels, comfortLabels, dataset, imageTagLabels) {
  const fields = dataset.fields || {};
  const warnings = [];

  function track(fieldName, value) {
    if (typeof value === "string" && value.startsWith("{")) {
      try {
        const parsed = JSON.parse(value);
        if (parsed.create_new) warnings.push(fieldName);
      } catch {
        // not JSON
      }
    }
    return value;
  }

  // --- Make ---
  const { termId: makeTermId, matchedKey: matchedMakeKey } = matchMake(
    form.make,
    dataset
  );
  const mappedMake =
    makeTermId != null
      ? track("Make", typeof makeTermId === "number" ? makeTermId : makeTermId)
      : null;

  // --- Model (scoped to resolved make) ---
  const mappedModel = track(
    "Model",
    matchModel(form.model, matchedMakeKey, dataset)
  );

  // --- Taxonomy fields ---
  const mappedBodyStyle = track(
    "Body Style",
    matchTaxonomy(form.body_style, fields.body_style || [])
  );
  const mappedColor = track(
    "Color",
    matchTaxonomy(form.exterior_color, fields.color || [])
  );
  const mappedFuelType = track(
    "Fuel Type",
    matchTaxonomy(form.fuel_type, fields.fuel_type || [])
  );
  const mappedTransmission = track(
    "Transmission",
    matchTaxonomy(form.transmission, fields.transmission || [])
  );
  const mappedDrivetrain = track(
    "Drivetrain",
    matchTaxonomy(form.drivetrain, fields.drivetrain || [])
  );
  const mappedEngineSize = track(
    "Engine Size",
    matchEngineSize(form.engine_displacement, dataset)
  );
  const mappedDoorCount = track(
    "Door Count",
    matchDoorCount(form.door_count, dataset)
  );
  const mappedVehicleType = track(
    "Vehicle Type",
    matchTaxonomy(form.vehicle_type, fields.vehicle_type || [])
  );

  // --- Features (array of term_ids) ---
  const mappedSafety = matchFeatures(safetyLabels, fields.safety_features || []);
  const mappedComfort = matchFeatures(comfortLabels, fields.comfort_features || []);

  // --- Image Tags (array of term_ids) ---
  const mappedImageTags = matchImageTags(
    imageTagLabels || [],
    fields.image_tags || []
  );

  const mapped = {
    // Taxonomy fields (term_id integers or create_new JSON strings)
    make: mappedMake,
    model: mappedModel,
    body_style: mappedBodyStyle,
    vehicle_type: mappedVehicleType,
    color: mappedColor,
    fuel_type: mappedFuelType,
    transmission: mappedTransmission,
    drivetrain: mappedDrivetrain,
    engine_size: mappedEngineSize,
    door_count: mappedDoorCount,

    // Plain text / numeric meta fields
    year: form.year || null,
    model_specific: form.trim || form.model_specific || null,          // "trim" → model_specific  (listivo_13698)
    price: form.asking_price_thb || form.price || null,        // listivo_130_listivo_13
    mileage: form.mileage_km || form.mileage || null,            // listivo_4686
    drive: form.drive || form.drivetrain || null,              // plain-text drive meta    (listivo_27936)
    reference_code: form.reference_code || form.vin || null,            // VIN / ref code           (listivo_8671)

    // Feature arrays (stringified JSON arrays of term_ids)
    safety_features: mappedSafety.length
      ? JSON.stringify(mappedSafety)
      : null,
    comfort_features: mappedComfort.length
      ? JSON.stringify(mappedComfort)
      : null,

    // Image tags (stringified JSON array of term_ids)
    image_tags: mappedImageTags.length
      ? JSON.stringify(mappedImageTags)
      : null,
  };

  return { mapped, warnings };
}

// ---------------------------------------------------------------------------
// Step 4 – Publish Listing
// ---------------------------------------------------------------------------

/** Maximum long-edge in pixels before downscaling. */
const MAX_EDGE_PX = 1920;

/** JPEG quality 0–1. 0.85 gives ~60-80 % size reduction with near-lossless appearance. */
const JPEG_QUALITY = 0.85;

/**
 * Compress any image (PNG / WebP / JPEG) to a JPEG File using an off-screen canvas.
 * Transparently downscales the longest edge to MAX_EDGE_PX if larger.
 *
 * @param {{ base64: string, mimeType: string }} photo
 * @param {string} filename  — desired output filename (extension will be .jpg)
 * @returns {Promise<File>}
 */
async function compressToJpeg(photo, filename) {
  // Build a full data-URL regardless of whether base64 already has the header
  const dataUrl = photo.base64.startsWith("data:")
    ? photo.base64
    : `data:${photo.mimeType || "image/jpeg"};base64,${photo.base64}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Calculate dimensions, capping the longer edge at MAX_EDGE_PX
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > MAX_EDGE_PX || h > MAX_EDGE_PX) {
        if (w >= h) {
          h = Math.round((h * MAX_EDGE_PX) / w);
          w = MAX_EDGE_PX;
        } else {
          w = Math.round((w * MAX_EDGE_PX) / h);
          h = MAX_EDGE_PX;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");

      // Fill white background before drawing (handles PNG transparency)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error(`Canvas toBlob failed for ${filename}`));
            return;
          }
          const jpegName = filename.replace(/\.[^.]+$/, ".jpg");
          resolve(new File([blob], jpegName, { type: "image/jpeg" }));
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${filename}`));
    img.src = dataUrl;
  });
}

/**
 * Publish a car listing to WowCar via multipart/form-data.
 *
 * @param {string}   token           — from loginToWowCar()
 * @param {object}   form            — current CarListing form state
 * @param {string[]} safetyLabels    — confirmed safety feature text labels
 * @param {string[]} comfortLabels   — confirmed comfort feature text labels
 * @param {Array<{base64:string,mimeType:string}>} photos  — raw images from the upload
 * @param {object}   dataset         — from fetchDataset()
 * @param {object}   options         — extra publish options
 * @returns {Promise<{ success:boolean, listing_url?:string, warnings:string[], data:object }>}
 */
export async function publishListing(
  token,
  form,
  safetyLabels,
  comfortLabels,
  photos,
  dataset,
  options = {}
) {
  // ── Required field validation (before any network call) ───────────────────
  const requiredMissing = [];
  if (!String(form.make || "").trim()) requiredMissing.push("Make");
  if (!String(form.model || "").trim()) requiredMissing.push("Model");
  if (!String(form.year || "").trim()) requiredMissing.push("Year");
  if (!String(form.asking_price_thb || "").replace(/[^0-9.]/g, ""))
    requiredMissing.push("Asking Price (THB)");
  if (!String(form.mileage_km || "").replace(/[^0-9.]/g, ""))
    requiredMissing.push("Mileage (km)");
  if (requiredMissing.length > 0) {
    throw new Error(
      `Missing required fields: ${requiredMissing.join(", ")}. Please fill them in the listing form before publishing.`
    );
  }

  const { mapped, warnings } = buildMappedPayload(
    form,
    safetyLabels,
    comfortLabels,
    dataset,
    options.image_tag_labels || []
  );

  const fd = new FormData();

  // ── Authentication (in body, NOT Authorization header) ──
  fd.append("api_token", token);

  // ── Listing status: publish | pending | draft ──
  const finalStatus = options.status || form.status || "publish";
  fd.append("status", finalStatus);

  // ── Taxonomy fields (term_id integers or create_new JSON strings) ──
  const taxonomyFields = [
    "make",
    "model",
    "body_style",
    "vehicle_type",
    "color",
    "fuel_type",
    "transmission",
    "drivetrain",
    "engine_size",
    "door_count",
  ];

  for (const key of taxonomyFields) {
    const val = mapped[key];
    if (val == null) continue;
    // Integers appended as string; create_new objects are already JSON strings
    fd.append(key, String(val));
  }

  // ── Plain-text / Meta fields (checking both form and options) ──
  
  // title (required by WP)
  const finalTitle = form.title || options.title || [form.year, form.make, form.model, form.trim]
    .filter(Boolean)
    .join(" ");
  if (finalTitle) fd.append("title", finalTitle);

  // year  (listivo_4316)
  const finalYear = form.year || options.year || null;
  if (finalYear) fd.append("year", String(finalYear));

  // price (listivo_130_listivo_13)
  const finalPrice = form.asking_price_thb || form.price || options.price || null;
  if (finalPrice) fd.append("price", String(finalPrice));

  // mileage (listivo_4686)
  const finalMileage = form.mileage_km || form.mileage || options.mileage || null;
  if (finalMileage) fd.append("mileage", String(finalMileage));

  // model_specific / trim (listivo_13698)
  const finalModelSpecific = form.trim || form.model_specific || options.model_specific || null;
  if (finalModelSpecific) fd.append("model_specific", String(finalModelSpecific));



  // reference code (listivo_8671)
  const finalRefCode = form.reference_code || options.reference_code || null;
  if (finalRefCode) fd.append("reference_code", String(finalRefCode));

  // VIN
  const finalVin = form.vin || options.vin || null;
  if (finalVin) fd.append("vin", String(finalVin));

  // expire
  const finalExpire = form.expire || options.expire || null;
  if (finalExpire) fd.append("expire", String(finalExpire));

  // featured_expire
  const finalFeaturedExpire = form.featured_expire || options.featured_expire || null;
  if (finalFeaturedExpire) fd.append("featured_expire", String(finalFeaturedExpire));

  // image_ids (attaching existing media IDs)
  const finalImageIds = form.image_ids || options.image_ids || null;
  if (finalImageIds) {
    let parsedIds = [];
    if (Array.isArray(finalImageIds)) {
      parsedIds = finalImageIds;
    } else if (typeof finalImageIds === "string") {
      parsedIds = finalImageIds
        .split(",")
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id));
    } else if (typeof finalImageIds === "number") {
      parsedIds = [finalImageIds];
    }
    if (parsedIds.length > 0) {
      fd.append("image_ids", JSON.stringify(parsedIds));
    }
  }

  // reasons_to_buy (listivo_13700)
  const finalReasons = form.reasons_to_buy || options.reasons_to_buy || null;
  if (finalReasons) fd.append("reasons_to_buy", String(finalReasons));

  // address (listivo_153_address)
  const finalAddress = form.address || options.address || null;
  if (finalAddress) fd.append("address", String(finalAddress));

  // lat (listivo_153_lat)
  const finalLat = form.lat || options.lat || null;
  if (finalLat) fd.append("lat", String(finalLat));

  // lng (listivo_153_lng)
  const finalLng = form.lng || options.lng || null;
  if (finalLng) fd.append("lng", String(finalLng));

  // line_id (listivo_8739)
  const finalLineId = form.line_id || options.line_id || null;
  if (finalLineId) fd.append("line_id", String(finalLineId));

  // dealer_price (listivo_8737)
  const finalDealerPrice = form.dealer_price || options.dealer_price || null;
  if (finalDealerPrice) {
    const cleanDP = typeof finalDealerPrice === "string" 
      ? Number(finalDealerPrice.replace(/[^0-9.]/g, "")) 
      : Number(finalDealerPrice);
    if (!isNaN(cleanDP)) {
      fd.append("dealer_price", String(cleanDP));
    }
  }

  // ── Multilingual descriptions — JSON.stringify'd object ──
  // Use preview advert descriptions only.
  const advert = options.advert || {};
  const thaiDescription = options.descriptions?.thai || advert.th?.description || "";
  const descriptionsObj = {
    english: options.descriptions?.english || advert.en?.description || "",
    thai: thaiDescription,
    arabic: options.descriptions?.arabic || "",
    chinese: options.descriptions?.chinese || "",
  };
  // Merge form.descriptions if it's passed (as object or string)
  if (form.descriptions) {
    try {
      const formDesc = typeof form.descriptions === "string" ? JSON.parse(form.descriptions) : form.descriptions;
      Object.assign(descriptionsObj, formDesc);
    } catch {
      // Not valid JSON, ignore
    }
  }
  console.log("advert.th", advert.th);
  console.log("options.descriptions", options.descriptions);
  console.log("final descriptionsObj", descriptionsObj);
  fd.append("descriptions", JSON.stringify(descriptionsObj));

  // ── Video — JSON.stringify'd object {url, embed} ──
  const videoObj = { url: "", embed: "" };
  if (options.video?.url) {
    videoObj.url = options.video.url;
    videoObj.embed = options.video.embed || "";
  } else if (form.video_url) {
    videoObj.url = form.video_url;
  } else if (form.video) {
    try {
      const formVideo = typeof form.video === "string" ? JSON.parse(form.video) : form.video;
      Object.assign(videoObj, formVideo);
    } catch {
      if (typeof form.video === "string") {
        videoObj.url = form.video;
      }
    }
  }
  if (videoObj.url) {
    fd.append("video", JSON.stringify(videoObj));
  }

  // ── Feature arrays — must be JSON.stringify'd ──
  if (mapped.safety_features)  fd.append("safety_features", mapped.safety_features);
  if (mapped.comfort_features) fd.append("comfort_features", mapped.comfort_features);

  // ── Image tags — JSON.stringify'd array of term_ids ──
  if (mapped.image_tags) fd.append("image_tags", mapped.image_tags);

  // ── Images — compress to JPEG then append as images[] ──
  const validPhotos = (photos || []).filter((p) => p?.base64);
  const imageFiles = await Promise.all(
    validPhotos.map((photo, idx) =>
      compressToJpeg(photo, `car-photo-${idx + 1}.jpg`)
    )
  );
  imageFiles.forEach((file) => {
    fd.append("images[]", file, file.name);
  });

  for (const [key, value] of fd.entries()) {
    console.log("FORMDATA", key, value);
  }

  // ── POST ──
  const res = await fetch(
    `${WOWCAR_BASE}/wp-json/wowcar/v1/create-listing`,
    {
      method: "POST",
      body: fd,
      // DO NOT set Content-Type — browser sets it automatically with boundary
    }
  );

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(
      `Publish failed (HTTP ${res.status}). Server returned non-JSON response.`
    );
  }

  if (!res.ok || data.success === false) {
    const msg =
      data?.message ||
      data?.data?.message ||
      `Publish failed (HTTP ${res.status})`;
    throw new Error(msg);
  }

  // ── Build rich warnings from API created_terms + client-side warnings ──
  // The API response may include created_terms with actual term names.
  // Prefer those over our internal field-name-only list.
  const apiCreatedTerms = Array.isArray(data.created_terms) ? data.created_terms : [];
  const richWarnings = apiCreatedTerms.length > 0
    ? apiCreatedTerms.map((t) => {
        const fieldLabel = t.field
          ? t.field.charAt(0).toUpperCase() + t.field.slice(1).replace(/_/g, " ")
          : "Unknown field";
        return `${fieldLabel}: "${t.name}" (new term created)`;
      })
    : warnings.map((w) => `${w}: new term was created in WowCar database`);

  return {
    success: true,
    listing_url: data.listing_url || data.url || data.link || null,
    listing_id: data.listing_id || data.post_id || null,
    warnings: richWarnings,
    created_terms: apiCreatedTerms,
    data,
  };
}
