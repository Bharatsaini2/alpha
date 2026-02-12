import { Connection } from '@solana/web3.js'
import dotenv from 'dotenv'
import logger from '../utils/logger'
dotenv.config()

const rpcUrl = process.env.RPC_URL
const fallbackRpcUrls = process.env.FALLBACK_RPC_URLS?.split(',').filter(Boolean) || []

// Primary connection
export const solConnection = new Connection(rpcUrl!, {
  commitment: 'confirmed',
})

// Fallback connections (if configured)
export const fallbackConnections = fallbackRpcUrls.map(url => 
  new Connection(url.trim(), { commitment: 'confirmed' })
)

/**
 * Execute an RPC call with automatic fallback to backup RPCs
 * @param operation - Function that performs the RPC call
 * @param operationName - Name for logging
 * @returns Result from the RPC call
 */
export async function executeWithFallback<T>(
  operation: (connection: Connection) => Promise<T>,
  operationName: string = 'RPC operation'
): Promise<T> {
  const allConnections = [solConnection, ...fallbackConnections]
  const errors: Array<{ rpc: string; error: string }> = []

  for (let i = 0; i < allConnections.length; i++) {
    const connection = allConnections[i]
    const rpcLabel = i === 0 ? 'Primary RPC' : `Fallback RPC ${i}`
    
    try {
      const result = await operation(connection)
      
      if (i > 0) {
        // Log when fallback was used successfully
        logger.info({
          component: 'SolanaConfig',
          operation: 'executeWithFallback',
          message: `${operationName} succeeded using ${rpcLabel}`,
          attemptNumber: i + 1,
        })
      }
      
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      errors.push({ rpc: rpcLabel, error: errorMessage })
      
      logger.warn({
        component: 'SolanaConfig',
        operation: 'executeWithFallback',
        message: `${operationName} failed on ${rpcLabel}`,
        error: errorMessage,
        attemptNumber: i + 1,
        hasMoreFallbacks: i < allConnections.length - 1,
      })
      
      // If this is the last connection, throw
      if (i === allConnections.length - 1) {
        logger.error({
          component: 'SolanaConfig',
          operation: 'executeWithFallback',
          message: `${operationName} failed on all RPCs`,
          errors,
        })
        throw new Error(`All RPC endpoints failed for ${operationName}`)
      }
      
      // ✅ CRITICAL FIX: Add delay before trying next RPC to prevent request storm
      // Exponential backoff: 1s, 2s, 4s, 8s...
      const waitTime = Math.min(1000 * Math.pow(2, i), 8000)
      logger.info({
        component: 'SolanaConfig',
        operation: 'executeWithFallback',
        message: `⏳ Waiting ${waitTime / 1000}s before trying next RPC...`,
      })
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }

  throw new Error('Unexpected error in executeWithFallback')
}
