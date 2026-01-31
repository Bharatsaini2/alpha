/**
 * SHYFT Parser V2 - Setup and Interface Tests
 * 
 * This test file verifies that:
 * 1. All v2 interfaces are properly defined
 * 2. fast-check library is correctly installed and working
 * 3. Test data generators (arbitraries) produce valid data
 * 
 * Task 1: Set up enhanced parser structure and interfaces
 * Requirements: 7.2, 7.3, 7.4, 8.1
 */

import * as fc from 'fast-check'
import {
  TokenBalanceChange,
  AssetDelta,
  AssetDeltaMap,
  FeeData,
  FilteredBalanceChanges,
  SwapperResult,
  QuoteBaseResult,
  ValidationResult,
  NormalizedAmounts,
  ParsedSwap,
  SplitSwapPair,
  EraseResult,
  ParserResult,
  PRIORITY_ASSETS,
  EPSILON,
  RENT_NOISE_THRESHOLD_SOL,
  KNOWN_AMM_POOLS,
  isParsedSwap,
  isSplitSwapPair,
  isEraseResult,
} from '../shyftParserV2.types'

import {
  solanaAddressArbitrary,
  tokenMintArbitrary,
  tokenSymbolArbitrary,
  tokenDecimalsArbitrary,
  signatureArbitrary,
  timestampArbitrary,
  tokenBalanceChangeArbitrary,
  tokenBalanceChangesForOwnerArbitrary,
  rentNoiseTransactionArbitrary,
  swapTransactionArbitrary,
  multiHopTransactionArbitrary,
  relayerTransactionArbitrary,
  assetDeltaArbitrary,
  twoAssetDeltaMapArbitrary,
  multiHopAssetDeltaMapArbitrary,
  feeDataArbitrary,
  bothPositiveEraseArbitrary,
  bothNegativeEraseArbitrary,
  createTokenBalanceChange,
  createAssetDelta,
} from './shyftParserV2.arbitraries'

describe('SHYFT Parser V2 - Setup and Interfaces', () => {
  describe('Task 1.1: TypeScript interfaces are properly defined', () => {
    it('should have all core data type interfaces', () => {
      // Verify interfaces exist by creating sample objects
      const tokenBalanceChange: TokenBalanceChange = {
        address: 'test-address',
        decimals: 9,
        change_amount: 1000000000,
        post_balance: 1000000000,
        pre_balance: 0,
        mint: PRIORITY_ASSETS.SOL,
        owner: 'test-owner',
      }
      expect(tokenBalanceChange).toBeDefined()

      const assetDelta: AssetDelta = {
        mint: PRIORITY_ASSETS.SOL,
        symbol: 'SOL',
        netDelta: 1000000000,
        decimals: 9,
        isIntermediate: false,
      }
      expect(assetDelta).toBeDefined()

      const feeData: FeeData = {
        transactionFee: 0.000005,
        platformFee: 1000,
        priorityFee: 0.00001,
      }
      expect(feeData).toBeDefined()
    })

    it('should have all component interfaces', () => {
      // Verify component result interfaces
      const filteredBalanceChanges: FilteredBalanceChanges = {
        economicChanges: [],
        rentRefunds: [],
      }
      expect(filteredBalanceChanges).toBeDefined()

      const swapperResult: SwapperResult = {
        swapper: 'test-swapper',
        confidence: 'high',
        method: 'fee_payer',
      }
      expect(swapperResult).toBeDefined()

      const quoteBaseResult: QuoteBaseResult = {
        quote: null,
        base: null,
        direction: null,
        eraseReason: 'test',
      }
      expect(quoteBaseResult).toBeDefined()

      const validationResult: ValidationResult = {
        isValid: true,
      }
      expect(validationResult).toBeDefined()

      const normalizedAmounts: NormalizedAmounts = {
        baseAmount: 1000,
        feeBreakdown: {
          transactionFeeSOL: 0.000005,
          transactionFeeQuote: 0.01,
          platformFee: 0,
          priorityFee: 0,
          totalFeeQuote: 0.01,
        },
      }
      expect(normalizedAmounts).toBeDefined()
    })

    it('should have all output schema interfaces', () => {
      const parsedSwap: ParsedSwap = {
        signature: 'test-sig',
        timestamp: 1234567890,
        swapper: 'test-swapper',
        direction: 'BUY',
        quoteAsset: {
          mint: PRIORITY_ASSETS.SOL,
          symbol: 'SOL',
          decimals: 9,
        },
        baseAsset: {
          mint: 'test-token',
          symbol: 'TEST',
          decimals: 6,
        },
        amounts: {
          swapInputAmount: 1.0,
          totalWalletCost: 1.01,
          baseAmount: 1000,
          feeBreakdown: {
            transactionFeeSOL: 0.000005,
            transactionFeeQuote: 0.01,
            platformFee: 0,
            priorityFee: 0,
            totalFeeQuote: 0.01,
          },
        },
        confidence: 85,
        protocol: 'Jupiter',
        swapperIdentificationMethod: 'fee_payer',
        rentRefundsFiltered: 0,
        intermediateAssetsCollapsed: [],
      }
      expect(parsedSwap).toBeDefined()

      const splitSwapPair: SplitSwapPair = {
        signature: 'test-sig',
        timestamp: 1234567890,
        swapper: 'test-swapper',
        splitReason: 'token_to_token_unstable_pair',
        sellRecord: parsedSwap,
        buyRecord: { ...parsedSwap, direction: 'BUY' },
        protocol: 'Jupiter',
        swapperIdentificationMethod: 'fee_payer',
      }
      expect(splitSwapPair).toBeDefined()

      const eraseResult: EraseResult = {
        signature: 'test-sig',
        timestamp: 1234567890,
        reason: 'both_positive_airdrop',
        debugInfo: {
          feePayer: 'test-payer',
          signers: ['test-signer'],
          assetDeltas: {},
        },
      }
      expect(eraseResult).toBeDefined()

      const parserResult: ParserResult = {
        success: true,
        data: parsedSwap,
        processingTimeMs: 50,
      }
      expect(parserResult).toBeDefined()
    })

    it('should have all constants defined', () => {
      expect(PRIORITY_ASSETS.SOL).toBe('So11111111111111111111111111111111111111112')
      expect(PRIORITY_ASSETS.USDC).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
      expect(PRIORITY_ASSETS.USDT).toBe('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB')
      expect(EPSILON).toBe(1e-9)
      expect(RENT_NOISE_THRESHOLD_SOL).toBe(0.01)
      expect(KNOWN_AMM_POOLS.size).toBeGreaterThan(0)
    })

    it('should have type guard functions', () => {
      const parsedSwap: ParsedSwap = {
        signature: 'test-sig',
        timestamp: 1234567890,
        swapper: 'test-swapper',
        direction: 'BUY',
        quoteAsset: {
          mint: PRIORITY_ASSETS.SOL,
          symbol: 'SOL',
          decimals: 9,
        },
        baseAsset: {
          mint: 'test-token',
          symbol: 'TEST',
          decimals: 6,
        },
        amounts: {
          baseAmount: 1000,
          feeBreakdown: {
            transactionFeeSOL: 0.000005,
            transactionFeeQuote: 0.01,
            platformFee: 0,
            priorityFee: 0,
            totalFeeQuote: 0.01,
          },
        },
        confidence: 85,
        protocol: 'Jupiter',
        swapperIdentificationMethod: 'fee_payer',
        rentRefundsFiltered: 0,
        intermediateAssetsCollapsed: [],
      }

      const eraseResult: EraseResult = {
        signature: 'test-sig',
        timestamp: 1234567890,
        reason: 'both_positive_airdrop',
        debugInfo: {
          feePayer: 'test-payer',
          signers: ['test-signer'],
          assetDeltas: {},
        },
      }

      expect(isParsedSwap(parsedSwap)).toBe(true)
      expect(isParsedSwap(eraseResult)).toBe(false)
      expect(isEraseResult(eraseResult)).toBe(true)
      expect(isEraseResult(parsedSwap)).toBe(false)
    })
  })

  describe('Task 1.2: fast-check library is installed and working', () => {
    it('should generate random integers', () => {
      fc.assert(
        fc.property(fc.integer(), (n) => {
          expect(typeof n).toBe('number')
          expect(Number.isInteger(n)).toBe(true)
        }),
        { numRuns: 10 }
      )
    })

    it('should generate random strings', () => {
      fc.assert(
        fc.property(fc.string(), (s) => {
          expect(typeof s).toBe('string')
        }),
        { numRuns: 10 }
      )
    })

    it('should generate random arrays', () => {
      fc.assert(
        fc.property(fc.array(fc.integer()), (arr) => {
          expect(Array.isArray(arr)).toBe(true)
        }),
        { numRuns: 10 }
      )
    })

    it('should generate random records', () => {
      fc.assert(
        fc.property(
          fc.record({
            name: fc.string(),
            age: fc.integer({ min: 0, max: 100 }),
          }),
          (record) => {
            expect(typeof record.name).toBe('string')
            expect(typeof record.age).toBe('number')
            expect(record.age).toBeGreaterThanOrEqual(0)
            expect(record.age).toBeLessThanOrEqual(100)
          }
        ),
        { numRuns: 10 }
      )
    })
  })

  describe('Task 1.3: Test data generators (arbitraries) produce valid data', () => {
    it('should generate valid Solana addresses', () => {
      fc.assert(
        fc.property(solanaAddressArbitrary, (address) => {
          expect(typeof address).toBe('string')
          expect(address.length).toBeGreaterThanOrEqual(32)
          expect(address.length).toBeLessThanOrEqual(44)
          // Base58 characters only
          expect(address).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/)
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid token mints', () => {
      fc.assert(
        fc.property(tokenMintArbitrary, (mint) => {
          expect(typeof mint).toBe('string')
          expect(mint.length).toBeGreaterThan(0)
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid token symbols', () => {
      fc.assert(
        fc.property(tokenSymbolArbitrary, (symbol) => {
          expect(typeof symbol).toBe('string')
          expect(symbol.length).toBeGreaterThanOrEqual(3)
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid token decimals', () => {
      fc.assert(
        fc.property(tokenDecimalsArbitrary, (decimals) => {
          expect(typeof decimals).toBe('number')
          expect(Number.isInteger(decimals)).toBe(true)
          expect(decimals).toBeGreaterThanOrEqual(0)
          expect(decimals).toBeLessThanOrEqual(18)
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid transaction signatures', () => {
      fc.assert(
        fc.property(signatureArbitrary, (signature) => {
          expect(typeof signature).toBe('string')
          expect(signature.length).toBeGreaterThanOrEqual(64)
          expect(signature.length).toBeLessThanOrEqual(88)
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid timestamps', () => {
      fc.assert(
        fc.property(timestampArbitrary, (timestamp) => {
          expect(typeof timestamp).toBe('number')
          expect(Number.isInteger(timestamp)).toBe(true)
          expect(timestamp).toBeGreaterThanOrEqual(1600000000)
          expect(timestamp).toBeLessThanOrEqual(2000000000)
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid token balance changes', () => {
      fc.assert(
        fc.property(tokenBalanceChangeArbitrary, (change) => {
          expect(typeof change.address).toBe('string')
          expect(typeof change.decimals).toBe('number')
          expect(typeof change.change_amount).toBe('number')
          expect(typeof change.post_balance).toBe('number')
          expect(typeof change.pre_balance).toBe('number')
          expect(typeof change.mint).toBe('string')
          expect(typeof change.owner).toBe('string')
          expect(change.post_balance).toBeGreaterThanOrEqual(0)
          expect(change.pre_balance).toBeGreaterThanOrEqual(0)
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid asset deltas', () => {
      fc.assert(
        fc.property(assetDeltaArbitrary, (delta) => {
          expect(typeof delta.mint).toBe('string')
          expect(typeof delta.symbol).toBe('string')
          expect(typeof delta.netDelta).toBe('number')
          expect(typeof delta.decimals).toBe('number')
          expect(typeof delta.isIntermediate).toBe('boolean')
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid fee data', () => {
      fc.assert(
        fc.property(feeDataArbitrary, (fees) => {
          expect(typeof fees.transactionFee).toBe('number')
          expect(fees.transactionFee).toBeGreaterThan(0)
          if (fees.platformFee !== undefined) {
            expect(typeof fees.platformFee).toBe('number')
          }
          if (fees.priorityFee !== undefined) {
            expect(typeof fees.priorityFee).toBe('number')
          }
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid rent noise transactions', () => {
      fc.assert(
        fc.property(rentNoiseTransactionArbitrary, (tx) => {
          expect(typeof tx.owner).toBe('string')
          expect(Array.isArray(tx.balanceChanges)).toBe(true)
          expect(tx.balanceChanges.length).toBe(2)
          
          // Find SOL change
          const solChange = tx.balanceChanges.find(c => c.mint === PRIORITY_ASSETS.SOL)
          expect(solChange).toBeDefined()
          expect(solChange!.change_amount).toBeGreaterThan(0)
          expect(solChange!.change_amount).toBeLessThan(10000000) // < 0.01 SOL
          
          // Find non-SOL change
          const tokenChange = tx.balanceChanges.find(c => c.mint !== PRIORITY_ASSETS.SOL)
          expect(tokenChange).toBeDefined()
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid swap transactions', () => {
      fc.assert(
        fc.property(swapTransactionArbitrary, (tx) => {
          expect(typeof tx.owner).toBe('string')
          expect(Array.isArray(tx.balanceChanges)).toBe(true)
          expect(tx.balanceChanges.length).toBe(2)
          
          // One positive, one negative
          const positive = tx.balanceChanges.filter(c => c.change_amount > 0)
          const negative = tx.balanceChanges.filter(c => c.change_amount < 0)
          expect(positive.length).toBe(1)
          expect(negative.length).toBe(1)
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid multi-hop transactions', () => {
      fc.assert(
        fc.property(multiHopTransactionArbitrary, (tx) => {
          expect(typeof tx.owner).toBe('string')
          expect(Array.isArray(tx.balanceChanges)).toBe(true)
          expect(tx.balanceChanges.length).toBe(4) // SOL out, USDC in, USDC out, Token in
          
          // Check for intermediate USDC (net zero)
          const usdcChanges = tx.balanceChanges.filter(c => c.mint === PRIORITY_ASSETS.USDC)
          expect(usdcChanges.length).toBe(2)
          const usdcNetDelta = usdcChanges.reduce((sum, c) => sum + c.change_amount, 0)
          expect(usdcNetDelta).toBe(0)
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid relayer transactions', () => {
      fc.assert(
        fc.property(relayerTransactionArbitrary, (tx) => {
          expect(typeof tx.feePayer).toBe('string')
          expect(typeof tx.swapper).toBe('string')
          expect(tx.feePayer).not.toBe(tx.swapper)
          expect(Array.isArray(tx.signers)).toBe(true)
          expect(tx.signers).toContain(tx.swapper)
          expect(Array.isArray(tx.balanceChanges)).toBe(true)
          
          // Swapper should have token changes
          const swapperChanges = tx.balanceChanges.filter(c => c.owner === tx.swapper)
          expect(swapperChanges.length).toBeGreaterThan(0)
          
          // Relayer should only have SOL fee payment
          const relayerChanges = tx.balanceChanges.filter(c => c.owner === tx.feePayer)
          expect(relayerChanges.length).toBeGreaterThan(0)
          expect(relayerChanges.every(c => c.mint === PRIORITY_ASSETS.SOL)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid two-asset delta maps', () => {
      fc.assert(
        fc.property(twoAssetDeltaMapArbitrary, (deltaMap) => {
          const mints = Object.keys(deltaMap)
          expect(mints.length).toBe(2)
          
          const deltas = Object.values(deltaMap)
          expect(deltas.length).toBe(2)
          
          // One positive, one negative
          const positive = deltas.filter(d => d.netDelta > 0)
          const negative = deltas.filter(d => d.netDelta < 0)
          expect(positive.length).toBe(1)
          expect(negative.length).toBe(1)
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid multi-hop asset delta maps', () => {
      fc.assert(
        fc.property(multiHopAssetDeltaMapArbitrary, (deltaMap) => {
          const mints = Object.keys(deltaMap)
          expect(mints.length).toBe(3)
          
          // Should have USDC as intermediate
          expect(deltaMap[PRIORITY_ASSETS.USDC]).toBeDefined()
          expect(deltaMap[PRIORITY_ASSETS.USDC].netDelta).toBe(0)
          expect(deltaMap[PRIORITY_ASSETS.USDC].isIntermediate).toBe(true)
          
          // Should have one positive and one negative non-intermediate
          const nonIntermediate = Object.values(deltaMap).filter(d => !d.isIntermediate)
          expect(nonIntermediate.length).toBe(2)
          const positive = nonIntermediate.filter(d => d.netDelta > 0)
          const negative = nonIntermediate.filter(d => d.netDelta < 0)
          expect(positive.length).toBe(1)
          expect(negative.length).toBe(1)
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid ERASE transactions (both positive)', () => {
      fc.assert(
        fc.property(bothPositiveEraseArbitrary, (tx) => {
          expect(typeof tx.owner).toBe('string')
          expect(Array.isArray(tx.balanceChanges)).toBe(true)
          expect(tx.balanceChanges.length).toBe(2)
          
          // Both should be positive
          expect(tx.balanceChanges.every(c => c.change_amount > 0)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid ERASE transactions (both negative)', () => {
      fc.assert(
        fc.property(bothNegativeEraseArbitrary, (tx) => {
          expect(typeof tx.owner).toBe('string')
          expect(Array.isArray(tx.balanceChanges)).toBe(true)
          expect(tx.balanceChanges.length).toBe(2)
          
          // Both should be negative
          expect(tx.balanceChanges.every(c => c.change_amount < 0)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('Task 1.4: Helper functions work correctly', () => {
    it('should create token balance changes with correct parameters', () => {
      const change = createTokenBalanceChange('owner123', 'mint456', 1000000, 6)
      
      expect(change.owner).toBe('owner123')
      expect(change.mint).toBe('mint456')
      expect(change.change_amount).toBe(1000000)
      expect(change.decimals).toBe(6)
      expect(change.post_balance).toBe(1000000)
      expect(change.pre_balance).toBe(0)
    })

    it('should create token balance changes with negative deltas', () => {
      const change = createTokenBalanceChange('owner123', 'mint456', -1000000, 6)
      
      expect(change.change_amount).toBe(-1000000)
      expect(change.post_balance).toBe(0)
      expect(change.pre_balance).toBe(1000000)
    })

    it('should create asset deltas with correct parameters', () => {
      const delta = createAssetDelta('mint123', 'TOKEN', 1000000, 6, false)
      
      expect(delta.mint).toBe('mint123')
      expect(delta.symbol).toBe('TOKEN')
      expect(delta.netDelta).toBe(1000000)
      expect(delta.decimals).toBe(6)
      expect(delta.isIntermediate).toBe(false)
    })

    it('should create intermediate asset deltas', () => {
      const delta = createAssetDelta('mint123', 'TOKEN', 0, 6, true)
      
      expect(delta.netDelta).toBe(0)
      expect(delta.isIntermediate).toBe(true)
    })
  })
})
