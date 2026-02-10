import { Request, Response, NextFunction } from 'express'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { solConnection, executeWithFallback } from '../config/solana-config'
import { redisClient } from '../config/redis'
import { User } from '../models/user.model'
import logger from '../utils/logger'

/**
 * Premium access validation result
 */
export interface PremiumAccessResult {
  hasAccess: boolean
  currentBalance: number
  requiredBalance: number
  difference?: number
}

/**
 * ALPHA token mint address
 */
export const ALPHA_TOKEN_MINT = '3wtGGWZ8wLWW6BqtC5rxmkHdqvM62atUcGTH4cw3pump'

/**
 * Minimum ALPHA token balance required for premium access (500,000 ALPHA / 5 lakh)
 */
export const PREMIUM_BALANCE_THRESHOLD = 500000

/**
 * Cache TTL for balance checks (1 hour in seconds)
 * Matches the validation interval to prevent cache expiration during checks
 */
const BALANCE_CACHE_TTL = 3600

/**
 * Generate Redis cache key for wallet balance
 */
const getBalanceCacheKey = (walletAddress: string): string => {
  return `premium:balance:${walletAddress.toLowerCase()}`
}

/**
 * Invalidate premium balance cache for a wallet
 * Call this after balance changes (e.g., after purchases)
 */
export const invalidatePremiumBalanceCache = async (
  walletAddress: string,
): Promise<void> => {
  try {
    const cacheKey = getBalanceCacheKey(walletAddress)
    await redisClient.del(cacheKey)
    logger.debug({
      component: 'PremiumGate',
      operation: 'invalidatePremiumBalanceCache',
      walletAddress,
      message: 'Premium balance cache invalidated',
    })
  } catch (error) {
    logger.error({
      component: 'PremiumGate',
      operation: 'invalidatePremiumBalanceCache',
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      walletAddress,
    })
  }
}

/**
 * Validate ALPHA token balance for premium access
 * @param walletAddress - Solana wallet address to check
 * @param bypassCache - If true, skip cache and query blockchain directly
 * @returns Premium access result with balance details
 */
export async function validateSOLBalance(
  walletAddress: string,
  bypassCache: boolean = false,
): Promise<PremiumAccessResult> {
  try {
    // Validate that the wallet address is valid Base58
    // If it's lowercase (legacy data), it will fail validation
    let publicKey: PublicKey
    try {
      publicKey = new PublicKey(walletAddress)
    } catch (error) {
      // Invalid wallet address (likely lowercase legacy data)
      logger.warn({
        component: 'PremiumGate',
        operation: 'validateAlphaBalance',
        message: 'Invalid wallet address format (possibly lowercase legacy data)',
        walletAddress,
      })
      
      // Return no access for invalid addresses
      return {
        hasAccess: false,
        currentBalance: 0,
        requiredBalance: PREMIUM_BALANCE_THRESHOLD,
        difference: PREMIUM_BALANCE_THRESHOLD,
      }
    }

    // Check cache first (unless bypassed)
    const cacheKey = getBalanceCacheKey(walletAddress)
    let balanceInAlpha: number

    if (!bypassCache) {
      const cachedBalance = await redisClient.get(cacheKey)
      if (cachedBalance !== null) {
        // Use cached balance
        balanceInAlpha = parseFloat(cachedBalance)
        logger.debug({
          component: 'PremiumGate',
          operation: 'validateAlphaBalance',
          message: 'Using cached ALPHA balance',
          walletAddress,
          balance: balanceInAlpha,
        })
        
        const hasAccess = balanceInAlpha >= PREMIUM_BALANCE_THRESHOLD
        const result: PremiumAccessResult = {
          hasAccess,
          currentBalance: balanceInAlpha,
          requiredBalance: PREMIUM_BALANCE_THRESHOLD,
        }

        if (!hasAccess) {
          result.difference = PREMIUM_BALANCE_THRESHOLD - balanceInAlpha
        }

        return result
      }
    }

    // Get ALPHA token account address
    const alphaTokenMint = new PublicKey(ALPHA_TOKEN_MINT)
    const tokenAccount = await getAssociatedTokenAddress(
      alphaTokenMint,
      publicKey
    )

    // Query blockchain for ALPHA token balance with retry logic and fallback RPCs
    balanceInAlpha = 0
    let rpcSuccess = false
    const maxRetries = 3
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Use executeWithFallback to automatically try backup RPCs
        const tokenAccountInfo = await executeWithFallback(
          async (connection) => connection.getTokenAccountBalance(tokenAccount),
          'getTokenAccountBalance'
        )
        
        if (tokenAccountInfo.value) {
          // Convert from token units to actual tokens (assuming 6 decimals for ALPHA)
          balanceInAlpha = parseFloat(tokenAccountInfo.value.amount) / Math.pow(10, tokenAccountInfo.value.decimals)
          rpcSuccess = true
          break
        }
      } catch (error) {
        const isLastAttempt = attempt === maxRetries
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        // Check if it's a "token account not found" error (user has no ALPHA)
        const isAccountNotFound = errorMessage.includes('could not find account') || 
                                   errorMessage.includes('Invalid param: could not find account')
        
        if (isAccountNotFound) {
          // Legitimate case: user has no ALPHA token account
          logger.debug({
            component: 'PremiumGate',
            operation: 'validateAlphaBalance',
            message: 'ALPHA token account not found (user has no ALPHA)',
            walletAddress,
          })
          balanceInAlpha = 0
          rpcSuccess = true
          break
        }
        
        // RPC error - log and retry
        logger.warn({
          component: 'PremiumGate',
          operation: 'validateAlphaBalance',
          attempt,
          maxRetries,
          message: `RPC error fetching ALPHA balance${isLastAttempt ? ' (final attempt)' : ', retrying...'}`,
          walletAddress,
          error: errorMessage,
        })
        
        if (!isLastAttempt) {
          // Wait before retry (exponential backoff: 1s, 2s, 4s)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000))
        }
      }
    }
    
    // If all RPC attempts failed (including fallbacks), throw error instead of assuming 0 balance
    if (!rpcSuccess) {
      throw new Error('Unable to verify ALPHA balance after multiple attempts across all RPC endpoints.')
    }

    // Cache the balance
    await redisClient.setex(cacheKey, BALANCE_CACHE_TTL, balanceInAlpha.toString())

    logger.debug({
      component: 'PremiumGate',
      operation: 'validateAlphaBalance',
      message: bypassCache ? 'Bypassed cache and queried blockchain for ALPHA balance' : 'Queried blockchain for ALPHA balance',
      walletAddress,
      balance: balanceInAlpha,
    })

    const hasAccess = balanceInAlpha >= PREMIUM_BALANCE_THRESHOLD
    const result: PremiumAccessResult = {
      hasAccess,
      currentBalance: balanceInAlpha,
      requiredBalance: PREMIUM_BALANCE_THRESHOLD,
    }

    if (!hasAccess) {
      result.difference = PREMIUM_BALANCE_THRESHOLD - balanceInAlpha
    }

    return result
  } catch (error) {
    logger.error({
      component: 'PremiumGate',
      operation: 'validateAlphaBalance',
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      walletAddress,
    })

    throw new Error('Unable to verify ALPHA token balance. Please try again.')
  }
}

/**
 * Premium gate middleware
 * Validates user ALPHA token balance before allowing access to premium features
 */
export const checkPremiumAccess = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Get wallet address from request body or query
    const walletAddress = req.body.walletAddress || req.query.walletAddress

    if (!walletAddress) {
      res.status(400).json({
        success: false,
        message: 'Wallet address required',
      })
      return
    }

    // Validate ALPHA token balance
    const result = await validateSOLBalance(walletAddress as string)

    if (!result.hasAccess) {
      res.status(403).json({
        success: false,
        message: `Premium access required. Minimum balance: ${PREMIUM_BALANCE_THRESHOLD} ALPHA tokens`,
        data: {
          currentBalance: result.currentBalance,
          requiredBalance: result.requiredBalance,
          difference: result.difference,
        },
      })
      return
    }

    // Attach premium access result to request for downstream use
    ;(req as any).premiumAccess = result

    next()
  } catch (error) {
    logger.error({
      component: 'PremiumGate',
      operation: 'checkPremiumAccess',
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
    })

    res.status(503).json({
      success: false,
      message: 'Unable to verify ALPHA token balance. Please try again.',
    })
  }
}

/**
 * Premium gate middleware for authenticated routes
 * Fetches user's wallet address from database and validates ALPHA token balance
 * Must be used after authenticate middleware
 */
export const premiumGate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Get userId from authenticated request
    const userId = (req as any).userId

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User authentication required',
      })
      return
    }

    // Fetch user from database
    const user = await User.findById(userId)

    if (!user || !user.walletAddress) {
      res.status(400).json({
        success: false,
        message: 'Wallet address not found. Please connect your wallet.',
      })
      return
    }

    // Use walletAddressOriginal if available (correct case), otherwise use walletAddress
    const walletForCheck = user.walletAddressOriginal || user.walletAddress

    // Validate ALPHA token balance
    const result = await validateSOLBalance(walletForCheck)

    if (!result.hasAccess) {
      res.status(403).json({
        success: false,
        message: `Premium access required. Minimum balance: ${PREMIUM_BALANCE_THRESHOLD} ALPHA tokens`,
        data: {
          currentBalance: result.currentBalance,
          requiredBalance: result.requiredBalance,
          difference: result.difference,
        },
      })
      return
    }

    // Attach premium access result to request for downstream use
    ;(req as any).premiumAccess = result

    logger.debug({
      component: 'PremiumGate',
      operation: 'premiumGate',
      userId,
      walletAddress: user.walletAddress,
      hasAccess: result.hasAccess,
      message: 'Premium access validated with ALPHA tokens',
    })

    next()
  } catch (error) {
    logger.error({
      component: 'PremiumGate',
      operation: 'premiumGate',
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
    })

    res.status(503).json({
      success: false,
      message: 'Unable to verify ALPHA token balance. Please try again.',
    })
  }
}
