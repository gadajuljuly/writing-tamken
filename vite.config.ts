import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Every build gets a version id. The app compares it with version.json on the
// site to tell open pages that a newer version was published.
const BUILD_ID = String(Date.now());
const versionFile = (): Plugin => ({
  name: "version-file",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD_ID }) });
  },
});

// base "./" lets the build run from any GitHub Pages sub-path (/writing-tamken/).
export default defineConfig({
  base: "./",
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
