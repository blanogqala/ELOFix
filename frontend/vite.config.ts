import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { assertProductionFrontendConfig } from "./scripts/productionFrontendConfig.mjs";

function elofixProductionConfigPlugin() {
  return {
    name: "elofix-production-frontend-config",
    configResolved(config) {
      if (config.command !== "build") return;
      assertProductionFrontendConfig(process.env, { mode: config.mode });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  let apiTarget = String(env.VITE_API_ORIGIN || "http://127.0.0.1:5000").replace(/\/$/, "");
  try {
    const parsed = new URL(apiTarget);
    if (parsed.hostname === "localhost") {
      apiTarget = `${parsed.protocol}//127.0.0.1${parsed.port ? `:${parsed.port}` : ""}`;
    }
  } catch {
    apiTarget = "http://127.0.0.1:5000";
  }

  return {
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/uploads": { target: apiTarget, changeOrigin: true },
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), elofixProductionConfigPlugin()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("jspdf") || id.includes("xlsx") || id.includes("html2canvas")) return "export-tools";
          if (id.includes("firebase")) return "firebase";
          if (id.includes("maplibre-gl")) return "maplibre";
          if (id.includes("@fingerprintjs")) return "fingerprint";
          if (id.includes("socket.io")) return "socket";
          if (id.includes("@radix-ui") || id.includes("lucide-react")) return "ui-vendor";
          if (id.includes("react-dom") || id.includes("react-router") || id.includes("/react/")) {
            return "react-vendor";
          }
        },
      },
    },
  },
  };
});
