/**
 * SHYFT Parser V2 - SwapperIdentifier Component
 * 
 * Purpose: Determine the actual swapper wallet using three-tier escalation logic
 * 
 * Task 3.1: Create three-tier escalation logic
 * Task 3.2: Implement system account exclusion logic
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10
 */

import {
  SwapperIdentifier,
  SwapperResult,
  TokenBalanceChange,
  KNOWN_AMM_POOLS,
} from './shyftParserV2.types'
import logger from './logger'
import { CORE_TOKENS, SYSTEM_ACCOUNTS } from './shyftParserV2/constants'

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const DEX_PROGRAMS = KNOWN_AMM_POOLS
const POOL_VAULTS = new Set<string>()

type OwnerDeltaStats = {
  sumAbsDelta: number
  hasNonCoreDelta: boolean
}

/**
 * SwapperIdentifier Implementation
 * 
 * Three-tier escalation logic:
 * 1. Tier 1: Check if fee payer has any non-zero balance delta (high confidence)
 * 2. Tier 2: Check if primary signer (signers[0]) has any non-zero balance delta (medium confidence)
 * 3. Tier 3: Escalate to owner analysis - collect all unique owners with deltas, exclude system accounts (low confidence)
 * 4. Tier 4: If zero or multiple wallets remain, classify as ERASE
 */
export class SwapperIdentifierImpl implements SwapperIdentifier {
  /**
   * Identify the swapper wallet using escalation logic
   * 
   * @param feePayer - The account that paid transaction fees
   * @param signers - Array of transaction signers
   * @param tokenBalanceChanges - All token balance changes in the transaction
   * @returns SwapperResult with swapper address, confidence, and identification method
   */
  identifySwapper(
    feePayer: string,
    signers: string[],
    tokenBalanceChanges: TokenBalanceChange[]
  ): SwapperResult {
    logger.debug(
      { feePayer, signers, balanceChangeCount: tokenBalanceChanges.length },
      'SwapperIdentifier: Starting swapper identification'
    )

    // Tier 1: Wallet with largest economic delta (balance-based)
    const ownerStats = this.collectOwnerStats(tokenBalanceChanges)
    const candidates = [...ownerStats.entries()]

    if (candidates.length === 0) {
      logger.debug('SwapperIdentifier: No economic delta after exclusions')
      return {
        swapper: null,
        confidence: 'low',
        method: 'erase',
      }
    }

    const maxDelta = Math.max(...candidates.map(([, stats]) => stats.sumAbsDelta))
    const topCandidates = candidates.filter(([, stats]) => stats.sumAbsDelta === maxDelta)

    if (topCandidates.length === 1) {
      const [swapper] = topCandidates[0]
      logger.debug({ swapper }, 'SwapperIdentifier: Tier 1 - Largest economic delta')
      return {
        swapper,
        confidence: 'high',
        method: 'owner_analysis',
      }
    }

    // Tier 2: Tie-breaker prefers non-core token deltas
    const nonCoreCandidates = topCandidates.filter(([, stats]) => stats.hasNonCoreDelta)
    if (nonCoreCandidates.length === 1) {
      const [swapper] = nonCoreCandidates[0]
      logger.debug({ swapper }, 'SwapperIdentifier: Tier 2 - Non-core delta tie-break')
      return {
        swapper,
        confidence: 'medium',
        method: 'owner_analysis',
      }
    }

    // Tier 3: Fee payer only if it has a non-zero economic delta
    const feePayerStats = ownerStats.get(feePayer)
    if (feePayerStats && feePayerStats.sumAbsDelta > 0) {
      logger.debug({ swapper: feePayer }, 'SwapperIdentifier: Tier 3 - Fee payer delta fallback')
      return {
        swapper: feePayer,
        confidence: 'low',
        method: 'fee_payer',
      }
    }

    logger.debug(
      { candidateCount: topCandidates.length },
      'SwapperIdentifier: Tie unresolved after non-core and fee payer fallback'
    )
    return {
      swapper: null,
      confidence: 'low',
      method: 'erase',
    }
  }

  private collectOwnerStats(
    tokenBalanceChanges: TokenBalanceChange[]
  ): Map<string, OwnerDeltaStats> {
    const stats = new Map<string, OwnerDeltaStats>()

    for (const change of tokenBalanceChanges) {
      const owner = change.owner
      const delta = this.extractDelta(change)

      if (!owner || delta === 0 || !Number.isFinite(delta)) {
        continue
      }

      if (this.isExcludedOwner(owner)) {
        continue
      }

      const entry = stats.get(owner) ?? { sumAbsDelta: 0, hasNonCoreDelta: false }
      entry.sumAbsDelta += Math.abs(delta)

      if (!CORE_TOKENS.has(change.mint)) {
        entry.hasNonCoreDelta = true
      }

      stats.set(owner, entry)
    }

    return stats
  }

  private extractDelta(change: TokenBalanceChange): number {
    if (
      typeof change.post_balance === 'number' &&
      typeof change.pre_balance === 'number'
    ) {
      return change.post_balance - change.pre_balance
    }

    return change.change_amount || 0
  }

  /**
   * Check if an address is a system account
   * 
   * @param address - Address to check
   * @returns true if address is a system account
   */
  private isSystemAccount(address: string): boolean {
    if (SYSTEM_ACCOUNTS.has(address)) {
      logger.debug({ address }, 'SwapperIdentifier: Excluded system account')
      return true
    }

    if (address === TOKEN_PROGRAM_ID) {
      logger.debug({ address }, 'SwapperIdentifier: Excluded token program')
      return true
    }

    if (DEX_PROGRAMS.has(address)) {
      logger.debug({ address }, 'SwapperIdentifier: Excluded dex program')
      return true
    }

    if (POOL_VAULTS.has(address)) {
      logger.debug({ address }, 'SwapperIdentifier: Excluded pool vault')
      return true
    }

    return false
  }

  private isExcludedOwner(address: string): boolean {
    return this.isSystemAccount(address)
  }
}

/**
 * Factory function to create a SwapperIdentifier instance
 */
export function createSwapperIdentifier(): SwapperIdentifier {
  return new SwapperIdentifierImpl()
}
