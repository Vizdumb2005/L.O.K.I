import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "effects/**/*.test.ts", "tests/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 20_000,
    reporters: ["default"],
    sequence: { concurrent: false }
  },
  resolve: {
    alias: {
      "@loki/effect-api": resolve(root, "packages/effect-api/src/index.ts"),
      "@loki/engine": resolve(root, "packages/engine/src/index.ts"),
      "@loki/perception": resolve(root, "packages/perception/src/index.ts"),
      "@loki/showrunner": resolve(root, "packages/showrunner/src/index.ts"),
      "@loki/sim": resolve(root, "packages/sim/src/index.ts"),
      "@loki/effect-card": resolve(root, "effects/card/src/index.ts"),
      "@loki/effect-example": resolve(root, "effects/_example/src/index.ts")
    }
  }
});
