import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"
import path from "node:path"

if (process.env["NODE_ENV"] === "test") {
  config({ path: path.resolve(process.cwd(), "../../.env.test"), quiet: true })
} else {
  config({ path: path.resolve(process.cwd(), "../../.env"), quiet: true })
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"]!,
  },
})
