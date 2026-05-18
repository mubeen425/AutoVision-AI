import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Load environment variables from the repository root (parent directory)
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "");
  
  // Resolve proxy target URL, fallback to the Render URL
  const apiBaseUrl = (env.VITE_API_BASE_URL || "https://autovision-ai-regg.onrender.com").replace(/\/$/, "");

  return {
    plugins: [react()],
    /** Load `.env` from repo root so one file can serve Vite + backend docs */
    envDir: path.resolve(__dirname, ".."),
    server: {
      proxy: {
        "/api": {
          target: apiBaseUrl,
          changeOrigin: true,
        },
      },
    },
    preview: {
      proxy: {
        "/api": {
          target: apiBaseUrl,
          changeOrigin: true,
        },
      },
    },
  };
});

