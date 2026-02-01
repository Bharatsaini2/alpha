/**
 * SHYFT Parser V2 - AssetDeltaCollector Tests
 * 
 * Task 5.2: Write property test for intermediate asset detection
 * Task 5.3: Write unit tests for multi-hop scenarios
 * 
 * Tests:
 * - Property 12: Intermediate Asset Detection
 * - Unit tests for multi-hop scenarios (SOL → USDC → TOKEN)
 * - Unit tests for epsilon tolerance
 */

import * as fc from 'fast-check'
import { createAssetDeltaCollector } from '../shyftParserV2.assetDeltaCollector'
import {
  TokenBalanceChange,
  AssetDeltaMap,
  EPSILON,
  PRIORITY_ASSETS,
} from '../shyftParserV2.types'
import { arbitraries } from './shyftParserV2.arbitraries'

describe('AssetDeltaCollector - Unit Tests', () => {
  const collector = createAssetDeltaCollector()
  const swapper = 'Wallet11111111111111111111111111111111111111'

  describe('Task 5.3: Multi-hop scenarios', () => {
    it('should collapse SOL → USDC → TOKEN multi-hop route', () => {
      // Requirement 4.2: Multi-hop route collapse
      const changes: TokenBalanceChange[] = [
        // SOL outflow (negative delta)
        {
          address: 'sol-account-1',
          decimals: 9,
          change_amount: -1_000_000_000, // -1 SOL
          post_balance: 0,
          pre_balance: 1_000_000_000,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
        // USDC intermediate (zero net delta - in and out)
        {
          address: 'usdc-account-1',
          decimals: 6,
          change_amount: 100_000_000, // +100 USDC
          post_balance: 100_000_000,
          pre_balance: 0,
          mint: PRIORITY_ASSETS.USDC,
          owner: swapper,
        },
        {
          address: 'usdc-account-2',
          decimals: 6,
          change_amount: -100_000_000, // -100 USDC (net zero)
          post_balance: 0,
          pre_balance: 100_000_000,
          mint: PRIORITY_ASSETS.USDC,
          owner: swapper,
        },
        // TOKEN inflow (positive delta)
        {
          address: 'token-account-1',
          decimals: 6,
          change_amount: 1_000_000_000, // +1000 TOKEN
          post_balance: 1_000_000_000,
          pre_balance: 0,
          mint: 'TokenMint111111111111111111111111111111111',
          owner: swapper,
        },
      ]

      const result = collector.collectDeltas(changes, swapper)

      // Should have 3 assets
      expect(Object.keys(result).length).toBe(3)

      // SOL should have negative delta (outflow)
      expect(result[PRIORITY_ASSETS.SOL]).toBeDefined()
      expect(result[PRIORITY_ASSETS.SOL].netDelta).toBe(-1_000_000_000)
      expect(result[PRIORITY_ASSETS.SOL].isIntermediate).toBe(false)

      // USDC should have zero net delta and be marked intermediate
      expect(result[PRIORITY_ASSETS.USDC]).toBeDefined()
      expect(result[PRIORITY_ASSETS.USDC].netDelta).toBe(0)
      expect(result[PRIORITY_ASSETS.USDC].isIntermediate).toBe(true)

      // TOKEN should have positive delta (inflow)
      expect(result['TokenMint111111111111111111111111111111111']).toBeDefined()
      expect(result['TokenMint111111111111111111111111111111111'].netDelta).toBe(1_000_000_000)
      expect(result['TokenMint111111111111111111111111111111111'].isIntermediate).toBe(false)
    })

    it('should handle multiple intermediate assets', () => {
      // Requirement 4.2: Multiple intermediate routing tokens
      const changes: TokenBalanceChange[] = [
        // SOL outflow
        {
          address: 'sol-account-1',
          decimals: 9,
          change_amount: -2_000_000_000, // -2 SOL
          post_balance: 0,
          pre_balance: 2_000_000_000,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
        // USDC intermediate (zero net)
        {
          address: 'usdc-account-1',
          decimals: 6,
          change_amount: 200_000_000,
          post_balance: 200_000_000,
          pre_balance: 0,
          mint: PRIORITY_ASSETS.USDC,
          owner: swapper,
        },
        {
          address: 'usdc-account-2',
          decimals: 6,
          change_amount: -200_000_000,
          post_balance: 0,
          pre_balance: 200_000_000,
          mint: PRIORITY_ASSETS.USDC,
          owner: swapper,
        },
        // USDT intermediate (zero net)
        {
          address: 'usdt-account-1',
          decimals: 6,
          change_amount: 150_000_000,
          post_balance: 150_000_000,
          pre_balance: 0,
          mint: PRIORITY_ASSETS.USDT,
          owner: swapper,
        },
        {
          address: 'usdt-account-2',
          decimals: 6,
          change_amount: -150_000_000,
          post_balance: 0,
          pre_balance: 150_000_000,
          mint: PRIORITY_ASSETS.USDT,
          owner: swapper,
        },
        // Final TOKEN inflow
        {
          address: 'token-account-1',
          decimals: 6,
          change_amount: 5_000_000_000, // +5000 TOKEN
          post_balance: 5_000_000_000,
          pre_balance: 0,
          mint: 'TokenMint222222222222222222222222222222222',
          owner: swapper,
        },
      ]

      const result = collector.collectDeltas(changes, swapper)

      // Should have 4 assets
      expect(Object.keys(result).length).toBe(4)

      // SOL should not be intermediate
      expect(result[PRIORITY_ASSETS.SOL].isIntermediate).toBe(false)

      // Both USDC and USDT should be intermediate
      expect(result[PRIORITY_ASSETS.USDC].isIntermediate).toBe(true)
      expect(result[PRIORITY_ASSETS.USDT].isIntermediate).toBe(true)

      // Final TOKEN should not be intermediate
      expect(result['TokenMint222222222222222222222222222222222'].isIntermediate).toBe(false)
    })

    it('should use epsilon tolerance for zero detection', () => {
      // Requirement 4.7: Epsilon tolerance for floating point comparisons
      const changes: TokenBalanceChange[] = [
        // SOL outflow
        {
          address: 'sol-account-1',
          decimals: 9,
          change_amount: -1_000_000_000,
          post_balance: 0,
          pre_balance: 1_000_000_000,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
        // USDC with tiny rounding error (should still be intermediate)
        {
          address: 'usdc-account-1',
          decimals: 6,
          change_amount: 100_000_000,
          post_balance: 100_000_000,
          pre_balance: 0,
          mint: PRIORITY_ASSETS.USDC,
          owner: swapper,
        },
        {
          address: 'usdc-account-2',
          decimals: 6,
          change_amount: -99_999_999, // Off by 1 (within epsilon when normalized)
          post_balance: 0,
          pre_balance: 99_999_999,
          mint: PRIORITY_ASSETS.USDC,
          owner: swapper,
        },
        // TOKEN inflow
        {
          address: 'token-account-1',
          decimals: 6,
          change_amount: 1_000_000_000,
          post_balance: 1_000_000_000,
          pre_balance: 0,
          mint: 'TokenMint333333333333333333333333333333333',
          owner: swapper,
        },
      ]

      const result = collector.collectDeltas(changes, swapper)

      // USDC net delta is 1 (very small)
      expect(result[PRIORITY_ASSETS.USDC].netDelta).toBe(1)

      // Should still be marked intermediate if within epsilon
      // Note: EPSILON is 1e-9, and 1 raw unit is much larger than epsilon
      // So this should NOT be intermediate (it's a real delta)
      expect(result[PRIORITY_ASSETS.USDC].isIntermediate).toBe(false)

      // Test with actual epsilon-level delta
      const changesWithEpsilon: TokenBalanceChange[] = [
        {
          address: 'sol-account-1',
          decimals: 9,
          change_amount: -1_000_000_000,
          post_balance: 0,
          pre_balance: 1_000_000_000,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
        // USDC with exactly zero delta
        {
          address: 'usdc-account-1',
          decimals: 6,
          change_amount: 0, // Exactly zero
          post_balance: 100_000_000,
          pre_balance: 100_000_000,
          mint: PRIORITY_ASSETS.USDC,
          owner: swapper,
        },
        {
          address: 'token-account-1',
          decimals: 6,
          change_amount: 1_000_000_000,
          post_balance: 1_000_000_000,
          pre_balance: 0,
          mint: 'TokenMint333333333333333333333333333333333',
          owner: swapper,
        },
      ]

      const resultWithZero = collector.collectDeltas(changesWithEpsilon, swapper)

      // USDC with exactly zero should be intermediate
      expect(resultWithZero[PRIORITY_ASSETS.USDC].netDelta).toBe(0)
      expect(resultWithZero[PRIORITY_ASSETS.USDC].isIntermediate).toBe(true)
    })

    it('should handle empty balance changes', () => {
      const result = collector.collectDeltas([], swapper)
      expect(Object.keys(result).length).toBe(0)
    })

    it('should filter out non-swapper changes', () => {
      const otherWallet = 'OtherWallet111111111111111111111111111111111'
      const changes: TokenBalanceChange[] = [
        // Swapper's change
        {
          address: 'sol-account-1',
          decimals: 9,
          change_amount: -1_000_000_000,
          post_balance: 0,
          pre_balance: 1_000_000_000,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
        // Other wallet's change (should be ignored)
        {
          address: 'token-account-1',
          decimals: 6,
          change_amount: 1_000_000_000,
          post_balance: 1_000_000_000,
          pre_balance: 0,
          mint: 'TokenMint111111111111111111111111111111111',
          owner: otherWallet,
        },
      ]

      const result = collector.collectDeltas(changes, swapper)

      // Should only have SOL (swapper's change)
      expect(Object.keys(result).length).toBe(1)
      expect(result[PRIORITY_ASSETS.SOL]).toBeDefined()
      expect(result['TokenMint111111111111111111111111111111111']).toBeUndefined()
    })

    it('should aggregate multiple changes for the same mint', () => {
      const changes: TokenBalanceChange[] = [
        // Multiple SOL changes (should be aggregated)
        {
          address: 'sol-account-1',
          decimals: 9,
          change_amount: -500_000_000, // -0.5 SOL
          post_balance: 500_000_000,
          pre_balance: 1_000_000_000,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
        {
          address: 'sol-account-2',
          decimals: 9,
          change_amount: -300_000_000, // -0.3 SOL
          post_balance: 200_000_000,
          pre_balance: 500_000_000,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
        {
          address: 'sol-account-3',
          decimals: 9,
          change_amount: -200_000_000, // -0.2 SOL
          post_balance: 0,
          pre_balance: 200_000_000,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
        // TOKEN inflow
        {
          address: 'token-account-1',
          decimals: 6,
          change_amount: 1_000_000_000,
          post_balance: 1_000_000_000,
          pre_balance: 0,
          mint: 'TokenMint111111111111111111111111111111111',
          owner: swapper,
        },
      ]

      const result = collector.collectDeltas(changes, swapper)

      // Should have 2 assets
      expect(Object.keys(result).length).toBe(2)

      // SOL should have aggregated delta (-1 SOL total)
      expect(result[PRIORITY_ASSETS.SOL].netDelta).toBe(-1_000_000_000)
      expect(result[PRIORITY_ASSETS.SOL].isIntermediate).toBe(false)
    })
  })

  describe('Task 5.2: Property 12 - Intermediate Asset Detection', () => {
    it('should mark assets with zero net delta as intermediate', () => {
      // **Property 12: Intermediate Asset Detection**
      // **Validates: Requirements 4.2**
      // 
      // For any asset in a transaction, if its net delta (sum of all balance changes
      // for that asset) equals zero within epsilon tolerance, it should be marked as
      // an intermediate routing asset.

      fc.assert(
        fc.property(
          // Generate a multi-hop transaction with intermediate assets
          arbitraries.multiHopTransaction,
          (tx) => {
            const collector = createAssetDeltaCollector()
            const result = collector.collectDeltas(tx.tokenBalanceChanges, tx.feePayer)

            // For each asset in the result
            for (const [mint, asset] of Object.entries(result)) {
              // Calculate the actual net delta from balance changes
              const actualNetDelta = tx.tokenBalanceChanges
                .filter((change) => change.owner === tx.feePayer && change.mint === mint)
                .reduce((sum, change) => sum + change.change_amount, 0)

              // Property: If net delta is within epsilon of zero, should be intermediate
              if (Math.abs(actualNetDelta) < EPSILON) {
                expect(asset.isIntermediate).toBe(true)
              }

              // Property: If net delta is NOT within epsilon of zero, should NOT be intermediate
              if (Math.abs(actualNetDelta) >= EPSILON) {
                expect(asset.isIntermediate).toBe(false)
              }

              // Property: netDelta should match the sum of all changes
              expect(asset.netDelta).toBe(actualNetDelta)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should correctly aggregate deltas across multiple balance changes', () => {
      // Property: Net delta should equal the sum of all balance changes for that mint
      fc.assert(
        fc.property(
          arbitraries.transaction,
          (tx) => {
            const collector = createAssetDeltaCollector()
            const result = collector.collectDeltas(tx.tokenBalanceChanges, tx.feePayer)

            // For each asset in the result
            for (const [mint, asset] of Object.entries(result)) {
              // Calculate expected net delta
              const expectedNetDelta = tx.tokenBalanceChanges
                .filter((change) => change.owner === tx.feePayer && change.mint === mint)
                .reduce((sum, change) => sum + change.change_amount, 0)

              // Property: netDelta should match the sum
              expect(asset.netDelta).toBe(expectedNetDelta)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should only include swapper balance changes', () => {
      // Property: Only balance changes where owner === swapper should be included
      fc.assert(
        fc.property(
          arbitraries.transaction,
          (tx) => {
            const collector = createAssetDeltaCollector()
            const result = collector.collectDeltas(tx.tokenBalanceChanges, tx.feePayer)

            // Get all mints from swapper's changes
            const swapperMints = new Set(
              tx.tokenBalanceChanges
                .filter((change) => change.owner === tx.feePayer)
                .map((change) => change.mint)
            )

            // Property: Result should only contain mints from swapper's changes
            for (const mint of Object.keys(result)) {
              expect(swapperMints.has(mint)).toBe(true)
            }

            // Property: All swapper mints should be in result
            for (const mint of swapperMints) {
              expect(result[mint]).toBeDefined()
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})

