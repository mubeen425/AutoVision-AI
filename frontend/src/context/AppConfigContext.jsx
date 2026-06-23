import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_CONFIG, fetchAppConfig } from "../services/configService";

const AppConfigContext = createContext(DEFAULT_CONFIG);

export function AppConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchAppConfig().then((next) => {
      if (!active) return;
      setConfig(next);
      setReady(true);

      const { title } = next.app;
      if (title) document.title = title;

      const theme = next.pwa?.themeColor;
      if (theme) {
        let meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
          meta = document.createElement("meta");
          meta.name = "theme-color";
          document.head.appendChild(meta);
        }
        meta.content = theme;
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => ({ config, ready }), [config, ready]);
  return (
    <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}
