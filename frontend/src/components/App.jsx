import React, { useCallback, useState } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import BrandMark from "./BrandMark";
import ImageUpload from "./ImageUpload";
import CarListing from "./CarListing";
import ErrorCard from "./ErrorCard";
import { analyzeCarImage } from "../services/geminiService";

const CONCURRENCY = 2;

/** Decorative background — local car photo (blurred) */
const BG_CAR_IMAGE = "/assets/images/tyler-clemmensen-d1Jum1vVLew-unsplash.jpg";

function classifyError(err) {
  const msg = err?.message ?? "";
  if (msg === "API_KEY_MISSING")
    return { code: "API_KEY_MISSING", message: err?.detail };
  if (msg === "PARSE_ERROR")
    return { code: "PARSE_ERROR", message: err?.detail };
  if (msg === "SERVICE_UNAVAILABLE" || msg === "RATE_LIMIT")
    return { code: msg, message: err?.detail };
  return { code: "PARSE_ERROR", message: err?.message };
}

export default function App() {
  const [items, setItems] = useState([]);

  const updateItem = useCallback((id, patch) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }, []);

  const runOne = useCallback(
    async (item) => {
      updateItem(item.id, {
        status: "loading",
        result: null,
        errorCode: null,
        errorMessage: null,
      });
      try {
        const data = await analyzeCarImage(item.base64, item.mimeType);
        if (data?.error) {
          updateItem(item.id, {
            status: "error",
            errorCode: data.error,
            errorMessage: data.error_message,
          });
          return;
        }
        updateItem(item.id, { status: "success", result: data });
      } catch (err) {
        const { code, message } = classifyError(err);
        updateItem(item.id, {
          status: "error",
          errorCode: code,
          errorMessage: message,
        });
      }
    },
    [updateItem],
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
      const seeded = selected.map((it) => ({ ...it, status: "queued" }));
      setItems(seeded);
      void runBatch(seeded);
    },
    [runBatch],
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

  const handleReset = useCallback(() => {
    setItems((cur) => {
      cur.forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
      return [];
    });
  }, []);

  const isIdle = items.length === 0;
  const total = items.length;
  const successCount = items.filter((it) => it.status === "success").length;
  const errorCount = items.filter((it) => it.status === "error").length;
  const busyCount = items.filter(
    (it) => it.status === "loading" || it.status === "queued",
  ).length;
  const isAnalyzing = busyCount > 0;

  return (
    <div className="min-h-screen relative text-gray-900">
      {/* Decorative background car (full-bleed, not zoomed) */}
      <div
        className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
        aria-hidden
      >
        <img
          src={BG_CAR_IMAGE}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center blur-[2px] brightness-[0.85] saturate-[0.55]"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/55 via-black/40 to-black/65" />
        <div className="absolute inset-0 bg-black/15 backdrop-blur-[1px]" />
      </div>

      {/* Header — Wowcar (partner) left, product title right; inline actions */}
      <header className="sticky top-0 z-20 border-b border-white/[0.08] bg-black/45 shadow-sm shadow-black/20 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[4rem] max-w-6xl items-center gap-3 px-4 py-3 sm:gap-5 sm:px-6 sm:py-3.5">
          {!isIdle && (
            <button
              type="button"
              onClick={handleReset}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-gray-200 transition hover:bg-white/10 hover:text-white sm:px-3"
            >
              <RefreshCw className="h-4 w-4 shrink-0 text-brand-orange" />
              New Scan
            </button>
          )}
          <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
            <div className="min-w-0 shrink">
              <BrandMark />
            </div>
            <h1 className="shrink-0 text-right text-base font-bold leading-tight tracking-tight text-white sm:text-lg md:text-xl">
              AutoVision <span className="text-brand-orange">AI</span>
            </h1>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative max-w-6xl mx-auto px-4 py-10 md:py-14 space-y-8">
        {isIdle && (
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-12 lg:items-center min-h-[calc(100vh-12rem)]">
            <div className="space-y-4 text-center lg:text-left">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white leading-[1.1] tracking-tight">
                Identify any car{" "}
                <span className="text-brand-orange">instantly</span>
              </h2>
              <p className="text-base sm:text-lg text-gray-300 max-w-xl mx-auto lg:mx-0">
                Upload up to 5 photos — our AI reads each vehicle and builds a
                full listing with specs, fuel type, and an estimated price.
              </p>
            </div>
            <div className="flex justify-center lg:justify-end">
              <ImageUpload
                variant="hero"
                onAnalyze={handleAnalyze}
                isLoading={false}
              />
            </div>
          </div>
        )}

        {!isIdle && (
          <div className="space-y-6">
            <SummaryBar
              total={total}
              successCount={successCount}
              errorCount={errorCount}
              busyCount={busyCount}
              isAnalyzing={isAnalyzing}
            />
            <div className="grid gap-6 lg:grid-cols-2">
              {items.map((it, idx) => (
                <ResultCard
                  key={it.id}
                  index={idx + 1}
                  item={it}
                  onRetry={() => handleRetry(it.id)}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryBar({ total, successCount, errorCount, busyCount, isAnalyzing }) {
  const completed = total - busyCount;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/45 px-4 py-3 backdrop-blur-md sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-200">
        <span className="font-semibold text-white">
          {isAnalyzing
            ? `Analyzing ${completed + 1 > total ? total : completed + 1} of ${total}…`
            : `Analyzed ${total} photo${total === 1 ? "" : "s"}`}
        </span>
        {successCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-emerald-300">
            <CheckCircle2 className="h-4 w-4" /> {successCount} succeeded
          </span>
        )}
        {errorCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-amber-300">
            <AlertTriangle className="h-4 w-4" /> {errorCount} failed
          </span>
        )}
        {busyCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-gray-300">
            <Loader2 className="h-4 w-4 animate-spin" /> {busyCount} in progress
          </span>
        )}
      </div>
    </div>
  );
}

function ResultCard({ item, index, onRetry }) {
  if (item.status === "loading" || item.status === "queued") {
    return (
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/45 shadow-lg backdrop-blur-md">
        <div className="relative h-48 bg-gray-900 sm:h-56">
          {item.previewUrl && (
            <img
              src={item.previewUrl}
              alt={item.fileName}
              className="h-full w-full object-cover opacity-60 blur-[1px]"
            />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 text-white">
            <Loader2 className="h-7 w-7 animate-spin text-brand-orange" />
            <span className="text-sm font-medium">
              {item.status === "queued" ? "Queued…" : "Analyzing…"}
            </span>
          </div>
          <span className="absolute left-2 top-2 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-black/70 px-1.5 text-xs font-semibold text-white">
            #{index}
          </span>
        </div>
        <div className="truncate px-4 py-3 text-xs text-gray-300">
          {item.fileName}
        </div>
      </div>
    );
  }

  if (item.status === "error") {
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
          <span className="absolute left-2 top-2 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-black/70 px-1.5 text-xs font-semibold text-white">
            #{index}
          </span>
        </div>
        <ErrorCard
          errorCode={item.errorCode}
          errorMessage={item.errorMessage}
        />
        <div className="flex justify-center">
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-orange px-4 py-2 text-sm font-medium text-white shadow-sm shadow-brand-orange/20 transition hover:bg-brand-orange-hover"
          >
            <RefreshCw className="h-4 w-4" />
            Retry this photo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <span className="absolute left-3 top-3 z-10 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-brand-orange px-2 text-xs font-bold text-white shadow">
        #{index}
      </span>
      <CarListing data={item.result} previewUrl={item.previewUrl} />
    </div>
  );
}
