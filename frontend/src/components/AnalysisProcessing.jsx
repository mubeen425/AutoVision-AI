import React, { useEffect, useState } from "react";
import {
  Sparkles,
  ScanLine,
  Crosshair,
  Car,
  Wand2,
  LineChart,
  CheckCircle2,
} from "lucide-react";

const STEPS = [
  { id: 0, label: "Scanning image & lighting", icon: ScanLine },
  { id: 1, label: "Locating vehicle in frame", icon: Crosshair },
  { id: 2, label: "Identifying make & model", icon: Car },
  { id: 3, label: "Extracting specs & color", icon: Wand2 },
  { id: 4, label: "Computing market estimate", icon: LineChart },
];

export default function AnalysisProcessing({ previewUrl, isQueued = false }) {
  const [activeStep, setActiveStep] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [progress, setProgress] = useState(() => (isQueued ? 12 : 0));

  useEffect(() => {
    if (isQueued) return;
    const stepTimer = setInterval(() => {
      setActiveStep((s) => (s < STEPS.length - 1 ? s + 1 : s));
    }, 1100);
    return () => clearInterval(stepTimer);
  }, [isQueued]);

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
          <Sparkles className="h-5 w-5 animate-pulse" />
          <span className="text-sm font-semibold tracking-wide uppercase">
            {isQueued ? "In queue" : "PicoPost AI"}
          </span>
          <Sparkles className="h-5 w-5 animate-pulse" />
        </div>

        {/* Image with scan + rings */}
        {previewUrl && (
          <div className="relative">
            <div
              className="absolute inset-0 rounded-2xl ring-2 ring-brand-orange/40 ring-offset-2 ring-offset-slate-950 animate-pulse"
              style={{ animationDuration: "2s" }}
            />
            <div className="relative h-60 w-full max-w-md overflow-hidden rounded-2xl border border-slate-800 shadow-md sm:h-72 sm:max-w-xl">
              <img
                src={previewUrl}
                alt=""
                className="h-full w-full object-cover"
              />
              <div className="analysis-scanline pointer-events-none absolute inset-0" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-orange/10 to-transparent" />
            </div>
            <div
              className="pointer-events-none absolute -inset-3 rounded-3xl border border-dashed border-brand-orange/30 opacity-60"
              style={{
                transform: `rotate(${Math.sin(pulse / 100) * 2}deg)`,
              }}
            />
          </div>
        )}

        {/* Progress bar */}
        <div className="w-full max-w-xl space-y-2">
          <div className="flex justify-between text-xs text-slate-400">
            <span>Processing</span>
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
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const done = i < activeStep;
            const current = i === activeStep;
            return (
              <li
                key={step.id}
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
                     <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Icon className={`h-4 w-4 ${current ? "animate-pulse" : ""}`} />
                  )}
                </span>
                <span
                  className={
                    current ? "font-semibold text-white" : "font-medium text-inherit"
                  }
                >
                  {step.label}
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
            Your photo will start analyzing in a moment.
          </p>
        )}
      </div>
    </div>
  );
}


