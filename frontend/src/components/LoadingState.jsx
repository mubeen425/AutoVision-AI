import React from "react";
import { FaSpinner } from "react-icons/fa6";
import { useLanguage } from "../context/LanguageContext";

export default function LoadingState() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <FaSpinner className="w-12 h-12 text-brand-orange animate-spin" />
      <div className="text-center">
        <p className="font-medium text-gray-800">{t("loadingState.analyzingPhoto")}</p>
        <p className="text-sm text-gray-500 mt-1">
          {t("loadingState.identifyingSpecs")}
        </p>
      </div>
    </div>
  );
}
