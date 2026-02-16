/**
 * SHYFT Parser V2 - AmountNormalizer Component
 * 
 * Purpose: Normalize raw balance changes to human-readable amounts
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.8
 * Task 10: Implement AmountNormalizer component
 * 
 * ✅ BALANCE-TRUTH MODEL:
 * - quote.netDelta already includes ALL fees (network, priority, platform)
 * - We NEVER add or subtract fees - that would be double accounting
 * - Fees are INFORMATIONAL ONLY - never used for amount calculations
 */

import logger from './logger'
import {
  AmountNormalizer,
  AssetDelta,
  FeeData,
  NormalizedAmounts,
  FeeBreakdown,
  PRIORITY_ASSETS,
} from './shyftParserV2.types'

export class AmountNormalizerImpl implements AmountNormalizer {
  normalize(
    quote: AssetDelta,
    base: AssetDelta,
    direction: 'BUY' | 'SELL',
    fees: FeeData
  ): NormalizedAmounts {
    try {
      // Validate inputs
      if (quote.netDelta === 0) {
        logger.warn(
          { quoteMint: quote.mint, direction },
          'AmountNormalizer: Quote delta is zero, using fallback'
        )
      }
      
      if (base.netDelta === 0) {
        logger.warn(
          { baseMint: base.mint, direction },
          'AmountNormalizer: Base delta is zero, using fallback'
        )
      }

      if (direction === 'BUY') {
        return this.normalizeBuy(quote, base, fees)
      } else {
        return this.normalizeSell(quote, base, fees)
      }
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          quoteMint: quote.mint,
          baseMint: base.mint,
          direction,
        },
        'AmountNormalizer: Error normalizing amounts, using fallback values'
      )
      
      // Return fallback values
      return this.createFallbackAmounts(quote, base, direction, fees)
    }
  }

  private normalizeBuy(
    quote: AssetDelta,
    base: AssetDelta,
    fees: FeeData
  ): NormalizedAmounts {
    // ✅ BALANCE-TRUTH MODEL: Use raw balance changes ONLY
    // quote.netDelta already includes ALL fees - it's the final wallet truth
    // 
    // 🔒 INVARIANT: swapInputAmount can ONLY come from pool transfers
    // Balance deltas may NEVER populate pool fields
    const totalWalletCost = Math.abs(quote.netDelta) / Math.pow(10, quote.decimals)
    const baseAmount = Math.abs(base.netDelta) / Math.pow(10, base.decimals)
    
    // Fee breakdown is INFORMATIONAL ONLY - never used for math
    const feeBreakdown = this.calculateFeeBreakdown(fees, quote.mint)
    
    // swapInputAmount = what went to pool (ONLY from pool data)
    // We don't have pool transfer data, so omit the field entirely
    // Consumers can decide to display totalWalletCost if needed
    return {
      totalWalletCost,
      baseAmount,
      feeBreakdown,
    }
  }

  private normalizeSell(
    quote: AssetDelta,
    base: AssetDelta,
    fees: FeeData
  ): NormalizedAmounts {
    // ✅ BALANCE-TRUTH MODEL: Use raw balance changes ONLY
    // quote.netDelta already has fees deducted - it's the final wallet truth
    // 
    // 🔒 INVARIANT: swapOutputAmount can ONLY come from pool transfers
    // Balance deltas may NEVER populate pool fields
    const netWalletReceived = Math.abs(quote.netDelta) / Math.pow(10, quote.decimals)
    const baseAmount = Math.abs(base.netDelta) / Math.pow(10, base.decimals)
    
    // Fee breakdown is INFORMATIONAL ONLY - never used for math
    const feeBreakdown = this.calculateFeeBreakdown(fees, quote.mint)
    
    // swapOutputAmount = what came from pool (ONLY from pool data)
    // We don't have pool transfer data, so omit the field entirely
    // Consumers can decide to display netWalletReceived if needed
    return {
      netWalletReceived,
      baseAmount,
      feeBreakdown,
    }
  }

  private calculateFeeBreakdown(fees: FeeData, quoteMint: string): FeeBreakdown {
    const transactionFeeSOL = fees.transactionFee
    const priorityFeeSOL = fees.priorityFee || 0
    const platformFee = fees.platformFee || 0

    let transactionFeeQuote: number
    let priorityFeeQuote: number

    if (quoteMint === PRIORITY_ASSETS.SOL || quoteMint === PRIORITY_ASSETS.WSOL) {
      transactionFeeQuote = transactionFeeSOL
      priorityFeeQuote = priorityFeeSOL
    } else {
      const solToQuoteRate = this.getSolToQuoteRate(quoteMint)
      transactionFeeQuote = transactionFeeSOL * solToQuoteRate
      priorityFeeQuote = priorityFeeSOL * solToQuoteRate
    }

    const totalFeeQuote = transactionFeeQuote + priorityFeeQuote + platformFee

    return {
      transactionFeeSOL,
      transactionFeeQuote,
      platformFee,
      priorityFee: priorityFeeSOL,
      totalFeeQuote,
    }
  }

  private getSolToQuoteRate(quoteMint: string): number {
    // For stablecoins, use approximate SOL price
    if (quoteMint === PRIORITY_ASSETS.USDC || quoteMint === PRIORITY_ASSETS.USDT) {
      return 100
    }
    
    // For other tokens, we don't have market data, so use 1:1 fallback
    // This means fees will be in SOL terms, which is acceptable
    logger.warn(
      { quoteMint },
      'AmountNormalizer: No market rate available for quote asset, using 1:1 fallback'
    )
    return 1
  }

  /**
   * Create fallback amounts when calculation fails
   * 
   * ✅ BALANCE-TRUTH MODEL: Even in fallback, we follow the same rules
   * - Pool amounts (swapInputAmount/swapOutputAmount) can ONLY come from pool data
   * - We use undefined for pool amounts, let consumers decide what to display
   */
  private createFallbackAmounts(
    quote: AssetDelta,
    base: AssetDelta,
    direction: 'BUY' | 'SELL',
    fees: FeeData
  ): NormalizedAmounts {
    // ✅ FIX: Properly normalize decimals in fallback
    const baseAmount = Math.abs(base.netDelta) / Math.pow(10, base.decimals)
    const quoteAmount = Math.abs(quote.netDelta) / Math.pow(10, quote.decimals)
    
    const feeBreakdown: FeeBreakdown = {
      transactionFeeSOL: fees.transactionFee,
      transactionFeeQuote: 0,
      platformFee: 0,
      priorityFee: 0,
      totalFeeQuote: 0,
    }

    if (direction === 'BUY') {
      return {
        totalWalletCost: quoteAmount,
        baseAmount,
        feeBreakdown,
      }
    } else {
      return {
        netWalletReceived: quoteAmount,
        baseAmount,
        feeBreakdown,
      }
    }
  }
}

export function createAmountNormalizer(): AmountNormalizer {
  return new AmountNormalizerImpl()
}
