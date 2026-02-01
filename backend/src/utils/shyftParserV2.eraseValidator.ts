/**
 * SHYFT Parser V2 - EraseValidator Component
 * 
 * Purpose: Apply strict rules to reject non-swap transactions
 * 
 * Task 9.1: Create strict ERASE validation rules
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 * 
 * Logic:
 * // Rule 1: Both positive (airdrop, mint, reward)
 * IF base.netDelta > 0 AND quote.netDelta >= 0:
 *   RETURN { isValid: false, eraseReason: 'both_positive_airdrop' }
 * 
 * // Rule 2: Both negative (burn, transfer, protocol movement)
 * IF base.netDelta < 0 AND quote.netDelta <= 0:
 *   RETURN { isValid: false, eraseReason: 'both_negative_burn' }
 * 
 * // Rule 3: No base delta (pure quote movement)
 * IF abs(base.netDelta) < EPSILON:
 *   RETURN { isValid: false, eraseReason: 'no_base_delta' }
 * 
 * RETURN { isValid: true }
 */

import {
  AssetDelta,
  ValidationResult,
  EraseValidator,
  EPSILON,
} from './shyftParserV2.types'

/**
 * EraseValidator implementation
 * 
 * Applies three strict rejection rules to filter out non-swap transactions:
 * 1. Both positive deltas (airdrop/mint/reward)
 * 2. Both negative deltas (burn/transfer)
 * 3. Missing base delta (pure quote movement)
 * 
 * These rules ensure that only legitimate swap transactions (one asset in, one asset out)
 * are classified as swaps, while other transaction types are rejected as ERASE.
 */
export class EraseValidatorImpl implements EraseValidator {
  /**
   * Validate that quote and base deltas represent a legitimate swap
   * 
   * @param quote - The quote asset delta (asset being sold/bought)
   * @param base - The base asset delta (asset being bought/sold)
   * @returns Validation result with isValid flag and optional eraseReason
   * 
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
   */
  validate(quote: AssetDelta, base: AssetDelta): ValidationResult {
    // Rule 3: No base delta (pure quote movement)
    // Check this FIRST because if base is zero, the other rules may give misleading results
    // If the base asset has no movement, this is not a swap
    if (Math.abs(base.netDelta) < EPSILON) {
      return {
        isValid: false,
        eraseReason: 'no_base_delta',
      }
    }

    // Rule 1: Both positive (airdrop, mint, reward)
    // If both assets are incoming, this is not a swap
    if (base.netDelta > 0 && quote.netDelta >= 0) {
      return {
        isValid: false,
        eraseReason: 'both_positive_airdrop',
      }
    }

    // Rule 2: Both negative (burn, transfer, protocol movement)
    // If both assets are outgoing, this is not a swap
    if (base.netDelta < 0 && quote.netDelta <= 0) {
      return {
        isValid: false,
        eraseReason: 'both_negative_burn',
      }
    }

    // All validation rules passed - this is a valid swap
    return {
      isValid: true,
    }
  }
}

/**
 * Factory function to create an EraseValidator instance
 */
export function createEraseValidator(): EraseValidator {
  return new EraseValidatorImpl()
}
