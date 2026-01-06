import { Request, Response, NextFunction } from 'express'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { solConnection } from '../config/solana-config'
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
 * Minimum SOL balance required for premium access (0.0006 SOL)
 */
export const PREMIUM_BALANCE_THRESHOLD = 0.0006

/**
 * Cache TTL for balance checks (5 minutes in seconds)
 */
const BALANCE_CACHE_TTL = 300

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
 * Validate SOL balance for premium access
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
        operation: 'validateSOLBalance',
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
    let balanceInSOL: number

    if (!bypassCache) {
      const cachedBalance = await redisClient.get(cacheKey)
      if (cachedBalance !== null) {
        // Use cached balance
        balanceInSOL = parseFloat(cachedBalance)
        logger.debug({
          component: 'PremiumGate',
          operation: 'validateSOLBalance',
          message: 'Using cached balance',
          walletAddress,
          balance: balanceInSOL,
        })
        
        const hasAccess = balanceInSOL >= PREMIUM_BALANCE_THRESHOLD
        const result: PremiumAccessResult = {
          hasAccess,
          currentBalance: balanceInSOL,
          requiredBalance: PREMIUM_BALANCE_THRESHOLD,
        }

        if (!hasAccess) {
          result.difference = PREMIUM_BALANCE_THRESHOLD - balanceInSOL
        }

        return result
      }
    }

    // Query blockchain for balance
    const balanceInLamports = await solConnection.getBalance(publicKey)
    balanceInSOL = balanceInLamports / LAMPORTS_PER_SOL

    // Cache the balance
    await redisClient.setex(cacheKey, BALANCE_CACHE_TTL, balanceInSOL.toString())

    logger.debug({
      component: 'PremiumGate',
      operation: 'validateSOLBalance',
      message: bypassCache ? 'Bypassed cache and queried blockchain' : 'Queried blockchain for balance',
      walletAddress,
      balance: balanceInSOL,
    })

    const hasAccess = balanceInSOL >= PREMIUM_BALANCE_THRESHOLD
    const result: PremiumAccessResult = {
      hasAccess,
      currentBalance: balanceInSOL,
      requiredBalance: PREMIUM_BALANCE_THRESHOLD,
    }

    if (!hasAccess) {
      result.difference = PREMIUM_BALANCE_THRESHOLD - balanceInSOL
    }

    return result
  } catch (error) {
    logger.error({
      component: 'PremiumGate',
      operation: 'validateSOLBalance',
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      walletAddress,
    })

    throw new Error('Unable to verify balance. Please try again.')
  }
}

/**
 * Premium gate middleware
 * Validates user SOL balance before allowing access to premium features
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

    // Validate SOL balance
    const result = await validateSOLBalance(walletAddress as string)

    if (!result.hasAccess) {
      res.status(403).json({
        success: false,
        message: `Premium access required. Minimum balance: ${PREMIUM_BALANCE_THRESHOLD} SOL`,
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
      message: 'Unable to verify balance. Please try again.',
    })
  }
}

/**
 * Premium gate middleware for authenticated routes
 * Fetches user's wallet address from database and validates SOL balance
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

    // Validate SOL balance
    const result = await validateSOLBalance(walletForCheck)

    if (!result.hasAccess) {
      res.status(403).json({
        success: false,
        message: `Premium access required. Minimum balance: ${PREMIUM_BALANCE_THRESHOLD} SOL`,
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
      message: 'Premium access validated',
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
      message: 'Unable to verify balance. Please try again.',
    })
  }
}
