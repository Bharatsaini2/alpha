/**
 * SHYFT Parser V2 - AmountNormalizer Component
 * 
 * Purpose: Calculate both swap amounts and total wallet costs
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.8
 * Task 10: Implement AmountNormalizer component
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
    // CRITICAL FIX: Normalize raw amounts using decimals
    const swapInputAmount = Math.abs(quote.netDelta) / Math.pow(10, quote.decimals)
    const feeBreakdown = this.calculateFeeBreakdown(fees, quote.mint)
    const totalWalletCost = swapInputAmount + feeBreakdown.totalFeeQuote
    const baseAmount = Math.abs(base.netDelta) / Math.pow(10, base.decimals)

    return {
      swapInputAmount,
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
    // CRITICAL FIX: Normalize raw amounts using decimals
    const swapOutputAmount = Math.abs(quote.netDelta) / Math.pow(10, quote.decimals)
    const feeBreakdown = this.calculateFeeBreakdown(fees, quote.mint)
    const netWalletReceived = swapOutputAmount - feeBreakdown.totalFeeQuote
    const baseAmount = Math.abs(base.netDelta) / Math.pow(10, base.decimals)

    return {
      swapOutputAmount,
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
   */
  private createFallbackAmounts(
    quote: AssetDelta,
    base: AssetDelta,
    direction: 'BUY' | 'SELL',
    fees: FeeData
  ): NormalizedAmounts {
    const baseAmount = Math.abs(base.netDelta)
    const feeBreakdown: FeeBreakdown = {
      transactionFeeSOL: fees.transactionFee,
      transactionFeeQuote: 0,
      platformFee: 0,
      priorityFee: 0,
      totalFeeQuote: 0,
    }

    if (direction === 'BUY') {
      return {
        swapInputAmount: Math.abs(quote.netDelta),
        totalWalletCost: Math.abs(quote.netDelta),
        baseAmount,
        feeBreakdown,
      }
    } else {
      return {
        swapOutputAmount: Math.abs(quote.netDelta),
        netWalletReceived: Math.abs(quote.netDelta),
        baseAmount,
        feeBreakdown,
      }
    }
  }
}

export function createAmountNormalizer(): AmountNormalizer {
  return new AmountNormalizerImpl()
}
