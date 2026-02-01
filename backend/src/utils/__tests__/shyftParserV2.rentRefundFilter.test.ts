/**
 * SHYFT Parser V2 - RentRefundFilter Tests
 * 
 * Task 2.2: Write property test for rent noise detection
 * Task 2.3: Write property test for SOL-only exclusion
 * Task 2.4: Write unit tests for rent refund edge cases
 */

import * as fc from 'fast-check'
import { createRentRefundFilter } from '../shyftParserV2.rentRefundFilter'
import {
  TokenBalanceChange,
  PRIORITY_ASSETS,
  RENT_NOISE_THRESHOLD_SOL,
} from '../shyftParserV2.types'
import {
  arbitraries,
  rentRefundBalanceChangeArbitrary,
  positiveBalanceChangeArbitrary,
  negativeBalanceChangeArbitrary,
} from './shyftParserV2.arbitraries'

describe('RentRefundFilter - Property-Based Tests', () => {
  const filter = createRentRefundFilter()

  /**
   * Property 1: Rent Noise Detection and Filtering
   * **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6**
   * 
   * For any transaction with token balance changes, if a SOL delta is positive,
   * less than 0.01 SOL in absolute value, and at least one non-SOL asset has a
   * non-zero delta, then that SOL delta should be classified as rent noise and
   * excluded from quote/base detection and direction classification, but preserved
   * in a separate rent refunds collection.
   */
  it('Property 1: Rent Noise Detection and Filtering', () => {
    // Generate transactions with rent noise pattern
    const rentNoiseTransactionArbitrary = arbitraries.walletAddress.chain((swapper) =>
      fc
        .tuple(
          rentRefundBalanceChangeArbitrary(swapper),
          fc.oneof(
            negativeBalanceChangeArbitrary(swapper, 'TokenMint111111111111111111111111111111111'),
            positiveBalanceChangeArbitrary(swapper, 'TokenMint111111111111111111111111111111111')
          )
        )
        .map(([rentRefund, tokenChange]) => ({
          swapper,
          balanceChanges: [rentRefund, tokenChange],
        }))
    )

    fc.assert(
      fc.property(rentNoiseTransactionArbitrary, ({ swapper, balanceChanges }) => {
        const result = filter.filterRentNoise(balanceChanges, swapper)

        // Find the rent refund in the original changes
        const rentRefund = balanceChanges.find(
          (change) =>
            change.mint === PRIORITY_ASSETS.SOL &&
            change.change_amount > 0 &&
            Math.abs(change.change_amount) / Math.pow(10, change.decimals) < RENT_NOISE_THRESHOLD_SOL
        )

        // Find non-SOL changes
        const nonSolChanges = balanceChanges.filter(
          (change) => change.mint !== PRIORITY_ASSETS.SOL && change.change_amount !== 0
        )

        if (rentRefund && nonSolChanges.length > 0) {
          // Rent refund should be in rentRefunds array
          expect(result.rentRefunds).toContainEqual(rentRefund)
          
          // Rent refund should NOT be in economicChanges array
          expect(result.economicChanges).not.toContainEqual(rentRefund)
          
          // Non-SOL changes should be in economicChanges
          nonSolChanges.forEach((change) => {
            expect(result.economicChanges).toContainEqual(change)
          })
        }
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 2: Rent Noise Exclusion for SOL-Only Transactions
   * **Validates: Requirements 1.7**
   * 
   * For any transaction where only SOL has non-zero deltas and no other assets
   * have activity, small positive SOL deltas should NOT be classified as rent noise.
   */
  it('Property 2: Rent Noise Exclusion for SOL-Only Transactions', () => {
    // Generate SOL-only transactions (no non-SOL activity)
    const solOnlyTransactionArbitrary = fc
      .tuple(
        arbitraries.walletAddress,
        fc.integer({ min: 1_000_000, max: 9_000_000 }) // Small SOL amount
      )
      .map(([swapper, solAmount]) => ({
        swapper,
        balanceChanges: [
          {
            address: 'sol-account',
            decimals: 9,
            change_amount: solAmount,
            post_balance: solAmount,
            pre_balance: 0,
            mint: PRIORITY_ASSETS.SOL,
            owner: swapper,
          },
        ] as TokenBalanceChange[],
      }))

    fc.assert(
      fc.property(solOnlyTransactionArbitrary, ({ swapper, balanceChanges }) => {
        const result = filter.filterRentNoise(balanceChanges, swapper)

        // SOL-only transactions should NOT have rent refunds
        expect(result.rentRefunds).toHaveLength(0)
        
        // All SOL changes should be in economicChanges
        expect(result.economicChanges).toHaveLength(balanceChanges.length)
        expect(result.economicChanges).toEqual(balanceChanges)
      }),
      { numRuns: 100 }
    )
  })
})

describe('RentRefundFilter - Unit Tests', () => {
  const filter = createRentRefundFilter()

  /**
   * Task 2.4: Write unit tests for rent refund edge cases
   * Requirements: 1.7
   */

  describe('Edge Case: Exactly 0.01 SOL boundary', () => {
    it('should classify 0.009999 SOL as rent noise when non-SOL activity exists', () => {
      const swapper = 'Wallet11111111111111111111111111111111111111'
      const balanceChanges: TokenBalanceChange[] = [
        {
          address: 'sol-account',
          decimals: 9,
          change_amount: 9_999_000, // 0.009999 SOL (just below threshold)
          post_balance: 9_999_000,
          pre_balance: 0,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
        {
          address: 'token-account',
          decimals: 6,
          change_amount: 1_000_000, // 1 token
          post_balance: 1_000_000,
          pre_balance: 0,
          mint: 'TokenMint111111111111111111111111111111111',
          owner: swapper,
        },
      ]

      const result = filter.filterRentNoise(balanceChanges, swapper)

      expect(result.rentRefunds).toHaveLength(1)
      expect(result.rentRefunds[0].mint).toBe(PRIORITY_ASSETS.SOL)
      expect(result.economicChanges).toHaveLength(1)
      expect(result.economicChanges[0].mint).toBe('TokenMint111111111111111111111111111111111')
    })

    it('should NOT classify 0.01 SOL as rent noise (at threshold)', () => {
      const swapper = 'Wallet11111111111111111111111111111111111111'
      const balanceChanges: TokenBalanceChange[] = [
        {
          address: 'sol-account',
          decimals: 9,
          change_amount: 10_000_000, // Exactly 0.01 SOL (at threshold)
          post_balance: 10_000_000,
          pre_balance: 0,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
        {
          address: 'token-account',
          decimals: 6,
          change_amount: 1_000_000,
          post_balance: 1_000_000,
          pre_balance: 0,
          mint: 'TokenMint111111111111111111111111111111111',
          owner: swapper,
        },
      ]

      const result = filter.filterRentNoise(balanceChanges, swapper)

      expect(result.rentRefunds).toHaveLength(0)
      expect(result.economicChanges).toHaveLength(2)
    })

    it('should NOT classify 0.01001 SOL as rent noise (above threshold)', () => {
      const swapper = 'Wallet11111111111111111111111111111111111111'
      const balanceChanges: TokenBalanceChange[] = [
        {
          address: 'sol-account',
          decimals: 9,
          change_amount: 10_010_000, // 0.01001 SOL (above threshold)
          post_balance: 10_010_000,
          pre_balance: 0,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
        {
          address: 'token-account',
          decimals: 6,
          change_amount: 1_000_000,
          post_balance: 1_000_000,
          pre_balance: 0,
          mint: 'TokenMint111111111111111111111111111111111',
          owner: swapper,
        },
      ]

      const result = filter.filterRentNoise(balanceChanges, swapper)

      expect(result.rentRefunds).toHaveLength(0)
      expect(result.economicChanges).toHaveLength(2)
    })
  })

  describe('Edge Case: SOL-only transactions', () => {
    it('should NOT classify small positive SOL as rent noise when no non-SOL activity', () => {
      const swapper = 'Wallet11111111111111111111111111111111111111'
      const balanceChanges: TokenBalanceChange[] = [
        {
          address: 'sol-account',
          decimals: 9,
          change_amount: 5_000_000, // 0.005 SOL
          post_balance: 5_000_000,
          pre_balance: 0,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
      ]

      const result = filter.filterRentNoise(balanceChanges, swapper)

      expect(result.rentRefunds).toHaveLength(0)
      expect(result.economicChanges).toHaveLength(1)
      expect(result.economicChanges[0].mint).toBe(PRIORITY_ASSETS.SOL)
    })

    it('should handle multiple SOL changes in SOL-only transaction', () => {
      const swapper = 'Wallet11111111111111111111111111111111111111'
      const balanceChanges: TokenBalanceChange[] = [
        {
          address: 'sol-account-1',
          decimals: 9,
          change_amount: 5_000_000, // 0.005 SOL
          post_balance: 5_000_000,
          pre_balance: 0,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
        {
          address: 'sol-account-2',
          decimals: 9,
          change_amount: -10_000_000, // -0.01 SOL
          post_balance: 0,
          pre_balance: 10_000_000,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
      ]

      const result = filter.filterRentNoise(balanceChanges, swapper)

      expect(result.rentRefunds).toHaveLength(0)
      expect(result.economicChanges).toHaveLength(2)
    })
  })

  describe('Edge Case: Transactions with no non-SOL activity', () => {
    it('should NOT classify rent noise when all non-SOL changes are zero', () => {
      const swapper = 'Wallet11111111111111111111111111111111111111'
      const balanceChanges: TokenBalanceChange[] = [
        {
          address: 'sol-account',
          decimals: 9,
          change_amount: 5_000_000, // 0.005 SOL
          post_balance: 5_000_000,
          pre_balance: 0,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
        {
          address: 'token-account',
          decimals: 6,
          change_amount: 0, // Zero change
          post_balance: 1_000_000,
          pre_balance: 1_000_000,
          mint: 'TokenMint111111111111111111111111111111111',
          owner: swapper,
        },
      ]

      const result = filter.filterRentNoise(balanceChanges, swapper)

      expect(result.rentRefunds).toHaveLength(0)
      expect(result.economicChanges).toHaveLength(2)
    })
  })

  describe('Edge Case: Negative SOL deltas', () => {
    it('should NOT classify negative SOL delta as rent noise', () => {
      const swapper = 'Wallet11111111111111111111111111111111111111'
      const balanceChanges: TokenBalanceChange[] = [
        {
          address: 'sol-account',
          decimals: 9,
          change_amount: -5_000_000, // -0.005 SOL (negative)
          post_balance: 0,
          pre_balance: 5_000_000,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
        {
          address: 'token-account',
          decimals: 6,
          change_amount: 1_000_000,
          post_balance: 1_000_000,
          pre_balance: 0,
          mint: 'TokenMint111111111111111111111111111111111',
          owner: swapper,
        },
      ]

      const result = filter.filterRentNoise(balanceChanges, swapper)

      expect(result.rentRefunds).toHaveLength(0)
      expect(result.economicChanges).toHaveLength(2)
    })
  })

  describe('Edge Case: Multiple rent refunds', () => {
    it('should classify multiple small SOL refunds as rent noise', () => {
      const swapper = 'Wallet11111111111111111111111111111111111111'
      const balanceChanges: TokenBalanceChange[] = [
        {
          address: 'sol-account-1',
          decimals: 9,
          change_amount: 2_000_000, // 0.002 SOL
          post_balance: 2_000_000,
          pre_balance: 0,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
        {
          address: 'sol-account-2',
          decimals: 9,
          change_amount: 3_000_000, // 0.003 SOL
          post_balance: 3_000_000,
          pre_balance: 0,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
        {
          address: 'token-account',
          decimals: 6,
          change_amount: 1_000_000,
          post_balance: 1_000_000,
          pre_balance: 0,
          mint: 'TokenMint111111111111111111111111111111111',
          owner: swapper,
        },
      ]

      const result = filter.filterRentNoise(balanceChanges, swapper)

      expect(result.rentRefunds).toHaveLength(2)
      expect(result.economicChanges).toHaveLength(1)
      expect(result.economicChanges[0].mint).toBe('TokenMint111111111111111111111111111111111')
    })
  })

  describe('Edge Case: Different swapper', () => {
    it('should only filter rent noise for the specified swapper', () => {
      const swapper = 'Wallet11111111111111111111111111111111111111'
      const otherUser = 'Wallet22222222222222222222222222222222222222'
      const balanceChanges: TokenBalanceChange[] = [
        {
          address: 'sol-account-swapper',
          decimals: 9,
          change_amount: 5_000_000, // 0.005 SOL for swapper
          post_balance: 5_000_000,
          pre_balance: 0,
          mint: PRIORITY_ASSETS.SOL,
          owner: swapper,
        },
        {
          address: 'sol-account-other',
          decimals: 9,
          change_amount: 5_000_000, // 0.005 SOL for other user (should be ignored)
          post_balance: 5_000_000,
          pre_balance: 0,
          mint: PRIORITY_ASSETS.SOL,
          owner: otherUser,
        },
        {
          address: 'token-account',
          decimals: 6,
          change_amount: 1_000_000,
          post_balance: 1_000_000,
          pre_balance: 0,
          mint: 'TokenMint111111111111111111111111111111111',
          owner: swapper,
        },
      ]

      const result = filter.filterRentNoise(balanceChanges, swapper)

      // Only swapper's changes should be processed
      expect(result.rentRefunds).toHaveLength(1)
      expect(result.rentRefunds[0].owner).toBe(swapper)
      expect(result.economicChanges).toHaveLength(1)
      expect(result.economicChanges[0].mint).toBe('TokenMint111111111111111111111111111111111')
    })
  })
})
