import { config } from "dotenv"

import { BaseConfigSchema } from "@/schemas"

config({ path: ".env", quiet: true })

export const baseConfig = BaseConfigSchema.parse(process.env)
