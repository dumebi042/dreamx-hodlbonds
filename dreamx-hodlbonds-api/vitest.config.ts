import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: [
        "./tsconfig.json",
        "./apps/intake/tsconfig.json",
        "./apps/price-oracle/tsconfig.json",
        "./apps/public-api/tsconfig.json",
        "./apps/server/tsconfig.json",
        "./apps/trading-api/tsconfig.json",
        "./packages/blockchain/tsconfig.json",
      ],
    }),
  ],
  test: {
    clearMocks: true,
    // globals: true,
    fileParallelism: false, // Important for tests that interact with a shared DB
  },
})
