import * as z from "zod"

export type PubsubTopicPath = z.infer<typeof PubsubTopicPathSchema>
export const PubsubTopicPathSchema = z
  .string()
  .regex(/^projects\/[-\w]+\/topics\/[-\w]+$/, "Invalid Pubsub topic path")
