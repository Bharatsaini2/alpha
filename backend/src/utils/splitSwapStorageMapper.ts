/**
 * Split Swap Storage Mapper
 * 
 * Maps Parser V2 output to storage layer fields, ensuring:
 * 1. Amount fields contain actual token amounts (not USD values)
 * 2. SOL amount fields are null when SOL is not involved
 * 3. Valuation data is kept separate from on-chain economic truth
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4
 * Task: Phase A, Task 2
 */

import { ParsedSwap, PRIORITY_ASSETS } from './shyftParserV2.types'

/**
 * Storage amount fields structure
 */
export interface StorageAmounts {
  amount: {
    buyAmount: number
    sellAmount: number
  }
  solAmount: {
    buySolAmount: number | null
    sellSolAmount: number | null
  }
}

/**
 * Sanitizes numeric values from Parser V2
 * 
 * Handles boundary cases:
 * - NaN → 0 (parser corruption)
 * - undefined → 0 (data not available)
 * - null → 0 (data not available)
 * - negative → 0 (invalid data)
 * - valid number → pass through
 * 
 * This makes the mapper robust against upstream data quality issues.
 * 
 * @param value - Potentially unsafe numeric value
 * @returns Safe numeric value (>= 0)
 */
function safeNumeric(value?: number | null): number {
  if (typeof value === 'number' && !isNaN(value) && value >= 0) {
    return value
  }
  return 0
}

/**
 * Sanitizes SOL amounts from Parser V2
 * 
 * Handles boundary cases:
 * - NaN → null (parser corruption)
 * - undefined → null (data not available)
 * - null → null (data not available)
 * - negative → null (invalid data)
 * - valid number → pass through
 * 
 * @param value - Potentially unsafe SOL amount
 * @returns Safe SOL amount or null
 */
function safeSOLAmount(value?: number | null): number | null {
  if (typeof value === 'number' && !isNaN(value) && value >= 0) {
    return value
  }
  return null
}

/**
 * Maps Parser V2 amounts to storage amount fields
 * 
 * Policy:
 * - null = not applicable (e.g., no SOL involved)
 * - 0 = actual zero amount
 * 
 * BUY direction:
 * - buyAmount = baseAmount (tokens bought)
 * - sellAmount = totalWalletCost (amount spent from wallet)
 * 
 * SELL direction:
 * - buyAmount = netWalletReceived (amount received in wallet)
 * - sellAmount = baseAmount (tokens sold)
 * 
 * Requirements: 1.1, 1.2, 1.4
 * 
 * @param parsedSwap - Parser V2 output
 * @returns Storage amount fields with actual token amounts
 */
export function mapParserAmountsToStorage(parsedSwap: ParsedSwap): StorageAmounts {
  const { direction, amounts } = parsedSwap
  
  // ✅ Single source of truth: delegate SOL mapping to mapSOLAmounts()
  const solAmount = mapSOLAmounts(parsedSwap)
  
  if (direction === 'BUY') {
    // BUY: User bought baseAsset, spent quoteAsset
    return {
      amount: {
        buyAmount: safeNumeric(amounts.baseAmount),  // ✅ Sanitized actual tokens bought
        sellAmount: safeNumeric(amounts.totalWalletCost),  // ✅ Sanitized actual amount spent
      },
      solAmount,
    }
  } else {
    // SELL: User sold baseAsset, received quoteAsset
    return {
      amount: {
        buyAmount: safeNumeric(amounts.netWalletReceived),  // ✅ Sanitized actual amount received
        sellAmount: safeNumeric(amounts.baseAmount),  // ✅ Sanitized actual tokens sold
      },
      solAmount,
    }
  }
}

/**
 * Checks if a mint address is SOL or WSOL
 * 
 * Requirements: 2.1, 2.2, 2.3
 * 
 * @param mint - Token mint address
 * @returns true if mint is SOL or WSOL
 */
export function isSOLMint(mint: string): boolean {
  return mint === PRIORITY_ASSETS.SOL || mint === PRIORITY_ASSETS.WSOL
}

/**
 * Maps SOL amounts for storage
 * 
 * Rules:
 * - If SOL/WSOL is directly involved: use actual SOL amounts from swap
 * - If SOL/WSOL is NOT involved: calculate SOL equivalent from USD value
 * - null = data not available
 * - 0 = actual zero amount
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4
 * 
 * @param parsedSwap - Parser V2 output
 * @param tokenInUsdAmount - USD value of tokenIn (for SOL equivalent calculation)
 * @param tokenOutUsdAmount - USD value of tokenOut (for SOL equivalent calculation)
 * @param solPrice - Current SOL price in USD (for SOL equivalent calculation)
 * @returns SOL amount fields (actual SOL or SOL equivalent)
 */
export function mapSOLAmounts(
  parsedSwap: ParsedSwap,
  tokenInUsdAmount?: number,
  tokenOutUsdAmount?: number,
  solPrice?: number
): {
  buySolAmount: number | null
  sellSolAmount: number | null
} {
  const { direction, amounts, quoteAsset, baseAsset } = parsedSwap
  
  const isQuoteSOL = isSOLMint(quoteAsset.mint)
  const isBaseSOL = isSOLMint(baseAsset.mint)
  
  // If SOL is directly involved, use actual SOL amounts
  if (isQuoteSOL || isBaseSOL) {
    if (direction === 'BUY') {
      // BUY: User bought baseAsset, spent quoteAsset
      return {
        // Bought SOL: use baseAmount (sanitized)
        buySolAmount: isBaseSOL ? safeSOLAmount(amounts.baseAmount) : null,
        // Spent SOL: use totalWalletCost (sanitized, may be undefined → null)
        sellSolAmount: isQuoteSOL ? safeSOLAmount(amounts.totalWalletCost) : null,
      }
    } else {
      // SELL: User sold baseAsset, received quoteAsset
      return {
        // Received SOL: use netWalletReceived (sanitized, may be undefined → null)
        buySolAmount: isQuoteSOL ? safeSOLAmount(amounts.netWalletReceived) : null,
        // Sold SOL: use baseAmount (sanitized)
        sellSolAmount: isBaseSOL ? safeSOLAmount(amounts.baseAmount) : null,
      }
    }
  }
  
  // If SOL is NOT involved, calculate SOL equivalent from USD values
  // This works for ALL core tokens (USDC, USDT, etc.) since we have their USD amounts
  // Formula: USD amount ÷ SOL price = SOL equivalent
  if (tokenInUsdAmount !== undefined && tokenOutUsdAmount !== undefined && solPrice && solPrice > 0) {
    const tokenInSolEquivalent = tokenInUsdAmount / solPrice
    const tokenOutSolEquivalent = tokenOutUsdAmount / solPrice
    
    if (direction === 'BUY') {
      // BUY: User bought baseAsset (tokenOut), spent quoteAsset (tokenIn)
      // Example: Spent 100 USDC ($100) to buy TOKEN
      // buySolAmount = $100 / $94 = 1.06 SOL (value of tokens bought)
      // sellSolAmount = $100 / $94 = 1.06 SOL (value of USDC spent)
      return {
        buySolAmount: safeSOLAmount(tokenOutSolEquivalent),  // SOL equivalent of tokens bought
        sellSolAmount: safeSOLAmount(tokenInSolEquivalent),  // SOL equivalent of amount spent
      }
    } else {
      // SELL: User sold baseAsset (tokenIn), received quoteAsset (tokenOut)
      // Example: Sold TOKEN worth $100 to get 100 USDC ($100)
      // sellSolAmount = $100 / $94 = 1.06 SOL (value of tokens sold)
      // buySolAmount = $100 / $94 = 1.06 SOL (value of USDC received)
      return {
        buySolAmount: safeSOLAmount(tokenOutSolEquivalent),  // SOL equivalent of amount received
        sellSolAmount: safeSOLAmount(tokenInSolEquivalent),  // SOL equivalent of tokens sold
      }
    }
  }
  
  // If no USD values or SOL price available, return null
  return {
    buySolAmount: null,
    sellSolAmount: null,
  }
}
