import React, { useRef, useState, useCallback } from "react";
import { Upload, X, Plus, Sparkles } from "lucide-react";

const ACCEPT = "image/jpeg,image/png,image/webp";
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILES = 5;

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        reject(new Error("read_failed"));
        return;
      }
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        reject(new Error("read_failed"));
        return;
      }
      resolve({ mimeType: match[1], base64: match[2] });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const styles = {
  default: {
    btn: "border-2 border-dashed border-gray-200 bg-white rounded-2xl p-10 text-center hover:border-brand-orange hover:bg-brand-orange-light transition cursor-pointer disabled:opacity-50 shadow-sm",
    iconWrap: "bg-brand-orange-light group-hover:bg-brand-orange/10",
    title: "font-medium text-gray-700",
    hint: "text-xs text-gray-400 mt-1",
  },
  hero: {
    btn: "border border-white/20 bg-gray-950/65 backdrop-blur-md rounded-2xl p-8 sm:p-10 text-center hover:border-brand-orange/60 hover:bg-gray-900/75 transition cursor-pointer disabled:opacity-50 shadow-xl shadow-black/30",
    iconWrap: "bg-brand-orange/20 group-hover:bg-brand-orange/30",
    title: "font-medium text-white",
    hint: "text-xs text-gray-400 mt-1",
  },
};

let _counter = 0;
const nextId = () => `img-${Date.now()}-${++_counter}`;

export default function ImageUpload({ onAnalyze, isLoading, variant = "default" }) {
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [warn, setWarn] = useState("");
  const itemsRef = useRef(items);
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
      setWarn(`Up to ${MAX_FILES} images allowed.`);
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
        `${skipped} unsupported file${skipped > 1 ? "s" : ""} skipped`,
      );
    if (overflow > 0)
      messages.push(`Only ${toAdd.length} added — max ${MAX_FILES} per scan`);
    if (messages.length) setWarn(messages.join(" · "));
  }, []);

  const onChange = (e) => {
    void addFiles(e.target.files);
    e.target.value = "";
  };

  const onDrop = (e) => {
    e.preventDefault();
    void addFiles(e.dataTransfer.files);
  };

  const remove = (id) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
  };

  const clearAll = () => {
    itemsRef.current.forEach(
      (it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl),
    );
    setItems([]);
    setWarn("");
  };

  const handleAnalyze = () => {
    if (!items.length || isLoading) return;
    onAnalyze(items.map((it) => ({ ...it })));
  };

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

      {items.length === 0 ? (
        <button
          type="button"
          disabled={isLoading}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className={`group w-full max-w-md ${s.btn}`}
        >
          <div className="flex flex-col items-center gap-3">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full transition ${s.iconWrap}`}
            >
              <Upload className="h-7 w-7 text-brand-orange" />
            </div>
            <div>
              <p className={s.title}>Drop photos here or click to upload</p>
              <p className={s.hint}>
                JPG, PNG, or WebP · up to {MAX_FILES} images
              </p>
            </div>
          </div>
        </button>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className={`w-full max-w-md space-y-4 rounded-2xl p-4 sm:p-5 ${
            hero
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
              {items.length} / {MAX_FILES} photo
              {items.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={clearAll}
              className={`text-xs underline-offset-2 hover:underline ${
                hero
                  ? "text-gray-300 hover:text-white"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Clear all
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {items.map((it, i) => (
              <div
                key={it.id}
                className={`group relative aspect-square overflow-hidden rounded-lg border ${
                  hero ? "border-white/10" : "border-gray-200"
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
                  aria-label={`Remove ${it.fileName}`}
                  className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition hover:bg-red-500 group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}

            {!reachedMax && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={`flex aspect-square items-center justify-center rounded-lg border-2 border-dashed text-xs transition ${
                  hero
                    ? "border-white/20 text-gray-300 hover:border-brand-orange/60 hover:bg-white/5 hover:text-white"
                    : "border-gray-300 text-gray-500 hover:border-brand-orange hover:bg-brand-orange-light hover:text-gray-700"
                }`}
              >
                <span className="flex flex-col items-center gap-1">
                  <Plus className="h-5 w-5" />
                  <span>Add more</span>
                </span>
              </button>
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
            <Sparkles className="h-4 w-4" />
            Analyze {items.length} photo{items.length === 1 ? "" : "s"}
          </button>
        </div>
      )}
    </div>
  );
}
