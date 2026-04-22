import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import type { Plugin } from "vite";

function appVersionPlugin(buildId: string): Plugin {
  return {
    name: "app-version-json",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "app-version.json",
        source: JSON.stringify({ buildId, builtAt: buildId }, null, 2),
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const buildId = process.env.VITE_APP_BUILD_ID || new Date().toISOString();

  return {
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), appVersionPlugin(buildId), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
