/**
 * SHYFT Parser V2 - Setup Verification Tests
 * 
 * This file verifies that the v2 parser structure and test infrastructure are properly set up.
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
  ParsedSwap,
  SplitSwapPair,
  EraseResult,
  isParsedSwap,
  isSplitSwapPair,
  isEraseResult,
  PRIORITY_ASSETS,
  EPSILON,
  RENT_NOISE_THRESHOLD_SOL,
} from '../shyftParserV2.types'
import { arbitraries } from './shyftParserV2.arbitraries'

describe('SHYFT Parser V2 - Setup Verification', () => {
  describe('Type Definitions', () => {
    it('should have all required interfaces defined', () => {
      // Verify that all interfaces are importable
      expect(typeof PRIORITY_ASSETS).toBe('object')
      expect(typeof EPSILON).toBe('number')
      expect(typeof RENT_NOISE_THRESHOLD_SOL).toBe('number')
    })

    it('should have correct constant values', () => {
      expect(PRIORITY_ASSETS.SOL).toBe('So11111111111111111111111111111111111111112')
      expect(PRIORITY_ASSETS.USDC).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
      expect(PRIORITY_ASSETS.USDT).toBe('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB')
      expect(EPSILON).toBe(1e-9)
      expect(RENT_NOISE_THRESHOLD_SOL).toBe(0.01)
    })

    it('should have type guards working correctly', () => {
      const parsedSwap: ParsedSwap = {
        signature: 'test-sig',
        timestamp: 1234567890,
        swapper: 'wallet123',
        direction: 'BUY',
        quoteAsset: { mint: 'SOL', symbol: 'SOL', decimals: 9 },
        baseAsset: { mint: 'TOKEN', symbol: 'TOKEN', decimals: 6 },
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
        confidence: 90,
        protocol: 'Jupiter',
        swapperIdentificationMethod: 'fee_payer',
        rentRefundsFiltered: 0,
        intermediateAssetsCollapsed: [],
      }

      const splitSwapPair: SplitSwapPair = {
        signature: 'test-sig',
        timestamp: 1234567890,
        swapper: 'wallet123',
        splitReason: 'token_to_token_unstable_pair',
        sellRecord: parsedSwap,
        buyRecord: parsedSwap,
        protocol: 'Jupiter',
        swapperIdentificationMethod: 'fee_payer',
      }

      const eraseResult: EraseResult = {
        signature: 'test-sig',
        timestamp: 1234567890,
        reason: 'both_positive_airdrop',
        debugInfo: {
          feePayer: 'wallet123',
          signers: ['wallet123'],
          assetDeltas: {},
        },
      }

      expect(isParsedSwap(parsedSwap)).toBe(true)
      expect(isParsedSwap(splitSwapPair)).toBe(false)
      expect(isParsedSwap(eraseResult)).toBe(false)

      expect(isSplitSwapPair(parsedSwap)).toBe(false)
      expect(isSplitSwapPair(splitSwapPair)).toBe(true)
      expect(isSplitSwapPair(eraseResult)).toBe(false)

      expect(isEraseResult(parsedSwap)).toBe(false)
      expect(isEraseResult(splitSwapPair)).toBe(false)
      expect(isEraseResult(eraseResult)).toBe(true)
    })
  })

  describe('Fast-Check Library Setup', () => {
    it('should be able to run a simple property test', () => {
      fc.assert(
        fc.property(fc.integer(), (n) => {
          return n + 0 === n
        }),
        { numRuns: 100 }
      )
    })

    it('should be able to generate random strings', () => {
      fc.assert(
        fc.property(fc.string(), (s) => {
          return s.length >= 0
        }),
        { numRuns: 100 }
      )
    })

    it('should be able to generate random numbers in range', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 }), (n) => {
          return n >= 0 && n <= 100
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('Test Data Generators (Arbitraries)', () => {
    it('should generate valid wallet addresses', () => {
      fc.assert(
        fc.property(arbitraries.walletAddress, (address) => {
          return typeof address === 'string' && address.length > 0
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid token mints', () => {
      fc.assert(
        fc.property(arbitraries.tokenMint, (mint) => {
          return typeof mint === 'string' && mint.length > 0
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid token symbols', () => {
      fc.assert(
        fc.property(arbitraries.tokenSymbol, (symbol) => {
          return typeof symbol === 'string' && symbol.length >= 3
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid token decimals', () => {
      fc.assert(
        fc.property(arbitraries.tokenDecimals, (decimals) => {
          return typeof decimals === 'number' && decimals >= 0 && decimals <= 9
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid balance amounts', () => {
      fc.assert(
        fc.property(arbitraries.balanceAmount, (amount) => {
          return typeof amount === 'number' && amount >= 0
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid delta amounts', () => {
      fc.assert(
        fc.property(arbitraries.deltaAmount, (delta) => {
          return typeof delta === 'number'
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid small SOL amounts (for rent refunds)', () => {
      fc.assert(
        fc.property(arbitraries.smallSolAmount, (amount) => {
          const solAmount = amount / 1e9 // Convert to SOL
          return solAmount > 0 && solAmount < RENT_NOISE_THRESHOLD_SOL
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid transaction signatures', () => {
      fc.assert(
        fc.property(arbitraries.signature, (sig) => {
          return typeof sig === 'string' && sig.length >= 64
        }),
        { numRuns: 100 }
      )
    })

    it('should generate valid timestamps', () => {
      fc.assert(
        fc.property(arbitraries.timestamp, (ts) => {
          return typeof ts === 'number' && ts >= 1600000000 && ts <= 1800000000
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('TokenBalanceChange Arbitraries', () => {
    it('should generate valid token balance changes', () => {
      fc.assert(
        fc.property(arbitraries.tokenBalanceChange, (change) => {
          return (
            typeof change.address === 'string' &&
            typeof change.decimals === 'number' &&
            typeof change.change_amount === 'number' &&
            typeof change.post_balance === 'number' &&
            typeof change.pre_balance === 'number' &&
            typeof change.mint === 'string' &&
            typeof change.owner === 'string'
          )
        }),
        { numRuns: 100 }
      )
    })

    it('should generate rent refund balance changes with correct properties', () => {
      const owner = 'TestWallet123'
      fc.assert(
        fc.property(arbitraries.rentRefundBalanceChange(owner), (change) => {
          const solAmount = change.change_amount / 1e9
          return (
            change.owner === owner &&
            change.mint === PRIORITY_ASSETS.SOL &&
            change.decimals === 9 &&
            change.change_amount > 0 &&
            solAmount < RENT_NOISE_THRESHOLD_SOL
          )
        }),
        { numRuns: 100 }
      )
    })

    it('should generate positive balance changes', () => {
      const owner = 'TestWallet123'
      const mint = 'TestMint456'
      fc.assert(
        fc.property(arbitraries.positiveBalanceChange(owner, mint), (change) => {
          return change.owner === owner && change.mint === mint && change.change_amount > 0
        }),
        { numRuns: 100 }
      )
    })

    it('should generate negative balance changes', () => {
      const owner = 'TestWallet123'
      const mint = 'TestMint456'
      fc.assert(
        fc.property(arbitraries.negativeBalanceChange(owner, mint), (change) => {
          return change.owner === owner && change.mint === mint && change.change_amount < 0
        }),
        { numRuns: 100 }
      )
    })

    it('should generate zero balance changes', () => {
      const owner = 'TestWallet123'
      const mint = 'TestMint456'
      fc.assert(
        fc.property(arbitraries.zeroBalanceChange(owner, mint), (change) => {
          return change.owner === owner && change.mint === mint && change.change_amount === 0
        }),
        { numRuns: 100 }
      )
    })

    it('should generate arrays of token balance changes', () => {
      fc.assert(
        fc.property(arbitraries.tokenBalanceChanges, (changes) => {
          return Array.isArray(changes) && changes.length >= 1 && changes.length <= 10
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('AssetDelta Arbitraries', () => {
    it('should generate valid asset deltas', () => {
      fc.assert(
        fc.property(arbitraries.assetDelta, (delta) => {
          return (
            typeof delta.mint === 'string' &&
            typeof delta.symbol === 'string' &&
            typeof delta.netDelta === 'number' &&
            typeof delta.decimals === 'number' &&
            typeof delta.isIntermediate === 'boolean'
          )
        }),
        { numRuns: 100 }
      )
    })

    it('should generate positive asset deltas', () => {
      fc.assert(
        fc.property(arbitraries.positiveAssetDelta, (delta) => {
          return delta.netDelta > 0 && delta.isIntermediate === false
        }),
        { numRuns: 100 }
      )
    })

    it('should generate negative asset deltas', () => {
      fc.assert(
        fc.property(arbitraries.negativeAssetDelta, (delta) => {
          return delta.netDelta < 0 && delta.isIntermediate === false
        }),
        { numRuns: 100 }
      )
    })

    it('should generate intermediate asset deltas', () => {
      fc.assert(
        fc.property(arbitraries.intermediateAssetDelta, (delta) => {
          return delta.netDelta === 0 && delta.isIntermediate === true
        }),
        { numRuns: 100 }
      )
    })

    it('should generate two-asset delta maps with opposite signs', () => {
      fc.assert(
        fc.property(arbitraries.twoAssetDeltaMap, (deltaMap) => {
          const deltas = Object.values(deltaMap)
          return (
            deltas.length === 2 &&
            deltas.some((d) => d.netDelta > 0) &&
            deltas.some((d) => d.netDelta < 0)
          )
        }),
        { numRuns: 100 }
      )
    })

    it('should generate multi-hop delta maps with intermediates', () => {
      fc.assert(
        fc.property(arbitraries.multiHopAssetDeltaMap, (deltaMap) => {
          const deltas = Object.values(deltaMap)
          return (
            deltas.length >= 3 &&
            deltas.some((d) => d.netDelta > 0) &&
            deltas.some((d) => d.netDelta < 0) &&
            deltas.some((d) => d.netDelta === 0 && d.isIntermediate === true)
          )
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('FeeData Arbitraries', () => {
    it('should generate valid fee data', () => {
      fc.assert(
        fc.property(arbitraries.feeData, (fees) => {
          return (
            typeof fees.transactionFee === 'number' &&
            fees.transactionFee >= 0 &&
            (fees.platformFee === undefined || fees.platformFee >= 0) &&
            (fees.priorityFee === undefined || fees.priorityFee >= 0)
          )
        }),
        { numRuns: 100 }
      )
    })

    it('should generate zero fee data', () => {
      fc.assert(
        fc.property(arbitraries.zeroFeeData, (fees) => {
          return (
            fees.transactionFee === 0 && fees.platformFee === 0 && fees.priorityFee === 0
          )
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('Transaction Arbitraries', () => {
    it('should generate valid transactions', () => {
      fc.assert(
        fc.property(arbitraries.transaction, (tx) => {
          return (
            typeof tx.signature === 'string' &&
            typeof tx.timestamp === 'number' &&
            typeof tx.feePayer === 'string' &&
            Array.isArray(tx.signers) &&
            Array.isArray(tx.tokenBalanceChanges) &&
            typeof tx.fee === 'number'
          )
        }),
        { numRuns: 100 }
      )
    })

    it('should generate rent noise transactions with correct structure', () => {
      fc.assert(
        fc.property(arbitraries.rentNoiseTransaction, (tx) => {
          const rentRefund = tx.tokenBalanceChanges.find(
            (c) => c.mint === PRIORITY_ASSETS.SOL && c.change_amount > 0
          )
          const nonSolActivity = tx.tokenBalanceChanges.some(
            (c) => c.mint !== PRIORITY_ASSETS.SOL && c.change_amount !== 0
          )
          return rentRefund !== undefined && nonSolActivity
        }),
        { numRuns: 100 }
      )
    })

    it('should generate relayer transactions with correct structure', () => {
      fc.assert(
        fc.property(arbitraries.relayerTransaction, (tx) => {
          // Fee payer should have no balance changes
          const feePayerChanges = tx.tokenBalanceChanges.filter((c) => c.owner === tx.feePayer)
          // Signer should have balance changes
          const signerChanges = tx.tokenBalanceChanges.filter((c) => c.owner === tx.signers[0])
          return feePayerChanges.length === 0 && signerChanges.length > 0
        }),
        { numRuns: 100 }
      )
    })

    it('should generate multi-hop transactions with intermediate assets', () => {
      fc.assert(
        fc.property(arbitraries.multiHopTransaction, (tx) => {
          // Should have at least one zero-delta change (intermediate)
          const hasIntermediate = tx.tokenBalanceChanges.some((c) => c.change_amount === 0)
          return hasIntermediate
        }),
        { numRuns: 100 }
      )
    })

    it('should generate token-to-token transactions without priority assets', () => {
      fc.assert(
        fc.property(arbitraries.tokenToTokenTransaction, (tx) => {
          const priorityAssets = [PRIORITY_ASSETS.SOL, PRIORITY_ASSETS.USDC, PRIORITY_ASSETS.USDT]
          const hasPriorityAsset = tx.tokenBalanceChanges.some((c) =>
            priorityAssets.includes(c.mint as any)
          )
          return !hasPriorityAsset
        }),
        { numRuns: 100 }
      )
    })
  })
})
