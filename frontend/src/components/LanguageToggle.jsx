import React from "react";
import { useLanguage } from "../context/LanguageContext";

export default function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div
      className="inline-flex items-center rounded-md border border-white/10 bg-white/5 p-0.5 text-[9px] min-[380px]:text-[10px] sm:text-xs font-semibold"
      role="group"
      aria-label={t("lang.switchTo")}
    >
      <button
        type="button"
        onClick={() => setLanguage("en")}
        aria-pressed={language === "en"}
        className={`rounded-sm px-1 py-0.5 min-[380px]:px-1.5 sm:px-2 sm:py-1 transition ${
          language === "en"
            ? "bg-brand-orange text-white shadow-sm"
            : "text-gray-300 hover:text-white"
        }`}
      >
        {t("lang.en")}
      </button>
      <button
        type="button"
        onClick={() => setLanguage("th")}
        aria-pressed={language === "th"}
        className={`rounded-sm px-1 py-0.5 min-[380px]:px-1.5 sm:px-2 sm:py-1 transition ${
          language === "th"
            ? "bg-brand-orange text-white shadow-sm"
            : "text-gray-300 hover:text-white"
        }`}
      >
        {t("lang.th")}
      </button>
    </div>
  );
}
