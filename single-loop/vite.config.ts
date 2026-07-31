import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("index.html", import.meta.url)),
        plate: fileURLToPath(new URL("plate.html", import.meta.url)),
      },
    },
  },
  test: { environment: "jsdom", include: ["tests/unit/**/*.test.ts"] },
});
