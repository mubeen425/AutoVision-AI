import React from "react";
import { FaShieldHalved, FaTriangleExclamation, FaCircleQuestion } from "react-icons/fa6";
import { useLanguage } from "../context/LanguageContext";

const ICONS = {
  confirmed: FaShieldHalved,
  estimated: FaTriangleExclamation,
  unknown: FaCircleQuestion,
};

const CLASSES = {
  confirmed: "bg-green-50 text-green-700 border-green-200",
  estimated: "bg-brand-orange-light text-orange-700 border-orange-200",
  unknown: "bg-gray-100 text-gray-500 border-gray-200",
};

export default function ConfidenceBadge({ level }) {
  const { t } = useLanguage();
  const key = ICONS[level] ? level : "unknown";
  const Icon = ICONS[key];
  const classes = CLASSES[key];

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${classes}`}
    >
      <Icon className="w-2.5 h-2.5" />
      {t(`confidence.${key}`)}
    </span>
  );
}
