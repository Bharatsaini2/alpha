/**
 * SHYFT Parser V2 - RentRefundFilter Component
 * 
 * Purpose: Identify and flag non-economic SOL rent refunds
 * 
 * Task 2.1: Create rent noise detection logic
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 * 
 * Logic:
 * FOR each balance_change WHERE owner == swapper:
 *   IF asset == SOL AND delta > 0 AND abs(delta) < 0.01:
 *     has_non_sol_activity = EXISTS(other_change WHERE mint != SOL AND delta != 0)
 *     IF has_non_sol_activity:
 *       MARK as rent_noise
 *       ADD to rentRefunds
 *       CONTINUE
 *   ADD to economicChanges
 */

import {
  TokenBalanceChange,
  FilteredBalanceChanges,
  RentRefundFilter,
  PRIORITY_ASSETS,
  RENT_NOISE_THRESHOLD_SOL,
} from './shyftParserV2.types'

/**
 * RentRefundFilter implementation
 * 
 * Filters out non-economic SOL rent refunds from balance changes.
 * Rent refunds are small positive SOL deltas (< 0.01 SOL) that occur when
 * Associated Token Accounts (ATAs) are closed during a transaction.
 * 
 * These should be excluded from economic analysis to prevent false BUY classifications.
 */
export class RentRefundFilterImpl implements RentRefundFilter {
  /**
   * Filter rent noise from balance changes
   * 
   * @param balanceChanges - All token balance changes from the transaction
   * @param swapperAddress - The identified swapper wallet address
   * @returns Filtered balance changes split into economic changes and rent refunds
   * 
   * **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6**
   */
  filterRentNoise(
    balanceChanges: TokenBalanceChange[],
    swapperAddress: string
  ): FilteredBalanceChanges {
    const economicChanges: TokenBalanceChange[] = []
    const rentRefunds: TokenBalanceChange[] = []

    // Filter balance changes for the swapper only
    const swapperChanges = balanceChanges.filter(
      (change) => change.owner === swapperAddress
    )

    // Check if there's any non-SOL activity
    const hasNonSolActivity = swapperChanges.some(
      (change) => change.mint !== PRIORITY_ASSETS.SOL && change.change_amount !== 0
    )

    // Process each balance change
    for (const change of swapperChanges) {
      // Check if this is a rent refund candidate
      if (this.isRentNoise(change, hasNonSolActivity)) {
        rentRefunds.push(change)
      } else {
        economicChanges.push(change)
      }
    }

    return {
      economicChanges,
      rentRefunds,
    }
  }

  /**
   * Check if a balance change is rent noise
   * 
   * A balance change is rent noise if ALL conditions hold:
   * 1. The asset is SOL (native or wrapped)
   * 2. The delta is positive (incoming)
   * 3. The absolute value is less than 0.01 SOL
   * 4. At least one non-SOL asset has a non-zero delta
   * 
   * @param change - The balance change to check
   * @param hasNonSolActivity - Whether there's any non-SOL activity in the transaction
   * @returns true if this is rent noise, false otherwise
   * 
   * **Validates: Requirements 1.3, 1.7**
   */
  private isRentNoise(
    change: TokenBalanceChange,
    hasNonSolActivity: boolean
  ): boolean {
    // Condition 1: Asset is SOL
    const isSol = change.mint === PRIORITY_ASSETS.SOL

    // Condition 2: Delta is positive (incoming)
    const isPositive = change.change_amount > 0

    // Condition 3: Absolute value is less than 0.01 SOL
    // Convert from lamports (9 decimals) to SOL
    const amountInSol = Math.abs(change.change_amount) / Math.pow(10, change.decimals)
    const isBelowThreshold = amountInSol < RENT_NOISE_THRESHOLD_SOL

    // Condition 4: At least one non-SOL asset has a non-zero delta
    // This is passed in as hasNonSolActivity

    // All conditions must be true for rent noise classification
    return isSol && isPositive && isBelowThreshold && hasNonSolActivity
  }
}

/**
 * Factory function to create a RentRefundFilter instance
 */
export function createRentRefundFilter(): RentRefundFilter {
  return new RentRefundFilterImpl()
}
