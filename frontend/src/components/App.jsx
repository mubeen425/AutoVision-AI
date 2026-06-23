import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FaRotate,
  FaCircleCheck,
  FaTriangleExclamation,
  FaSpinner,
  FaChevronLeft,
  FaChevronRight,
  FaDownload,
} from "react-icons/fa6";
import BrandMark from "./BrandMark";
import ImageUpload from "./ImageUpload";
import CarListing from "./CarListing";
import ErrorCard from "./ErrorCard";
import AnalysisProcessing from "./AnalysisProcessing";
import InstallPrompt from "./InstallPrompt";
import {
  analyzeCarImage,
  analyzeCarPhotos,
  enhanceCarPhotos,
  enhanceSinglePhoto,
  translateField,
  translateListing,
} from "../services/geminiService";
import { useAppConfig } from "../context/AppConfigContext";
import { useLanguage } from "../context/LanguageContext";
import { usePwaInstall } from "../context/PwaInstallContext";
import LanguageToggle from "./LanguageToggle";

const CONCURRENCY = 2;

function classifyError(err) {
  const msg = err?.message ?? "";
  if (msg === "API_KEY_MISSING")
    return { code: "API_KEY_MISSING", message: err?.detail };
  if (msg === "PARSE_ERROR")
    return { code: "PARSE_ERROR", message: err?.detail };
  if (msg === "SERVICE_UNAVAILABLE" || msg === "RATE_LIMIT")
    return { code: msg, message: err?.detail };
  if (msg === "GEMINI_ACCESS_DENIED")
    return { code: "GEMINI_ACCESS_DENIED", message: err?.detail };
  return { code: "PARSE_ERROR", message: err?.message };
}

function getDisplayListing(item, language) {
  return item.listingData?.[language] ?? item.listingData?.en ?? item.result ?? null;
}

function getDisplayError(item, language) {
  if (item.errorBilingual) {
    const pick = item.errorBilingual[language] ?? item.errorBilingual.en;
    return {
      errorCode: pick?.errorCode ?? item.errorCode,
      errorMessage: pick?.errorMessage ?? item.errorMessage,
    };
  }
  return { errorCode: item.errorCode, errorMessage: item.errorMessage };
}

export default function App({ onSignOut }) {
  const { config } = useAppConfig();
  const { language, t } = useLanguage();
  const { canInstall, installed, install, isDeferredReady } = usePwaInstall();
  const { app, assets } = config;
  const bgCarImage = assets.banner;

  const [items, setItems] = useState([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [isAdvertPreviewOpen, setIsAdvertPreviewOpen] = useState(false);
  const [showInstalledAlert, setShowInstalledAlert] = useState(false);

  const updateItem = useCallback((id, patch) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }, []);

  // Enhance the background/lighting of exterior photos (car kept unchanged).
  // Runs automatically after a successful analysis; pure cabin interior is skipped.
  const runEnhance = useCallback(
    async (item, data) => {
      const photos =
        item.photos && item.photos.length
          ? item.photos
          : [
              {
                base64: item.base64,
                mimeType: item.mimeType,
                previewUrl: item.previewUrl,
              },
            ];
      if (!photos.length || !photos[0].base64) return;

      updateItem(item.id, {
        enhanceStatus: "enhancing",
        enhancedUrls: photos.map(() => null),
        enhancedMeta: photos.map(() => null),
      });

      const enhancedUrls = photos.map(() => null);
      const enhancedMeta = photos.map(() => null);

      const maxEnhanceCount = 2;
      const promises = photos.map(async (photo, index) => {
        if (index >= maxEnhanceCount) {
          enhancedMeta[index] = { skipped: "limit_reached" };
          updateItem(item.id, {
            enhancedUrls: [...enhancedUrls],
            enhancedMeta: [...enhancedMeta],
          });
          return;
        }

        try {
          const result = await enhanceSinglePhoto(photo.base64, photo.mimeType);
          if (result?.enhanced?.base64) {
            enhancedUrls[index] = `data:${result.enhanced.mimeType || "image/png"};base64,${result.enhanced.base64}`;
          }
          enhancedMeta[index] = result || null;
        } catch (err) {
          enhancedMeta[index] = { error: err.message || "ENHANCE_FAILED" };
        }
        updateItem(item.id, {
          enhancedUrls: [...enhancedUrls],
          enhancedMeta: [...enhancedMeta],
        });
      });

      try {
        await Promise.all(promises);
        updateItem(item.id, {
          enhanceStatus: "done",
        });
      } catch {
        updateItem(item.id, {
          enhanceStatus: "error",
        });
      }
    },
    [updateItem],
  );

  const runOne = useCallback(
    async (item) => {
      updateItem(item.id, {
        status: "loading",
        result: null,
        listingData: null,
        errorCode: null,
        errorMessage: null,
        errorBilingual: null,
        enhanceStatus: null,
        enhancedUrls: null,
        enhancedMeta: null,
      });

      // Start the image enhancement in parallel (without waiting for analyzeCarPhotos)
      const enhancePromise = runEnhance(item, null);

      try {
        const data =
          item.photos && item.photos.length > 1
            ? await analyzeCarPhotos(
                item.photos.map((p) => ({
                  base64: p.base64,
                  mimeType: p.mimeType,
                })),
              )
            : await analyzeCarImage(item.base64, item.mimeType);
        if (data?.error || data?.errorBilingual) {
          const bilingual = data.errorBilingual ?? {
            en: {
              errorCode: data.error,
              errorMessage: data.error_message ?? null,
            },
            th: {
              errorCode: data.error,
              errorMessage: data.error_message ?? null,
            },
          };
          updateItem(item.id, {
            status: "error",
            errorBilingual: bilingual,
            errorCode: bilingual.en.errorCode,
            errorMessage: bilingual.en.errorMessage,
          });
          await enhancePromise;
          return;
        }
        const enData = data.en ?? data.listingData?.en;
        updateItem(item.id, {
          status: "success",
          listingData: data.listingData ?? { en: enData, th: enData },
          result: enData,
        });
        await enhancePromise;
      } catch (err) {
        const { code, message } = classifyError(err);
        updateItem(item.id, {
          status: "error",
          errorBilingual: {
            en: { errorCode: code, errorMessage: message ?? null },
            th: { errorCode: code, errorMessage: message ?? null },
          },
          errorCode: code,
          errorMessage: message,
        });
        await enhancePromise;
      }
    },
    [updateItem, runEnhance],
  );

  const runBatch = useCallback(
    async (toProcess) => {
      const queue = [...toProcess];
      const worker = async () => {
        while (queue.length) {
          const next = queue.shift();
          if (next) await runOne(next);
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(CONCURRENCY, toProcess.length) },
          worker,
        ),
      );
    },
    [runOne],
  );

  const handleAnalyze = useCallback(
    (selected) => {
      if (!selected || !selected.length) return;
      setActiveSlide(0);

      const merged = {
        id: `combined-${Date.now()}`,
        fileName:
          selected.length === 1
            ? selected[0]?.fileName || t("upload.singlePhotoName")
            : t("upload.multiplePhotosName", { count: selected.length }),
        previewUrl: selected[0]?.previewUrl,
        previewUrls: selected.map((it) => it.previewUrl).filter(Boolean),
        base64: selected[0]?.base64,
        mimeType: selected[0]?.mimeType,
        photos: selected.map((it) => ({
          id: it.id,
          base64: it.base64,
          mimeType: it.mimeType,
          previewUrl: it.previewUrl,
          fileName: it.fileName,
        })),
        status: "queued",
      };
      setItems([merged]);
      void runBatch([merged]);
    },
    [runBatch, t],
  );

  const handleRetry = useCallback(
    (id) => {
      setItems((cur) => {
        const target = cur.find((it) => it.id === id);
        if (target) void runOne(target);
        return cur;
      });
    },
    [runOne],
  );

  const translateTextInBackground = useCallback(async (itemId, fieldKey, text) => {
    if (!text || !text.trim()) return;
    try {
      const result = await translateListing({ [fieldKey]: text });
      const translatedText = result[fieldKey];
      if (translatedText) {
        setItems((prev) =>
          prev.map((it) => {
            if (it.id !== itemId) return it;
            const nextTh = { ...it.listingData.th, [fieldKey]: translatedText };
            return {
              ...it,
              listingData: {
                ...it.listingData,
                th: nextTh,
              },
            };
          })
        );
      }
    } catch (err) {
      console.error("Background translation failed:", err);
    }
  }, []);

  const handleSaveListing = useCallback((id, updatedForm, updatedFeatures, updatedAdvert, editLanguage) => {
    const activeLang = editLanguage || language;
    const targetLang = activeLang === "en" ? "th" : "en";

    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;

        const oldListingData = it.listingData ?? {};
        const oldEn = oldListingData.en ?? it.result ?? {};
        const oldTh = oldListingData.th ?? it.result ?? {};

        const oldActive = activeLang === "en" ? oldEn : oldTh;
        const oldTarget = activeLang === "en" ? oldTh : oldEn;

        const updatedActive = { ...oldActive, ...updatedForm };
        const updatedTarget = { ...oldTarget };

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
          "dealer_price",
          "address",
          "lat",
          "lng",
          "line_id",
          "drive",
          "expire",
          "featured_expire",
          "video_url",
          "image_ids",
        ];

        const localizedKeys = [
          "body_style",
          "exterior_color",
          "fuel_type",
          "transmission",
          "drivetrain",
        ];

        globalKeys.forEach((key) => {
          if (updatedForm[key] !== undefined) {
            updatedTarget[key] = updatedForm[key];
          }
        });

        localizedKeys.forEach((key) => {
          if (updatedForm[key] !== undefined) {
            const hasChanged = String(updatedForm[key]).trim() !== String(oldActive[key] || "").trim();
            if (hasChanged) {
              updatedTarget[key] = translateField(updatedForm[key], targetLang);
            }
          }
        });

        const textKeys = ["notes", "reasons_to_buy"];
        textKeys.forEach((key) => {
          if (updatedForm[key] !== undefined) {
            const hasChanged = String(updatedForm[key]).trim() !== String(oldActive[key] || "").trim();
            if (hasChanged) {
              updatedTarget[key] = updatedForm[key];
              if (activeLang === "en") {
                void translateTextInBackground(id, key, updatedForm[key]);
              }
            }
          }
        });

        const newEn = activeLang === "en" ? updatedActive : updatedTarget;
        const newTh = activeLang === "en" ? updatedTarget : updatedActive;

        const nextItem = {
          ...it,
          listingData: {
            en: newEn,
            th: newTh,
          },
          result: newEn,
        };

        if (updatedFeatures !== undefined) {
          nextItem.confirmedFeatures = updatedFeatures;
        }
        if (updatedAdvert !== undefined) {
          nextItem.advert = updatedAdvert;
        }

        return nextItem;
      }),
    );
  }, [language, translateTextInBackground]);

  const handleReset = useCallback(() => {
    setActiveSlide(0);
    setItems((cur) => {
      cur.forEach((it) => {
        const urls = new Set();
        if (it.previewUrl) urls.add(it.previewUrl);
        if (Array.isArray(it.previewUrls)) it.previewUrls.forEach((u) => u && urls.add(u));
        if (Array.isArray(it.photos))
          it.photos.forEach((p) => p?.previewUrl && urls.add(p.previewUrl));
        urls.forEach((u) => URL.revokeObjectURL(u));
      });
      return [];
    });
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    setActiveSlide((i) => Math.min(i, Math.max(0, items.length - 1)));
  }, [items.length]);

  const isIdle = items.length === 0;
  const total = items.length;
  const successCount = items.filter((it) => it.status === "success").length;
  const errorCount = items.filter((it) => it.status === "error").length;
  const busyCount = items.filter(
    (it) => it.status === "loading" || it.status === "queued",
  ).length;
  const isAnalyzing = busyCount > 0;

  return (
    <div className="h-[100dvh] w-[100dvw] flex flex-col overflow-hidden relative text-gray-900 bg-zinc-950">
      {/* Decorative background car (full-bleed, not zoomed) */}
      <div
        className="absolute inset-0 z-0 overflow-hidden pointer-events-none"
        aria-hidden
      >
        <img
          src={bgCarImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[32%_center] lg:object-center opacity-[0.85] transition-all duration-700"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/50 via-black/38 to-black/60" />
        <div className="absolute inset-0 bg-black/20" />
      </div>

      {/* Header — WowCar (partner) left, product title right */}
      <header className="shrink-0 z-20 border-b border-white/[0.08] bg-black/45 shadow-sm shadow-black/20 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[3.5rem] lg:min-h-[4rem] max-w-7xl items-center justify-between px-4 py-2.5 lg:py-3 sm:px-6">
          <button
            onClick={handleReset}
            className="min-w-0 shrink cursor-pointer transition hover:opacity-85 focus:outline-none"
            title={t("app.returnHome")}
          >
            <BrandMark />
          </button>
          <div className="flex shrink-0 items-center gap-1 min-[380px]:gap-2 sm:gap-3">
            <LanguageToggle />
            {canInstall && (
              <button
                type="button"
                onClick={() => {
                  if (installed || !isDeferredReady) {
                    setShowInstalledAlert(true);
                  } else {
                    install();
                  }
                }}
                title={installed ? t("app.alreadyInstalled") : t("app.installProduct", { product: app.productName })}
                aria-label={installed ? t("app.alreadyInstalled") : t("app.installProduct", { product: app.productName })}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] min-[380px]:text-xs font-semibold text-gray-200 shadow-sm transition hover:bg-white/10 hover:text-white sm:px-2.5"
              >
                {installed ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-emerald-500">
                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.5 2.5a.75.75 0 0 0 1.14-.105l4-5.5Z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <FaDownload className="h-3.5 w-3.5 shrink-0 text-brand-orange" />
                )}
                <span className="hidden sm:inline">
                  {installed ? t("app.alreadyInstalled") : t("app.install")}
                </span>
              </button>
            )}
            {onSignOut && (
              <button
                id="app-signout-btn"
                type="button"
                onClick={onSignOut}
                title={t("app.signOut")}
                aria-label={t("app.signOutLabel")}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] min-[380px]:text-xs font-semibold text-gray-200 shadow-sm transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300 sm:px-2.5"
              >
                {/* Door-arrow sign-out icon */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
                  <path fillRule="evenodd" d="M7.5 3.75A1.5 1.5 0 0 0 6 5.25v13.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5V15a.75.75 0 0 1 1.5 0v3.75a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3V5.25a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3V9A.75.75 0 0 1 15 9V5.25a1.5 1.5 0 0 0-1.5-1.5h-6Zm10.72 4.72a.75.75 0 0 1 1.06 0l3 3a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 1 1-1.06-1.06l1.72-1.72H9a.75.75 0 0 1 0-1.5h10.94l-1.72-1.72a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
                <span className="hidden sm:inline">{t("app.signOut")}</span>
              </button>
            )}
            <h1 className="text-right text-[10px] min-[380px]:text-xs sm:text-sm font-bold leading-tight tracking-tight text-white md:text-base lg:text-lg shrink-0">
              <span className="text-brand-orange">{app.productName.slice(0, 4)}</span>
              {app.productName.slice(4)}
            </h1>
          </div>

        </div>
      </header>

      {/* Sub-bar for active scans (bottom of nav on top) */}
      {!isIdle && (
        <div className="shrink-0 z-10">
          <div className="mx-auto max-w-7xl flex items-center justify-end px-4 pt-4 pb-2 sm:px-6">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-gray-200 shadow-sm transition hover:bg-white/10 hover:text-white"
            >
              <FaRotate className="h-3.5 w-3.5 shrink-0 text-brand-orange" />
              {t("app.newScan")}
            </button>
          </div>
        </div>
      )}

      {/* Main - Scrollable content zone when active, centered scrollable when idle */}
      <main className={`flex-1 min-h-0 relative z-10 max-w-7xl w-full mx-auto px-4 py-2 lg:py-6 space-y-3 overflow-y-auto ${
        isIdle ? "flex flex-col" : ""
      }`}>
        {isIdle && (
          <div className="flex flex-col items-center justify-center lg:grid lg:grid-cols-2 lg:gap-12 lg:items-center w-full py-4 lg:py-0 space-y-4 lg:space-y-0 text-center lg:text-left my-auto">
            <div className="space-y-2 lg:space-y-4 max-w-xl mx-auto lg:mx-0">
              <h2 className="font-h1 text-white leading-tight tracking-tight text-center lg:text-left">
                {t("hero.headline")} <br />{" "}
                <span className="text-brand-orange">{t("hero.headlineAccent")}</span>
              </h2>
              <p className="font-p-lead text-gray-300 text-center lg:text-left">
                {t("hero.lead", {
                  partner: app.partnerName,
                  product: app.productName,
                })}
              </p>
            </div>
            <div className="flex justify-center w-full max-w-xl mx-auto lg:mx-0 lg:justify-end">
              <ImageUpload
                variant="hero"
                onAnalyze={handleAnalyze}
                isLoading={false}
              />
            </div>
          </div>
        )}

        {!isIdle && (
          <div className="space-y-6 pb-6">
            {!isAdvertPreviewOpen && (
              <div key="summary-bar-wrapper" className={total > 1 ? "px-0 md:px-14" : "px-0"}>
                <SummaryBar
                  total={total}
                  successCount={successCount}
                  errorCount={errorCount}
                  busyCount={busyCount}
                  isAnalyzing={isAnalyzing}
                  combinedPhotoCount={
                    items.length === 1 && Array.isArray(items[0].previewUrls)
                      ? items[0].previewUrls.length
                      : 0
                  }
                />
              </div>
            )}
            <ResultsCarousel
              key="results-carousel"
              items={items}
              activeSlide={activeSlide}
              language={language}
              onSlideChange={setActiveSlide}
              onRetry={handleRetry}
              onAdvertPreviewChange={setIsAdvertPreviewOpen}
              onSave={handleSaveListing}
            />
          </div>
        )}
      </main>

      <footer className="shrink-0 z-20 border-t border-white/[0.08] bg-black/45 shadow-sm shadow-black/20 backdrop-blur-xl py-3 text-center text-[10px] sm:text-xs tracking-wide text-gray-400">
        {t("app.allRightsReserved")} © {app.partnerName} {app.copyrightYear}{" "}
        <span className="hidden sm:inline">·</span> <br className="sm:hidden" />{" "}
        {t("app.poweredBy")}{" "}
        <span className="font-semibold text-brand-orange">{app.productName.slice(0, 4)}</span>
        <span className="font-semibold text-white">{app.productName.slice(4)}</span> · {t("app.version")}{" "}
        {app.version}
      </footer>

      <InstallPrompt />

      {showInstalledAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-zinc-900/95 p-6 text-center shadow-2xl backdrop-blur-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.5 2.5a.75.75 0 0 0 1.14-.105l4-5.5Z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white">
              {t("pwa.alreadyInstalled")}
            </h3>
            <p className="mt-2 text-sm text-gray-400">
              {t("pwa.alreadyInstalledDesc")}
            </p>
            <button
              type="button"
              onClick={() => setShowInstalledAlert(false)}
              className="mt-5 w-full rounded-xl bg-brand-orange py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-orange/25 transition hover:bg-brand-orange-hover active:scale-[0.98] focus:outline-none"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const SWIPE_THRESHOLD_PX = 50;

function ResultsCarousel({ items, activeSlide, language, onSlideChange, onRetry, onAdvertPreviewChange, onSave }) {
  const { t } = useLanguage();
  const total = items.length;
  const activeItem = items[activeSlide];
  const touchStartX = useRef(null);
  const canPrev = activeSlide > 0;
  const canNext = activeSlide < total - 1;

  const goPrev = useCallback(() => {
    if (canPrev) onSlideChange(activeSlide - 1);
  }, [activeSlide, canPrev, onSlideChange]);

  const goNext = useCallback(() => {
    if (canNext) onSlideChange(activeSlide + 1);
  }, [activeSlide, canNext, onSlideChange]);

  const navBtnClass =
    "absolute top-1/2 z-10 hidden md:flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/70 disabled:pointer-events-none disabled:opacity-30";

  if (!activeItem) return null;

  return (
    <div className="space-y-4">
      <div className={`relative ${total > 1 ? "px-0 md:px-14" : "px-0"}`}>
        {total > 1 && (
          <>
            <button
              type="button"
              aria-label={t("carousel.previous")}
              disabled={!canPrev}
              onClick={goPrev}
              className={`${navBtnClass} left-0 sm:left-1`}
            >
              <FaChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={t("carousel.next")}
              disabled={!canNext}
              onClick={goNext}
              className={`${navBtnClass} right-0 sm:right-1`}
            >
              <FaChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </>
        )}
        <div
          className="w-full min-w-0 overflow-hidden rounded-2xl"
          onTouchStart={(e) => {
            touchStartX.current = e.changedTouches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (touchStartX.current == null) return;
            const endX = e.changedTouches[0].clientX;
            const dx = endX - touchStartX.current;
            touchStartX.current = null;
            if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
            if (dx > 0) goPrev();
            else goNext();
          }}
        >
          <div
            key={`${activeItem.id}-${activeSlide}`}
            className="animate-carousel-swap"
          >
            <ResultCard
              index={activeSlide + 1}
              item={activeItem}
              language={language}
              onRetry={() => onRetry(activeItem.id)}
              onAdvertPreviewChange={onAdvertPreviewChange}
              onSave={onSave}
            />
          </div>
        </div>
      </div>

      {total > 1 && (
        <div
          className="flex flex-wrap items-center justify-center gap-2"
          role="tablist"
          aria-label={t("carousel.selectPhoto")}
        >
          {items.map((it, idx) => {
            const selected = idx === activeSlide;
            return (
              <button
                key={it.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={t("carousel.photoOf", { current: idx + 1, total })}
                onClick={() => onSlideChange(idx)}
                className={
                  selected
                    ? "min-h-[2.25rem] min-w-[2.25rem] rounded-xl bg-brand-orange px-3 text-sm font-bold text-white shadow shadow-brand-orange/25"
                    : "min-h-[2.25rem] min-w-[2.25rem] rounded-xl border border-white/15 bg-black/40 px-3 text-sm font-semibold text-gray-200 backdrop-blur-sm transition hover:border-white/25 hover:bg-black/55 hover:text-white"
                }
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryBar({
  total,
  successCount,
  errorCount,
  busyCount,
  isAnalyzing,
  combinedPhotoCount = 0,
}) {
  const { t } = useLanguage();
  const completed = total - busyCount;
  const isCombined = combinedPhotoCount > 1 && total === 1;
  const analyzingLabel = isCombined
      ? isAnalyzing
        ? t("summary.analyzingCombined", { count: combinedPhotoCount })
        : t("summary.analyzedCombined", { count: combinedPhotoCount })
      : isAnalyzing
        ? t("summary.analyzingProgress", {
            current: completed + 1 > total ? total : completed + 1,
            total,
          })
        : t(total === 1 ? "summary.analyzedPhotos" : "summary.analyzedPhotos_plural", {
            count: total,
          });
  return (
    <div className="rounded-2xl border border-white/10 bg-black/45 px-4 py-3 backdrop-blur-md sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-200">
        <span className="font-semibold text-white">{analyzingLabel}</span>
        {successCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-emerald-300">
            <FaCircleCheck className="h-4 w-4" /> {t("summary.succeeded", { count: successCount })}
          </span>
        )}
        {errorCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-amber-300">
            <FaTriangleExclamation className="h-4 w-4" /> {t("summary.failed", { count: errorCount })}
          </span>
        )}
        {busyCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-gray-300">
            <FaSpinner className="h-4 w-4 animate-spin" /> {t("summary.inProgress", { count: busyCount })}
          </span>
        )}
      </div>
    </div>
  );
}

function ResultCard({ item, index, language, onRetry, onAdvertPreviewChange, onSave }) {
  const { t } = useLanguage();

  if (item.status === "loading" || item.status === "queued") {
    return (
      <div className="relative">
        <AnalysisProcessing
          key={`${item.id}-${item.status}`}
          previewUrl={item.previewUrl}
          previewUrls={
            item.previewUrls?.length
              ? item.previewUrls
              : item.photos?.map((p) => p.previewUrl).filter(Boolean)
          }
          isQueued={item.status === "queued"}
          photoCount={item.photos ? item.photos.length : 1}
        />
        <p className="mt-2 truncate text-center text-xs text-gray-400">
          {item.fileName}
        </p>
      </div>
    );
  }

  if (item.status === "error") {
    const { errorCode, errorMessage } = getDisplayError(item, language);
    return (
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-2xl border border-amber-300/30 bg-black/45 shadow-lg backdrop-blur-md">
          {item.previewUrl && (
            <img
              src={item.previewUrl}
              alt={item.fileName}
              className="h-40 w-full object-cover opacity-70 sm:h-44"
            />
          )}
        </div>
        <ErrorCard errorCode={errorCode} errorMessage={errorMessage} />
        <div className="flex justify-center">
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-orange px-4 py-2 text-sm font-medium text-white shadow-sm shadow-brand-orange/20 transition hover:bg-brand-orange-hover"
          >
             <FaRotate className="h-4 w-4" />
            {t("listing.retryPhoto")}
          </button>
        </div>
      </div>
    );
  }

  const displayData = getDisplayListing(item, language);
  const dataEn = item.listingData?.en ?? item.result;

  return (
    <div className="relative">
      <CarListing
        data={displayData}
        dataEn={dataEn}
        previewUrl={item.previewUrl}
        previewUrls={item.previewUrls}
        enhancedUrls={item.enhancedUrls}
        enhancedMeta={item.enhancedMeta}
        enhanceStatus={item.enhanceStatus}
        onAdvertPreviewChange={onAdvertPreviewChange}
        photos={item.photos || (item.base64 ? [{ base64: item.base64, mimeType: item.mimeType }] : [])}
        confirmedFeaturesProp={item.confirmedFeatures}
        advertProp={item.advert}
        onSave={(updatedForm, updatedFeatures, updatedAdvert, editLanguage) =>
          onSave?.(item.id, updatedForm, updatedFeatures, updatedAdvert, editLanguage)
        }
      />
    </div>
  );
}
