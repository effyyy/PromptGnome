import { resolve } from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  oxc: false,
  esbuild: {
    // Use the React 17+ automatic JSX runtime so source files do not need
    // to import React explicitly (matches Plasmo's production transform).
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    globals: true,
    environment: "jsdom",
    testTimeout: 20_000,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "benchmarks/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.d.ts"]
    }
  },
  resolve: {
    alias: {
      "~src": resolve(__dirname, "src"),
      "~": resolve(__dirname, "."),
      // Plasmo's data-text: scheme is not available in Vitest.
      // Map to a stub that exports an empty string.
      "data-text:../content-style.css": resolve(__dirname, "tests/__mocks__/data-text-stub.ts")
    }
  }
})
