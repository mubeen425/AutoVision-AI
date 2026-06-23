import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import en from "../i18n/en.json";
import th from "../i18n/th.json";

const STORAGE_KEY = "autovision-language";

const MESSAGES = { en, th };

const LanguageContext = createContext(null);

function getNested(obj, path) {
  return path.split(".").reduce((acc, key) => {
    if (acc == null) return undefined;
    return acc[key];
  }, obj);
}

function interpolate(template, vars = {}) {
  if (typeof template !== "string") return template ?? "";
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key] != null ? String(vars[key]) : "",
  );
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === "th" ? "th" : "en";
    } catch {
      return "en";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = language === "th" ? "th" : "en";
  }, [language]);

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang === "th" ? "th" : "en");
  }, []);

  const t = useCallback(
    (key, vars) => {
      const primary = getNested(MESSAGES[language], key);
      const fallback = getNested(MESSAGES.en, key);
      const value = primary ?? fallback ?? key;
      if (typeof value === "object") return value;
      return interpolate(value, vars);
    },
    [language],
  );

  const value = useMemo(
    () => ({ language, setLanguage, t, isThai: language === "th" }),
    [language, setLanguage, t],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
