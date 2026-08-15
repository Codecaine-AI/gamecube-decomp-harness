import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const CORE_ROOT = resolve(import.meta.dirname, "../../../../Codecaine/Core");

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    alias: [
      { find: /^@\//, replacement: `${resolve(import.meta.dirname, "src")}/` },
      { find: /^react$/, replacement: resolve(import.meta.dirname, "../../node_modules/react/index.js") },
      { find: /^react\/jsx-runtime$/, replacement: resolve(import.meta.dirname, "../../node_modules/react/jsx-runtime.js") },
      { find: /^react\/jsx-dev-runtime$/, replacement: resolve(import.meta.dirname, "../../node_modules/react/jsx-dev-runtime.js") },
      { find: /^react-dom$/, replacement: resolve(import.meta.dirname, "../../node_modules/react-dom/index.js") },
      { find: /^react-dom\/client$/, replacement: resolve(import.meta.dirname, "../../node_modules/react-dom/client.js") },
    ],
  },
  server: {
    fs: {
      allow: [REPO_ROOT, CORE_ROOT],
    },
  },
  build: {
    emptyOutDir: true,
    outDir: resolve(import.meta.dirname, "dist"),
  },
});
