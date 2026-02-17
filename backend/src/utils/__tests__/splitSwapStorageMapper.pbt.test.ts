/**
 * Property-Based Tests for Split Swap Storage Mapper
 * 
 * Feature: split-swap-storage-architecture-fix
 * 
 * Tests verify correctness properties across all possible inputs using fast-check
 */

import fc from 'fast-check'
import {
  mapParserAmountsToStorage,
  isSOLMint,
  mapSOLAmounts,
} from '../splitSwapStorageMapper'
import { ParsedSwap, PRIORITY_ASSETS } from '../shyftParserV2.types'

// ============================================================================
// Arbitraries (Random Data Generators)
// ============================================================================

/**
 * Generate random asset (with option for SOL)
 */
function arbitraryAsset(): fc.Arbitrary<{
  mint: string
  symbol: string
  decimals: number
}> {
  return fc.oneof(
    // SOL asset
    fc.constant({
      mint: PRIORITY_ASSETS.SOL,
      symbol: 'SOL',
      decimals: 9,
    }),
    // WSOL asset (treated as SOL)
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
  ) as fc.Arbitrary<{ mint: string; symbol: string; decimals: number }>
}

/**
 * Generate random amounts
 */
function arbitraryAmounts(): fc.Arbitrary<{
  swapInputAmount?: number
  totalWalletCost?: number
  swapOutputAmount?: number
  netWalletReceived?: number
  baseAmount: number
  feeBreakdown: any
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
      feeBreakdown: fc.constant({}),
    })
    .map((record) => {
      const result: {
        swapInputAmount?: number
        totalWalletCost?: number
        swapOutputAmount?: number
        netWalletReceived?: number
        baseAmount: number
        feeBreakdown: any
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

/**
 * Generate random ParsedSwap
 */
function arbitraryParsedSwap(direction?: 'BUY' | 'SELL'): fc.Arbitrary<ParsedSwap> {
  return fc.record({
    signature: fc.string({ minLength: 64, maxLength: 64 }),
    timestamp: fc.integer({ min: 1000000000, max: 2000000000 }),
    swapper: fc.string({ minLength: 32, maxLength: 44 }),
    direction: direction ? fc.constant(direction) : fc.constantFrom('BUY', 'SELL'),
    quoteAsset: arbitraryAsset(),
    baseAsset: arbitraryAsset(),
    amounts: arbitraryAmounts(),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    protocol: fc.constantFrom('raydium', 'orca', 'jupiter'),
    swapperIdentificationMethod: fc.constantFrom('fee_payer', 'signer', 'owner_analysis'),
    rentRefundsFiltered: fc.double({ min: 0, max: 0.01, noNaN: true }),
    intermediateAssetsCollapsed: fc.array(fc.string()),
  }) as fc.Arbitrary<ParsedSwap>
}

/**
 * Generate ParsedSwap with no SOL involved
 */
function arbitraryNonSOLSwap(): fc.Arbitrary<ParsedSwap> {
  return fc.record({
    signature: fc.string({ minLength: 64, maxLength: 64 }),
    timestamp: fc.integer({ min: 1000000000, max: 2000000000 }),
    swapper: fc.string({ minLength: 32, maxLength: 44 }),
    direction: fc.constantFrom('BUY', 'SELL'),
    quoteAsset: fc.record({
      mint: fc.string({ minLength: 32, maxLength: 44 }).filter((m: string) => m !== PRIORITY_ASSETS.SOL && m !== PRIORITY_ASSETS.WSOL),
      symbol: fc.string({ minLength: 3, maxLength: 10 }).filter((s: string) => s !== 'SOL' && s !== 'WSOL'),
      decimals: fc.constantFrom(6, 8, 9),
    }),
    baseAsset: fc.record({
      mint: fc.string({ minLength: 32, maxLength: 44 }).filter((m: string) => m !== PRIORITY_ASSETS.SOL && m !== PRIORITY_ASSETS.WSOL),
      symbol: fc.string({ minLength: 3, maxLength: 10 }).filter((s: string) => s !== 'SOL' && s !== 'WSOL'),
      decimals: fc.constantFrom(6, 8, 9),
    }),
    amounts: arbitraryAmounts(),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    protocol: fc.constantFrom('raydium', 'orca', 'jupiter'),
    swapperIdentificationMethod: fc.constantFrom('fee_payer', 'signer', 'owner_analysis'),
    rentRefundsFiltered: fc.double({ min: 0, max: 0.01, noNaN: true }),
    intermediateAssetsCollapsed: fc.array(fc.string()),
  }) as fc.Arbitrary<ParsedSwap>
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Split Swap Storage Mapper Property-Based Tests', () => {
  /**
   * Property 2: Actual Token Amounts in Amount Fields
   * 
   * For any ParsedSwap, the mapped amount fields should contain actual token amounts
   * from Parser V2's amounts object (baseAmount, totalWalletCost, or netWalletReceived),
   * never USD-normalized values or price-derived conversions.
   * 
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
   */
  describe('Property 2: Actual Token Amounts in Amount Fields', () => {
    it('should map BUY direction correctly: buyAmount=baseAmount, sellAmount=totalWalletCost', () => {
      fc.assert(
        fc.property(
          arbitraryParsedSwap('BUY'),
          (parsedSwap) => {
            const mapped = mapParserAmountsToStorage(parsedSwap)
            
            // Verify buyAmount is baseAmount
            expect(mapped.amount.buyAmount).toBe(parsedSwap.amounts.baseAmount)
            
            // Verify sellAmount is totalWalletCost (or 0 if not available)
            const expectedSellAmount = parsedSwap.amounts.totalWalletCost ?? 0
            expect(mapped.amount.sellAmount).toBe(expectedSellAmount)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should map SELL direction correctly: buyAmount=netWalletReceived, sellAmount=baseAmount', () => {
      fc.assert(
        fc.property(
          arbitraryParsedSwap('SELL'),
          (parsedSwap) => {
            const mapped = mapParserAmountsToStorage(parsedSwap)
            
            // Verify sellAmount is baseAmount
            expect(mapped.amount.sellAmount).toBe(parsedSwap.amounts.baseAmount)
            
            // Verify buyAmount is netWalletReceived (or 0 if not available)
            const expectedBuyAmount = parsedSwap.amounts.netWalletReceived ?? 0
            expect(mapped.amount.buyAmount).toBe(expectedBuyAmount)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should never contain negative amounts', () => {
      fc.assert(
        fc.property(
          arbitraryParsedSwap(),
          (parsedSwap) => {
            const mapped = mapParserAmountsToStorage(parsedSwap)
            
            // Verify no negative amounts
            expect(mapped.amount.buyAmount).toBeGreaterThanOrEqual(0)
            expect(mapped.amount.sellAmount).toBeGreaterThanOrEqual(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should use 0 for missing optional amounts (not null)', () => {
      fc.assert(
        fc.property(
          arbitraryParsedSwap(),
          (parsedSwap) => {
            const mapped = mapParserAmountsToStorage(parsedSwap)
            
            // Verify amounts are numbers (not null)
            expect(typeof mapped.amount.buyAmount).toBe('number')
            expect(typeof mapped.amount.sellAmount).toBe('number')
            
            // Verify 0 is used when optional fields are missing
            if (parsedSwap.direction === 'BUY' && !parsedSwap.amounts.totalWalletCost) {
              expect(mapped.amount.sellAmount).toBe(0)
            }
            if (parsedSwap.direction === 'SELL' && !parsedSwap.amounts.netWalletReceived) {
              expect(mapped.amount.buyAmount).toBe(0)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 3: SOL Amount Population Only When SOL Involved
   * 
   * For any ParsedSwap, if the swap involves SOL or WSOL (as either quote or base asset),
   * the corresponding solAmount fields should contain the actual SOL delta from Parser V2;
   * otherwise, both buySolAmount and sellSolAmount should be null.
   * 
   * **Validates: Requirements 2.1, 2.2, 2.3**
   */
  describe('Property 3: SOL Amount Population Only When SOL Involved', () => {
    it('should set SOL amounts to null when no SOL is involved', () => {
      fc.assert(
        fc.property(
          arbitraryNonSOLSwap(),
          (parsedSwap) => {
            const mapped = mapSOLAmounts(parsedSwap)
            
            // Verify both SOL fields are null
            expect(mapped.buySolAmount).toBeNull()
            expect(mapped.sellSolAmount).toBeNull()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should populate SOL amounts when SOL is involved', () => {
      fc.assert(
        fc.property(
          arbitraryParsedSwap(),
          (parsedSwap) => {
            const isQuoteSOL = isSOLMint(parsedSwap.quoteAsset.mint)
            const isBaseSOL = isSOLMint(parsedSwap.baseAsset.mint)
            
            const mapped = mapSOLAmounts(parsedSwap)
            
            if (!isQuoteSOL && !isBaseSOL) {
              // No SOL involved - both should be null
              expect(mapped.buySolAmount).toBeNull()
              expect(mapped.sellSolAmount).toBeNull()
            } else {
              // SOL involved - check that the correct field is populated or null based on availability
              if (parsedSwap.direction === 'BUY') {
                if (isBaseSOL) {
                  // Bought SOL - buySolAmount should be baseAmount
                  expect(mapped.buySolAmount).toBe(parsedSwap.amounts.baseAmount)
                }
                if (isQuoteSOL) {
                  // Spent SOL - sellSolAmount should be totalWalletCost or null
                  expect(mapped.sellSolAmount).toBe(parsedSwap.amounts.totalWalletCost ?? null)
                }
              } else {
                if (isQuoteSOL) {
                  // Received SOL - buySolAmount should be netWalletReceived or null
                  expect(mapped.buySolAmount).toBe(parsedSwap.amounts.netWalletReceived ?? null)
                }
                if (isBaseSOL) {
                  // Sold SOL - sellSolAmount should be baseAmount
                  expect(mapped.sellSolAmount).toBe(parsedSwap.amounts.baseAmount)
                }
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should correctly identify SOL and WSOL mints', () => {
      // Test SOL mint
      expect(isSOLMint(PRIORITY_ASSETS.SOL)).toBe(true)
      
      // Test WSOL mint
      expect(isSOLMint(PRIORITY_ASSETS.WSOL)).toBe(true)
      
      // Test non-SOL mints
      fc.assert(
        fc.property(
          fc.string({ minLength: 32, maxLength: 44 }).filter(
            (m: string) => m !== PRIORITY_ASSETS.SOL && m !== PRIORITY_ASSETS.WSOL
          ),
          (mint: string) => {
            expect(isSOLMint(mint)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should map SOL amounts correctly for BUY direction', () => {
      fc.assert(
        fc.property(
          arbitraryParsedSwap('BUY'),
          (parsedSwap) => {
            const isQuoteSOL = isSOLMint(parsedSwap.quoteAsset.mint)
            const isBaseSOL = isSOLMint(parsedSwap.baseAsset.mint)
            
            const mapped = mapSOLAmounts(parsedSwap)
            
            if (isBaseSOL) {
              // Bought SOL - buySolAmount should be baseAmount
              expect(mapped.buySolAmount).toBe(parsedSwap.amounts.baseAmount)
            } else {
              // Did not buy SOL - buySolAmount should be null
              expect(mapped.buySolAmount).toBeNull()
            }
            
            if (isQuoteSOL) {
              // Spent SOL - sellSolAmount should be totalWalletCost
              expect(mapped.sellSolAmount).toBe(parsedSwap.amounts.totalWalletCost ?? null)
            } else {
              // Did not spend SOL - sellSolAmount should be null
              expect(mapped.sellSolAmount).toBeNull()
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should map SOL amounts correctly for SELL direction', () => {
      fc.assert(
        fc.property(
          arbitraryParsedSwap('SELL'),
          (parsedSwap) => {
            const isQuoteSOL = isSOLMint(parsedSwap.quoteAsset.mint)
            const isBaseSOL = isSOLMint(parsedSwap.baseAsset.mint)
            
            const mapped = mapSOLAmounts(parsedSwap)
            
            if (isQuoteSOL) {
              // Received SOL - buySolAmount should be netWalletReceived
              expect(mapped.buySolAmount).toBe(parsedSwap.amounts.netWalletReceived ?? null)
            } else {
              // Did not receive SOL - buySolAmount should be null
              expect(mapped.buySolAmount).toBeNull()
            }
            
            if (isBaseSOL) {
              // Sold SOL - sellSolAmount should be baseAmount
              expect(mapped.sellSolAmount).toBe(parsedSwap.amounts.baseAmount)
            } else {
              // Did not sell SOL - sellSolAmount should be null
              expect(mapped.sellSolAmount).toBeNull()
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Task 9: mapParserAmountsToStorage no longer returns solAmount.
   * SOL amounts are computed in storeTransactionInDB via mapSOLAmounts with USD/SOL price.
   */
})
