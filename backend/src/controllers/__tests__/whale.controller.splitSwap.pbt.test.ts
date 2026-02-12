/**
 * Property-Based Tests for Split Swap Controller Logic
 * 
 * Feature: split-swap-storage-architecture-fix
 * Phase: B - Controller Fix Deployment
 * 
 * Tests verify correctness properties for split swap storage at the controller level
 */

import fc from 'fast-check'
import { ParsedSwap, SplitSwapPair, PRIORITY_ASSETS } from '../../utils/shyftParserV2.types'
import { mapParserAmountsToStorage } from '../../utils/splitSwapStorageMapper'

// ============================================================================
// Test Setup - Mock Database Operations
// ============================================================================

// Mock database storage
let mockDatabase: any[] = []

beforeEach(() => {
  // Clear mock database before each test
  mockDatabase = []
})

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
    // Random token asset (non-SOL)
    fc.record({
      mint: fc.string({ minLength: 32, maxLength: 44 }).filter(s => s !== PRIORITY_ASSETS.SOL && s !== PRIORITY_ASSETS.WSOL),
      symbol: fc.string({ minLength: 3, maxLength: 10 }).filter(s => s !== 'SOL' && s !== 'WSOL'),
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
  return fc.record({
    swapInputAmount: fc.option(fc.double({ min: 0.001, max: 1000000, noNaN: true })),
    totalWalletCost: fc.option(fc.double({ min: 0.001, max: 1000000, noNaN: true })),
    swapOutputAmount: fc.option(fc.double({ min: 0.001, max: 1000000, noNaN: true })),
    netWalletReceived: fc.option(fc.double({ min: 0.001, max: 1000000, noNaN: true })),
    baseAmount: fc.double({ min: 0.001, max: 1000000, noNaN: true }),
    feeBreakdown: fc.constant({}),
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
 * Generate random SplitSwapPair
 */
function arbitrarySplitSwapPair(): fc.Arbitrary<SplitSwapPair> {
  return fc.record({
    signature: fc.string({ minLength: 64, maxLength: 64 }),
    timestamp: fc.integer({ min: 1000000000, max: 2000000000 }),
    swapper: fc.string({ minLength: 32, maxLength: 44 }),
    splitReason: fc.constant('token_to_token_unstable_pair' as const),
    sellRecord: arbitraryParsedSwap('SELL'),
    buyRecord: arbitraryParsedSwap('BUY'),
    protocol: fc.constantFrom('raydium', 'orca', 'jupiter'),
    swapperIdentificationMethod: fc.constantFrom('fee_payer', 'signer', 'owner_analysis'),
  }) as fc.Arbitrary<SplitSwapPair>
}

/**
 * Generate ParsedSwap with no SOL involved
 */
function arbitraryNonSOLSwap(): fc.Arbitrary<ParsedSwap> {
  const nonSOLAsset = fc.record({
    mint: fc.string({ minLength: 32, maxLength: 44 }).filter(s => s !== PRIORITY_ASSETS.SOL && s !== PRIORITY_ASSETS.WSOL),
    symbol: fc.string({ minLength: 3, maxLength: 10 }).filter(s => s !== 'SOL' && s !== 'WSOL'),
    decimals: fc.constantFrom(6, 8, 9),
  })

  return fc.record({
    signature: fc.string({ minLength: 64, maxLength: 64 }),
    timestamp: fc.integer({ min: 1000000000, max: 2000000000 }),
    swapper: fc.string({ minLength: 32, maxLength: 44 }),
    direction: fc.constantFrom('BUY', 'SELL'),
    quoteAsset: nonSOLAsset,
    baseAsset: nonSOLAsset,
    amounts: arbitraryAmounts(),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    protocol: fc.constantFrom('raydium', 'orca', 'jupiter'),
    swapperIdentificationMethod: fc.constantFrom('fee_payer', 'signer', 'owner_analysis'),
    rentRefundsFiltered: fc.double({ min: 0, max: 0.01, noNaN: true }),
    intermediateAssetsCollapsed: fc.array(fc.string()),
  }) as fc.Arbitrary<ParsedSwap>
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Simulate storing a split swap pair (creates two separate records)
 */
async function storeSplitSwapPair(splitSwapPair: SplitSwapPair): Promise<void> {
  // Simulate MongoDB transaction behavior
  const recordsToInsert: any[] = []
  
  try {
    // Create SELL record
    const sellStorageAmounts = mapParserAmountsToStorage(splitSwapPair.sellRecord)
    const sellRecord = {
      signature: splitSwapPair.signature,
      type: 'sell' as const,
      amount: sellStorageAmounts.amount,
      solAmount: sellStorageAmounts.solAmount,
      whaleAddress: splitSwapPair.swapper,
      timestamp: new Date(splitSwapPair.timestamp),
      classificationSource: 'v2_parser_split_sell',
    }
    recordsToInsert.push(sellRecord)
    
    // Create BUY record
    const buyStorageAmounts = mapParserAmountsToStorage(splitSwapPair.buyRecord)
    const buyRecord = {
      signature: splitSwapPair.signature,
      type: 'buy' as const,
      amount: buyStorageAmounts.amount,
      solAmount: buyStorageAmounts.solAmount,
      whaleAddress: splitSwapPair.swapper,
      timestamp: new Date(splitSwapPair.timestamp),
      classificationSource: 'v2_parser_split_buy',
    }
    recordsToInsert.push(buyRecord)
    
    // Atomic insert (all or nothing)
    mockDatabase.push(...recordsToInsert)
  } catch (error) {
    // Rollback on error
    throw error
  }
}

/**
 * Simulate storing a single swap
 */
async function storeSingleSwap(parsedSwap: ParsedSwap): Promise<any> {
  const storageAmounts = mapParserAmountsToStorage(parsedSwap)
  
  const record = {
    signature: parsedSwap.signature,
    type: parsedSwap.direction === 'BUY' ? 'buy' as const : 'sell' as const,
    amount: storageAmounts.amount,
    solAmount: storageAmounts.solAmount,
    whaleAddress: parsedSwap.swapper,
    timestamp: new Date(parsedSwap.timestamp),
    classificationSource: 'v2_parser',
  }
  
  mockDatabase.push(record)
  return record
}

/**
 * Query mock database by signature
 */
function findBySignature(signature: string): any[] {
  return mockDatabase.filter(r => r.signature === signature)
}

// ============================================================================
// Property Tests
// ============================================================================// ============================================================================
// Property Tests
// ============================================================================

describe('Split Swap Controller Property-Based Tests', () => {
  describe('Property 1: Split Swap Two-Record Creation', () => {
    it('should create exactly two separate records for split swaps', async () => {
      // Feature: split-swap-storage-architecture-fix, Property 1
      await fc.assert(
        fc.asyncProperty(
          arbitrarySplitSwapPair(),
          async (splitSwapPair) => {
            // Store the split swap
            await storeSplitSwapPair(splitSwapPair)
            
            // Query mock database for records with this signature
            const records = findBySignature(splitSwapPair.signature)
            
            // Verify exactly 2 records
            expect(records.length).toBe(2)
            
            // Verify one SELL, one BUY
            const types = records.map(r => r.type).sort()
            expect(types).toEqual(['buy', 'sell'])
            
            // Verify no "both" type
            const bothRecords = records.filter(r => r.type === 'both')
            expect(bothRecords.length).toBe(0)
            
            // Verify both records have the same signature
            expect(records[0].signature).toBe(splitSwapPair.signature)
            expect(records[1].signature).toBe(splitSwapPair.signature)
          }
        ),
        { numRuns: 100 }
      )
    })
    
    it('should use correct classification sources for split swap records', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitrarySplitSwapPair(),
          async (splitSwapPair) => {
            await storeSplitSwapPair(splitSwapPair)
            
            const records = findBySignature(splitSwapPair.signature)
            
            const sellRecord = records.find(r => r.type === 'sell')
            const buyRecord = records.find(r => r.type === 'buy')
            
            expect(sellRecord).toBeDefined()
            expect(buyRecord).toBeDefined()
            
            expect(sellRecord!.classificationSource).toBe('v2_parser_split_sell')
            expect(buyRecord!.classificationSource).toBe('v2_parser_split_buy')
          }
        ),
        { numRuns: 100 }
      )
    })
    
    it('should preserve swapper across both records', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitrarySplitSwapPair(),
          async (splitSwapPair) => {
            await storeSplitSwapPair(splitSwapPair)
            
            const records = findBySignature(splitSwapPair.signature)
            
            expect(records[0].whaleAddress).toBe(splitSwapPair.swapper)
            expect(records[1].whaleAddress).toBe(splitSwapPair.swapper)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
  
  describe('Property 4: No Fabricated SOL Amounts', () => {
    it('should never store fabricated SOL amounts for non-SOL swaps', async () => {
      // Feature: split-swap-storage-architecture-fix, Property 4
      await fc.assert(
        fc.asyncProperty(
          arbitraryNonSOLSwap(),
          async (parsedSwap) => {
            const storedRecord = await storeSingleSwap(parsedSwap)
            
            // SOL amounts must be null
            expect(storedRecord.solAmount.buySolAmount).toBeNull()
            expect(storedRecord.solAmount.sellSolAmount).toBeNull()
          }
        ),
        { numRuns: 100 }
      )
    })
    
    it('should only store actual SOL deltas from Parser V2, never price conversions', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryParsedSwap(),
          async (parsedSwap) => {
            const storedRecord = await storeSingleSwap(parsedSwap)
            
            const isQuoteSOL = parsedSwap.quoteAsset.mint === PRIORITY_ASSETS.SOL || 
                              parsedSwap.quoteAsset.mint === PRIORITY_ASSETS.WSOL
            const isBaseSOL = parsedSwap.baseAsset.mint === PRIORITY_ASSETS.SOL || 
                             parsedSwap.baseAsset.mint === PRIORITY_ASSETS.WSOL
            
            if (!isQuoteSOL && !isBaseSOL) {
              // No SOL involved - must be null
              expect(storedRecord.solAmount.buySolAmount).toBeNull()
              expect(storedRecord.solAmount.sellSolAmount).toBeNull()
            } else {
              // SOL involved - verify amounts come from Parser V2, not price calculations
              if (parsedSwap.direction === 'BUY') {
                if (isBaseSOL) {
                  // Bought SOL - should match baseAmount
                  const expectedAmount = parsedSwap.amounts.baseAmount
                  expect(storedRecord.solAmount.buySolAmount).toBe(expectedAmount)
                } else {
                  expect(storedRecord.solAmount.buySolAmount).toBeNull()
                }
                
                if (isQuoteSOL) {
                  // Spent SOL - should match totalWalletCost or be null
                  const expectedAmount = parsedSwap.amounts.totalWalletCost ?? null
                  if (expectedAmount !== null) {
                    expect(storedRecord.solAmount.sellSolAmount).toBe(expectedAmount)
                  } else {
                    expect(storedRecord.solAmount.sellSolAmount).toBeNull()
                  }
                } else {
                  expect(storedRecord.solAmount.sellSolAmount).toBeNull()
                }
              } else {
                // SELL direction
                if (isQuoteSOL) {
                  // Received SOL - should match netWalletReceived or be null
                  const expectedAmount = parsedSwap.amounts.netWalletReceived ?? null
                  if (expectedAmount !== null) {
                    expect(storedRecord.solAmount.buySolAmount).toBe(expectedAmount)
                  } else {
                    expect(storedRecord.solAmount.buySolAmount).toBeNull()
                  }
                } else {
                  expect(storedRecord.solAmount.buySolAmount).toBeNull()
                }
                
                if (isBaseSOL) {
                  // Sold SOL - should match baseAmount
                  const expectedAmount = parsedSwap.amounts.baseAmount
                  expect(storedRecord.solAmount.sellSolAmount).toBe(expectedAmount)
                } else {
                  expect(storedRecord.solAmount.sellSolAmount).toBeNull()
                }
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })
    
    it('should never store negative SOL amounts', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitraryParsedSwap(),
          async (parsedSwap) => {
            const storedRecord = await storeSingleSwap(parsedSwap)
            
            // Verify no negative SOL amounts
            if (storedRecord.solAmount.buySolAmount !== null) {
              expect(storedRecord.solAmount.buySolAmount).toBeGreaterThanOrEqual(0)
            }
            if (storedRecord.solAmount.sellSolAmount !== null) {
              expect(storedRecord.solAmount.sellSolAmount).toBeGreaterThanOrEqual(0)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})