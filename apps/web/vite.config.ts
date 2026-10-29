import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  // GitHub Pages serves from /<repo>/; the deploy workflow sets LOKI_BASE.
  base: process.env.LOKI_BASE ?? "/",
  plugins: [react()],
  server: {
    port: 4173,
    strictPort: true,
    host: "127.0.0.1",
    proxy: { "/api": "http://127.0.0.1:8787" }
  },
  preview: { port: 4173, strictPort: true, host: "127.0.0.1" },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        "ort-smoke": resolve(root, "ort-smoke.html")
      }
    }
  },
  resolve: {
    dedupe: ["three", "react", "react-dom"],
    alias: {
      three: resolve(root, "node_modules/three"),
      "@loki/effect-api": resolve(root, "../../packages/effect-api/src/index.ts"),
      "@loki/engine": resolve(root, "../../packages/engine/src/index.ts"),
      "@loki/perception": resolve(root, "../../packages/perception/src/index.ts"),
      "@loki/showrunner": resolve(root, "../../packages/showrunner/src/index.ts"),
      "@loki/sim": resolve(root, "../../packages/sim/src/index.ts"),
      "@loki/effect-card": resolve(root, "../../effects/card/src/index.ts"),
      "@loki/effect-example": resolve(root, "../../effects/_example/src/index.ts")
    }
  }
});
