import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./components/App.jsx";
import LoginPage from "./components/LoginPage.jsx";
import { AppConfigProvider } from "./context/AppConfigContext.jsx";
import { LanguageProvider } from "./context/LanguageContext.jsx";
import { PwaInstallProvider } from "./context/PwaInstallContext.jsx";
import "./index.css";

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      registration.update().catch(() => {});
    }
  },
});

const SESSION_AUTH_KEY = "autovision-session-auth";

/** Renders the Login page until the user authenticates, then shows the App. */
function AuthGate() {
  const [authenticated, setAuthenticated] = useState(() => {
    // Persist login for the browser session (cleared when tab/browser closes)
    return sessionStorage.getItem(SESSION_AUTH_KEY) === "1";
  });

  const handleLoginSuccess = () => {
    sessionStorage.setItem(SESSION_AUTH_KEY, "1");
    setAuthenticated(true);
  };

  const handleSignOut = () => {
    sessionStorage.removeItem(SESSION_AUTH_KEY);
    setAuthenticated(false);
  };

  if (!authenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return <App onSignOut={handleSignOut} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppConfigProvider>
      <LanguageProvider>
        <PwaInstallProvider>
          <AuthGate />
        </PwaInstallProvider>
      </LanguageProvider>
    </AppConfigProvider>
  </React.StrictMode>,
);
