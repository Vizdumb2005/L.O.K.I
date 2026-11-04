import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

function servePublicOrt() {
  return {
    name: "serve-public-ort",
    configureServer(server: {
      middlewares: {
        use: (
          fn: (
            req: { url?: string },
            res: { setHeader: (k: string, v: string) => void; end: (b: Buffer) => void },
            next: () => void
          ) => void
        ) => void;
      };
    }) {
      server.middlewares.use((req, res, next) => {
        const clean = (req.url ?? "").split("?")[0] ?? "";
        const match = clean.match(/\/ort\/(ort-wasm[^/]+\.(?:mjs|wasm))$/);
        if (!match) return next();
        const file = resolve(root, "public/ort", match[1]!);
        if (!existsSync(file)) return next();
        res.setHeader(
          "Content-Type",
          file.endsWith(".wasm") ? "application/wasm" : "application/javascript"
        );
        res.end(readFileSync(file));
      });
    }
  };
}

export default defineConfig({
  define: {
    __LOKI_GIT_SHA__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? "dev")
  },
  root,
  // GitHub Pages serves from /<repo>/; the deploy workflow sets LOKI_BASE.
  base: process.env.LOKI_BASE ?? "/",
  plugins: [servePublicOrt(), react()],
  server: {
    port: 4173,
    strictPort: true,
    host: "127.0.0.1",
    proxy: { "/api": "http://127.0.0.1:8787" }
  },
  preview: { port: 4173, strictPort: true, host: "127.0.0.1" },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: true },
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
      "@loki/effect-example": resolve(root, "../../effects/_example/src/index.ts"),
      "@loki/effect-countdown": resolve(root, "../../effects/countdown/src/index.ts")
    }
  }
});