import { defineConfig } from "vite";
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
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
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
}));
