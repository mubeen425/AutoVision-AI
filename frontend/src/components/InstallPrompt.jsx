import React, { useEffect, useState } from "react";
import { FaDownload, FaXmark } from "react-icons/fa6";
import { useAppConfig } from "../context/AppConfigContext";
import { useLanguage } from "../context/LanguageContext";
import { usePwaInstall } from "../context/PwaInstallContext";

const BANNER_DISMISS_KEY = "picopost-pwa-banner-dismissed";

export default function InstallPrompt() {
  const { config } = useAppConfig();
  const { t } = useLanguage();
  const { canInstall, installed, install } = usePwaInstall();
  const [bannerVisible, setBannerVisible] = useState(false);

  useEffect(() => {
    if (!canInstall || installed) {
      setBannerVisible(false);
      return;
    }
    if (sessionStorage.getItem(BANNER_DISMISS_KEY) === "1") return;
    setBannerVisible(true);
  }, [canInstall, installed]);

  if (!canInstall || installed || !bannerVisible) return null;

  const product = config.app.productName || "PicoPost";

  const dismissBanner = () => {
    sessionStorage.setItem(BANNER_DISMISS_KEY, "1");
    setBannerVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label={t("installPrompt.dialogLabel")}
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-white/15 bg-zinc-900/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl sm:left-auto sm:right-6"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-orange text-white">
        <FaDownload className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">
          {t("installPrompt.title", { product })}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">
          {t("installPrompt.description")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => install()}
            className="rounded-lg bg-brand-orange px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-orange-hover"
          >
            {t("installPrompt.install")}
          </button>
          <button
            type="button"
            onClick={dismissBanner}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-white/5"
          >
            {t("installPrompt.notNow")}
          </button>
        </div>
      </div>
      <button
        type="button"
        aria-label={t("installPrompt.dismiss")}
        onClick={dismissBanner}
        className="shrink-0 rounded-lg p-1 text-gray-500 transition hover:bg-white/5 hover:text-gray-300"
      >
        <FaXmark className="h-4 w-4" />
      </button>
    </div>
  );
}
