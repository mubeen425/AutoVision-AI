import React from "react";
import {
  FaSpinner,
  FaCircleCheck,
  FaTriangleExclamation,
  FaXmark,
  FaArrowUpRightFromSquare,
  FaEye,
  FaEyeSlash,
} from "react-icons/fa6";
import {
  loginToWowCar,
  fetchDataset,
  publishListing,
  validateToken,
} from "../services/wowcarService";
import { useLanguage } from "../context/LanguageContext";

const WOWCAR_TOKEN_STORAGE_KEY = "wowcar_api_token";

// ─── Available image tag labels (matched against dataset at publish time) ─────
const IMAGE_TAG_OPTIONS = [
  "Low Mileage",
  "Excellent Condition",
  "Great Value",
  "Like New",
  "One Owner",
  "Finance Available",
  "Special Offer",
  "Fuel-Efficient",
  "Well Maintained",
  "Trade-In Welcome",
  "Popular Model",
  "Reliable",
  "Warranty Included",
  "0% Down Payment",
];

// ─── Build the photos array to send, preferring enhanced images ───────────────
function buildPhotosToPublish(photos, enhancedUrls) {
  if (!Array.isArray(photos) || photos.length === 0) return [];
  return photos.map((photo, i) => {
    const enhancedDataUrl =
      Array.isArray(enhancedUrls) && enhancedUrls[i] ? enhancedUrls[i] : null;
    if (enhancedDataUrl) {
      // Enhanced is a data URL: extract base64 and mimeType
      const match = enhancedDataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return { ...photo, base64: match[2], mimeType: match[1] };
      }
    }
    return photo;
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Overlay({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      aria-hidden="true"
    />
  );
}

function Modal({ children, onClose }) {
  return (
    <>
      <Overlay onClose={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8"
      >
        <div
          className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/50 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200 max-h-[94dvh] sm:max-w-lg"
        >
          {children}
        </div>
      </div>
    </>
  );
}

function ModalHeader({ title, subtitle, onClose }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 bg-black/80 px-6 py-4 backdrop-blur-xl sm:px-8 sm:py-5">
      <div>
        <span className="text-sm font-semibold text-white">{title}</span>
        {subtitle && (
          <p className="mt-0.5 text-[11px] leading-tight text-gray-400">{subtitle}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"
        aria-label="Close"
      >
        <FaXmark className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PublishToWowCar({
  open,
  onClose,
  form,
  advert = null,
  safetyFeatures = [],
  comfortFeatures = [],
  confirmedFeatures = {},
  photos = [],
  enhancedUrls = null,
}) {
  const { t } = useLanguage();

  // ── login form ──
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPwd, setShowPwd] = React.useState(false);
  const [savedToken, setSavedToken] = React.useState("");
  const [isValidatingToken, setIsValidatingToken] = React.useState(false);

  const [status, setStatus] = React.useState(() => form.status || "draft");

  // ── pipeline state ──
  // "idle" | "running" | "done" | "error"
  const [stage, setStage] = React.useState("idle");
  const [errorMsg, setErrorMsg] = React.useState("");
  const [warnings, setWarnings] = React.useState([]);
  const [listingUrl, setListingUrl] = React.useState(null);
  const autoPublishTriggeredRef = React.useRef(false);

  // ── helpers ──
  const resetModal = () => {
    setStage("idle");
    setErrorMsg("");
    setWarnings([]);
    setListingUrl(null);
    setUsername("");
    setPassword("");
    setShowPwd(false);
    setStatus(form.status || "draft");
  };

  const clearSavedToken = React.useCallback(() => {
    setSavedToken("");
    try {
      window.sessionStorage.removeItem(WOWCAR_TOKEN_STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const loadSavedToken = React.useCallback(() => {
    try {
      const token = window.sessionStorage.getItem(WOWCAR_TOKEN_STORAGE_KEY) || "";
      setSavedToken(token);
      return token;
    } catch {
      return "";
    }
  }, []);

  const handleClose = () => {
    onClose();
    if (stage !== "done") resetModal();
  };

  React.useEffect(() => {
    if (open) {
      resetModal();
      autoPublishTriggeredRef.current = false;
      setIsValidatingToken(false);
      
      const token = loadSavedToken();
      if (token) {
        setIsValidatingToken(true);
        validateToken(token)
          .then((isValid) => {
            setIsValidatingToken(false);
            if (isValid) {
              if (!autoPublishTriggeredRef.current) {
                autoPublishTriggeredRef.current = true;
                void handlePublish(null, token);
              }
            } else {
              clearSavedToken();
            }
          })
          .catch(() => {
            setIsValidatingToken(false);
            clearSavedToken();
          });
      }
    }
  }, [open, loadSavedToken, clearSavedToken]);

  // ── build confirmed feature label lists ──
  const safetyLabels = React.useMemo(
    () =>
      safetyFeatures
        .filter(
          (f) =>
            f?.feature &&
            confirmedFeatures[`safety:${f.feature_en || f.feature}`] !== false
        )
        .map((f) => f.feature_en || f.feature),
    [safetyFeatures, confirmedFeatures]
  );

  const comfortLabels = React.useMemo(
    () =>
      comfortFeatures
        .filter(
          (f) =>
            f?.feature &&
            confirmedFeatures[`comfort:${f.feature_en || f.feature}`] !== false
        )
        .map((f) => f.feature_en || f.feature),
    [comfortFeatures, confirmedFeatures]
  );

  // ── pre-publish required field validation ──
  const missingRequired = React.useMemo(() => {
    const missing = [];
    if (!String(form?.title || "").trim()) missing.push("Title");
    if (!String(form?.make || "").trim()) missing.push("Make");
    if (!String(form?.model || "").trim()) missing.push("Model");
    if (!String(form?.year || "").trim()) missing.push("Year");
    if (!String(form?.asking_price_thb || "").replace(/[^0-9.]/g, "")) missing.push("Asking Price (THB)");
    if (!String(form?.mileage_km || "").replace(/[^0-9.]/g, "")) missing.push("Mileage (km)");
    return missing;
  }, [form]);

  // ── publish pipeline ──
  const handlePublish = async (e, tokenOverride = null) => {
    if (e?.preventDefault) e.preventDefault();

    // Build final photos array — prefer enhanced images over originals
    const photosToPublish = buildPhotosToPublish(photos, enhancedUrls);

    setErrorMsg("");
    setWarnings([]);

    try {
      let token = tokenOverride || savedToken || loadSavedToken();
      let justLoggedIn = false;

      if (!token) {
        if (!username.trim() || !password.trim()) return;
        setStage("authenticating");
        token = await loginToWowCar(username.trim(), password.trim());
        justLoggedIn = true;
        setSavedToken(token);
        try {
          window.sessionStorage.setItem(WOWCAR_TOKEN_STORAGE_KEY, token);
        } catch {
          // Ignore storage failures.
        }
      } else {
        setStage("running");
      }

      if (justLoggedIn) {
        setStage("login_success");
        await new Promise((r) => setTimeout(r, 3500)); // 3.5 seconds
        setStage("running");
      }

      const dataset = await fetchDataset(token);
      await new Promise((r) => setTimeout(r, 150));

      const result = await publishListing(
        token,
        form,
        safetyLabels,
        comfortLabels,
        photosToPublish,
        dataset,
        {
          status,
          address: form.address?.trim() || undefined,
          lat: form.lat?.trim() || undefined,
          lng: form.lng?.trim() || undefined,
          line_id: form.line_id?.trim() || undefined,
          reasons_to_buy: form.reasons_to_buy?.trim() || undefined,
          video: form.video_url?.trim() ? { url: form.video_url.trim(), embed: "" } : undefined,
          advert: advert || undefined,
        }
      );

      setWarnings(result.warnings || []);
      setListingUrl(result.listing_url || null);
      setStage("done");
    } catch (err) {
      const message = err?.message || "An unexpected error occurred.";
      if (/token|unauthori|forbidden|login failed/i.test(message)) {
        clearSavedToken();
      }
      setErrorMsg(message);
      setStage("error");
    }
  };

  if (!open) return null;

  // Determine how many photos are enhanced
  const enhancedCount = Array.isArray(enhancedUrls)
    ? enhancedUrls.filter(Boolean).length
    : 0;

  const subtitleText =
    isValidatingToken
      ? "Verifying account connection…"
      : stage === "done"
        ? "Listing published successfully"
        : stage === "running"
          ? "Publishing in progress…"
          : stage === "authenticating"
            ? "Connecting to Car Butler…"
            : stage === "login_success"
              ? "Authentication successful"
              : t("listing.enterCredentials");

  return (
    <>
      {/* ─── Modal ──────────────────────────────────────────────────────── */}
      {open && (
        <Modal onClose={handleClose}>
          <ModalHeader
            title={t("listing.publishToCarButler")}
            subtitle={subtitleText}
            onClose={handleClose}
          />

          {/* ── State: validating token ── */}
          {isValidatingToken && (
            <div className="flex flex-col items-center justify-center bg-black/50 px-6 py-14 sm:px-8 sm:py-16">
              <FaSpinner className="h-8 w-8 animate-spin text-brand-orange mb-4" />
              <p className="text-sm font-semibold text-white">Verifying account connection...</p>
              <p className="text-xs text-white/50 mt-2">Checking saved credentials</p>
            </div>
          )}

          {/* ── State: idle — Login Form ── */}
          {stage === "idle" && !isValidatingToken && (
            <form onSubmit={handlePublish} className="flex min-h-0 flex-col overflow-y-auto bg-black/50">

              {/* ── Missing required fields warning ── */}
              {missingRequired.length > 0 && (
                <div className="mx-5 mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <FaTriangleExclamation className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <div>
                      <p className="text-xs font-semibold text-amber-300">Required fields missing</p>
                      <p className="mt-0.5 text-[11px] text-amber-400/80 leading-relaxed">
                        Please fill these in the listing form first:
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {missingRequired.map((f) => (
                          <li key={f} className="text-[11px] font-medium text-amber-300">• {f}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4 p-5 sm:p-6">
                {!savedToken && (
                  <>
                {/* Username */}
                <div className="space-y-1">
                  <label
                    htmlFor="wc-username"
                    className="text-xs font-semibold uppercase tracking-wide text-gray-400"
                  >
                    {t("login.username")}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-gray-500">
                        <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
                      </svg>
                    </span>
                    <input
                      id="wc-username"
                      type="text"
                      autoFocus
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={t("login.usernamePlaceholder")}
                      required
                      className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder-gray-500 outline-none ring-0 transition focus:border-brand-orange/60 focus:bg-white/8 focus:ring-1 focus:ring-brand-orange/40"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <label
                    htmlFor="wc-password"
                    className="text-xs font-semibold uppercase tracking-wide text-gray-400"
                  >
                    {t("login.password")}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-gray-500">
                        <path fillRule="evenodd" d="M15.75 1.5a6.75 6.75 0 0 0-6.651 7.906c.067.39-.032.717-.221.906l-6.5 6.499a3 3 0 0 0-.878 2.121v2.818c0 .414.336.75.75.75H6a.75.75 0 0 0 .75-.75v-1.5h1.5A.75.75 0 0 0 9 19.5V18h1.5a.75.75 0 0 0 .53-.22l2.658-2.658c.19-.189.517-.288.906-.22A6.75 6.75 0 1 0 15.75 1.5Zm0 3a.75.75 0 0 0 0 1.5A2.25 2.25 0 0 1 18 8.25a.75.75 0 0 0 1.5 0 3.75 3.75 0 0 0-3.75-3.75Z" clipRule="evenodd" />
                      </svg>
                    </span>
                    <input
                      id="wc-password"
                      type={showPwd ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t("login.passwordPlaceholder")}
                      required
                      className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-10 text-sm text-white placeholder-gray-500 outline-none ring-0 transition focus:border-brand-orange/60 focus:bg-white/8 focus:ring-1 focus:ring-brand-orange/40"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute inset-y-0 right-3 flex items-center text-gray-500 transition hover:text-gray-300"
                      aria-label={showPwd ? t("login.hidePassword") : t("login.showPassword")}
                    >
                      {showPwd ? (
                        <FaEyeSlash className="h-3.5 w-3.5" />
                      ) : (
                        <FaEye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                  </>
                )}

                <button
                  type="submit"
                  disabled={(!savedToken && (!username.trim() || !password.trim())) || missingRequired.length > 0}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-orange py-3 text-sm font-bold text-white shadow-lg shadow-brand-orange/25 transition hover:bg-brand-orange-hover active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-orange/50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savedToken ? t("listing.publishToCarButler") : t("listing.connectAccount")}
                </button>

                {missingRequired.length > 0 && (
                  <p className="text-center text-[11px] text-amber-400/70">
                    {t("listing.publishRequiredIntro")}
                  </p>
                )}
              </div>
            </form>
          )}

          {/* ── State: authenticating ── */}
          {stage === "authenticating" && (
            <div className="flex flex-col items-center justify-center bg-black/50 px-6 py-14 sm:px-8 sm:py-16">
              <FaSpinner className="h-8 w-8 animate-spin text-brand-orange mb-4" />
              <p className="text-sm font-semibold text-white">Connecting account...</p>
              <p className="text-xs text-white/50 mt-2">Authenticating credentials with Car Butler</p>
            </div>
          )}

          {/* ── State: login_success ── */}
          {stage === "login_success" && (
            <div className="flex flex-col items-center justify-center bg-black/50 px-6 py-14 sm:px-8 sm:py-16 text-center space-y-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 animate-bounce">
                <FaCircleCheck className="h-7 w-7 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{t("login.loginSuccess")}</p>
                <p className="text-xs text-white/50 mt-2">Starting publication process...</p>
              </div>
            </div>
          )}

          {/* ── State: running — Progress Spinner ── */}
          {stage === "running" && (
            <div className="flex flex-col items-center justify-center bg-black/50 px-6 py-14 sm:px-8 sm:py-16">
              <FaSpinner className="h-8 w-8 animate-spin text-brand-orange mb-4" />
              <p className="text-sm font-semibold text-white">Publishing in progress...</p>
              <p className="text-xs text-white/50 mt-2">Please wait — do not close this window</p>
            </div>
          )}

          {/* ── State: error ── */}
          {stage === "error" && (
            <div className="space-y-4 bg-black/50 p-6 sm:p-8">
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                <div className="flex items-start gap-2.5">
                  <FaTriangleExclamation className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <div>
                    <p className="text-sm font-semibold text-red-300">
                      {t("errors.default.title")}
                    </p>
                    <p className="mt-0.5 text-xs text-red-400/90 leading-relaxed">{errorMsg}</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={resetModal}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  {t("app.returnHome")}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
                >
                  {t("app.returnHome")}
                </button>
              </div>
            </div>
          )}

          {/* ── State: done — Success ── */}
          {stage === "done" && (
            <div className="space-y-5 bg-black/50 p-6 text-center sm:p-8">
              <div className="flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-orange/20 animate-bounce">
                  <FaCircleCheck className="h-7 w-7 text-brand-orange" />
                </div>
              </div>
              
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">
                  Published Successfully!
                </h3>
                <p className="text-sm text-white/60">
                  {[form.year, form.make, form.model].filter(Boolean).join(" ")} is now live
                </p>
              </div>

              {listingUrl && (
                <a
                  href={listingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-orange/90"
                >
                  <FaArrowUpRightFromSquare className="h-3.5 w-3.5" />
                  {t("listing.previewAdvert")}
                </a>
              )}

              <button
                type="button"
                onClick={handleClose}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                {t("app.returnHome")}
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
