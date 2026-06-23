import React, { useEffect, useState } from "react";
import {
  FaWandSparkles,
  FaExpand,
  FaCrosshairs,
  FaCar,
  FaWandMagicSparkles,
  FaChartLine,
  FaCircleCheck,
} from "react-icons/fa6";
import { useAppConfig } from "../context/AppConfigContext";
import { useLanguage } from "../context/LanguageContext";

const STEP_ICONS = [FaExpand, FaCrosshairs, FaCar, FaWandMagicSparkles, FaChartLine];

// Typical analysis finishes within ~10s — spread slides/steps across that window.
const ANALYSIS_WINDOW_MS = 10_000;
const SLIDE_TRANSITION_MS = 800;

/** Each image stays on screen for an equal share of the ~10s analysis window. */
function slideIntervalMs(imageCount) {
  if (imageCount <= 1) return ANALYSIS_WINDOW_MS;
  return Math.round(ANALYSIS_WINDOW_MS / imageCount);
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

export default function AnalysisProcessing({
  previewUrl,
  previewUrls,
  isQueued = false,
  photoCount = 1,
}) {
  const { config } = useAppConfig();
  const { t } = useLanguage();
  const steps = config.processingSteps.map((step, i) => {
    const stepCopy = t(`processing.steps.${i}`);
    const label =
      typeof stepCopy === "object" && stepCopy?.label
        ? stepCopy.label
        : step.label;
    const labelPlural =
      typeof stepCopy === "object" && stepCopy?.labelPlural
        ? stepCopy.labelPlural
        : step.labelPlural;
    return {
      ...step,
      label,
      labelPlural,
      icon: STEP_ICONS[i] ?? FaWandSparkles,
    };
  });
  const productName = config.app.productName;

  const [activeStep, setActiveStep] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [progress, setProgress] = useState(() => (isQueued ? 12 : 0));
  const reducedMotion = usePrefersReducedMotion();

  // All photos to cycle through; fall back to the single preview.
  const images =
    Array.isArray(previewUrls) && previewUrls.length > 0
      ? previewUrls
      : previewUrl
        ? [previewUrl]
        : [];
  const multi = images.length > 1;
  const imageKey = images.join("\0");

  // Walk through every photo once, then hold on the last one.
  const slideMs = slideIntervalMs(images.length);
  const [pos, setPos] = useState(0);
  const [scanned, setScanned] = useState(() => new Set());

  useEffect(() => {
    setPos(0);
    setScanned(new Set());
  }, [imageKey]);

  useEffect(() => {
    if (isQueued || !multi) return;

    // On the last image: mark it scanned after its dwell time, then stop.
    if (pos >= images.length - 1) {
      const done = setTimeout(() => {
        setScanned((prev) => {
          const next = new Set(prev);
          next.add(pos);
          return next;
        });
      }, slideMs);
      return () => clearTimeout(done);
    }

    const timer = setTimeout(() => {
      setScanned((prev) => {
        const next = new Set(prev);
        next.add(pos);
        return next;
      });
      setPos((p) => p + 1);
    }, slideMs);
    return () => clearTimeout(timer);
  }, [isQueued, multi, pos, images.length, slideMs]);

  // 1-based index of the photo currently in the scan window.
  const currentImage = multi ? pos + 1 : 1;

  useEffect(() => {
    if (isQueued) return;
    const stepMs = Math.round(ANALYSIS_WINDOW_MS / steps.length);
    const stepTimer = setInterval(() => {
      setActiveStep((s) => (s < steps.length - 1 ? s + 1 : s));
    }, stepMs);
    return () => clearInterval(stepTimer);
  }, [isQueued, steps.length]);

  useEffect(() => {
    if (isQueued) return;
    const p = setInterval(() => {
      setProgress((v) => (v >= 92 ? 92 : v + Math.random() * 8 + 2));
    }, 280);
    return () => clearInterval(p);
  }, [isQueued]);

  useEffect(() => {
    const t = setInterval(() => setPulse((p) => (p + 1) % 1000), 50);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-zinc-900 to-black p-6 shadow-2xl shadow-black/85">
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand-orange/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-amber-500/5 blur-3xl" />

      <div className="relative flex flex-col items-center gap-6">
        <div className="flex items-center gap-2 text-brand-orange">
          <FaWandSparkles className="h-5 w-5 animate-pulse" />
          <span className="text-sm font-semibold tracking-wide uppercase">
            {isQueued
              ? t("processing.inQueue")
              : t("processing.aiLabel", { product: productName })}
          </span>
          <FaWandSparkles className="h-5 w-5 animate-pulse" />
        </div>

        {/* Scan window — crossfade through every uploaded photo */}
        {images.length > 0 && (
          <div className="relative w-full max-w-md sm:max-w-xl">
            <div
              className="absolute inset-0 rounded-2xl ring-2 ring-brand-orange/40 ring-offset-2 ring-offset-slate-950 animate-pulse"
              style={{ animationDuration: "2s" }}
            />
            <div className="relative h-60 w-full overflow-hidden rounded-2xl border border-slate-800 shadow-md sm:h-72">
              {images.map((url, i) => (
                <img
                  key={`frame-${i}`}
                  src={url}
                  alt=""
                  className={`absolute inset-0 h-full w-full object-cover ease-in-out ${
                    reducedMotion ? "" : "transition-opacity"
                  }`}
                  style={{
                    opacity: i === pos ? 1 : 0,
                    transitionDuration: reducedMotion ? "0ms" : `${SLIDE_TRANSITION_MS}ms`,
                  }}
                />
              ))}

              <div className="analysis-scanline pointer-events-none absolute inset-0 z-10" />
              <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-brand-orange/10 to-transparent" />

              {multi && (
                <span className="absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                  {t("processing.image")} {currentImage}
                  <span className="text-slate-400">/ {images.length}</span>
                </span>
              )}
            </div>
            <div
              className="pointer-events-none absolute -inset-3 rounded-3xl border border-dashed border-brand-orange/30 opacity-60"
              style={{
                transform: `rotate(${Math.sin(pulse / 100) * 2}deg)`,
              }}
            />
          </div>
        )}

        {/* Thumbnail strip — makes it obvious every photo is being scanned */}
        {multi && (
          <div className="flex w-full max-w-xl items-center justify-center gap-2 overflow-x-auto pb-1">
            {images.map((url, i) => {
              const isActive = i === pos;
              const isDone = scanned.has(i);
              return (
                <div
                  key={`thumb-${i}`}
                  className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border transition-all duration-300 ${
                    isActive
                      ? "border-brand-orange ring-2 ring-brand-orange/50"
                      : isDone
                        ? "border-emerald-500/50"
                        : "border-slate-700 opacity-60"
                  }`}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  {isActive && (
                    <div className="analysis-scanline pointer-events-none absolute inset-0" />
                  )}
                  {isDone && (
                    <div className="absolute inset-0 flex items-center justify-center bg-emerald-950/50">
                      <FaCircleCheck className="h-4 w-4 text-emerald-400" />
                    </div>
                  )}
                  <span className="absolute left-0.5 top-0.5 rounded bg-black/70 px-1 text-[9px] font-bold text-white">
                    {i + 1}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Progress bar */}
        <div className="w-full max-w-xl space-y-2">
          <div className="flex justify-between text-xs text-slate-400">
            <span>{t("processing.processing")}</span>
            <span className="font-mono tabular-nums text-brand-orange">
              {Math.round(Math.min(progress, 92))}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-orange via-amber-400 to-brand-orange transition-[width] duration-300 ease-out"
              style={{ width: `${Math.min(progress, 92)}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        <ul className="w-full max-w-xl space-y-2.5">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const done = i < activeStep;
            const current = i === activeStep;
            const label =
              i === 0 && photoCount > 1 && step.labelPlural
                ? step.labelPlural
                : step.label;
            return (
              <li
                key={step.id ?? i}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-all duration-300 ${
                  current
                    ? "border-brand-orange/30 bg-brand-orange/10 text-white shadow-lg shadow-brand-orange/5"
                    : done
                      ? "border-slate-800 bg-slate-900/40 text-slate-300"
                      : "border-transparent bg-slate-950/20 text-slate-500"
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    done
                      ? "bg-emerald-950/50 text-emerald-400 border border-emerald-500/10"
                      : current
                        ? "bg-brand-orange text-white"
                        : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {done ? (
                    <FaCircleCheck className="h-4 w-4" />
                  ) : (
                    <Icon className={`h-4 w-4 ${current ? "animate-pulse" : ""}`} />
                  )}
                </span>
                <span
                  className={
                    current ? "font-semibold text-white" : "font-medium text-inherit"
                  }
                >
                  {label}
                </span>
                {current && (
                  <span className="ml-auto flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-orange [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-orange [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-orange [animation-delay:300ms]" />
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {isQueued && (
          <p className="text-center text-xs text-slate-500 mt-2">
            {t("processing.queuedHint")}
          </p>
        )}
      </div>
    </div>
  );
}
