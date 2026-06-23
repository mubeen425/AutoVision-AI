import React, { useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import Webcam from "react-webcam";
import {
  FaArrowUpFromBracket,
  FaXmark,
  FaPlus,
  FaWandSparkles,
  FaCamera,
  FaCheck,
} from "react-icons/fa6";
import { useAppConfig } from "../context/AppConfigContext";
import { useLanguage } from "../context/LanguageContext";

const FALLBACK_ACCEPT = "image/jpeg,image/png,image/webp";
const FALLBACK_ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const FALLBACK_MAX_FILES = 20;

// Rear camera at 4:3 — matches typical mobile still-photo framing. `exact`
// forces the back camera on phones; if that fails we relax facingMode, then
// drop aspectRatio on devices that cannot negotiate 4:3 (e.g. some webcams).
// Screenshots use the stream's native resolution (forceScreenshotSourceSize).
const CAMERA_ASPECT_RATIO = 4 / 3;
const videoConstraintsRear = {
  facingMode: { exact: "environment" },
  aspectRatio: { ideal: CAMERA_ASPECT_RATIO },
  width: { ideal: 1920 },
  height: { ideal: 1440 },
};
const videoConstraintsFallback = {
  facingMode: "environment",
  aspectRatio: { ideal: CAMERA_ASPECT_RATIO },
  width: { ideal: 1920 },
  height: { ideal: 1440 },
};
const videoConstraintsRelaxed = {
  facingMode: "environment",
  width: { ideal: 1920 },
  height: { ideal: 1080 },
};

/** Split a data URL ("data:<mime>;base64,<data>") into parts. */
function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseDataUrl(reader.result);
      if (!parsed) {
        reject(new Error("read_failed"));
        return;
      }
      resolve(parsed);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const DEFAULT_CAMERA_ZOOM = {
  min: 1,
  max: 4,
  step: 0.1,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function captureZoomedVideoFrame(video, zoom) {
  if (!video?.videoWidth || !video?.videoHeight) return null;

  const canvas = document.createElement("canvas");
  const width = video.videoWidth;
  const height = video.videoHeight;
  canvas.width = width;
  canvas.height = height;

  const sourceWidth = width / zoom;
  const sourceHeight = height / zoom;
  const sourceX = (width - sourceWidth) / 2;
  const sourceY = (height - sourceHeight) / 2;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(
    video,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height,
  );

  return canvas.toDataURL("image/jpeg", 0.95);
}

const styles = {
  default: {
    btn: "border-2 border-dashed border-gray-200 bg-white rounded-2xl p-10 text-center hover:border-brand-orange hover:bg-brand-orange-light transition cursor-pointer disabled:opacity-50 shadow-sm",
    iconWrap: "bg-brand-orange-light group-hover:bg-brand-orange/10",
    title: "font-medium text-gray-700",
    hint: "text-xs text-gray-400 mt-1",
  },
  hero: {
    btn: "border border-white/20 bg-gray-950/65 backdrop-blur-md rounded-2xl p-5 sm:p-10 text-center hover:border-brand-orange/60 hover:bg-gray-900/75 transition cursor-pointer disabled:opacity-50 shadow-xl shadow-black/30",
    iconWrap: "bg-brand-orange/20 group-hover:bg-brand-orange/30",
    title: "font-medium text-white",
    hint: "text-xs text-gray-400 mt-1",
  },
};

let _counter = 0;
const nextId = () => `img-${Date.now()}-${++_counter}`;

export default function ImageUpload({ onAnalyze, isLoading, variant = "default" }) {
  const { config } = useAppConfig();
  const { t } = useLanguage();
  const MAX_FILES = config.upload.maxFiles ?? FALLBACK_MAX_FILES;
  const ALLOWED = config.upload.acceptMime?.length
    ? config.upload.acceptMime
    : FALLBACK_ALLOWED;
  const ACCEPT = ALLOWED.join(",");

  const inputRef = useRef(null);
  const webcamRef = useRef(null);
  const [items, setItems] = useState([]);
  const [warn, setWarn] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState("");
  // Per-session capture feedback for the full-screen camera.
  const [shotCount, setShotCount] = useState(0);
  const [lastShot, setLastShot] = useState(null);
  const [flash, setFlash] = useState(false);
  // Start by forcing the rear camera; drop to non-exact on failure.
  const [camConstraints, setCamConstraints] = useState(videoConstraintsRear);
  const camFallbackStepRef = useRef(0);
  const itemsRef = useRef(items);
  const cameraZoomRef = useRef({
    value: 1,
    supportsNative: false,
  });
  itemsRef.current = items;

  // Do not revoke blob URLs on unmount: after "Analyze", this component unmounts
  // while App.jsx still uses the same previewUrl on result cards. Revoking here
  // would break those <img> sources. Revoke only in remove/clearAll; App
  // revokes on "New Scan" (handleReset).

  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setWarn("");

    const current = itemsRef.current;
    const slotsLeft = MAX_FILES - current.length;
    if (slotsLeft <= 0) {
      setWarn(t("upload.maxFiles", { max: MAX_FILES }));
      return;
    }

    let skipped = 0;
    const valid = [];
    for (const f of files) {
      if (!ALLOWED.includes(f.type)) {
        skipped++;
        continue;
      }
      valid.push(f);
    }

    const toAdd = valid.slice(0, slotsLeft);
    const overflow = valid.length - toAdd.length;

    const prepared = await Promise.all(
      toAdd.map(async (file) => {
        const { base64, mimeType } = await readFileAsBase64(file);
        const previewUrl = URL.createObjectURL(file);
        return {
          id: nextId(),
          fileName: file.name,
          previewUrl,
          base64,
          mimeType,
        };
      }),
    );

    setItems((prev) => [...prev, ...prepared]);

    const messages = [];
    if (skipped > 0)
      messages.push(
        t(skipped > 1 ? "upload.unsupportedSkipped_plural" : "upload.unsupportedSkipped", {
          count: skipped,
        }),
      );
    if (overflow > 0)
      messages.push(
        t("upload.onlyAdded", { added: toAdd.length, max: MAX_FILES }),
      );
    if (messages.length) setWarn(messages.join(" · "));
  }, [MAX_FILES, ALLOWED, t]);

  const onChange = (e) => {
    void addFiles(e.target.files);
    e.target.value = "";
  };

  const onDrop = (e) => {
    e.preventDefault();
    void addFiles(e.dataTransfer.files);
  };

  // Object URLs need revoking; data: URLs (camera captures) do not.
  const revokePreview = (url) => {
    if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
  };

  const remove = (id) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      revokePreview(target?.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
  };

  const clearAll = () => {
    itemsRef.current.forEach((it) => revokePreview(it.previewUrl));
    setItems([]);
    setWarn("");
  };

  const openCamera = () => {
    setWarn("");
    setCamError("");
    setCamReady(false);
    setShotCount(0);
    setLastShot(null);
    setFlash(false);
    cameraZoomRef.current = {
      value: 1,
      supportsNative: false,
    };
    camFallbackStepRef.current = 0;
    setCamConstraints(videoConstraintsRear);
    setShowCamera(true);
  };

  const closeCamera = () => {
    setShowCamera(false);
    setCamReady(false);
    setCamError("");
  };

  const onCameraError = useCallback((err) => {
    // Step 1: exact rear + 4:3 → non-exact rear + 4:3 (laptops without environment).
    // Step 2: drop aspectRatio for webcams that only offer 16:9.
    if (camFallbackStepRef.current === 0) {
      camFallbackStepRef.current = 1;
      setCamConstraints(videoConstraintsFallback);
      return;
    }
    if (camFallbackStepRef.current === 1) {
      camFallbackStepRef.current = 2;
      setCamConstraints(videoConstraintsRelaxed);
      return;
    }
    const name = err?.name || "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      setCamError(t("upload.cameraDenied"));
    } else if (name === "NotFoundError" || name === "OverconstrainedError") {
      setCamError(t("upload.cameraNotFound"));
    } else {
      setCamError(t("upload.cameraFailed"));
    }
  }, [t]);

  const capturePhoto = useCallback(() => {
    const cam = webcamRef.current;
    if (!cam) return;

    const current = itemsRef.current;
    if (current.length >= MAX_FILES) {
      setWarn(t("upload.maxFiles", { max: MAX_FILES }));
      return;
    }

    // Capture at the stream's native 4:3 resolution (forceScreenshotSourceSize).
    const zoomInfo = cameraZoomRef.current;
    const dataUrl =
      !zoomInfo.supportsNative && zoomInfo.value > 1.01
        ? captureZoomedVideoFrame(cam.video, zoomInfo.value)
        : cam.getScreenshot();
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) {
      setCamError(t("upload.captureFailed"));
      return;
    }

    const item = {
      id: nextId(),
      fileName: `camera-${Date.now()}.jpg`,
      // data: URL doubles as the preview; no object URL to revoke.
      previewUrl: dataUrl,
      base64: parsed.base64,
      mimeType: parsed.mimeType,
    };
    setItems((prev) => [...prev, item]);
    setLastShot(dataUrl);
    setShotCount((c) => c + 1);
    // Brief shutter flash, like a native camera app.
    setFlash(true);
    window.setTimeout(() => setFlash(false), 180);
  }, [MAX_FILES, t]);

  const handleAnalyze = () => {
    if (!items.length || isLoading) return;
    onAnalyze(items.map((it) => ({ ...it })));
  };

  useEffect(() => {
    if (!showCamera) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showCamera]);

  const s = styles[variant] ?? styles.default;
  const reachedMax = items.length >= MAX_FILES;
  const hero = variant === "hero";

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={onChange}
        disabled={isLoading}
      />

      {showCamera &&
        createPortal(
          <CameraView
            webcamRef={webcamRef}
            constraints={camConstraints}
            ready={camReady}
            error={camError}
            shotCount={shotCount}
            lastShot={lastShot}
            flash={flash}
            zoomRef={cameraZoomRef}
            maxFiles={MAX_FILES}
            totalCount={items.length}
            onReady={() => setCamReady(true)}
            onError={onCameraError}
            onCapture={capturePhoto}
            onClose={closeCamera}
            t={t}
            onUploadInstead={() => {
              closeCamera();
              inputRef.current?.click();
            }}
          />,
          document.body,
        )}

      {items.length === 0 ? (
        <div className="flex w-full max-w-md flex-col gap-3">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className={`group w-full ${s.btn}`}
          >
            <div className="flex flex-col items-center gap-2 sm:gap-3">
              <div
                className={`flex h-10 w-10 sm:h-14 sm:w-14 items-center justify-center rounded-full transition ${s.iconWrap}`}
              >
                <FaArrowUpFromBracket className="h-5 w-5 sm:h-6 sm:w-6 text-brand-orange" />
              </div>
              <div>
                <p className={s.title}>{t("upload.dropOrClick")}</p>
                <p className={s.hint}>
                  {t("upload.formats", { max: MAX_FILES })}
                </p>
              </div>
            </div>
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={openCamera}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-orange px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-brand-orange/20 transition hover:bg-brand-orange-hover disabled:opacity-60"
          >
            <FaCamera className="h-4 w-4" />
            {t("upload.takePhoto")}
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className={`w-full max-w-xl space-y-4 rounded-2xl p-4 sm:p-5 ${hero
            ? "border border-white/20 bg-gray-950/65 shadow-xl shadow-black/30 backdrop-blur-md"
            : "border border-gray-200 bg-white shadow-sm"
            }`}
        >
          <div className="flex items-center justify-between text-sm">
            <span
              className={
                hero ? "font-medium text-white" : "font-medium text-gray-700"
              }
            >
              {t(items.length === 1 ? "upload.photoCount" : "upload.photoCount_plural", {
                count: items.length,
                max: MAX_FILES,
              })}
            </span>
            <button
              type="button"
              onClick={clearAll}
              className={`text-xs underline-offset-2 hover:underline ${hero
                ? "text-gray-300 hover:text-white"
                : "text-gray-500 hover:text-gray-700"
                }`}
            >
              {t("upload.clearAll")}
            </button>
          </div>

          <p className={`text-[11px] ${hero ? "text-gray-400" : "text-gray-500"}`}>
            {t("upload.sameCarHint")}
          </p>

          <div className="max-h-60 overflow-y-auto pr-1 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {items.map((it, i) => (
              <div
                key={it.id}
                className={`group relative aspect-square overflow-hidden rounded-lg border ${hero ? "border-white/10" : "border-gray-200"
                  }`}
              >
                <img
                  src={it.previewUrl}
                  alt={it.fileName}
                  className="h-full w-full object-cover"
                />
                <span className="absolute left-1 top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-black/70 px-1 text-[10px] font-semibold text-white">
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => remove(it.id)}
                  aria-label={t("upload.removePhoto", { fileName: it.fileName })}
                  className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition hover:bg-brand-orange-hover group-hover:opacity-100"
                >
                  <FaXmark className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {!reachedMax && (
              <>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className={`flex aspect-square items-center justify-center rounded-lg border-2 border-dashed text-xs transition ${hero
                    ? "border-white/20 text-gray-300 hover:border-brand-orange/60 hover:bg-white/5 hover:text-white"
                    : "border-gray-300 text-gray-500 hover:border-brand-orange hover:bg-brand-orange-light hover:text-gray-700"
                    }`}
                >
                  <span className="flex flex-col items-center gap-1">
                    <FaPlus className="h-5 w-5" />
                    <span>{t("upload.addMore")}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={openCamera}
                  className={`flex aspect-square items-center justify-center rounded-lg border-2 border-dashed text-xs transition ${hero
                    ? "border-white/20 text-gray-300 hover:border-brand-orange/60 hover:bg-white/5 hover:text-white"
                    : "border-gray-300 text-gray-500 hover:border-brand-orange hover:bg-brand-orange-light hover:text-gray-700"
                    }`}
                >
                  <span className="flex flex-col items-center gap-1">
                    <FaCamera className="h-5 w-5" />
                    <span>{t("upload.camera")}</span>
                  </span>
                </button>
              </>
            )}
          </div>

          {warn && (
            <p
              className={`text-xs ${hero ? "text-amber-300" : "text-amber-700"}`}
            >
              {warn}
            </p>
          )}

          <button
            type="button"
            disabled={isLoading}
            onClick={handleAnalyze}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-orange/20 transition hover:bg-brand-orange-hover disabled:opacity-60"
          >
            <FaWandSparkles className="h-4 w-4" />
            {t(items.length === 1 ? "upload.analyze" : "upload.analyze_plural", {
              count: items.length,
            })}
          </button>
        </div>
      )}
    </div>
  );
}

function CameraView({
  webcamRef,
  constraints,
  ready,
  error,
  shotCount,
  lastShot,
  flash,
  zoomRef,
  maxFiles,
  totalCount,
  onReady,
  onError,
  onCapture,
  onClose,
  onUploadInstead,
  t,
}) {
  const reachedMax = totalCount >= maxFiles;
  const canCapture = ready && !error && !reachedMax;
  const overlayRef = useRef(null);
  const videoSurfaceRef = useRef(null);
  const videoTrackRef = useRef(null);
  const nativeZoomSupportedRef = useRef(false);
  const zoomBoundsRef = useRef(DEFAULT_CAMERA_ZOOM);
  const activePinchRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [zoomBounds, setZoomBounds] = useState(DEFAULT_CAMERA_ZOOM);
  const [supportsNativeZoom, setSupportsNativeZoom] = useState(false);

  const applyZoom = useCallback((nextZoom) => {
    const bounds = zoomBoundsRef.current;
    const stepped =
      Math.round(nextZoom / bounds.step) * bounds.step;
    const adjusted = clamp(stepped, bounds.min, bounds.max);

    setZoom(adjusted);
    zoomRef.current = {
      value: adjusted,
      supportsNative: nativeZoomSupportedRef.current,
    };

    if (nativeZoomSupportedRef.current && videoTrackRef.current) {
      void videoTrackRef.current.applyConstraints({
        advanced: [{ zoom: adjusted }],
      }).catch(() => {
        nativeZoomSupportedRef.current = false;
        setSupportsNativeZoom(false);
        zoomRef.current = {
          value: adjusted,
          supportsNative: false,
        };
      });
    }
  }, [zoomRef]);

  const handleUserMedia = useCallback((stream) => {
    const [track] = stream?.getVideoTracks?.() || [];
    videoTrackRef.current = track || null;

    const capabilities =
      typeof track?.getCapabilities === "function" ? track.getCapabilities() : {};
    const zoomCapability = capabilities?.zoom;
    const hasNativeZoom =
      Number.isFinite(zoomCapability?.min) &&
      Number.isFinite(zoomCapability?.max) &&
      zoomCapability.max > zoomCapability.min;

    const nextBounds = hasNativeZoom
      ? {
          min: zoomCapability.min,
          max: zoomCapability.max,
          step: zoomCapability.step || DEFAULT_CAMERA_ZOOM.step,
        }
      : DEFAULT_CAMERA_ZOOM;

    zoomBoundsRef.current = nextBounds;
    setZoomBounds(nextBounds);
    nativeZoomSupportedRef.current = hasNativeZoom;
    setSupportsNativeZoom(hasNativeZoom);

    const initialZoom = clamp(1, nextBounds.min, nextBounds.max);
    setZoom(initialZoom);
    zoomRef.current = {
      value: initialZoom,
      supportsNative: hasNativeZoom,
    };

    if (hasNativeZoom) {
      void track.applyConstraints({
        advanced: [{ zoom: initialZoom }],
      });
    }

    onReady();
  }, [onReady, zoomRef]);

  const getTouchDistance = (touches) => {
    const first = touches[0];
    const second = touches[1];
    return Math.hypot(
      first.clientX - second.clientX,
      first.clientY - second.clientY,
    );
  };

  // `position: fixed` is anchored to the layout viewport, which does NOT move
  // when the user pinch-zooms (mobile) or browser-zooms (laptop). Without this,
  // the camera control bars drift away from the visible area and visually
  // overlap the live preview. We resize/translate the overlay to match the
  // visual viewport so the UI stays correctly laid out at any zoom level.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = overlayRef.current;
    if (!vv || !el) return;

    const sync = () => {
      el.style.width = `${vv.width}px`;
      el.style.height = `${vv.height}px`;
      el.style.transform = `translate(${vv.offsetLeft}px, ${vv.offsetTop}px)`;
    };

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  // Block pinch / double-tap zoom gestures while the camera is open so the
  // capture surface and buttons can't be zoomed into an overlapping state.
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const prevent = (e) => e.preventDefault();
    el.addEventListener("gesturestart", prevent);
    el.addEventListener("gesturechange", prevent);
    return () => {
      el.removeEventListener("gesturestart", prevent);
      el.removeEventListener("gesturechange", prevent);
    };
  }, []);

  useEffect(() => {
    const el = videoSurfaceRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      activePinchRef.current = {
        distance: getTouchDistance(e.touches),
        zoom: zoomRef.current.value,
      };
    };

    const onTouchMove = (e) => {
      if (e.touches.length !== 2 || !activePinchRef.current) return;
      e.preventDefault();
      const start = activePinchRef.current;
      const distance = getTouchDistance(e.touches);
      if (!start.distance) return;
      applyZoom(start.zoom * (distance / start.distance));
    };

    const onTouchEnd = () => {
      activePinchRef.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [applyZoom, zoomRef]);

  return (
    <div
      ref={overlayRef}
      className="fixed left-0 top-0 z-[200] flex flex-col bg-black"
      style={{
        width: "100vw",
        height: "100dvh",
        transformOrigin: "0 0",
        touchAction: "none",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Live camera surface fills the whole screen */}
      <div ref={videoSurfaceRef} className="relative flex-1 overflow-hidden bg-black">
        {!error && (
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            screenshotQuality={0.95}
            forceScreenshotSourceSize
            videoConstraints={constraints}
            onUserMedia={handleUserMedia}
            onUserMediaError={onError}
            playsInline
            mirrored={false}
            className="absolute inset-0 h-full w-full object-contain"
            style={{
              transform: supportsNativeZoom ? undefined : `scale(${zoom})`,
              transformOrigin: "center center",
            }}
          />
        )}

        {/* Shutter flash */}
        <div
          className={`pointer-events-none absolute inset-0 bg-white transition-opacity duration-150 ${
            flash ? "opacity-80" : "opacity-0"
          }`}
        />

        {/* Top bar — compact so more room for the live preview */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/60 to-transparent px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("upload.closeCamera")}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70"
          >
            <FaXmark className="h-4 w-4" />
          </button>
          <span className="min-w-0 truncate rounded-full bg-black/50 px-2 py-0.5 text-center text-[10px] font-medium text-white backdrop-blur-sm">
            {reachedMax
              ? t("upload.maxReached", { max: maxFiles })
              : t("upload.fitCar")}
          </span>
          <span className="inline-flex h-8 min-w-[2rem] shrink-0 items-center justify-center rounded-full bg-black/50 px-1.5 text-xs font-semibold text-white backdrop-blur-sm">
            {totalCount}
          </span>
        </div>

        {!error && !ready && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-300">
            {t("upload.startingCamera")}
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="max-w-sm text-sm text-amber-300">{error}</p>
            <button
              type="button"
              onClick={onUploadInstead}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-orange/20 transition hover:bg-brand-orange-hover"
            >
              <FaArrowUpFromBracket className="h-4 w-4" />
              {t("upload.uploadInstead")}
            </button>
          </div>
        )}

        {!error && zoomBounds.max > zoomBounds.min && (
          <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
            {zoom.toFixed(1)}x
          </div>
        )}
      </div>

      {/* Bottom control bar — compact shutter row */}
      {!error && (
        <div className="relative shrink-0 bg-black px-4 pb-3 pt-2">
          <div className="mx-auto grid w-full max-w-md grid-cols-3 items-center gap-2">
            {/* Last-shot thumbnail */}
            <div className="flex min-w-0 justify-start">
              {lastShot ? (
                <div className="relative">
                  <img
                    src={lastShot}
                    alt={t("upload.lastCapture")}
                    className="h-10 w-10 rounded-md border border-white/30 object-cover"
                  />
                  {shotCount > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-orange px-0.5 text-[9px] font-bold text-white">
                      {shotCount}
                    </span>
                  )}
                </div>
              ) : (
                <div className="h-10 w-10" />
              )}
            </div>

            {/* Shutter */}
            <div className="flex min-w-0 justify-center">
              <button
                type="button"
                onClick={onCapture}
                disabled={!canCapture}
                aria-label={t("upload.capturePhoto")}
                className="group flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full border-[3px] border-white/80 transition active:scale-95 disabled:opacity-40"
              >
                <span className="h-10 w-10 rounded-full bg-white transition group-active:bg-gray-200" />
              </button>
            </div>

            {/* Done */}
            <div className="flex min-w-0 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                <FaCheck className="h-3.5 w-3.5 text-brand-orange" />
                {t("upload.done")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
