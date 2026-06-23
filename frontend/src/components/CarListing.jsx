import React from "react";
import {
  FaCalendarDays,
  FaCar,
  FaPalette,
  FaGasPump,
  FaArrowsUpDown,
  FaCouch,
  FaTag,
  FaDownload,
  FaPenToSquare,
  FaCircleCheck,
  FaShieldHalved,
  FaWandSparkles,
  FaSpinner,
  FaCopy,
  FaChevronLeft,
  FaChevronRight,
  FaCircleExclamation,
  FaTriangleExclamation,
  FaFacebook,
  FaInstagram,
  FaShareNodes,
} from "react-icons/fa6";
import { TbEngineFilled, TbManualGearbox, TbAutomaticGearbox } from "react-icons/tb";
import { GiCarDoor } from "react-icons/gi";
import ConfidenceBadge from "./ConfidenceBadge";
import { useAppConfig } from "../context/AppConfigContext";
import { useLanguage } from "../context/LanguageContext";
import { generateCarAdvert, translateField } from "../services/geminiService";
import PublishToWowCar from "./PublishToWowCar";
import PublishToFacebook from "./PublishToFacebook";
import {
  publishToAyrshare,
  getSocialMediaUrls,
} from "../services/ayrshareService";

function formatPrice(n) {
  if (n == null || n === "") return null;
  const num = typeof n === "number" ? n : Number(String(n).replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(num)) return String(n);
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(num);
}

function sanitizeFilePart(s) {
  if (s == null || s === "") return "";
  return String(s)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function buildListingJsonObject(form) {
  return {
    make: form.make || null,
    model: form.model || null,
    year: form.year || null,
    trim: form.trim || null,
    body_style: form.body_style || null,
    vehicle_type: form.vehicle_type || null,
    exterior_color: form.exterior_color || null,
    fuel_type: form.fuel_type || null,
    transmission: form.transmission || null,
    drivetrain: form.drivetrain || null,
    engine_displacement: form.engine_displacement || null,
    door_count: form.door_count || null,
    vin: form.vin || null,
    reference_code: form.reference_code || null,
    asking_price_thb: parsePriceValue(form.asking_price_thb),
    mileage_km: parsePriceValue(form.mileage_km),
    estimated_price_thb: parsePriceValue(form.estimated_price_thb),
    estimated_price_min_thb: parsePriceValue(form.estimated_price_min_thb),
    estimated_price_max_thb: parsePriceValue(form.estimated_price_max_thb),
    notes: form.notes || null,
    confidence: form.confidence ?? null,
    title: form.title || null,
    status: form.status || null,
    dealer_price: parsePriceValue(form.dealer_price),
    reasons_to_buy: form.reasons_to_buy || null,
    address: form.address || null,
    lat: form.lat || null,
    lng: form.lng || null,
    line_id: form.line_id || null,
    drive: form.drive || null,
    expire: form.expire || null,
    featured_expire: form.featured_expire || null,
    video_url: form.video_url || null,
    image_ids: form.image_ids || null,
  };
}

function parsePriceValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isNaN(num) ? null : num;
}

function buildFormState(data) {
  if (!data || typeof data !== "object") return {};

  let autoTitle = data.title || "";
  if (!autoTitle) {
    const parts = [data.year, data.make, data.model, data.trim].filter(Boolean);
    autoTitle = parts.join(" ");
  }

  return {
    make: data.make ?? "",
    model: data.model ?? "",
    year: data.year ?? "",
    trim: data.trim ?? "",
    body_style: data.body_style ?? "",
    vehicle_type: data.vehicle_type ?? "",
    exterior_color: data.exterior_color ?? "",
    fuel_type: data.fuel_type ?? "",
    transmission: data.transmission ?? "",
    drivetrain: data.drivetrain ?? "",
    engine_displacement: data.engine_displacement ?? "",
    door_count: data.door_count ?? "",
    vin: data.vin ?? "",
    reference_code: data.reference_code ?? "",
    asking_price_thb: data.asking_price_thb || "",
    mileage_km: data.mileage_km ?? "",
    estimated_price_thb: data.estimated_price_thb ?? "",
    estimated_price_min_thb: data.estimated_price_min_thb ?? "",
    estimated_price_max_thb: data.estimated_price_max_thb ?? "",
    notes: data.notes ?? "",
    confidence: data.confidence ?? null,
    title: autoTitle,
    status: data.status || "draft",
    dealer_price: data.dealer_price ?? "",
    reasons_to_buy: data.reasons_to_buy ?? "",
    address: data.address ?? "",
    lat: data.lat ?? "",
    lng: data.lng ?? "",
    line_id: data.line_id ?? "",
    drive: data.drive || data.drivetrain || "",
    expire: data.expire ?? "",
    featured_expire: data.featured_expire ?? "",
    video_url: data.video_url ?? "",
    image_ids: data.image_ids ?? "",
  };
}

function downloadListingForm(form) {
  const payload = buildListingJsonObject(form);
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const base = [form.year, form.make, form.model]
    .filter(Boolean)
    .map(sanitizeFilePart)
    .filter(Boolean)
    .join("-");
  const name = base
    ? `listing-${base}.json`
    : `listing-${new Date().toISOString().slice(0, 10)}.json`;
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function FormField({
  label,
  value,
  confidence,
  placeholder,
  readOnly = false,
  inputMode,
  onChange,
  required = false,
}) {
  const c = confidence;
  const isEmpty = value === null || value === undefined || value === "";
  const display = isEmpty ? "" : String(value);
  const inputClass = readOnly
    ? "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none ring-brand-orange/20 focus:ring-2"
    : "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-brand-orange/20 transition focus:border-brand-orange/40 focus:ring-2";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {label} {required && <span className="text-red-500 font-bold">*</span>}
        </label>
        {c && <ConfidenceBadge level={isEmpty ? "unknown" : c} />}
      </div>
      <input
        readOnly={readOnly}
        inputMode={inputMode}
        value={display}
        onChange={readOnly ? undefined : (e) => onChange?.(e.target.value)}
        placeholder={isEmpty ? placeholder : undefined}
        className={`${inputClass}${isEmpty ? " italic text-gray-400" : ""}`}
      />
    </div>
  );
}

function asFeatureList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (f) => f && typeof f.feature === "string" && f.feature.trim() && f.detected,
  );
}

function featureCategory(source, key, legacyKey) {
  return asFeatureList(source[key] ?? source[legacyKey]);
}

function featureKey(category, featureItem) {
  const stable =
    typeof featureItem === "object"
      ? featureItem.feature_en || featureItem.feature
      : featureItem;
  return `${category}:${stable}`;
}

function FeatureGroup({
  title,
  icon: Icon,
  categoryKey,
  features,
  confirmed,
  onToggle,
  t,
}) {
  if (!features.length) return null;
  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
        {Icon && <Icon className="h-4 w-4 text-brand-orange" />}
        {title}
      </h3>
      <div className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
        {features.map((f) => {
          const key = featureKey(categoryKey, f);
          const isOnCar = confirmed[key] !== false;
          const confidenceHint =
            typeof f.confidence === "number"
              ? t("listing.aiConfidence", {
                percent: Math.round(f.confidence * 100),
              })
              : undefined;
          return (
            <label
              key={key}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg py-0.5 transition hover:bg-gray-50"
              title={confidenceHint}
            >
              <input
                type="checkbox"
                checked={isOnCar}
                onChange={() => onToggle(key)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-orange focus:ring-2 focus:ring-brand-orange/30"
              />
              <span
                className={`text-sm leading-snug ${isOnCar ? "text-gray-700" : "text-gray-400 line-through"
                  }`}
              >
                {f.feature}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function buildInitialConfirmed(safety, comfort) {
  const next = {};
  for (const f of safety) {
    next[featureKey("safety", f)] = true;
  }
  for (const f of comfort) {
    next[featureKey("comfort", f)] = true;
  }
  return next;
}

function FeaturesPanel({ features, confirmed, onToggle, t }) {
  const source = features && typeof features === "object" ? features : {};
  const safety = featureCategory(source, "safety", "safety_features");
  const comfort = featureCategory(source, "comfort", "comfort_features");

  if (!safety.length && !comfort.length) {
    if (source.error) {
      return (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800 shadow-sm">
          {t("listing.featuresUnavailable")}
        </div>
      );
    }
    return null;
  }

  const featureKeys = [
    ...safety.map((f) => featureKey("safety", f)),
    ...comfort.map((f) => featureKey("comfort", f)),
  ];
  const confirmedCount = featureKeys.filter((key) => confirmed[key] !== false).length;
  const totalCount = featureKeys.length;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
        <div className="flex items-center gap-2">
          <FaCircleCheck className="h-4 w-4 shrink-0 text-brand-orange" />
          <span className="text-sm font-semibold text-gray-700">
            {t("listing.detectedFeatures")}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-gray-500">
          {t("listing.featuresHint")}
        </p>
        <p className="mt-1 text-xs font-medium text-gray-600">
          {t("listing.featuresConfirmed", {
            confirmed: confirmedCount,
            total: totalCount,
          })}
        </p>
      </div>
      <div className="space-y-6 p-5 sm:p-6">
        <FeatureGroup
          title={t("listing.safetyFeatures")}
          categoryKey="safety"
          features={safety}
          confirmed={confirmed}
          onToggle={onToggle}
          t={t}
        />
        <FeatureGroup
          title={t("listing.comfortFeatures")}
          categoryKey="comfort"
          features={comfort}
          confirmed={confirmed}
          onToggle={onToggle}
          t={t}
        />
      </div>
    </div>
  );
}

function resolveFieldValue(field, form) {
  if (field.key === "asking_price_thb") return form.asking_price_thb ?? null;
  if (field.key === "mileage_km") return form.mileage_km ?? null;
  if (field.type === "price") return form.estimated_price_thb ?? null;
  return form[field.key] ?? null;
}

function resolveFieldConfidence(field, c) {
  if (field.key === "asking_price_thb") return c.asking_price_thb || "unknown";
  if (field.key === "mileage_km") return c.mileage_km || "unknown";
  if (field.type === "price") return c.estimated_price_thb;
  return c[field.key];
}

function downloadImage(src, fileName) {
  const a = document.createElement("a");
  a.href = src;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function normalizeFieldText(value) {
  if (value == null) return "";
  const s = String(value).trim();
  return s;
}

function buildAdvertPayload(form, dataEn, dataTh, features, confirmedFeatures, language) {
  const sourceEn = dataEn && typeof dataEn === "object" ? dataEn : {};
  const sourceTh = dataTh && typeof dataTh === "object" ? dataTh : {};

  const globalKeys = [
    "make",
    "model",
    "year",
    "trim",
    "door_count",
    "engine_displacement",
    "vin",
    "asking_price_thb",
    "mileage_km",
    "estimated_price_thb",
    "estimated_price_min_thb",
    "estimated_price_max_thb",
  ];

  const pickEn = (key) => {
    if (globalKeys.includes(key)) {
      return normalizeFieldText(form[key] ?? sourceEn[key] ?? sourceTh[key]);
    }
    if (key === "notes") {
      return normalizeFieldText(language === "en" ? form.notes : (sourceEn.notes ?? form.notes));
    }
    // Localized key
    if (language === "en") {
      return normalizeFieldText(form[key] ?? sourceEn[key]);
    } else {
      // Form is Thai, translate to English
      const val = form[key] ?? sourceTh[key];
      const hasChanged = String(val).trim() !== String(sourceTh[key] || "").trim();
      if (hasChanged && val) {
        return normalizeFieldText(translateField(val, "en"));
      }
      return normalizeFieldText(sourceEn[key] ?? (val ? translateField(val, "en") : ""));
    }
  };

  const pickTh = (key) => {
    if (globalKeys.includes(key)) {
      return normalizeFieldText(form[key] ?? sourceTh[key] ?? sourceEn[key]);
    }
    if (key === "notes") {
      return normalizeFieldText(language === "th" ? form.notes : (sourceTh.notes ?? form.notes));
    }
    // Localized key
    if (language === "th") {
      return normalizeFieldText(form[key] ?? sourceTh[key]);
    } else {
      // Form is English, translate to Thai
      const val = form[key] ?? sourceEn[key];
      const hasChanged = String(val).trim() !== String(sourceEn[key] || "").trim();
      if (hasChanged && val) {
        return normalizeFieldText(translateField(val, "th"));
      }
      return normalizeFieldText(sourceTh[key] ?? (val ? translateField(val, "th") : ""));
    }
  };

  const sourceFeatures = features && typeof features === "object" ? features : {};
  const safety = featureCategory(sourceFeatures, "safety", "safety_features")
    .filter((item) => item?.feature && confirmedFeatures[featureKey("safety", item)] !== false)
    .map((item) => item.feature);
  const comfort = featureCategory(sourceFeatures, "comfort", "comfort_features")
    .filter((item) => item?.feature && confirmedFeatures[featureKey("comfort", item)] !== false)
    .map((item) => item.feature);

  return {
    vehicle: {
      en: {
        make: pickEn("make"),
        model: pickEn("model"),
        year: pickEn("year"),
        trim: pickEn("trim"),
        body_style: pickEn("body_style"),
        vehicle_type: pickEn("vehicle_type"),
        exterior_color: pickEn("exterior_color"),
        fuel_type: pickEn("fuel_type"),
        transmission: pickEn("transmission"),
        engine_displacement: pickEn("engine_displacement"),
        drivetrain: pickEn("drivetrain"),
        door_count: pickEn("door_count"),
        vin: pickEn("vin"),
        estimated_price_thb: pickEn("estimated_price_thb"),
        estimated_price_min_thb: pickEn("estimated_price_min_thb"),
        estimated_price_max_thb: pickEn("estimated_price_max_thb"),
        asking_price_thb: pickEn("asking_price_thb"),
        mileage_km: pickEn("mileage_km"),
        notes: pickEn("notes"),
        safety_features: safety,
        comfort_features: comfort,
      },
      th: {
        make: pickTh("make"),
        model: pickTh("model"),
        year: pickTh("year"),
        trim: pickTh("trim"),
        body_style: pickTh("body_style"),
        vehicle_type: pickTh("vehicle_type"),
        exterior_color: pickTh("exterior_color"),
        fuel_type: pickTh("fuel_type"),
        transmission: pickTh("transmission"),
        engine_displacement: pickTh("engine_displacement"),
        drivetrain: pickTh("drivetrain"),
        door_count: pickTh("door_count"),
        vin: pickTh("vin"),
        estimated_price_thb: pickTh("estimated_price_thb"),
        estimated_price_min_thb: pickTh("estimated_price_min_thb"),
        estimated_price_max_thb: pickTh("estimated_price_max_thb"),
        asking_price_thb: pickTh("asking_price_thb"),
        mileage_km: pickTh("mileage_km"),
        notes: pickTh("notes"),
        safety_features: safety,
        comfort_features: comfort,
      },
    },
  };
}

function normalizeAdvertResult(result) {
  const coerceSection = (section) => {
    const current = section && typeof section === "object" ? section : {};
    return {
      title: normalizeFieldText(current.title),
      description: normalizeFieldText(current.description),
      key_specs: Array.isArray(current.key_specs) ? current.key_specs.filter(Boolean) : [],
      short_caption: normalizeFieldText(current.short_caption),
      hashtags: Array.isArray(current.hashtags) ? current.hashtags.filter(Boolean) : [],
    };
  };

  const advert = result?.advert && typeof result.advert === "object" ? result.advert : {};
  return {
    ...result,
    success: Boolean(result?.success ?? true),
    advert: {
      en: coerceSection(advert.en),
      th: coerceSection(advert.th),
    },
  };
}

export default function CarListing({
  data,
  dataEn,
  previewUrl,
  previewUrls,
  enhancedUrls,
  enhancedMeta,
  enhanceStatus,
  onAdvertPreviewChange,
  photos,
  confirmedFeaturesProp,
  advertProp,
  onSave,
}) {
  const { config } = useAppConfig();
  const { language, t } = useLanguage();
  const injectedFields = [
    { key: "engine_displacement", label: t("fields.engine_displacement"), type: "text" },
    { key: "asking_price_thb", label: t("fields.asking_price_thb"), type: "price" },
    { key: "estimated_price_thb", label: t("fields.estimated_price_thb"), type: "price" },
    { key: "mileage_km", label: t("fields.mileage_km"), type: "text" },
  ];
  const orderedFieldKeys = [
    "year",
    "make",
    "model",
    "trim",
    "body_style",
    "door_count",
    "exterior_color",
    "fuel_type",
    "transmission",
    "drivetrain",
  ];
  const orderedFields = orderedFieldKeys
    .map((key) => {
      let field = config.listingFields?.find((f) => f.key === key);
      if (!field && key === "vin") {
        field = { key: "vin", label: "VIN", type: "text" };
      }
      return field;
    })
    .filter(Boolean);
  const remainingFields = config.listingFields.filter(
    (field) => !orderedFieldKeys.includes(field.key),
  );
  const excludedKeys = [
    "estimated_price_range",
    "estimated_price_min_thb",
    "estimated_price_max_thb",
    "estimated_price_thb",
    "engine_displacement",
    "asking_price_thb",
    "mileage_km",
    "title",
    "status",
    "dealer_price",
    "address",
    "line_id",
    "drive",
    "video_url",
    "image_ids",
    "vin",
    "vehicle_type",
    "reference_code",
    "reasons_to_buy",
    "lat",
    "lng",
    "expire",
    "featured_expire",
  ];
  const listingFields = [
    ...orderedFields,
    ...remainingFields.filter(
      (field) => !excludedKeys.includes(field.key)
    ),
    ...injectedFields,
  ];
  const [form, setForm] = React.useState(() => buildFormState(data));
  const [draft, setDraft] = React.useState(() => buildFormState(data));
  const [isEditing, setIsEditing] = React.useState(false);
  const [formErrors, setFormErrors] = React.useState([]);
  const [advert, setAdvert] = React.useState(() => advertProp ?? { en: null, th: null });
  const [advertLoading, setAdvertLoading] = React.useState(false);
  const [advertError, setAdvertError] = React.useState("");
  const [advertSuccess, setAdvertSuccess] = React.useState("");
  const [hasGeneratedAdvert, setHasGeneratedAdvert] = React.useState(() => {
    const initialAdvert = advertProp ?? { en: null, th: null };
    return Boolean(initialAdvert.en || initialAdvert.th);
  });
  const [showAdvertPage, setShowAdvertPage] = React.useState(false);
  const [showPublishModal, setShowPublishModal] = React.useState(false);
  const [showFacebookModal, setShowFacebookModal] = React.useState(false);
  const [advertTab, setAdvertTab] = React.useState("text"); // "text" or "image"

  // ── Ayrshare social publishing state ──
  const [publishingFacebook, setPublishingFacebook] = React.useState(false);
  const [publishingInstagram, setPublishingInstagram] = React.useState(false);
  const [publishingAll, setPublishingAll] = React.useState(false);
  const [socialPublishResults, setSocialPublishResults] = React.useState({
    facebook: null,
    instagram: null,
  });
  const [socialPublishErrors, setSocialPublishErrors] = React.useState({
    facebook: null,
    instagram: null,
  });
  const [facebookPosted, setFacebookPosted] = React.useState(false);
  const [instagramPosted, setInstagramPosted] = React.useState(false);

  const sourceFeatures = data.features && typeof data.features === "object" ? data.features : {};
  const safetyFeatures = React.useMemo(() => featureCategory(sourceFeatures, "safety", "safety_features"), [sourceFeatures]);
  const comfortFeatures = React.useMemo(() => featureCategory(sourceFeatures, "comfort", "comfort_features"), [sourceFeatures]);

  const [confirmedFeatures, setConfirmedFeatures] = React.useState(() =>
    confirmedFeaturesProp ?? buildInitialConfirmed(safetyFeatures, comfortFeatures),
  );

  const predictedSignature = React.useMemo(
    () =>
      JSON.stringify({
        safety: safetyFeatures.map((f) => f.feature),
        comfort: comfortFeatures.map((f) => f.feature),
      }),
    [safetyFeatures, comfortFeatures],
  );

  React.useEffect(() => {
    if (confirmedFeaturesProp) {
      setConfirmedFeatures(confirmedFeaturesProp);
    } else {
      setConfirmedFeatures(buildInitialConfirmed(safetyFeatures, comfortFeatures));
    }
  }, [confirmedFeaturesProp, predictedSignature, safetyFeatures, comfortFeatures]);

  React.useEffect(() => {
    if (advertProp) {
      setAdvert(advertProp);
      setHasGeneratedAdvert(Boolean(advertProp.en || advertProp.th));
    } else {
      setAdvert({ en: null, th: null });
      setHasGeneratedAdvert(false);
    }
  }, [advertProp]);

  const toggleFeature = React.useCallback((key) => {
    setConfirmedFeatures((prev) => {
      const next = { ...prev, [key]: prev[key] === false };
      onSave?.(form, next, advert, language);
      return next;
    });
  }, [form, advert, onSave, language]);

  React.useEffect(() => {
    onAdvertPreviewChange?.(showAdvertPage);
  }, [onAdvertPreviewChange, showAdvertPage]);

  React.useEffect(() => {
    if (!advertSuccess) return undefined;
    const timer = window.setTimeout(() => {
      setAdvertSuccess("");
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [advertSuccess]);

  React.useEffect(() => {
    const next = buildFormState(data);
    setForm(next);
    setDraft(next);
    setIsEditing(false);
  }, [data]);

  const setTextField = (key, raw, options = {}) => {
    const { confirm = false } = options;
    setDraft((prev) => {
      const next = {
        ...prev,
        [key]: raw,
      };
      if (confirm) {
        next.confidence = {
          ...(prev.confidence || {}),
          [key]: "confirmed",
        };
      }
      if (key === "year" || key === "make" || key === "model" || key === "trim") {
        const parts = [next.year, next.make, next.model, next.trim].filter(Boolean);
        next.title = parts.join(" ");
      }
      return next;
    });
  };

  const validateListingForm = React.useCallback((formData) => {
    const errors = [];

    // Required fields: make, model, year, asking_price_thb
    if (!formData.make || String(formData.make).trim() === "") {
      errors.push({ key: "listing.publishRequiredFieldMissing", vars: { fieldKey: "fields.make" } });
    }
    if (!formData.model || String(formData.model).trim() === "") {
      errors.push({ key: "listing.publishRequiredFieldMissing", vars: { fieldKey: "fields.model" } });
    }
    if (!formData.year || String(formData.year).trim() === "") {
      errors.push({ key: "listing.publishRequiredFieldMissing", vars: { fieldKey: "fields.year" } });
    } else {
      const yearStr = String(formData.year).trim();
      if (yearStr.replace(/[^0-9]/g, "").length !== 4 || /\d{4}\s*[-–\/]\s*\d{4}/.test(yearStr)) {
        errors.push({ key: "listing.publishYearInvalid" });
      } else {
        const yearNum = parseInt(yearStr, 10);
        const currentYear = new Date().getFullYear();
        if (yearNum < 1900 || yearNum > currentYear + 2) {
          errors.push({ key: "listing.yearRangeInvalid", vars: { min: 1900, max: currentYear + 2 } });
        }
      }
    }

    if (!formData.asking_price_thb || String(formData.asking_price_thb).trim() === "") {
      errors.push({ key: "listing.publishRequiredFieldMissing", vars: { fieldKey: "fields.asking_price_thb" } });
    } else {
      const parsedPrice = parsePriceValue(formData.asking_price_thb);
      if (parsedPrice === null || parsedPrice <= 0 || Number.isNaN(parsedPrice)) {
        errors.push({ key: "listing.priceInvalid" });
      }
    }

    // Optional fields format: mileage_km
    if (formData.mileage_km !== undefined && formData.mileage_km !== null && String(formData.mileage_km).trim() !== "") {
      const parsedMileage = parsePriceValue(formData.mileage_km);
      if (parsedMileage === null || parsedMileage < 0 || Number.isNaN(parsedMileage)) {
        errors.push({ key: "listing.mileageInvalid" });
      }
    }

    return errors;
  }, []);

  const applyDraft = () => {
    const errors = validateListingForm(draft);

    if (errors.length > 0) {
      setFormErrors(errors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setFormErrors([]);
    const resetAdvert = { en: null, th: null };
    setForm(draft);
    setIsEditing(false);
    setAdvert(resetAdvert);
    setAdvertError("");
    setAdvertSuccess("");
    setHasGeneratedAdvert(false);
    setShowAdvertPage(false);
    setSocialPublishResults({ facebook: null, instagram: null });
    setSocialPublishErrors({ facebook: null, instagram: null });
    setFacebookPosted(false);
    setInstagramPosted(false);
    onSave?.(draft, confirmedFeatures, resetAdvert, language);
  };

  const revertDraft = () => {
    setDraft(form);
    setIsEditing(false);
    setFormErrors([]);
  };

  const handleCreateAdvert = React.useCallback(async () => {
    const current = isEditing ? draft : form;
    const errors = validateListingForm(current);
    if (errors.length > 0) {
      setFormErrors(errors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setFormErrors([]);
    setAdvertLoading(true);
    setAdvertError("");
    try {
      const payload = buildAdvertPayload(current, dataEn, data, data.features, confirmedFeatures, language);
      const result = await generateCarAdvert(payload.vehicle);
      const normalized = normalizeAdvertResult(result);
      const newAdvert = {
        en: normalized.advert.en,
        th: normalized.advert.th,
      };
      setAdvert(newAdvert);
      setHasGeneratedAdvert(true);
      setAdvertSuccess(t("listing.advertCreated"));
      setSocialPublishResults({ facebook: null, instagram: null });
      setSocialPublishErrors({ facebook: null, instagram: null });
      setFacebookPosted(false);
      setInstagramPosted(false);
      onSave?.(current, confirmedFeatures, newAdvert, language);
    } catch (err) {
      setAdvertError(t("listing.serverError") || err.message);
    } finally {
      setAdvertLoading(false);
    }
  }, [data, dataEn, draft, form, isEditing, t, confirmedFeatures, onSave, language, validateListingForm]);

  const handlePublishClick = () => {
    setAdvertError("");
    const requiredFields = [
      { key: "title", labelKey: "fields.title" },
      { key: "make", labelKey: "fields.make" },
      { key: "model", labelKey: "fields.model" },
      { key: "year", labelKey: "fields.year" },
      { key: "asking_price_thb", labelKey: "fields.asking_price_thb" },
      { key: "mileage_km", labelKey: "fields.mileage_km" },
    ];

    const targetForm = isEditing ? draft : form;
    const errors = [];

    requiredFields.forEach((f) => {
      const val = targetForm?.[f.key];
      if (val === undefined || val === null || String(val).trim() === "") {
        errors.push({ key: "listing.publishRequiredFieldMissing", vars: { fieldKey: f.labelKey } });
      }
    });

    const yearStr = String(targetForm.year || "").trim();
    if (yearStr) {
      if (yearStr.replace(/[^0-9]/g, "").length !== 4 || /\d{4}\s*[-–\/]\s*\d{4}/.test(yearStr)) {
        errors.push({ key: "listing.publishYearInvalid" });
      }
    }

    if (errors.length > 0) {
      setAdvertError(errors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setShowPublishModal(true);
  };

  // ── Ayrshare social publish handler ──
  const handleSocialPublish = React.useCallback(
    async (platformKey) => {
      // Validate advert exists
      const currentAdvert = language === "th" ? advert.th : advert.en;
      if (!currentAdvert) {
        setSocialPublishErrors((prev) => ({
          ...prev,
          [platformKey]: "No advert content found. Please generate an advert first.",
        }));
        return;
      }

      // Map platform key to Ayrshare platform identifiers
      const platformMap = {
        facebook: ["facebook"],
        instagram: ["instagram"],
        all: ["facebook", "instagram"],
      };
      const platforms = platformMap[platformKey];
      if (!platforms) return;

      // Set loading state early so user sees feedback during image upload
      const setLoading =
        platformKey === "facebook"
          ? setPublishingFacebook
          : platformKey === "instagram"
            ? setPublishingInstagram
            : setPublishingAll;

      setLoading(true);
      setSocialPublishResults((prev) => ({ ...prev, [platformKey]: null }));
      setSocialPublishErrors((prev) => ({ ...prev, [platformKey]: null }));

      try {
        const currentForm = isEditing ? draft : form;

        // Get or upload media to get public URLs (async — may upload data:/blob: images)
        const mediaUrls = await getSocialMediaUrls(enhancedUrls, photos);
        if (mediaUrls.length === 0) {
          throw new Error(
            "No images available for social publishing. Please upload or enhance a car image first."
          );
        }

        const postText = formatAdvertForCopy(language, currentAdvert);
        if (!postText.trim()) {
          throw new Error("Advert content is empty. Please generate an advert with content first.");
        }

        const result = await publishToAyrshare({
          post: postText,
          platforms,
          mediaUrls: mediaUrls,
        });

        setSocialPublishResults((prev) => ({ ...prev, [platformKey]: result }));

        const isSuccess = Array.isArray(result?.postIds) && result.postIds.some(
          (item) => item.status === "success"
        );
        if (isSuccess) {
          if (platformKey === "facebook") {
            setFacebookPosted(true);
          } else if (platformKey === "instagram") {
            setInstagramPosted(true);
          }
        }
      } catch (err) {
        const msg = err?.message || "An unexpected error occurred during social publishing.";
        let errorMsg = msg;

        // Detect duplicate post error
        if (/duplicate/i.test(msg) || /identical/i.test(msg)) {
          errorMsg = platformKey === "facebook"
            ? t("listing.alreadyPostedFacebook")
            : t("listing.alreadyPostedInstagram");
          if (platformKey === "facebook") {
            setFacebookPosted(true);
          } else if (platformKey === "instagram") {
            setInstagramPosted(true);
          }
        }
        // Detect common Ayrshare-specific errors and give clearer messages
        else if (/facebook.*not connected/i.test(msg) || /facebook.*not linked/i.test(msg)) {
          errorMsg = "Facebook account is not connected in the Ayrshare dashboard. Please connect it first.";
        } else if (/instagram.*not connected/i.test(msg) || /instagram.*not linked/i.test(msg)) {
          errorMsg = "Instagram account is not connected in the Ayrshare dashboard. Please connect it first.";
        } else if (/permission/i.test(msg)) {
          errorMsg = "Permission denied. Please check your Ayrshare account permissions for the target platform.";
        } else if (/media upload failed/i.test(msg) || /upload/i.test(msg)) {
          errorMsg = `Image upload failed: ${msg}. Please try again.`;
        }

        setSocialPublishErrors((prev) => ({ ...prev, [platformKey]: errorMsg }));
      } finally {
        setLoading(false);
      }
    },
    [advert, language, isEditing, draft, form, enhancedUrls, photos, safetyFeatures, comfortFeatures, confirmedFeatures, t]
  );

  const handleCopyAdvert = React.useCallback(async (language) => {
    const content = advert?.[language];
    if (!content) return;
    const text = formatAdvertForCopy(language, content);
    await navigator.clipboard.writeText(text);
  }, [advert]);

  function formatAdvertForCopy(lang, content) {
    const specs = Array.isArray(content?.key_specs) ? content.key_specs.filter(Boolean) : [];
    const specHeader = lang === "th" ? "ข้อมูลรถ:" : "Key Specs:";
    // Collect confirmed features for copy text
    const confirmedSafety = safetyFeatures
      .filter((f) => confirmedFeatures[featureKey("safety", f)] !== false)
      .map((f) => f.feature);
    const confirmedComfort = comfortFeatures
      .filter((f) => confirmedFeatures[featureKey("comfort", f)] !== false)
      .map((f) => f.feature);
    const featuresHeader = lang === "th" ? "ออปชั่น:" : "Features:";
    const safetyHeader = lang === "th" ? "ความปลอดภัย" : "Safety";
    const comfortHeader = lang === "th" ? "ความสะดวกสบาย" : "Comfort";
    const featureLines = [];
    if (confirmedSafety.length || confirmedComfort.length) {
      featureLines.push("", featuresHeader);
      if (confirmedSafety.length) {
        featureLines.push(`${safetyHeader}:`, ...confirmedSafety.map((f) => `  • ${f}`));
      }
      if (confirmedComfort.length) {
        featureLines.push(`${comfortHeader}:`, ...confirmedComfort.map((f) => `  • ${f}`));
      }
    }
    const lines = [
      content?.title || "",
      "",
      content?.description || "",
      "",
      specHeader,
      ...specs.map((s) => `• ${s}`),
      ...featureLines,
      "",
      content?.short_caption || "",
    ];
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  const c = (isEditing ? draft : form).confidence || data.confidence || {};
  const allPreviews = Array.isArray(previewUrls) && previewUrls.length
    ? previewUrls
    : previewUrl
      ? [previewUrl]
      : [];
  const [activePreview, setActivePreview] = React.useState(0);
  const safeActive = Math.min(activePreview, Math.max(0, allPreviews.length - 1));
  const mainPreview = allPreviews[safeActive] ?? null;

  const enhancedMain = Array.isArray(enhancedUrls)
    ? enhancedUrls[safeActive] ?? null
    : null;
  const enhancedInfo = Array.isArray(enhancedMeta)
    ? enhancedMeta[safeActive] ?? null
    : null;
  const isEnhancing = enhanceStatus === "enhancing";
  const skipReason = enhancedInfo?.skipped || null;
  const [showEnhanced, setShowEnhanced] = React.useState(true);
  // Default to showing the enhanced version as soon as one is available.
  React.useEffect(() => {
    if (enhancedMain) setShowEnhanced(true);
  }, [enhancedMain]);
  const displayedPreview =
    showEnhanced && enhancedMain ? enhancedMain : mainPreview;

  const titleParts = [form.year, form.make, form.model].filter(Boolean);
  const title = titleParts.length ? titleParts.join(" ") : t("listing.identifiedVehicle");

  const price = formatPrice(parsePriceValue(form.asking_price_thb || form.estimated_price_thb));
  const txSource = String(dataEn?.transmission || form.transmission || "").toLowerCase();
  const isAutomatic =
    txSource.includes("auto") ||
    txSource.includes("cvt") ||
    txSource.includes("dct");
  const transmissionIcon = isAutomatic ? TbAutomaticGearbox : TbManualGearbox;

  const tags = [
    { icon: FaCalendarDays, value: form.year },
    { icon: FaTag, value: form.make },
    { icon: FaCar, value: form.model },
    { icon: FaTag, value: form.trim },
    { icon: FaCar, value: form.body_style },
    { icon: GiCarDoor, value: form.door_count },
    { icon: FaPalette, value: form.exterior_color },
    { icon: FaGasPump, value: form.fuel_type },
    { icon: transmissionIcon, value: form.transmission },
    { icon: FaArrowsUpDown, value: form.drivetrain },
    { icon: TbEngineFilled, value: form.engine_displacement },
  ].filter((t) => t.value);

  const activeAdvert = language === "th" ? advert.th : advert.en;
  const activeSpecLabel = language === "th" ? "ข้อมูลรถ" : "Key Specs";

  if (showAdvertPage) {
    return (
      <div className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-lg shadow-black/10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 bg-gray-50 px-5 py-4">
          <div className="text-sm font-semibold text-gray-900">{t("listing.previewAdvert")}</div>
          <div className="flex flex-col gap-2 w-full sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={handlePublishClick}
              className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto rounded-lg border border-brand-orange/30 bg-brand-orange/10 px-3 py-1.5 text-xs font-semibold text-brand-orange transition hover:bg-brand-orange/20 hover:border-brand-orange/50"
            >
              <FaCar className="h-3.5 w-3.5 shrink-0" />
              {t("listing.publishToCarButler")}
            </button>


            {/* ── Ayrshare Social Publishing Buttons ── */}
            {activeAdvert && (
              <>
                <button
                  type="button"
                  id="ayrshare-publish-facebook"
                  onClick={() => handleSocialPublish("facebook")}
                  disabled={publishingFacebook || facebookPosted}
                  className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto rounded-lg border border-blue-600/30 bg-blue-600/10 px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-600/20 hover:border-blue-600/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {facebookPosted ? (
                    <FaCircleCheck className="h-3 w-3 text-emerald-600" />
                  ) : publishingFacebook ? (
                    <FaSpinner className="h-3 w-3 animate-spin" />
                  ) : (
                    <FaFacebook className="h-3 w-3" />
                  )}
                  {facebookPosted ? t("listing.postedToFacebook") : t("listing.publishToFacebook")}
                </button>
                <button
                  type="button"
                  id="ayrshare-publish-instagram"
                  onClick={() => handleSocialPublish("instagram")}
                  disabled={publishingInstagram || instagramPosted}
                  className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto rounded-lg border border-pink-500/30 bg-gradient-to-r from-pink-500/10 to-purple-500/10 px-3 py-1.5 text-xs font-semibold text-pink-600 transition hover:from-pink-500/20 hover:to-purple-500/20 hover:border-pink-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {instagramPosted ? (
                    <FaCircleCheck className="h-3 w-3 text-emerald-600" />
                  ) : publishingInstagram ? (
                    <FaSpinner className="h-3 w-3 animate-spin" />
                  ) : (
                    <FaInstagram className="h-3 w-3" />
                  )}
                  {instagramPosted ? t("listing.postedToInstagram") : t("listing.publishToInstagram")}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setShowAdvertPage(false)}
              className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-brand-orange/40 hover:bg-orange-50/80"
            >
              <FaChevronLeft className="h-3 w-3 text-brand-orange shrink-0" />
              {t("app.returnHome")}
            </button>
          </div>
        </div>

        {/* ── Ayrshare Social Publish Result/Error Display ── */}
        {(socialPublishErrors.facebook ||
          socialPublishErrors.instagram ||
          socialPublishResults.facebook ||
          socialPublishResults.instagram) && (
            <div className="border-b border-gray-100 bg-gray-50 px-5 py-3 space-y-3">
              {/* Facebook Results */}
              {(socialPublishErrors.facebook || socialPublishResults.facebook) && (
                <div>
                  {socialPublishErrors.facebook && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        <FaTriangleExclamation className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                        <div>
                          <p className="text-xs font-semibold text-red-800">Facebook Publishing Error</p>
                          <p className="mt-0.5 text-xs text-red-700 leading-relaxed">{socialPublishErrors.facebook}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {socialPublishResults.facebook && !socialPublishErrors.facebook && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        <FaCircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <div className="space-y-1.5 min-w-0">
                          <p className="text-xs font-semibold text-emerald-800">
                            Facebook Published Successfully!
                          </p>
                          {Array.isArray(socialPublishResults.facebook?.postIds) &&
                            socialPublishResults.facebook.postIds.map((item, idx) => (
                              <div
                                key={idx}
                                className="rounded-lg bg-emerald-100/60 px-3 py-2 text-xs text-emerald-800"
                              >
                                <span className="font-semibold capitalize">Facebook:</span>{" "}
                                {item.status === "success" ? (
                                  <>
                                    <span className="text-emerald-700">✓ Success</span>
                                    {item.id && (
                                      <span className="ml-1 text-emerald-600/80">
                                        (ID: {item.id})
                                      </span>
                                    )}
                                    {item.postUrl && (
                                      <a
                                        href={item.postUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-1 text-emerald-700 underline hover:text-emerald-900"
                                      >
                                        View Post ↗
                                      </a>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-red-600">
                                    ✗ {item.message || "Failed"}
                                  </span>
                                )}
                              </div>
                            ))}
                          {!Array.isArray(socialPublishResults.facebook?.postIds) && socialPublishResults.facebook?.status === "success" && (
                            <p className="text-xs text-emerald-700">Post published successfully.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Instagram Results */}
              {(socialPublishErrors.instagram || socialPublishResults.instagram) && (
                <div>
                  {socialPublishErrors.instagram && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        <FaTriangleExclamation className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                        <div>
                          <p className="text-xs font-semibold text-red-800">Instagram Publishing Error</p>
                          <p className="mt-0.5 text-xs text-red-700 leading-relaxed">{socialPublishErrors.instagram}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {socialPublishResults.instagram && !socialPublishErrors.instagram && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        <FaCircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <div className="space-y-1.5 min-w-0">
                          <p className="text-xs font-semibold text-emerald-800">
                            Instagram Published Successfully!
                          </p>
                          {Array.isArray(socialPublishResults.instagram?.postIds) &&
                            socialPublishResults.instagram.postIds.map((item, idx) => (
                              <div
                                key={idx}
                                className="rounded-lg bg-emerald-100/60 px-3 py-2 text-xs text-emerald-800"
                              >
                                <span className="font-semibold capitalize">Instagram:</span>{" "}
                                {item.status === "success" ? (
                                  <>
                                    <span className="text-emerald-700">✓ Success</span>
                                    {item.id && (
                                      <span className="ml-1 text-emerald-600/80">
                                        (ID: {item.id})
                                      </span>
                                    )}
                                    {item.postUrl && (
                                      <a
                                        href={item.postUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-1 text-emerald-700 underline hover:text-emerald-900"
                                      >
                                        View Post ↗
                                      </a>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-red-600">
                                    ✗ {item.message || "Failed"}
                                  </span>
                                )}
                              </div>
                            ))}
                          {!Array.isArray(socialPublishResults.instagram?.postIds) && socialPublishResults.instagram?.status === "success" && (
                            <p className="text-xs text-emerald-700">Post published successfully.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        <div className="bg-gray-50 px-5 py-5">
          {(advertError || advertSuccess) && (
            <div className="mb-4 text-sm">
              {advertError && <div className="text-red-600">{advertError}</div>}
              {!advertError && advertSuccess && <div className="text-emerald-600">{advertSuccess}</div>}
            </div>
          )}

          {!activeAdvert ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600">
              <p className="mb-3">{t("listing.noAdvertYet")}</p>
              <button
                type="button"
                onClick={() => handleCreateAdvert()}
                disabled={advertLoading || isEditing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-orange px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-orange-hover disabled:opacity-60"
              >
                {advertLoading ? t("listing.writingAdvert") : t("listing.writeAdvert")}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Tab Selector */}
              <div className="flex justify-center">
                <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setAdvertTab("text")}
                    className={`rounded-md px-4 py-1.5 text-xs font-semibold transition ${advertTab === "text"
                        ? "bg-brand-orange text-white"
                        : "text-gray-600 hover:bg-gray-50"
                      }`}
                  >
                    {language === "th" ? "ข้อความโฆษณา" : "Text Preview"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvertTab("image")}
                    className={`rounded-md px-4 py-1.5 text-xs font-semibold transition ${advertTab === "image"
                        ? "bg-brand-orange text-white"
                        : "text-gray-600 hover:bg-gray-50"
                      }`}
                  >
                    {language === "th" ? "พรีวิวพร้อมรูปภาพ" : "Ad with Image"}
                  </button>
                </div>
              </div>

              {advertTab === "text" ? (
                /* Text Preview card */
                <div className="overflow-hidden rounded-[1.5rem] border border-gray-200 bg-white shadow-[0_18px_50px_rgba(0,0,0,0.10)]">
                  <div className="border-b border-gray-100 bg-gradient-to-br from-gray-50 via-white to-orange-50/40 px-6 py-6 sm:px-8 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-orange">
                          {t("listing.previewAdvert")}
                        </div>
                        <h3 className="mt-1 max-w-3xl break-words text-2xl font-semibold leading-tight text-gray-950 sm:text-[2rem]">
                          {activeAdvert.title}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyAdvert(language)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-brand-orange/40 hover:bg-orange-50/80 hover:text-gray-900"
                      >
                        <FaCopy className="h-3.5 w-3.5 text-brand-orange" />
                        {t("listing.copy")}
                      </button>
                    </div>

                    {price && (
                      <p className="text-2xl font-extrabold text-brand-orange">
                        {price}
                      </p>
                    )}

                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {tags.slice(0, 5).map((tag, i) => {
                          const IconComponent = tag.icon;
                          return (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 shadow-sm"
                            >
                              <IconComponent className="h-3 w-3 text-brand-orange shrink-0" />
                              {tag.value}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <div className="border-t border-gray-100 pt-4 space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                        {language === "th" ? "รายละเอียดโฆษณา" : "Ad Description"}
                      </h4>
                      <p className="max-w-4xl whitespace-pre-line text-[15px] leading-7 text-gray-700 sm:text-base">
                        {activeAdvert.description}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-5 px-6 py-6 sm:px-8">
                    {Array.isArray(activeAdvert.key_specs) && activeAdvert.key_specs.length > 0 && (
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 mb-3">
                          {activeSpecLabel}
                        </div>
                        <ul className="grid gap-x-8 gap-y-2 grid-cols-1 sm:grid-cols-2 text-sm text-gray-700">
                          {activeAdvert.key_specs.map((spec, idx) => (
                            <li
                              key={`${language}-spec-${idx}`}
                              className="flex items-start gap-2"
                            >
                              <span className="text-brand-orange mt-1 font-bold select-none">•</span>
                              {(() => {
                                const raw = String(spec).trim();
                                const idxColon = raw.search(/[:：-]/);
                                if (idxColon === -1) {
                                  return <span className="font-semibold">{raw}</span>;
                                }
                                const label = raw.slice(0, idxColon).trim();
                                const value = raw.slice(idxColon + 1).trim();
                                return (
                                  <span>
                                    <strong className="text-gray-900 font-semibold">{label}</strong>: {value}
                                  </span>
                                );
                              })()}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Confirmed Features Section — Text Preview */}
                    {(safetyFeatures.filter((f) => confirmedFeatures[featureKey("safety", f)] !== false).length > 0 ||
                      comfortFeatures.filter((f) => confirmedFeatures[featureKey("comfort", f)] !== false).length > 0) && (
                        <div className="border-t border-gray-100 pt-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 mb-3">
                            {language === "th" ? "ออปชั่น" : "Features"}
                          </div>
                          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                            {safetyFeatures.filter((f) => confirmedFeatures[featureKey("safety", f)] !== false).length > 0 && (
                              <div>
                                <div className="mb-2">
                                  <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-900">
                                    {language === "th" ? "ความปลอดภัย" : "Safety"}
                                  </span>
                                </div>
                                <ul className="space-y-1.5">
                                  {safetyFeatures
                                    .filter((f) => confirmedFeatures[featureKey("safety", f)] !== false)
                                    .map((f) => (
                                      <li key={featureKey("safety", f)} className="flex items-start gap-2 text-sm text-gray-700">
                                        <span className="text-brand-orange select-none font-bold">•</span>
                                        <span>{f.feature}</span>
                                      </li>
                                    ))}
                                </ul>
                              </div>
                            )}
                            {comfortFeatures.filter((f) => confirmedFeatures[featureKey("comfort", f)] !== false).length > 0 && (
                              <div>
                                <div className="mb-2">
                                  <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-900">
                                    {language === "th" ? "ความสะดวกสบาย" : "Comfort"}
                                  </span>
                                </div>
                                <ul className="space-y-1.5">
                                  {comfortFeatures
                                    .filter((f) => confirmedFeatures[featureKey("comfort", f)] !== false)
                                    .map((f) => (
                                      <li key={featureKey("comfort", f)} className="flex items-start gap-2 text-sm text-gray-700">
                                        <span className="text-brand-orange select-none font-bold">•</span>
                                        <span>{f.feature}</span>
                                      </li>
                                    ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                    {activeAdvert.short_caption && (
                      <p className="pt-1 text-sm font-medium leading-6 text-gray-800">
                        {activeAdvert.short_caption}
                      </p>
                    )}

                  </div>
                </div>
              ) : (
                /* Ad with Image Card view */
                <div className="overflow-hidden rounded-[1.5rem] border border-gray-200 bg-white shadow-[0_18px_50px_rgba(0,0,0,0.10)]">
                  {/* Vehicle Image section */}
                  {displayedPreview && (
                    <>
                      <div className="relative border-b border-gray-100 bg-gray-50 py-4 flex items-center justify-center overflow-hidden max-h-[28rem] sm:max-h-[34rem]">
                        {allPreviews.length > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={() => setActivePreview((prev) => (prev > 0 ? prev - 1 : allPreviews.length - 1))}
                              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white shadow-md backdrop-blur-sm transition focus:outline-none"
                              aria-label="Previous image"
                            >
                              <FaChevronLeft className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setActivePreview((prev) => (prev < allPreviews.length - 1 ? prev + 1 : 0))}
                              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white shadow-md backdrop-blur-sm transition focus:outline-none"
                              aria-label="Next image"
                            >
                              <FaChevronRight className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        <img
                          src={displayedPreview}
                          alt="Advert Vehicle"
                          className="max-h-[26rem] sm:max-h-[32rem] w-auto max-w-[95%] object-contain rounded-xl shadow-md transition duration-300 hover:scale-[1.01]"
                        />
                        {showEnhanced && enhancedMain && (
                          <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-brand-orange px-2.5 py-1 text-xs font-semibold text-white shadow backdrop-blur-sm">
                            <FaWandSparkles className="h-3.5 w-3.5" />
                            {t("listing.enhanced")}
                          </span>
                        )}
                      </div>

                      {/* Thumbnail gallery for image swapping */}
                      {allPreviews.length > 1 && (
                        <div className="flex flex-wrap justify-center gap-2 bg-gray-50/50 border-b border-gray-100 px-4 py-3">
                          {allPreviews.map((u, i) => {
                            const isActive = i === safeActive;
                            const thumbEnhanced = Array.isArray(enhancedUrls)
                              ? enhancedUrls[i] ?? null
                              : null;
                            const displayedThumb = showEnhanced && thumbEnhanced ? thumbEnhanced : u;
                            return (
                              <button
                                key={`ad-thumb-${u}-${i}`}
                                type="button"
                                onClick={() => setActivePreview(i)}
                                aria-label={t("listing.viewPhoto", { n: i + 1 })}
                                className={`relative h-10 w-14 overflow-hidden rounded border transition ${isActive
                                    ? "border-brand-orange ring-2 ring-brand-orange/40"
                                    : "border-gray-200 hover:border-brand-orange/60"
                                  }`}
                              >
                                <img
                                  src={displayedThumb}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                                {showEnhanced && thumbEnhanced && (
                                  <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-brand-orange ring-1 ring-white" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}

                  {/* Advert details layout styled like a marketplace listing */}
                  <div className="p-6 sm:p-8 space-y-6">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 sm:text-2xl leading-tight">
                        {activeAdvert.title}
                      </h3>
                      {price && (
                        <p className="mt-2 text-2xl font-extrabold text-brand-orange">
                          {price}
                        </p>
                      )}
                    </div>

                    {/* Spec badging specifically for this preview card */}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {tags.slice(0, 5).map((tag, i) => {
                          const IconComponent = tag.icon;
                          return (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 shadow-sm"
                            >
                              <IconComponent className="h-3 w-3 text-brand-orange shrink-0" />
                              {tag.value}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <div className="border-t border-gray-100 pt-5 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                        {language === "th" ? "รายละเอียดโฆษณา" : "Ad Description"}
                      </h4>
                      <p className="text-sm leading-6 text-gray-700 whitespace-pre-line sm:text-base">
                        {activeAdvert.description}
                      </p>
                    </div>

                    {Array.isArray(activeAdvert.key_specs) && activeAdvert.key_specs.length > 0 && (
                      <div className="border-t border-gray-100 pt-5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                          {activeSpecLabel}
                        </h4>
                        <ul className="grid gap-x-8 gap-y-2 grid-cols-1 sm:grid-cols-2 text-sm text-gray-700">
                          {activeAdvert.key_specs.map((spec, idx) => (
                            <li
                              key={`${language}-spec-img-${idx}`}
                              className="flex items-start gap-2"
                            >
                              <span className="text-brand-orange mt-1 font-bold">•</span>
                              {(() => {
                                const raw = String(spec).trim();
                                const idxColon = raw.search(/[:：-]/);
                                if (idxColon === -1) {
                                  return <span className="font-semibold">{raw}</span>;
                                }
                                const label = raw.slice(0, idxColon).trim();
                                const value = raw.slice(idxColon + 1).trim();
                                return (
                                  <span>
                                    <strong className="text-gray-900 font-semibold">{label}</strong>: {value}
                                  </span>
                                );
                              })()}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Confirmed Features Section — Ad with Image */}
                    {(safetyFeatures.filter((f) => confirmedFeatures[featureKey("safety", f)] !== false).length > 0 ||
                      comfortFeatures.filter((f) => confirmedFeatures[featureKey("comfort", f)] !== false).length > 0) && (
                        <div className="border-t border-gray-100 pt-5">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                            {language === "th" ? "ออปชั่น" : "Features"}
                          </h4>
                          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                            {safetyFeatures.filter((f) => confirmedFeatures[featureKey("safety", f)] !== false).length > 0 && (
                              <div>
                                <div className="mb-2">
                                  <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-900">
                                    {language === "th" ? "ความปลอดภัย" : "Safety"}
                                  </span>
                                </div>
                                <ul className="space-y-1.5">
                                  {safetyFeatures
                                    .filter((f) => confirmedFeatures[featureKey("safety", f)] !== false)
                                    .map((f) => (
                                      <li key={featureKey("safety", f)} className="flex items-start gap-2 text-sm text-gray-700">
                                        <span className="text-brand-orange select-none font-bold">•</span>
                                        <span>{f.feature}</span>
                                      </li>
                                    ))}
                                </ul>
                              </div>
                            )}
                            {comfortFeatures.filter((f) => confirmedFeatures[featureKey("comfort", f)] !== false).length > 0 && (
                              <div>
                                <div className="mb-2">
                                  <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-900">
                                    {language === "th" ? "ความสะดวกสบาย" : "Comfort"}
                                  </span>
                                </div>
                                <ul className="space-y-1.5">
                                  {comfortFeatures
                                    .filter((f) => confirmedFeatures[featureKey("comfort", f)] !== false)
                                    .map((f) => (
                                      <li key={featureKey("comfort", f)} className="flex items-start gap-2 text-sm text-gray-700">
                                        <span className="text-brand-orange select-none font-bold">•</span>
                                        <span>{f.feature}</span>
                                      </li>
                                    ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                    {activeAdvert.short_caption && (
                      <div className="border-t border-gray-100 pt-5 flex flex-wrap items-center justify-between gap-4">
                        <p className="text-sm font-semibold text-gray-900">
                          {activeAdvert.short_caption}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <PublishToWowCar
                open={showPublishModal}
                onClose={() => setShowPublishModal(false)}
                form={isEditing ? draft : form}
                advert={advert}
                safetyFeatures={safetyFeatures}
                comfortFeatures={comfortFeatures}
                confirmedFeatures={confirmedFeatures}
                photos={photos || []}
                enhancedUrls={enhancedUrls || null}
              />
              <PublishToFacebook
                open={showFacebookModal}
                onClose={() => setShowFacebookModal(false)}
                form={isEditing ? draft : form}
                advert={advert}
                photos={photos || []}
                enhancedUrls={enhancedUrls || null}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={showAdvertPage ? "hidden" : "space-y-6"}>
        {/* Light panel so title & tags stay readable on the dark page background */}
        <div className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-lg shadow-black/10">
          {mainPreview && (
            <div className="border-b border-gray-100 bg-gray-50">
              <div className="relative flex min-h-[20rem] max-h-[30rem] items-center justify-center p-4 sm:max-h-[36rem] sm:p-6">
                <img
                  src={displayedPreview}
                  alt={
                    showEnhanced && enhancedMain
                      ? t("listing.enhanced")
                      : t("listing.yourUpload")
                  }
                  className="max-h-[26rem] w-full max-w-2xl object-contain sm:max-h-[32rem]"
                />
                {isEnhancing && (
                  <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                    <FaSpinner className="h-3.5 w-3.5 animate-spin text-brand-orange" />
                    {t("listing.enhancingBackground")}
                  </span>
                )}
                {!isEnhancing && enhancedMain && (
                  <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-brand-orange/90 px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-sm">
                    <FaWandSparkles className="h-3.5 w-3.5" />
                    {showEnhanced ? t("listing.enhanced") : t("listing.original")}
                  </span>
                )}
                {!isEnhancing && !enhancedMain && skipReason === "interior" && (
                  <span className="absolute left-4 top-4 inline-flex items-center rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                    {t("listing.interiorNotEnhanced")}
                  </span>
                )}
                {!isEnhancing && !enhancedMain && skipReason === "engine_bay" && (
                  <span className="absolute left-4 top-4 inline-flex items-center rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                    {t("listing.engineNotEnhanced")}
                  </span>
                )}
                {!isEnhancing && !enhancedMain && enhancedInfo?.error === "RATE_LIMIT" && (
                  <span
                    className="absolute left-4 top-4 max-w-[85%] inline-flex items-center rounded-full bg-amber-600/90 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm"
                    title={t("listing.requestsExceeded")}
                  >
                    {t("listing.vertexBusy")}
                  </span>
                )}
                {!isEnhancing && !enhancedMain && enhancedInfo?.error && enhancedInfo.error !== "RATE_LIMIT" && (
                  <span
                    className="absolute left-4 top-4 max-w-[85%] inline-flex items-center rounded-full bg-red-600/90 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm"
                    title={t("listing.enhancementFailed")}
                  >
                    {t("listing.enhancementFailed")}
                  </span>
                )}
                {!isEnhancing && !enhancedMain && skipReason && skipReason !== "interior" && skipReason !== "engine_bay" && (
                  <span className="absolute left-4 top-4 inline-flex items-center rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                    {t("listing.notEnhanced", {
                      reason: skipReason.replace(/_/g, " "),
                    })}
                  </span>
                )}
              </div>

              {enhancedMain && (
                <div className="flex flex-wrap items-center justify-center gap-2 border-t border-gray-100 bg-white px-4 py-3">
                  <div className="inline-flex overflow-hidden rounded-lg border border-gray-200">
                    <button
                      type="button"
                      onClick={() => setShowEnhanced(false)}
                      className={`px-3 py-1.5 text-xs font-semibold transition ${!showEnhanced
                          ? "bg-brand-orange text-white"
                          : "bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                    >
                      {t("listing.original")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEnhanced(true)}
                      className={`px-3 py-1.5 text-xs font-semibold transition ${showEnhanced
                          ? "bg-brand-orange text-white"
                          : "bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                    >
                      {t("listing.enhanced")}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      downloadImage(
                        enhancedMain,
                        `enhanced-${[data.year, data.make, data.model]
                          .filter(Boolean)
                          .map(sanitizeFilePart)
                          .filter(Boolean)
                          .join("-") || "car"}-${safeActive + 1}.png`,
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:border-brand-orange/40 hover:bg-orange-50/80 hover:text-gray-900"
                  >
                    <FaDownload className="h-3.5 w-3.5 text-brand-orange" />
                    {t("listing.downloadEnhanced")}
                  </button>
                </div>
              )}
              {allPreviews.length > 1 && (
                <div className="flex flex-wrap gap-2 border-t border-gray-100 bg-white px-4 py-3">
                  {allPreviews.map((u, i) => {
                    const isActive = i === safeActive;
                    const thumbEnhanced = Array.isArray(enhancedUrls)
                      ? enhancedUrls[i] ?? null
                      : null;
                    const thumbMeta = Array.isArray(enhancedMeta)
                      ? enhancedMeta[i] ?? null
                      : null;
                    return (
                      <button
                        key={`${u}-${i}`}
                        type="button"
                        onClick={() => setActivePreview(i)}
                        aria-label={t("listing.viewPhoto", { n: i + 1 })}
                        className={`relative h-14 w-14 overflow-hidden rounded-md border transition ${isActive
                            ? "border-brand-orange ring-2 ring-brand-orange/40"
                            : "border-gray-200 hover:border-brand-orange/60"
                          }`}
                      >
                        <img
                          src={thumbEnhanced || u}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        {!isEnhancing && thumbEnhanced && (
                          <span
                            className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full bg-brand-orange ring-1 ring-white"
                            title={t("listing.enhanced")}
                          />
                        )}
                        {!isEnhancing && !thumbEnhanced && thumbMeta?.skipped && (
                          <span
                            className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full bg-gray-400 ring-1 ring-white"
                            title={t("listing.original")}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div className="space-y-4 p-5 sm:p-6">
            <div className="space-y-1">
              <h2 className="font-h2 text-gray-900">{title}</h2>
              {price && (
                <p className="text-lg font-bold text-brand-orange sm:text-xl">{price}</p>
              )}
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag, i) => {
                  const IconComponent = tag.icon;
                  return (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm"
                    >
                      <IconComponent
                        className={`${IconComponent === TbEngineFilled ||
                            IconComponent === GiCarDoor ||
                            IconComponent === TbAutomaticGearbox ||
                            IconComponent === TbManualGearbox
                            ? "h-[17px] w-[17px]"
                            : "h-3.5 w-3.5"
                          } text-brand-orange shrink-0`}
                      />
                      {tag.value}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Filled form */}
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-5 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <FaTag className="h-4 w-4 shrink-0 text-brand-orange" />
              <span className="text-sm font-semibold text-gray-700">
                {t("listing.listingForm")}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(form);
                    setIsEditing(true);
                    setFormErrors([]);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:border-brand-orange/40 hover:bg-orange-50/80 hover:text-gray-900"
                >
                  <FaPenToSquare className="h-3.5 w-3.5 text-brand-orange" />
                  {t("listing.update")}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={revertDraft}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:border-brand-orange/40 hover:bg-orange-50/80 hover:text-gray-900"
                  >
                    {t("listing.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={applyDraft}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-orange px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-orange-hover"
                  >
                    {t("listing.saveChanges")}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => handleCreateAdvert()}
                disabled={advertLoading || isEditing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {advertLoading ? t("listing.writingAdvert") : t("listing.writeAdvert")}
              </button>
              {hasGeneratedAdvert && !advertLoading && (
                <button
                  type="button"
                  onClick={() => setShowAdvertPage(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-brand-orange/40 hover:bg-orange-50/80 hover:text-gray-900"
                >
                  {t("listing.previewAdvert")}
                </button>
              )}
            </div>
          </div>
          {advertError && (
            <div className="border-b border-gray-100 bg-white p-5">
              {Array.isArray(advertError) ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="flex items-start gap-3">
                    <FaCircleExclamation className="mt-0.5 h-5 w-5 shrink-0 text-red-500 animate-pulse" />
                    <div>
                      <h4 className="text-sm font-bold text-red-800">
                        {t("listing.publishRequiredIntro")}
                      </h4>
                      <ul className="mt-2 space-y-1 text-xs text-red-700 list-disc list-inside">
                        {advertError.map((err, i) => {
                          if (typeof err === "object" && err !== null) {
                            const vars = err.vars ? { ...err.vars } : {};
                            if (vars.fieldKey) {
                              vars.field = t(vars.fieldKey);
                            }
                            return <li key={i}>{t(err.key, vars)}</li>;
                          }
                          return <li key={i}>{err}</li>;
                        })}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 animate-in fade-in duration-200">
                  <div className="flex items-start gap-3">
                    <FaTriangleExclamation className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                    <div>
                      <h4 className="text-sm font-bold text-red-800">
                        Publishing Failed
                      </h4>
                      <p className="mt-1 text-xs text-red-700 leading-relaxed">{advertError}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {formErrors && formErrors.length > 0 && (
            <div className="border-b border-gray-100 bg-white p-5">
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex items-start gap-3">
                  <FaCircleExclamation className="mt-0.5 h-5 w-5 shrink-0 text-red-500 animate-pulse" />
                  <div>
                    <h4 className="text-sm font-bold text-red-800">
                      {t("listing.saveRequiredIntro")}
                    </h4>
                    <ul className="mt-2 space-y-1 text-xs text-red-700 list-disc list-inside">
                      {formErrors.map((err, i) => {
                        if (typeof err === "object" && err !== null) {
                          const vars = err.vars ? { ...err.vars } : {};
                          if (vars.fieldKey) {
                            vars.field = t(vars.fieldKey);
                          }
                          return <li key={i}>{t(err.key, vars)}</li>;
                        }
                        return <li key={i}>{err}</li>;
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
          <form className="space-y-4 p-5" onSubmit={(e) => e.preventDefault()}>
            <div className="grid gap-4 sm:grid-cols-2">
              {listingFields.map((field) => {
                const value = resolveFieldValue(
                  field,
                  isEditing ? draft : form,
                );
                const confidence = resolveFieldConfidence(field, c);
                const colSpan = field.colSpan === 2 ? "sm:col-span-2" : "";
                return (
                  <div key={field.key} className={colSpan}>
                    <FormField
                      label={t(`fields.${field.key}`) || field.label}
                      value={value}
                      confidence={confidence}
                      placeholder={t("listing.placeholder")}
                      readOnly={!isEditing}
                      required={["make", "model", "year", "asking_price_thb"].includes(field.key)}
                      inputMode={
                        field.type === "price" || field.key === "mileage_km"
                          ? "numeric"
                          : undefined
                      }
                      onChange={(raw) => setTextField(field.key, raw, { confirm: true })}
                    />
                  </div>
                );
              })}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("listing.notes")}
              </label>
              <textarea
                rows={3}
                value={(isEditing ? draft : form).notes || ""}
                onChange={(e) => setTextField("notes", e.target.value, { confirm: true })}
                readOnly={!isEditing}
                placeholder={!(isEditing ? draft : form).notes ? t("listing.addNotes") : undefined}
                className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-brand-orange/20 transition focus:border-brand-orange/40 focus:ring-2"
              />
            </div>
          </form>

        </div>

        {/* Detected safety & comfort features */}
        <FeaturesPanel
          features={data.features}
          confirmed={confirmedFeatures}
          onToggle={toggleFeature}
          t={t}
        />
      </div>
      {advertSuccess && !showAdvertPage && (
        <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg shadow-emerald-900/10">
            <span>{advertSuccess}</span>
            <button
              type="button"
              onClick={() => setShowAdvertPage(true)}
              className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              {t("listing.previewAdvert")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
