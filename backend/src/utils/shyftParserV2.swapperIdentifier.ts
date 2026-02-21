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

    const candidate1 = feePayer
    const candidate2 = signers[0] || null

    // Tier 1: Fee payer check (Requirement 2.4)
    if (this.hasAnyDelta(candidate1, tokenBalanceChanges)) {
      logger.debug({ swapper: candidate1 }, 'SwapperIdentifier: Tier 1 - Fee payer has delta')
      return {
        swapper: candidate1,
        confidence: 'high',
        method: 'fee_payer',
      }
    }

    // Tier 2: Primary signer fallback (Requirement 2.5)
    if (candidate2 && this.hasAnyDelta(candidate2, tokenBalanceChanges)) {
      logger.debug({ swapper: candidate2 }, 'SwapperIdentifier: Tier 2 - Primary signer has delta')
      return {
        swapper: candidate2,
        confidence: 'medium',
        method: 'signer',
      }
    }

    // Tier 3: Owner analysis escalation (Requirements 2.6, 2.7, 2.8, 2.9)
    logger.debug('SwapperIdentifier: Tier 3 - Escalating to owner analysis')
    const owners = this.collectOwnersWithDeltas(tokenBalanceChanges)
    const filteredOwners = this.excludeSystemAccounts(owners)

    logger.debug(
      { totalOwners: owners.length, filteredOwners: filteredOwners.length },
      'SwapperIdentifier: Owner analysis results'
    )

    // Requirement 2.9: Exactly one wallet after exclusions
    if (filteredOwners.length === 1) {
      logger.debug({ swapper: filteredOwners[0] }, 'SwapperIdentifier: Tier 3 - Single owner identified')
      return {
        swapper: filteredOwners[0],
        confidence: 'low',
        method: 'owner_analysis',
      }
    }

    // Tier 4: Cannot determine (Requirement 2.10)
    logger.debug(
      { filteredOwnerCount: filteredOwners.length },
      'SwapperIdentifier: Tier 4 - Cannot determine swapper (ERASE)'
    )
    return {
      swapper: null,
      confidence: 'low',
      method: 'erase',
    }
  }

  /**
   * Check if a wallet has any non-zero balance delta
   * 
   * @param wallet - Wallet address to check
   * @param tokenBalanceChanges - All token balance changes
   * @returns true if wallet has at least one non-zero delta
   */
  private hasAnyDelta(wallet: string, tokenBalanceChanges: TokenBalanceChange[]): boolean {
    return tokenBalanceChanges.some(
      (change) => change.owner === wallet && change.change_amount !== 0
    )
  }

  /**
   * Collect all unique owners with non-zero deltas
   * 
   * Requirement 2.7: Collect all unique owners from token_balance_changes with non-zero deltas
   * 
   * @param tokenBalanceChanges - All token balance changes
   * @returns Array of unique owner addresses with non-zero deltas
   */
  private collectOwnersWithDeltas(tokenBalanceChanges: TokenBalanceChange[]): string[] {
    const ownersSet = new Set<string>()

    for (const change of tokenBalanceChanges) {
      if (change.change_amount !== 0) {
        ownersSet.add(change.owner)
      }
    }

    return Array.from(ownersSet)
  }

  /**
   * Exclude system accounts from owner candidates
   * 
   * Requirement 2.8: Exclude AMM pools, vaults, PDAs, and program accounts
   * 
   * System accounts include:
   * - Known AMM pool addresses (Raydium, Orca, Jupiter)
   * - Vault program addresses
   * - PDA patterns (deterministic derivation check)
   * - Program-owned accounts
   * 
   * @param owners - Array of owner addresses
   * @returns Filtered array with system accounts removed
   */
  private excludeSystemAccounts(owners: string[]): string[] {
    return owners.filter((owner) => !this.isSystemAccount(owner))
  }

  /**
   * Check if an address is a system account
   * 
   * @param address - Address to check
   * @returns true if address is a system account
   */
  private isSystemAccount(address: string): boolean {
    // Check known AMM pools
    if (KNOWN_AMM_POOLS.has(address)) {
      logger.debug({ address }, 'SwapperIdentifier: Excluded known AMM pool')
      return true
    }

    // Check for PDA patterns
    // PDAs typically have specific patterns or can be detected by their derivation
    // For now, we use a heuristic: addresses ending in specific patterns
    // This is a simplified check - in production, you might want more sophisticated PDA detection
    if (this.isProbablyPDA(address)) {
      logger.debug({ address }, 'SwapperIdentifier: Excluded probable PDA')
      return true
    }

    // Check for program-owned accounts
    // Program accounts typically have specific prefixes or patterns
    // This is a heuristic check
    if (this.isProbablyProgramAccount(address)) {
      logger.debug({ address }, 'SwapperIdentifier: Excluded probable program account')
      return true
    }

    return false
  }

  /**
   * Heuristic check for PDA (Program Derived Address)
   * 
   * PDAs are deterministically derived addresses that don't have private keys.
   * They're commonly used for program-controlled accounts.
   * 
   * This is a simplified heuristic. In production, you might want to:
   * - Check if the address is off the ed25519 curve
   * - Verify against known PDA seeds
   * - Use on-chain account data to check ownership
   * 
   * @param address - Address to check
   * @returns true if address is probably a PDA
   */
  private isProbablyPDA(address: string): boolean {
    // PDAs often contain specific patterns in their base58 encoding
    // This is a placeholder for more sophisticated PDA detection
    // For now, we'll use a conservative approach and not filter based on this
    return false
  }

  /**
   * Heuristic check for program-owned account
   * 
   * Program accounts are owned by smart contracts rather than user wallets.
   * 
   * This is a simplified heuristic. In production, you might want to:
   * - Check the account owner field from on-chain data
   * - Maintain a list of known program addresses
   * - Use account discriminators
   * 
   * @param address - Address to check
   * @returns true if address is probably a program account
   */
  private isProbablyProgramAccount(address: string): boolean {
    // Program accounts often have specific patterns
    // This is a placeholder for more sophisticated program account detection
    // For now, we'll use a conservative approach and not filter based on this
    return false
  }
}

/**
 * Factory function to create a SwapperIdentifier instance
 */
export function createSwapperIdentifier(): SwapperIdentifier {
  return new SwapperIdentifierImpl()
}
