import React, { useState } from "react";
import { useAppConfig } from "../context/AppConfigContext";
import { usePwaInstall } from "../context/PwaInstallContext";
import { useLanguage } from "../context/LanguageContext";
import LanguageToggle from "./LanguageToggle";

// ─── API base URL (same logic used everywhere in the app) ─────────────────────
const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const API_BASE =
  RAW_BASE === "local" || RAW_BASE === ""
    ? ""          // Vite dev-proxy: relative paths hit localhost:8000
    : RAW_BASE.replace(/\/$/, "");
// ─────────────────────────────────────────────────────────────────────────────

export default function LoginPage({ onLoginSuccess }) {
  const { config } = useAppConfig();
  const { assets, app } = config;
  const bgCarImage = assets.banner;
  const logoSrc = assets.logo;
  const { canInstall, installed, install, isDeferredReady } = usePwaInstall();
  const { t } = useLanguage();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [showInstalledAlert, setShowInstalledAlert] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (data.success) {
        onLoginSuccess();
      } else {
        setError(t("login.invalidCredentials"));
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 600);
      }
    } catch {
      setError(t("login.serverError"));
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 600);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInstall = async () => {
    if (installed || !isDeferredReady) {
      setShowInstalledAlert(true);
      return;
    }
    setIsInstalling(true);
    try {
      await install();
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="h-[100dvh] w-[100dvw] flex flex-col overflow-hidden relative text-gray-900 bg-zinc-950">

      {/* ── Decorative background ── */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden>
        <img
          src={bgCarImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[32%_center] lg:object-center opacity-[0.85] transition-all duration-700"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/45 to-black/70" />
        <div className="absolute inset-0 bg-black/20" />
      </div>

      {/* ── Header ── */}
      <header className="shrink-0 z-20 border-b border-white/[0.08] bg-black/45 shadow-sm shadow-black/20 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[3.5rem] lg:min-h-[4rem] max-w-7xl items-center justify-between px-4 py-2.5 lg:py-3 sm:px-6">
          <img
            src={logoSrc}
            alt={app.partnerName || "WowCar"}
            className="h-7 min-[380px]:h-8 sm:h-12 w-auto max-h-9 min-[380px]:max-h-11 sm:max-h-14 md:h-15 md:max-h-18 max-w-[min(110px,30vw)] min-[380px]:max-w-[min(150px,38vw)] sm:max-w-[340px] object-contain object-left select-none"
          />
          <div className="flex items-center gap-1 min-[380px]:gap-2 sm:gap-3">
            <LanguageToggle />
            {/* PWA Install button in header */}
            {canInstall && (
              <button
                id="login-pwa-install-header-btn"
                type="button"
                onClick={handleInstall}
                disabled={isInstalling}
                title={installed ? t("app.alreadyInstalled") : t("app.installProduct", { product: app.productName })}
                aria-label={installed ? t("app.alreadyInstalled") : t("app.installProduct", { product: app.productName })}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] min-[380px]:text-xs font-semibold text-gray-200 shadow-sm transition hover:bg-white/10 hover:text-white disabled:opacity-60 disabled:cursor-not-allowed sm:px-2.5"
              >
                {/* Download/Checkmark icon */}
                {installed ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-emerald-500">
                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.5 2.5a.75.75 0 0 0 1.14-.105l4-5.5Z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-brand-orange">
                    <path fillRule="evenodd" d="M12 2.25a.75.75 0 0 1 .75.75v11.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 1 1 1.06-1.06l3.22 3.22V3a.75.75 0 0 1 .75-.75Zm-9 13.5a.75.75 0 0 1 .75.75v2.25a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V16.5a.75.75 0 0 1 1.5 0v2.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V16.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
                  </svg>
                )}
                <span className="hidden sm:inline font-medium">
                  {installed ? t("app.alreadyInstalled") : t("app.install")}
                </span>
              </button>
            )}
            <h1 className="text-right text-[10px] min-[380px]:text-xs sm:text-sm font-bold leading-tight tracking-tight text-white md:text-base lg:text-lg shrink-0">
              <span className="text-brand-orange">{app.productName.slice(0, 4)}</span>
              {app.productName.slice(4)}
            </h1>
          </div>
        </div>
      </header>

      {/* ── Main centred login card ── */}
      <main className="flex-1 min-h-0 relative z-10 flex items-center justify-center px-4 py-8 overflow-y-auto">
        <div
          className={`w-full max-w-sm rounded-2xl border border-white/10 bg-black/50 p-8 shadow-2xl backdrop-blur-xl transition-all duration-300 ${
            isShaking ? "animate-[login-shake_0.5s_ease-in-out]" : ""
          }`}
          style={isShaking ? { animation: "loginShake 0.5s ease-in-out" } : {}}
        >
          {/* Card header */}
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-orange/30 bg-brand-orange/10 shadow-lg shadow-brand-orange/10">
              {/* Lock icon (inline SVG, no extra deps needed) */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-7 w-7 text-brand-orange"
              >
                <path
                  fillRule="evenodd"
                  d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">{t("login.welcomeBack")}</h2>
            <p className="mt-1 text-sm text-gray-400">{t("login.signInToAccess", { product: app.productName })}</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label htmlFor="login-username" className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
                {t("login.username")}
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-gray-500">
                    <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
                  </svg>
                </span>
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(""); }}
                  placeholder={t("login.usernamePlaceholder")}
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder-gray-500 outline-none ring-0 transition focus:border-brand-orange/60 focus:bg-white/8 focus:ring-1 focus:ring-brand-orange/40"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
                {t("login.password")}
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-gray-500">
                    <path fillRule="evenodd" d="M15.75 1.5a6.75 6.75 0 0 0-6.651 7.906c.067.39-.032.717-.221.906l-6.5 6.499a3 3 0 0 0-.878 2.121v2.818c0 .414.336.75.75.75H6a.75.75 0 0 0 .75-.75v-1.5h1.5A.75.75 0 0 0 9 19.5V18h1.5a.75.75 0 0 0 .53-.22l2.658-2.658c.19-.189.517-.288.906-.22A6.75 6.75 0 1 0 15.75 1.5Zm0 3a.75.75 0 0 0 0 1.5A2.25 2.25 0 0 1 18 8.25a.75.75 0 0 0 1.5 0 3.75 3.75 0 0 0-3.75-3.75Z" clipRule="evenodd" />
                  </svg>
                </span>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder={t("login.passwordPlaceholder")}
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-10 text-sm text-white placeholder-gray-500 outline-none ring-0 transition focus:border-brand-orange/60 focus:bg-white/8 focus:ring-1 focus:ring-brand-orange/40"
                />
                {/* Show/hide toggle */}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-500 transition hover:text-gray-300"
                  aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                      <path d="M3.53 2.47a.75.75 0 0 0-1.06 1.06l18 18a.75.75 0 1 0 1.06-1.06l-18-18ZM22.676 12.553a11.249 11.249 0 0 1-2.631 4.31l-3.099-3.099a5.25 5.25 0 0 0-6.71-6.71L7.759 4.577A11.217 11.217 0 0 1 12 4c4.182 0 7.847 2.306 9.676 5.698.34.635.34 1.52-.001 2.155ZM15.75 12c0 .216-.018.428-.052.636l-4.334-4.334a4.5 4.5 0 0 1 4.386 3.698ZM12.971 15.448l-4.419-4.42a4.5 4.5 0 0 0 4.42 4.42ZM3.323 11.698A11.215 11.215 0 0 0 2.324 12c1.829 3.392 5.494 5.698 9.676 5.698 1.153 0 2.261-.155 3.318-.443l-1.6-1.6a5.25 5.25 0 0 1-5.896-5.896L3.323 11.698Z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                      <path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 0 1 0-1.113ZM17.25 12a5.25 5.25 0 1 1-10.5 0 5.25 5.25 0 0 1 10.5 0Z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0 text-red-400">
                  <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              id="login-submit-btn"
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full rounded-xl bg-brand-orange py-3 text-sm font-bold text-white shadow-lg shadow-brand-orange/25 transition hover:bg-brand-orange-hover active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-orange/50 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  {t("login.verifying")}
                </>
              ) : (
                t("login.signIn")
              )}
            </button>
          </form>

          {/* PWA Install button inside the card */}
          {canInstall && (
            <div className="mt-5 pt-5 border-t border-white/10">
              <button
                id="login-pwa-install-card-btn"
                type="button"
                onClick={handleInstall}
                disabled={isInstalling}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-brand-orange/30 bg-brand-orange/10 py-2.5 text-sm font-semibold text-brand-orange transition hover:bg-brand-orange/20 hover:border-brand-orange/50 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isInstalling ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    {t("pwa.installing")}
                  </>
                ) : installed ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0 text-emerald-500">
                      <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.5 2.5a.75.75 0 0 0 1.14-.105l4-5.5Z" clipRule="evenodd" />
                    </svg>
                    {t("pwa.alreadyInstalled")}
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                      <path fillRule="evenodd" d="M12 2.25a.75.75 0 0 1 .75.75v11.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 1 1 1.06-1.06l3.22 3.22V3a.75.75 0 0 1 .75-.75Zm-9 13.5a.75.75 0 0 1 .75.75v2.25a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V16.5a.75.75 0 0 1 1.5 0v2.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V16.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
                    </svg>
                    {t("pwa.installApp")}
                  </>
                )}
              </button>
              <p className="mt-2 text-center text-[11px] text-gray-500">{t("pwa.installCardHint")}</p>
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="shrink-0 z-20 border-t border-white/[0.08] bg-black/45 shadow-sm shadow-black/20 backdrop-blur-xl py-3 text-center text-[10px] sm:text-xs tracking-wide text-gray-400">
        © {app.partnerName} {app.copyrightYear} ·{" "}
        Powered by{" "}
        <span className="font-semibold text-brand-orange">{app.productName.slice(0, 4)}</span>
        <span className="font-semibold text-white">{app.productName.slice(4)}</span>
        {" "}· v{app.version}
      </footer>

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

      {/* ── Shake keyframe (inline style injection) ── */}
      <style>{`
        @keyframes loginShake {
          0%, 100% { transform: translateX(0); }
          15%       { transform: translateX(-8px); }
          30%       { transform: translateX(8px); }
          45%       { transform: translateX(-6px); }
          60%       { transform: translateX(6px); }
          75%       { transform: translateX(-3px); }
          90%       { transform: translateX(3px); }
        }
      `}</style>
    </div>
  );
}
