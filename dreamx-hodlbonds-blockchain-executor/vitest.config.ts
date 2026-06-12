import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: [
        "./tsconfig.json",
        "./apps/executor/tsconfig.json",
        "./apps/intake/tsconfig.json",
        "./packages/dto/tsconfig.json",
        "./packages/client/tsconfig.json",
      ],
    }),
  ],
  test: {
    clearMocks: true,
    globals: true,
    fileParallelism: false,  // Important for tests that interact with a shared DB
  },
})
