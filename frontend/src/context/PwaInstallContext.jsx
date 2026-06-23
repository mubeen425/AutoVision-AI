import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const PwaInstallContext = createContext(null);

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

export function PwaInstallProvider({ children }) {
  const [deferred, setDeferred] = useState(() => {
    return typeof window !== "undefined" ? window.deferredPwaPrompt : null;
  });
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    // Check if app is installed on the system (supported in Chrome/Edge)
    if (navigator.getInstalledRelatedApps) {
      navigator.getInstalledRelatedApps()
        .then((relatedApps) => {
          if (relatedApps && relatedApps.length > 0) {
            setInstalled(true);
          }
        })
        .catch(() => {});
    }

    if (window.deferredPwaPrompt) {
      setDeferred(window.deferredPwaPrompt);
    }

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
      window.deferredPwaPrompt = e;
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      window.deferredPwaPrompt = null;
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) {
      return { outcome: "not-ready" };
    }
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      return { outcome };
    } catch (error) {
      console.error("PWA install prompt failed:", error);
      return { outcome: "failed", error };
    } finally {
      setDeferred(null);
    }
  }, [deferred]);

  const value = {
    canInstall: true,
    installed,
    install,
    isDeferredReady: Boolean(deferred),
  };

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
    </PwaInstallContext.Provider>
  );
}

export function usePwaInstall() {
  const ctx = useContext(PwaInstallContext);
  if (!ctx) {
    throw new Error("usePwaInstall must be used within PwaInstallProvider");
  }
  return ctx;
}
