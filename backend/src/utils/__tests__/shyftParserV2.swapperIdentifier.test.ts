/**
 * SHYFT Parser V2 - SwapperIdentifier Property-Based Tests
 * 
 * This file contains property-based tests for the SwapperIdentifier component.
 * 
 * Task 3.3: Write property test for largest delta selection
 * Task 3.4: Write property test for non-core tie break
 * Task 3.5: Write property test for system account exclusion
 * Task 3.6: Write property test for single owner escalation
 * Task 3.7: Write property test for ambiguous owner escalation
 * Task 3.8: Write unit tests for relayer scenarios
 */

import * as fc from 'fast-check'
import { createSwapperIdentifier } from '../shyftParserV2.swapperIdentifier'
import { TokenBalanceChange, KNOWN_AMM_POOLS } from '../shyftParserV2.types'
import {
  walletAddressArbitrary,
  tokenMintArbitrary,
  priorityAssetMintArbitrary,
  tokenDecimalsArbitrary,
  ammPoolAddressArbitrary,
} from './shyftParserV2.arbitraries'

describe('SHYFT Parser V2 - SwapperIdentifier Property-Based Tests', () => {
  const swapperIdentifier = createSwapperIdentifier()

  /**
   * Property 3: Largest Economic Delta Wins
   * 
   * **Validates: Requirements 2.4, 2.6**
   * 
   * The swapper should be the wallet with the largest absolute economic delta,
   * even when the fee payer has a smaller delta.
   */
  describe('Property 3: Largest Economic Delta Wins', () => {
    it('should select the largest delta owner when fee payer differs', () => {
      fc.assert(
        fc.property(
          walletAddressArbitrary,
          walletAddressArbitrary,
          tokenMintArbitrary,
          tokenDecimalsArbitrary,
          fc.integer({ min: 1, max: 1_000_000_000 }),
          fc.integer({ min: 1, max: 1_000_000_000 }),
          (feePayer, actualSwapper, mint, decimals, baseDelta, extraDelta) => {
            fc.pre(feePayer !== actualSwapper)

            const feeDelta = baseDelta
            const swapperDelta = baseDelta + extraDelta

            const balanceChanges: TokenBalanceChange[] = [
              {
                address: 'account-fee-payer',
                decimals,
                change_amount: feeDelta,
                post_balance: 1000000 + feeDelta,
                pre_balance: 1000000,
                mint,
                owner: feePayer,
              },
              {
                address: 'account-swapper',
                decimals,
                change_amount: swapperDelta,
                post_balance: 1000000 + swapperDelta,
                pre_balance: 1000000,
                mint,
                owner: actualSwapper,
              },
            ]

            const result = swapperIdentifier.identifySwapper(feePayer, [feePayer], balanceChanges)

            expect(result.swapper).toBe(actualSwapper)
            expect(result.confidence).toBe('high')
            expect(result.method).toBe('owner_analysis')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should prefer non-core token delta when tied', () => {
      fc.assert(
        fc.property(
          walletAddressArbitrary,
          walletAddressArbitrary,
          priorityAssetMintArbitrary,
          tokenMintArbitrary,
          tokenDecimalsArbitrary,
          fc.integer({ min: 1, max: 1_000_000_000 }),
          (coreOwner, nonCoreOwner, coreMint, nonCoreMint, decimals, deltaMagnitude) => {
            fc.pre(coreOwner !== nonCoreOwner)
            fc.pre(!KNOWN_AMM_POOLS.has(nonCoreOwner))

            const balanceChanges: TokenBalanceChange[] = [
              {
                address: 'account-core',
                decimals,
                change_amount: deltaMagnitude,
                post_balance: 1000000 + deltaMagnitude,
                pre_balance: 1000000,
                mint: coreMint,
                owner: coreOwner,
              },
              {
                address: 'account-non-core',
                decimals,
                change_amount: -deltaMagnitude,
                post_balance: 1000000 - deltaMagnitude,
                pre_balance: 1000000,
                mint: nonCoreMint,
                owner: nonCoreOwner,
              },
            ]

            const result = swapperIdentifier.identifySwapper(coreOwner, [coreOwner], balanceChanges)

            expect(result.swapper).toBe(nonCoreOwner)
            expect(result.confidence).toBe('medium')
            expect(result.method).toBe('owner_analysis')
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 5: System Account Exclusion in Owner Analysis
   * 
   * **Validates: Requirements 2.8**
   * 
   * For any transaction requiring owner analysis escalation, known AMM pools, vaults, PDAs,
   * and program accounts should be excluded from swapper candidates.
   */
  describe('Property 5: System Account Exclusion in Owner Analysis', () => {
    it('should exclude known AMM pools from owner candidates', () => {
      fc.assert(
        fc.property(
          walletAddressArbitrary,
          fc.array(walletAddressArbitrary, { minLength: 1, maxLength: 3 }),
          ammPoolAddressArbitrary,
          walletAddressArbitrary,
          tokenMintArbitrary,
          tokenDecimalsArbitrary,
          fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }).filter((n) => n !== 0),
          (feePayer, signers, ammPool, userWallet, mint, decimals, nonZeroDelta) => {
            // Ensure fee payer, signers, AMM pool, and user wallet are all different
            fc.pre(
              feePayer !== userWallet &&
                !signers.includes(userWallet) &&
                ammPool !== userWallet &&
                !KNOWN_AMM_POOLS.has(userWallet)
            )

            // Create balance changes: AMM pool and user wallet both have deltas
            // Fee payer and signers have zero deltas (to trigger owner analysis)
            const balanceChanges: TokenBalanceChange[] = [
              {
                address: 'account-amm',
                decimals,
                change_amount: nonZeroDelta,
                post_balance: 1000000,
                pre_balance: 500000,
                mint,
                owner: ammPool,
              },
              {
                address: 'account-user',
                decimals,
                change_amount: nonZeroDelta * -1,
                post_balance: 500000,
                pre_balance: 1000000,
                mint,
                owner: userWallet,
              },
            ]

            const result = swapperIdentifier.identifySwapper(feePayer, signers, balanceChanges)

            // Assert: User wallet should be identified (AMM pool excluded)
            expect(result.swapper).toBe(userWallet)
            expect(result.confidence).toBe('high')
            expect(result.method).toBe('owner_analysis')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should classify as ERASE when only system accounts have deltas', () => {
      fc.assert(
        fc.property(
          walletAddressArbitrary,
          fc.array(walletAddressArbitrary, { minLength: 1, maxLength: 3 }),
          fc.array(ammPoolAddressArbitrary, { minLength: 1, maxLength: 3 }),
          tokenMintArbitrary,
          tokenDecimalsArbitrary,
          fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }).filter((n) => n !== 0),
          (feePayer, signers, ammPools, mint, decimals, nonZeroDelta) => {
            // Create balance changes: only AMM pools have deltas
            const balanceChanges: TokenBalanceChange[] = ammPools.map((ammPool, index) => ({
              address: `account-amm-${index}`,
              decimals,
              change_amount: index === 0 ? nonZeroDelta : nonZeroDelta * -1,
              post_balance: 1000000,
              pre_balance: 500000,
              mint,
              owner: ammPool,
            }))

            const result = swapperIdentifier.identifySwapper(feePayer, signers, balanceChanges)

            // Assert: Should classify as ERASE (no valid swapper candidates)
            expect(result.swapper).toBeNull()
            expect(result.confidence).toBe('low')
            expect(result.method).toBe('erase')
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 6: Single Owner Escalation Success
   * 
   * **Validates: Requirements 2.9**
   * 
   * For any transaction where both fee payer and primary signer have zero deltas,
   * if exactly one non-system wallet has non-zero deltas after exclusions,
   * that wallet should be identified as the swapper.
   */
  describe('Property 6: Single Owner Escalation Success', () => {
    it('should identify single owner as swapper when fee payer and signer have zero deltas', () => {
      fc.assert(
        fc.property(
          walletAddressArbitrary,
          fc.array(walletAddressArbitrary, { minLength: 1, maxLength: 3 }),
          walletAddressArbitrary,
          tokenMintArbitrary,
          tokenDecimalsArbitrary,
          fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }).filter((n) => n !== 0),
          (feePayer, signers, actualSwapper, mint, decimals, nonZeroDelta) => {
            // Ensure actual swapper is different from fee payer and signers
            fc.pre(
              actualSwapper !== feePayer &&
                !signers.includes(actualSwapper) &&
                !KNOWN_AMM_POOLS.has(actualSwapper)
            )

            // Create balance changes: only actual swapper has deltas
            const balanceChanges: TokenBalanceChange[] = [
              {
                address: 'account-swapper',
                decimals,
                change_amount: nonZeroDelta,
                post_balance: 1000000,
                pre_balance: 500000,
                mint,
                owner: actualSwapper,
              },
            ]

            const result = swapperIdentifier.identifySwapper(feePayer, signers, balanceChanges)

            // Assert: Actual swapper should be identified via owner analysis
            expect(result.swapper).toBe(actualSwapper)
            expect(result.confidence).toBe('high')
            expect(result.method).toBe('owner_analysis')
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 7: Ambiguous Owner Escalation Failure
   * 
   * **Validates: Requirements 2.10**
   * 
   * For any transaction where both fee payer and primary signer have zero deltas,
   * if zero or multiple non-system wallets remain after exclusions,
   * the transaction should be classified as ERASE.
   */
  describe('Property 7: Ambiguous Owner Escalation Failure', () => {
    it('should classify as ERASE when multiple owners tie on delta', () => {
      fc.assert(
        fc.property(
          walletAddressArbitrary,
          fc.array(walletAddressArbitrary, { minLength: 1, maxLength: 3 }),
          fc.array(walletAddressArbitrary, { minLength: 2, maxLength: 5 }),
          tokenMintArbitrary,
          tokenDecimalsArbitrary,
          fc.integer({ min: 1, max: 1_000_000_000 }),
          (feePayer, signers, multipleOwners, mint, decimals, magnitude) => {
            // Ensure all owners are different and not system accounts
            const uniqueOwners = Array.from(new Set(multipleOwners))
            fc.pre(
              uniqueOwners.length >= 2 &&
                uniqueOwners.every(
                  (owner) =>
                    owner !== feePayer &&
                    !signers.includes(owner) &&
                    !KNOWN_AMM_POOLS.has(owner)
                )
            )

            // Create balance changes: multiple owners with identical abs delta (tie)
            const balanceChanges: TokenBalanceChange[] = uniqueOwners.map((owner, index) => ({
              address: `account-${index}`,
              decimals,
              change_amount: index % 2 === 0 ? magnitude : -magnitude,
              post_balance: 1000000 + (index % 2 === 0 ? magnitude : -magnitude),
              pre_balance: 1000000,
              mint,
              owner,
            }))

            const result = swapperIdentifier.identifySwapper(feePayer, signers, balanceChanges)

            // Assert: Should classify as ERASE (ambiguous ownership tie)
            expect(result.swapper).toBeNull()
            expect(result.confidence).toBe('low')
            expect(result.method).toBe('erase')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should classify as ERASE when no owners have deltas', () => {
      fc.assert(
        fc.property(
          walletAddressArbitrary,
          fc.array(walletAddressArbitrary, { minLength: 1, maxLength: 3 }),
          tokenMintArbitrary,
          tokenDecimalsArbitrary,
          (feePayer, signers, mint, decimals) => {
            // Create balance changes with zero deltas
            const balanceChanges: TokenBalanceChange[] = [
              {
                address: 'account-1',
                decimals,
                change_amount: 0,
                post_balance: 1000000,
                pre_balance: 1000000,
                mint,
                owner: feePayer,
              },
            ]

            const result = swapperIdentifier.identifySwapper(feePayer, signers, balanceChanges)

            // Assert: Should classify as ERASE (no activity)
            expect(result.swapper).toBeNull()
            expect(result.confidence).toBe('low')
            expect(result.method).toBe('erase')
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})

/**
 * Unit Tests for Relayer Scenarios
 * 
 * Task 3.8: Write unit tests for relayer scenarios
 * Requirements: 2.9, 2.10
 */
describe('SHYFT Parser V2 - SwapperIdentifier Unit Tests', () => {
  const swapperIdentifier = createSwapperIdentifier()

  describe('Relayer Scenarios', () => {
    it('should identify actual swapper in relayer-paid transaction', () => {
      const relayer = 'Relayer1111111111111111111111111111111111111'
      const actualSwapper = 'Wallet11111111111111111111111111111111111111'
      const signers = [actualSwapper]

      const balanceChanges: TokenBalanceChange[] = [
        {
          address: 'account-swapper-sol',
          decimals: 9,
          change_amount: -5000000000, // -5 SOL
          post_balance: 1000000000,
          pre_balance: 6000000000,
          mint: 'So11111111111111111111111111111111111111112',
          owner: actualSwapper,
        },
        {
          address: 'account-swapper-token',
          decimals: 6,
          change_amount: 1000000000, // +1000 tokens
          post_balance: 1000000000,
          pre_balance: 0,
          mint: 'TokenMint111111111111111111111111111111111',
          owner: actualSwapper,
        },
      ]

      const result = swapperIdentifier.identifySwapper(relayer, signers, balanceChanges)

      // Assert: Actual swapper should be identified via owner analysis
      expect(result.swapper).toBe(actualSwapper)
      expect(result.confidence).toBe('high')
      expect(result.method).toBe('owner_analysis')
    })

    it('should handle multiple signer scenarios', () => {
      const feePayer = 'FeePayer111111111111111111111111111111111111'
      const signer1 = 'Signer11111111111111111111111111111111111111'
      const signer2 = 'Signer22222222222222222222222222222222222222'
      const signers = [signer1, signer2]

      const balanceChanges: TokenBalanceChange[] = [
        {
          address: 'account-signer1',
          decimals: 9,
          change_amount: -3000000000, // -3 SOL
          post_balance: 2000000000,
          pre_balance: 5000000000,
          mint: 'So11111111111111111111111111111111111111112',
          owner: signer1,
        },
        {
          address: 'account-signer1-token',
          decimals: 6,
          change_amount: 500000000, // +500 tokens
          post_balance: 500000000,
          pre_balance: 0,
          mint: 'TokenMint111111111111111111111111111111111',
          owner: signer1,
        },
      ]

      const result = swapperIdentifier.identifySwapper(feePayer, signers, balanceChanges)

      // Assert: Owner with largest delta should be identified
      expect(result.swapper).toBe(signer1)
      expect(result.confidence).toBe('high')
      expect(result.method).toBe('owner_analysis')
    })

    it('should handle ambiguous ownership cases', () => {
      const feePayer = 'FeePayer111111111111111111111111111111111111'
      const signers = ['Signer11111111111111111111111111111111111111']
      const owner1 = 'Owner111111111111111111111111111111111111111'
      const owner2 = 'Owner222222222222222222222222222222222222222'

      const balanceChanges: TokenBalanceChange[] = [
        {
          address: 'account-owner1',
          decimals: 9,
          change_amount: -2000000000, // -2 SOL
          post_balance: 3000000000,
          pre_balance: 5000000000,
          mint: 'So11111111111111111111111111111111111111112',
          owner: owner1,
        },
        {
          address: 'account-owner2',
          decimals: 6,
          change_amount: 2000000000, // +2000 tokens (tie abs delta)
          post_balance: 2000000000,
          pre_balance: 0,
          mint: 'TokenMint111111111111111111111111111111111',
          owner: owner2,
        },
      ]

      const result = swapperIdentifier.identifySwapper(feePayer, signers, balanceChanges)

      // Assert: Should classify as ERASE (ambiguous tie)
      expect(result.swapper).toBeNull()
      expect(result.confidence).toBe('low')
      expect(result.method).toBe('erase')
    })

    it('should handle relayer with AMM pool interaction', () => {
      const relayer = 'Relayer1111111111111111111111111111111111111'
      const actualSwapper = 'Wallet11111111111111111111111111111111111111'
      const ammPool = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8' // Raydium pool
      const signers = [actualSwapper]

      const balanceChanges: TokenBalanceChange[] = [
        {
          address: 'account-swapper',
          decimals: 9,
          change_amount: -4000000000, // -4 SOL
          post_balance: 1000000000,
          pre_balance: 5000000000,
          mint: 'So11111111111111111111111111111111111111112',
          owner: actualSwapper,
        },
        {
          address: 'account-pool',
          decimals: 9,
          change_amount: 4000000000, // +4 SOL (pool receives)
          post_balance: 100000000000,
          pre_balance: 96000000000,
          mint: 'So11111111111111111111111111111111111111112',
          owner: ammPool,
        },
        {
          address: 'account-swapper-token',
          decimals: 6,
          change_amount: 800000000, // +800 tokens
          post_balance: 800000000,
          pre_balance: 0,
          mint: 'TokenMint111111111111111111111111111111111',
          owner: actualSwapper,
        },
      ]

      const result = swapperIdentifier.identifySwapper(relayer, signers, balanceChanges)

      // Assert: Actual swapper should be identified (AMM pool excluded)
      expect(result.swapper).toBe(actualSwapper)
      expect(result.confidence).toBe('high')
      expect(result.method).toBe('owner_analysis')
    })
  })
})
