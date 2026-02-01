/**
 * SHYFT Parser V2 - AmountNormalizer Tests
 * 
 * Property-Based Tests (Properties 22-27) and Unit Tests
 * Task 10: Implement AmountNormalizer component
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.8
 */

import * as fc from 'fast-check'
import { createAmountNormalizer } from '../shyftParserV2.amountNormalizer'
import { AssetDelta, FeeData, PRIORITY_ASSETS } from '../shyftParserV2.types'
import {
  positiveAssetDeltaArbitrary,
  negativeAssetDeltaArbitrary,
  feeDataArbitrary,
} from './shyftParserV2.arbitraries'

describe('AmountNormalizer', () => {
  const normalizer = createAmountNormalizer()

  describe('Property-Based Tests', () => {
    test('Property 22: BUY swap input amount equals absolute value of quote delta', () => {
      fc.assert(
        fc.property(
          negativeAssetDeltaArbitrary,
          positiveAssetDeltaArbitrary,
          feeDataArbitrary,
          (quote, base, fees) => {
            const result = normalizer.normalize(quote, base, 'BUY', fees)
            expect(result.swapInputAmount).toBe(Math.abs(quote.netDelta))
          }
        ),
        { numRuns: 100 }
      )
    })

    test('Property 23: BUY total wallet cost equals input amount plus fees', () => {
      fc.assert(
        fc.property(
          negativeAssetDeltaArbitrary,
          positiveAssetDeltaArbitrary,
          feeDataArbitrary,
          (quote, base, fees) => {
            const result = normalizer.normalize(quote, base, 'BUY', fees)
            expect(result.totalWalletCost).toBe(
              result.swapInputAmount! + result.feeBreakdown.totalFeeQuote
            )
            expect(result.totalWalletCost).toBeDefined()
          }
        ),
        { numRuns: 100 }
      )
    })

    test('Property 24: SELL swap output amount equals absolute value of quote delta', () => {
      fc.assert(
        fc.property(
          positiveAssetDeltaArbitrary,
          negativeAssetDeltaArbitrary,
          feeDataArbitrary,
          (quote, base, fees) => {
            const result = normalizer.normalize(quote, base, 'SELL', fees)
            expect(result.swapOutputAmount).toBe(Math.abs(quote.netDelta))
          }
        ),
        { numRuns: 100 }
      )
    })

    test('Property 25: SELL net wallet received equals output amount minus fees', () => {
      fc.assert(
        fc.property(
          positiveAssetDeltaArbitrary,
          negativeAssetDeltaArbitrary,
          feeDataArbitrary,
          (quote, base, fees) => {
            const result = normalizer.normalize(quote, base, 'SELL', fees)
            expect(result.netWalletReceived).toBe(
              result.swapOutputAmount! - result.feeBreakdown.totalFeeQuote
            )
            expect(result.netWalletReceived).toBeDefined()
          }
        ),
        { numRuns: 100 }
      )
    })

    test('Property 26: Dual amount storage for BUY and SELL', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.tuple(fc.constant('BUY' as const), negativeAssetDeltaArbitrary, positiveAssetDeltaArbitrary),
            fc.tuple(fc.constant('SELL' as const), positiveAssetDeltaArbitrary, negativeAssetDeltaArbitrary)
          ),
          feeDataArbitrary,
          ([direction, quote, base], fees) => {
            const result = normalizer.normalize(quote, base, direction, fees)
            if (direction === 'BUY') {
              expect(result.swapInputAmount).toBeDefined()
              expect(result.totalWalletCost).toBeDefined()
              expect(result.swapOutputAmount).toBeUndefined()
              expect(result.netWalletReceived).toBeUndefined()
            } else {
              expect(result.swapOutputAmount).toBeDefined()
              expect(result.netWalletReceived).toBeDefined()
              expect(result.swapInputAmount).toBeUndefined()
              expect(result.totalWalletCost).toBeUndefined()
            }
            expect(result.baseAmount).toBeDefined()
            expect(result.baseAmount).toBeGreaterThan(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    test('Property 27: Fee breakdown presence and structure', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.tuple(fc.constant('BUY' as const), negativeAssetDeltaArbitrary, positiveAssetDeltaArbitrary),
            fc.tuple(fc.constant('SELL' as const), positiveAssetDeltaArbitrary, negativeAssetDeltaArbitrary)
          ),
          feeDataArbitrary,
          ([direction, quote, base], fees) => {
            const result = normalizer.normalize(quote, base, direction, fees)
            expect(result.feeBreakdown).toBeDefined()
            expect(result.feeBreakdown.transactionFeeSOL).toBeDefined()
            expect(result.feeBreakdown.transactionFeeQuote).toBeDefined()
            expect(result.feeBreakdown.platformFee).toBeDefined()
            expect(result.feeBreakdown.priorityFee).toBeDefined()
            expect(result.feeBreakdown.totalFeeQuote).toBeDefined()
            expect(result.feeBreakdown.transactionFeeSOL).toBeGreaterThanOrEqual(0)
            expect(result.feeBreakdown.transactionFeeQuote).toBeGreaterThanOrEqual(0)
            expect(result.feeBreakdown.platformFee).toBeGreaterThanOrEqual(0)
            expect(result.feeBreakdown.priorityFee).toBeGreaterThanOrEqual(0)
            expect(result.feeBreakdown.totalFeeQuote).toBeGreaterThanOrEqual(0)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Unit Tests', () => {
    describe('BUY amount calculations', () => {
      test('should calculate correct amounts for SOL to TOKEN swap', () => {
        const quote: AssetDelta = {
          mint: PRIORITY_ASSETS.SOL,
          symbol: 'SOL',
          netDelta: -1000000000,
          decimals: 9,
          isIntermediate: false,
        }
        const base: AssetDelta = {
          mint: 'TokenMint111111111111111111111111111111111',
          symbol: 'TOKEN',
          netDelta: 5000000,
          decimals: 6,
          isIntermediate: false,
        }
        const fees: FeeData = {
          transactionFee: 0.000005,
          priorityFee: 0.000001,
          platformFee: 0,
        }
        const result = normalizer.normalize(quote, base, 'BUY', fees)
        expect(result.swapInputAmount).toBe(1000000000)
        expect(result.totalWalletCost).toBe(1000000000 + 0.000006)
        expect(result.baseAmount).toBe(5000000)
        expect(result.feeBreakdown.totalFeeQuote).toBe(0.000006)
      })

      test('should handle zero fees correctly', () => {
        const quote: AssetDelta = {
          mint: PRIORITY_ASSETS.SOL,
          symbol: 'SOL',
          netDelta: -1000000000,
          decimals: 9,
          isIntermediate: false,
        }
        const base: AssetDelta = {
          mint: 'TokenMint111111111111111111111111111111111',
          symbol: 'TOKEN',
          netDelta: 5000000,
          decimals: 6,
          isIntermediate: false,
        }
        const fees: FeeData = {
          transactionFee: 0,
          priorityFee: 0,
          platformFee: 0,
        }
        const result = normalizer.normalize(quote, base, 'BUY', fees)
        expect(result.swapInputAmount).toBe(1000000000)
        expect(result.totalWalletCost).toBe(1000000000)
        expect(result.feeBreakdown.totalFeeQuote).toBe(0)
      })
    })

    describe('SELL amount calculations', () => {
      test('should calculate correct amounts for TOKEN to SOL swap', () => {
        const quote: AssetDelta = {
          mint: PRIORITY_ASSETS.SOL,
          symbol: 'SOL',
          netDelta: 2000000000,
          decimals: 9,
          isIntermediate: false,
        }
        const base: AssetDelta = {
          mint: 'TokenMint111111111111111111111111111111111',
          symbol: 'TOKEN',
          netDelta: -10000000,
          decimals: 6,
          isIntermediate: false,
        }
        const fees: FeeData = {
          transactionFee: 0.000005,
          priorityFee: 0.000001,
          platformFee: 0,
        }
        const result = normalizer.normalize(quote, base, 'SELL', fees)
        expect(result.swapOutputAmount).toBe(2000000000)
        expect(result.netWalletReceived).toBe(2000000000 - 0.000006)
        expect(result.baseAmount).toBe(10000000)
        expect(result.feeBreakdown.totalFeeQuote).toBe(0.000006)
      })

      test('should handle zero fees correctly', () => {
        const quote: AssetDelta = {
          mint: PRIORITY_ASSETS.SOL,
          symbol: 'SOL',
          netDelta: 2000000000,
          decimals: 9,
          isIntermediate: false,
        }
        const base: AssetDelta = {
          mint: 'TokenMint111111111111111111111111111111111',
          symbol: 'TOKEN',
          netDelta: -10000000,
          decimals: 6,
          isIntermediate: false,
        }
        const fees: FeeData = {
          transactionFee: 0,
          priorityFee: 0,
          platformFee: 0,
        }
        const result = normalizer.normalize(quote, base, 'SELL', fees)
        expect(result.swapOutputAmount).toBe(2000000000)
        expect(result.netWalletReceived).toBe(2000000000)
        expect(result.feeBreakdown.totalFeeQuote).toBe(0)
      })
    })
  })
})
