import React from "react";
import {
  Tag,
  Calendar,
  Palette,
  CarFront,
  Scissors,
  Fuel,
  Car,
  Settings,
  Wrench,
  Square,
  Users,
  Download,
} from "lucide-react";
import ConfidenceBadge from "./ConfidenceBadge";

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

function listingPricePoint(data) {
  if (data == null) return null;
  return data.estimated_price_thb ?? null;
}

function listingPriceMin(data) {
  if (data == null) return null;
  return data.estimated_price_min_thb ?? null;
}

function listingPriceMax(data) {
  if (data == null) return null;
  return data.estimated_price_max_thb ?? null;
}

function sanitizeFilePart(s) {
  if (s == null || s === "") return "";
  return String(s)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function buildListingJsonObject(data) {
  return {
    make: data.make ?? null,
    model: data.model ?? null,
    year: data.year ?? null,
    trim: data.trim ?? null,
    body_style: data.body_style ?? null,
    exterior_color: data.exterior_color ?? null,
    fuel_type: data.fuel_type ?? null,
    transmission: data.transmission ?? null,
    drivetrain: data.drivetrain ?? null,
    engine_displacement: data.engine_displacement ?? null,
    door_count: data.door_count ?? null,
    seat_count: data.seat_count ?? null,
    estimated_price_thb: listingPricePoint(data),
    estimated_price_min_thb: listingPriceMin(data),
    estimated_price_max_thb: listingPriceMax(data),
    notes: data.notes ?? null,
    confidence: data.confidence ?? null,
  };
}

function downloadListingForm(data) {
  const payload = buildListingJsonObject(data);
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const base = [data.year, data.make, data.model]
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

function FormField({ label, value, confidence, placeholder = "—" }) {
  const c = confidence;
  const isEmpty = value === null || value === undefined || value === "";
  const display = isEmpty ? "" : String(value);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {label}
        </label>
        {c && (
          <ConfidenceBadge level={isEmpty ? "unknown" : c} />
        )}
      </div>
      <input
        readOnly
        value={display}
        placeholder={isEmpty ? placeholder : undefined}
        className={`w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none ring-brand-orange/20 focus:ring-2 ${
          isEmpty ? "italic text-gray-400" : ""
        }`}
      />
    </div>
  );
}

export default function CarListing({ data, previewUrl, previewUrls }) {
  const c = data.confidence || {};
  const allPreviews = Array.isArray(previewUrls) && previewUrls.length
    ? previewUrls
    : previewUrl
      ? [previewUrl]
      : [];
  const [activePreview, setActivePreview] = React.useState(0);
  const safeActive = Math.min(activePreview, Math.max(0, allPreviews.length - 1));
  const mainPreview = allPreviews[safeActive] ?? null;

  const titleParts = [data.year, data.make, data.model].filter(Boolean);
  const title = titleParts.length ? titleParts.join(" ") : "Identified vehicle";

  const price = formatPrice(listingPricePoint(data));
  const priceMin = listingPriceMin(data);
  const priceMax = listingPriceMax(data);
  const hasPriceRange =
    priceMin != null &&
    priceMax != null &&
    !Number.isNaN(Number(priceMin)) &&
    !Number.isNaN(Number(priceMax));

  const tags = [
    { icon: Calendar, value: data.year },
    { icon: CarFront, value: data.body_style },
    { icon: Palette, value: data.exterior_color },
    { icon: Fuel, value: data.fuel_type },
    { icon: Settings, value: data.transmission },
    { icon: Car, value: data.drivetrain },
    { icon: Wrench, value: data.engine_displacement },
    { icon: Square, value: data.door_count },
    { icon: Users, value: data.seat_count },
    { icon: Scissors, value: data.trim },
  ].filter((t) => t.value);

  return (
    <div className="space-y-6">
      {/* Light panel so title & tags stay readable on the dark page background */}
      <div className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-lg shadow-black/10">
        {mainPreview && (
          <div className="border-b border-gray-100 bg-gray-50">
            <div className="flex min-h-[11rem] max-h-72 items-center justify-center p-4 sm:max-h-80 sm:p-6">
              <img
                src={mainPreview}
                alt="Your upload"
                className="max-h-56 w-full max-w-2xl object-contain sm:max-h-64"
              />
            </div>
            {allPreviews.length > 1 && (
              <div className="flex flex-wrap gap-2 border-t border-gray-100 bg-white px-4 py-3">
                {allPreviews.map((u, i) => {
                  const isActive = i === safeActive;
                  return (
                    <button
                      key={`${u}-${i}`}
                      type="button"
                      onClick={() => setActivePreview(i)}
                      aria-label={`View photo ${i + 1}`}
                      className={`relative h-14 w-14 overflow-hidden rounded-md border transition ${
                        isActive
                          ? "border-brand-orange ring-2 ring-brand-orange/40"
                          : "border-gray-200 hover:border-brand-orange/60"
                      }`}
                    >
                      <img
                        src={u}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute left-0.5 top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-black/70 px-1 text-[9px] font-semibold text-white">
                        {i + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className="space-y-4 p-5 sm:p-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{title}</h2>
            {price && (
              <p className="text-lg font-bold text-brand-orange sm:text-xl">{price}</p>
            )}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700"
                >
                  <tag.icon className="h-3.5 w-3.5 text-brand-orange" />
                  {tag.value}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filled form */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-5 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Tag className="h-4 w-4 shrink-0 text-brand-orange" />
            <span className="text-sm font-semibold text-gray-700">
              Listing form
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
            <span className="text-xs text-gray-400">Read-only · AI-filled</span>
            <button
              type="button"
              onClick={() => downloadListingForm(data)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:border-brand-orange/40 hover:bg-orange-50/80 hover:text-gray-900"
            >
              <Download className="h-3.5 w-3.5 text-brand-orange" />
              Download
            </button>
          </div>
        </div>
        <form className="space-y-4 p-5" onSubmit={(e) => e.preventDefault()}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Make" value={data.make} confidence={c.make} />
            <FormField label="Model" value={data.model} confidence={c.model} />
            <FormField label="Year" value={data.year} confidence={c.year} />
            <FormField label="Trim" value={data.trim} confidence={c.trim} />
            <FormField
              label="Body style"
              value={data.body_style}
              confidence={c.body_style}
            />
            <FormField
              label="Exterior color"
              value={data.exterior_color}
              confidence={c.exterior_color}
            />
            <FormField
              label="Fuel type"
              value={data.fuel_type}
              confidence={c.fuel_type}
            />
            <FormField
              label="Transmission"
              value={data.transmission}
              confidence={c.transmission}
            />
            <FormField
              label="Drivetrain"
              value={data.drivetrain}
              confidence={c.drivetrain}
            />
            <FormField
              label="Engine displacement"
              value={data.engine_displacement}
              confidence={c.engine_displacement}
            />
            <FormField
              label="Doors"
              value={data.door_count}
              confidence={c.door_count}
            />
            <FormField
              label="Seats"
              value={data.seat_count}
              confidence={c.seat_count}
            />
            <div className="sm:col-span-2">
              <FormField
                label="Est. price (THB)"
                value={price}
                confidence={c.estimated_price_thb}
              />
            </div>
            {hasPriceRange && (
              <div className="sm:col-span-2">
                <FormField
                  label="Est. price range (THB)"
                  value={`${formatPrice(priceMin)} – ${formatPrice(priceMax)}`}
                  confidence={
                    c.estimated_price_min_thb ||
                    c.estimated_price_max_thb ||
                    c.estimated_price_thb
                  }
                />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Notes
            </label>
            <textarea
              readOnly
              rows={3}
              value={data.notes || ""}
              placeholder={!data.notes ? "No notes" : undefined}
              className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none ring-brand-orange/20 focus:ring-2"
            />
          </div>
        </form>
      </div>
    </div>
  );
}
