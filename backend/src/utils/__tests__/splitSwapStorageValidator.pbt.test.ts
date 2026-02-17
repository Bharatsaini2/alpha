/**
 * Property-Based Tests for Storage Validation
 * 
 * Property 5: Valuation Data Architectural Separation
 * 
 * For any stored swap record, USD valuations and SOL-equivalent valuations 
 * should be stored in transaction.tokenIn.usdAmount and transaction.tokenOut.usdAmount 
 * fields, never in amount.buyAmount, amount.sellAmount, solAmount.buySolAmount, 
 * or solAmount.sellSolAmount fields.
 * 
 * Validates: Requirements 1.5, 2.5
 * Task: Phase A, Task 3.5
 */

import fc from 'fast-check'
import { ParsedSwap, PRIORITY_ASSETS } from '../shyftParserV2.types'
import { mapParserAmountsToStorage, mapSOLAmounts } from '../splitSwapStorageMapper'

describe('Property 5: Valuation Data Architectural Separation', () => {
  // Feature: split-swap-storage-architecture-fix, Property 5
  
  it('should never store USD values in amount fields', () => {
    fc.assert(
      fc.property(
        arbitraryParsedSwap(),
        (parsedSwap) => {
          // Map Parser V2 to storage
          const storageAmounts = mapParserAmountsToStorage(parsedSwap)
          
          // Amount fields should contain actual token amounts
          // These should be >= 0 and typically much larger than USD values for non-stablecoins
          // We verify they match Parser V2 amounts, not USD conversions
          
          const { direction, amounts } = parsedSwap
          
          if (direction === 'BUY') {
            // buyAmount should be baseAmount (actual tokens bought)
            expect(storageAmounts.amount.buyAmount).toBe(amounts.baseAmount)
            
            // sellAmount should be totalWalletCost (actual amount spent)
            expect(storageAmounts.amount.sellAmount).toBe(amounts.totalWalletCost ?? 0)
          } else {
            // buyAmount should be netWalletReceived (actual amount received)
            expect(storageAmounts.amount.buyAmount).toBe(amounts.netWalletReceived ?? 0)
            
            // sellAmount should be baseAmount (actual tokens sold)
            expect(storageAmounts.amount.sellAmount).toBe(amounts.baseAmount)
          }
          
          // Verify amounts are actual token amounts, not USD values
          // Token amounts should match Parser V2 exactly
          expect(storageAmounts.amount.buyAmount).toBeGreaterThanOrEqual(0)
          expect(storageAmounts.amount.sellAmount).toBeGreaterThanOrEqual(0)
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should never store price-derived values in SOL amount fields', () => {
    fc.assert(
      fc.property(
        arbitraryParsedSwap(),
        (parsedSwap) => {
          // Task 9: SOL amounts come from mapSOLAmounts (called in storeTransactionInDB with USD/SOL price)
          const solAmounts = mapSOLAmounts(parsedSwap)

          const { direction, amounts, quoteAsset, baseAsset } = parsedSwap

          const isQuoteSOL = quoteAsset.mint === PRIORITY_ASSETS.SOL || quoteAsset.mint === PRIORITY_ASSETS.WSOL
          const isBaseSOL = baseAsset.mint === PRIORITY_ASSETS.SOL || baseAsset.mint === PRIORITY_ASSETS.WSOL

          if (!isQuoteSOL && !isBaseSOL) {
            expect(solAmounts.buySolAmount).toBeNull()
            expect(solAmounts.sellSolAmount).toBeNull()
          } else {
            if (direction === 'BUY') {
              if (isBaseSOL) {
                expect(solAmounts.buySolAmount).toBe(amounts.baseAmount)
              } else {
                expect(solAmounts.buySolAmount).toBeNull()
              }
              if (isQuoteSOL) {
                expect(solAmounts.sellSolAmount).toBe(amounts.totalWalletCost ?? null)
              } else {
                expect(solAmounts.sellSolAmount).toBeNull()
              }
            } else {
              if (isQuoteSOL) {
                expect(solAmounts.buySolAmount).toBe(amounts.netWalletReceived ?? null)
              } else {
                expect(solAmounts.buySolAmount).toBeNull()
              }
              if (isBaseSOL) {
                expect(solAmounts.sellSolAmount).toBe(amounts.baseAmount)
              } else {
                expect(solAmounts.sellSolAmount).toBeNull()
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should maintain separation between on-chain amounts and valuations', () => {
    fc.assert(
      fc.property(
        arbitraryParsedSwap(),
        (parsedSwap) => {
          // Map Parser V2 to storage
          const storageAmounts = mapParserAmountsToStorage(parsedSwap)
          
          // ✅ Test structural invariant: amount fields must equal Parser V2 amounts
          // NOT price-derived transformations
          // We cannot test "not equal USD" because equality can happen by coincidence
          // (e.g., 1 token at $1 price = $1 USD value)
          
          if (parsedSwap.direction === 'BUY') {
            // buyAmount should be baseAmount from Parser V2 (sanitized)
            const expectedBuyAmount = safeNumeric(parsedSwap.amounts.baseAmount)
            expect(storageAmounts.amount.buyAmount).toBe(expectedBuyAmount)
            
            // sellAmount should be totalWalletCost from Parser V2 (sanitized)
            const expectedSellAmount = safeNumeric(parsedSwap.amounts.totalWalletCost)
            expect(storageAmounts.amount.sellAmount).toBe(expectedSellAmount)
          } else {
            // buyAmount should be netWalletReceived from Parser V2 (sanitized)
            const expectedBuyAmount = safeNumeric(parsedSwap.amounts.netWalletReceived)
            expect(storageAmounts.amount.buyAmount).toBe(expectedBuyAmount)
            
            // sellAmount should be baseAmount from Parser V2 (sanitized)
            const expectedSellAmount = safeNumeric(parsedSwap.amounts.baseAmount)
            expect(storageAmounts.amount.sellAmount).toBe(expectedSellAmount)
          }
          
          // ✅ Verify no price-derived transformation was applied
          // This is tested by checking exact equality with Parser V2 amounts
          // If price transformation was applied, values would differ
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Helper function for tests (matches mapper implementation)
function safeNumeric(value?: number | null): number {
  if (typeof value === 'number' && !isNaN(value) && value >= 0) {
    return value
  }
  return 0
}

// Arbitraries for property testing

function arbitraryParsedSwap(): fc.Arbitrary<ParsedSwap> {
  return fc.record({
    signature: fc.string({ minLength: 64, maxLength: 64 }),
    timestamp: fc.integer({ min: 1000000000, max: 2000000000 }),
    swapper: fc.string({ minLength: 32, maxLength: 44 }),
    direction: fc.constantFrom('BUY' as const, 'SELL' as const),
    quoteAsset: arbitraryAsset(),
    baseAsset: arbitraryAsset(),
    amounts: arbitraryAmounts(),
    confidence: fc.double({ min: 0, max: 1 }),
    protocol: fc.constantFrom('raydium', 'orca', 'jupiter', 'pump.fun'),
    swapperIdentificationMethod: fc.constantFrom('fee_payer', 'signer', 'owner_analysis'),
    rentRefundsFiltered: fc.double({ min: 0, max: 0.01 }),
    intermediateAssetsCollapsed: fc.array(fc.string({ minLength: 32, maxLength: 44 })),
  })
}

function arbitraryAsset(): fc.Arbitrary<{ mint: string; symbol: string; decimals: number }> {
  return fc.oneof(
    // SOL asset
    fc.constant({
      mint: PRIORITY_ASSETS.SOL,
      symbol: 'SOL',
      decimals: 9,
    }),
    // WSOL asset
    fc.constant({
      mint: PRIORITY_ASSETS.WSOL,
      symbol: 'WSOL',
      decimals: 9,
    }),
    // Random token asset
    fc.record({
      mint: fc.string({ minLength: 32, maxLength: 44 }),
      symbol: fc.string({ minLength: 3, maxLength: 10 }),
      decimals: fc.constantFrom(6, 8, 9),
    })
  )
}

function arbitraryAmounts(): fc.Arbitrary<{
  swapInputAmount?: number
  totalWalletCost?: number
  swapOutputAmount?: number
  netWalletReceived?: number
  baseAmount: number
  feeBreakdown: {
    transactionFeeSOL: number
    transactionFeeQuote: number
    platformFee: number
    priorityFee: number
    totalFeeQuote: number
  }
}> {
  const optionalNumber = fc.option(
    fc.double({ min: 0.001, max: 1000000, noNaN: true }),
    { nil: undefined },
  )

  return fc
    .record({
      swapInputAmount: optionalNumber,
      totalWalletCost: optionalNumber,
      swapOutputAmount: optionalNumber,
      netWalletReceived: optionalNumber,
      baseAmount: fc.double({ min: 0.001, max: 1000000, noNaN: true }),
      feeBreakdown: fc.record({
        transactionFeeSOL: fc.double({ min: 0, max: 0.01, noNaN: true }),
        transactionFeeQuote: fc.double({ min: 0, max: 10, noNaN: true }),
        platformFee: fc.double({ min: 0, max: 5, noNaN: true }),
        priorityFee: fc.double({ min: 0, max: 0.01, noNaN: true }),
        totalFeeQuote: fc.double({ min: 0, max: 15, noNaN: true }),
      }),
    })
    .map((record) => {
      const result: {
        swapInputAmount?: number
        totalWalletCost?: number
        swapOutputAmount?: number
        netWalletReceived?: number
        baseAmount: number
        feeBreakdown: {
          transactionFeeSOL: number
          transactionFeeQuote: number
          platformFee: number
          priorityFee: number
          totalFeeQuote: number
        }
      } = {
        baseAmount: record.baseAmount,
        feeBreakdown: record.feeBreakdown,
      }

      if (record.swapInputAmount !== undefined) {
        result.swapInputAmount = record.swapInputAmount
      }
      if (record.totalWalletCost !== undefined) {
        result.totalWalletCost = record.totalWalletCost
      }
      if (record.swapOutputAmount !== undefined) {
        result.swapOutputAmount = record.swapOutputAmount
      }
      if (record.netWalletReceived !== undefined) {
        result.netWalletReceived = record.netWalletReceived
      }

      return result
    })
}
