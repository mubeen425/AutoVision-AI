import React from "react";
import { AlertCircle, CloudOff, Crop, Users, FileX, HelpCircle } from "lucide-react";

const ERROR_CONFIG = {
  unclear_image: {
    icon: HelpCircle,
    title: "Image Too Unclear",
    color: "yellow",
    tip: "Try a clearer, well-lit photo of the car from the front, side, or rear.",
  },
  partial_car: {
    icon: Crop,
    title: "Car Not Fully in Frame",
    color: "yellow",
    tip: "Show more of the vehicle—avoid tight crops or half-visible cars. Include the full car or a clear front, side, or rear view.",
  },
  multiple_cars: {
    icon: Users,
    title: "Multiple Cars Detected",
    color: "blue",
    tip: "Please upload a photo where one car is clearly the main subject.",
  },
  unsupported_format: {
    icon: FileX,
    title: "Unsupported Format",
    color: "red",
    tip: "Please upload a JPG, PNG, or WebP image.",
  },
  no_match: {
    icon: CloudOff,
    title: "No Reliable Match Found",
    color: "orange",
    tip: "The car could not be identified. Try a higher-resolution image or a different angle.",
  },
  not_a_car: {
    icon: AlertCircle,
    title: "Not a Car Image",
    color: "red",
    tip: "Please upload a photo of a car.",
  },
  API_KEY_MISSING: {
    icon: AlertCircle,
    title: "API Key Not Set",
    color: "red",
    tip: "Add your Gemini API key to the .env file as VITE_GEMINI_API_KEY.",
  },
  GEMINI_ACCESS_DENIED: {
    icon: AlertCircle,
    title: "Gemini Access Blocked (403)",
    color: "red",
    tip:
      "Google denied API access for this key or project. In Google AI Studio create a new API key (or open Cloud Console → APIs & Services → Credentials): remove HTTP referrer restrictions for server-side use, ensure “Generative Language API” is enabled for the project, and check billing/region. Update GEMINI_API_KEY on Render and redeploy.",
  },
  PARSE_ERROR: {
    icon: AlertCircle,
    title: "Analysis Failed",
    color: "red",
    tip: "The AI returned an unexpected response. Please try again.",
  },
  SERVICE_UNAVAILABLE: {
    icon: CloudOff,
    title: "Service Temporarily Busy",
    color: "orange",
    tip: "Gemini hit high demand. This app retries automatically and switches to a lighter model. Wait a minute and try again, or set VITE_GEMINI_MODEL=gemini-2.5-flash-lite in .env.",
  },
  RATE_LIMIT: {
    icon: AlertCircle,
    title: "Too Many Requests",
    color: "orange",
    tip: "Slow down and try again in a few seconds. Free-tier keys have low rate limits.",
  },
};

const COLOR_MAP = {
  yellow: {
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    icon: "text-yellow-500",
    title: "text-yellow-800",
  },
  blue: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: "text-blue-500",
    title: "text-blue-800",
  },
  red: {
    bg: "bg-red-50",
    border: "border-red-200",
    icon: "text-red-500",
    title: "text-red-800",
  },
  orange: {
    bg: "bg-brand-orange-light",
    border: "border-orange-200",
    icon: "text-brand-orange",
    title: "text-orange-800",
  },
};

export default function ErrorCard({ errorCode, errorMessage }) {
  const cfg = ERROR_CONFIG[errorCode] || {
    icon: AlertCircle,
    title: "Something Went Wrong",
    color: "red",
    tip: errorMessage || "An unexpected error occurred. Please try again.",
  };
  const colors = COLOR_MAP[cfg.color] || COLOR_MAP.red;
  const Icon = cfg.icon;

  return (
    <div
      className={`rounded-2xl border ${colors.bg} ${colors.border} p-6 max-w-2xl mx-auto`}
    >
      <div className="flex items-start gap-4">
        <Icon className={`w-7 h-7 mt-0.5 flex-shrink-0 ${colors.icon}`} />
        <div>
          <h3 className={`font-semibold text-lg ${colors.title}`}>
            {cfg.title}
          </h3>
          {errorMessage && (
            <p className="text-sm text-gray-600 mt-1">{errorMessage}</p>
          )}
          <p className="text-sm text-gray-500 mt-2 bg-white/70 rounded-lg px-3 py-2 border border-gray-100">
            💡 {cfg.tip}
          </p>
        </div>
      </div>
    </div>
  );
}
