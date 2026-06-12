import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  HttpRequestError,
  RpcRequestError,
  TimeoutError,
} from "viem"

import { errors } from "./errors"

/**
 * Context for logging blockchain errors
 */
interface BlockchainErrorContext {
  chainId: number | string
  [key: string]: unknown // Allow additional context properties
}

/**
 * Wraps blockchain operations with consistent error handling.
 * Classifies Viem errors into appropriate HTTP exceptions.
 *
 * @param operation - Async function that performs blockchain operations
 * @param context - Logging context (chainId, address, etc.)
 * @returns The result of the operation
 * @throws HTTPException with appropriate status code and message
 */
export async function withBlockchainError<T>(
  operation: () => Promise<T>,
  context: BlockchainErrorContext,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    console.error("Blockchain error:", {
      ...context,
      errorName: error instanceof Error ? error.name : "Unknown",
      errorMessage: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    })

    if (error instanceof ContractFunctionExecutionError) {
      if (error.cause instanceof ContractFunctionRevertedError) {
        throw errors.badRequest(
          "Contract call reverted. Data may not be available or contract not properly initialized.",
        )
      }
      if (error.details.includes("insufficient funds")) {
        throw errors.badRequest("Insufficient funds to perform blockchain operation.")
      }
      throw errors.notFound("Contract", context.address as string | undefined)
    }

    if (error instanceof HttpRequestError || error instanceof TimeoutError) {
      throw errors.serviceUnavailable(
        "Blockchain network temporarily unavailable. Please try again.",
      )
    }

    if (error instanceof RpcRequestError) {
      if (error.code === 429 || error.message.toLowerCase().includes("rate limit")) {
        throw errors.tooManyRequests(
          "Blockchain provider rate limit reached. Please try again shortly.",
        )
      }
      throw errors.serviceUnavailable("Blockchain RPC error occurred. Please try again.")
    }

    console.error("Unexpected blockchain error:", error)
    throw errors.internal("Failed to fetch data from blockchain")
  }
}
