import type { Data, Status } from "@/common"
import type { TaskInput, TaskParams } from "@/schemas/task-schema"

import { Message } from "@/message"
import { TaskInputSchema, TaskParamsSchema } from "@/schemas/task-schema"

export class Task<TData extends Data = Data> extends Message<TData> {
  id: number
  status: Status
  attempts: number
  nextAttempt: number | null

  constructor(task: Task)
  constructor(task: TaskInput)
  constructor(task: Task | TaskInput) {
    let taskParams: TaskParams

    if (task instanceof Task) {
      super(task)
      taskParams = {
        id: task.id,
        status: task.status,
        attempts: task.attempts,
        nextAttempt: task.nextAttempt,
      }
    } else {
      const validatedInput = TaskInputSchema.parse(task)

      super({
        ...validatedInput,
        earliestTry: validatedInput.earliest_try_unix,
        latestTry: validatedInput.latest_try_unix,
        shouldRetry: validatedInput.should_retry,
      })

      taskParams = {
        id: validatedInput.id,
        status: validatedInput.status,
        attempts: validatedInput.attempts,
        nextAttempt: validatedInput.next_attempt_unix,
      }
    }

    const validatedParams = TaskParamsSchema.parse(taskParams)
    this.id = validatedParams.id
    this.status = validatedParams.status
    this.attempts = validatedParams.attempts
    this.nextAttempt = validatedParams.nextAttempt
  }

  static fromTask(_: Task): void {
    throw new Error("fromTask() is not implemented in the Task class itself")
  }
}
