import React from "react";
import {
  FaCircleExclamation,
  FaCloud,
  FaBan,
  FaCropSimple,
  FaUsers,
  FaCircleXmark,
  FaCircleQuestion,
} from "react-icons/fa6";
import { useLanguage } from "../context/LanguageContext";

const ERROR_ICONS = {
  unclear_image: FaCircleQuestion,
  partial_car: FaCropSimple,
  multiple_cars: FaUsers,
  unsupported_format: FaCircleXmark,
  no_match: FaBan,
  not_a_car: FaCircleExclamation,
  API_KEY_MISSING: FaCircleExclamation,
  GEMINI_ACCESS_DENIED: FaCircleExclamation,
  PARSE_ERROR: FaCircleExclamation,
  SERVICE_UNAVAILABLE: FaCloud,
  RATE_LIMIT: FaCircleExclamation,
};

const COLOR_MAP = {
  orange: {
    bg: "bg-black/65 backdrop-blur-md",
    border: "border-brand-orange/30",
    icon: "text-brand-orange",
    title: "text-white",
    text: "text-gray-300",
    tipBg: "bg-white/[0.04] border-white/[0.08] text-gray-300",
  },
  green: {
    bg: "bg-black/65 backdrop-blur-md",
    border: "border-emerald-500/30",
    icon: "text-emerald-400",
    title: "text-white",
    text: "text-gray-300",
    tipBg: "bg-white/[0.04] border-white/[0.08] text-gray-300",
  },
};

export default function ErrorCard({ errorCode }) {
  const { t } = useLanguage();
  const errKey = ERROR_ICONS[errorCode] ? errorCode : "default";
  const title = t(`errors.${errKey}.title`);
  const tip = t(`errors.${errKey}.tip`);
  const Icon = ERROR_ICONS[errorCode] || FaCircleExclamation;
  const colors = COLOR_MAP.orange;

  return (
    <div
      className={`rounded-2xl border ${colors.bg} ${colors.border} p-6 max-w-2xl mx-auto shadow-xl shadow-black/20`}
    >
      <div className="flex items-start gap-4">
        <Icon className={`w-7 h-7 mt-0.5 flex-shrink-0 ${colors.icon}`} />
        <div>
          <h3 className={`font-semibold text-lg ${colors.title}`}>
            {title}
          </h3>
          <p className={`text-sm mt-3 rounded-xl px-3.5 py-2.5 border leading-relaxed ${colors.tipBg}`}>
            💡 {tip}
          </p>
        </div>
      </div>
    </div>
  );
}
