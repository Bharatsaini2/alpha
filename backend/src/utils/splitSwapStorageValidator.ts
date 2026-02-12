/**
 * Split Swap Storage Validator
 * 
 * Validates that stored swap records conform to architectural invariants:
 * 1. Amount fields contain actual token amounts (not USD values)
 * 2. SOL amount fields are null when SOL is not involved
 * 3. Split swaps are stored as separate records (not merged "both" type)
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4
 * Task: Phase A, Task 3
 */

import { ParsedSwap } from './shyftParserV2.types'
import { IWhaleAllTransactionsV2 } from '../models/whaleAllTransactionsV2.model'
import { isSOLMint } from './splitSwapStorageMapper'

/**
 * Validation error detail
 */
export interface ValidationError {
  field: string
  issue: string
  expectedValue: any
  actualValue: any
}

/**
 * Storage validation result
 */
export interface StorageValidationResult {
  valid: boolean
  errors: ValidationError[]
}

/**
 * Validates that a stored swap record conforms to architectural invariants
 * 
 * Checks:
 * - Amount fields contain actual token amounts from Parser V2
 * - SOL fields are null when SOL is not involved
 * - SOL fields contain actual SOL deltas when SOL is involved
 * - No USD values in amount fields
 * - No fabricated SOL amounts from price conversions
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4
 * 
 * @param parsedSwap - Parser V2 output
 * @param storedRecord - Stored database record
 * @returns Validation result with errors if any
 */
export function validateSplitSwapStorage(
  parsedSwap: ParsedSwap,
  storedRecord: IWhaleAllTransactionsV2
): StorageValidationResult {
  const errors: ValidationError[] = []
  
  const { direction, amounts, quoteAsset, baseAsset } = parsedSwap
  
  // Parse stored amounts for comparison
  // ✅ Fix #2: Add numeric validation BEFORE using parseFloat results
  const storedBuyAmount = parseFloat(storedRecord.amount.buyAmount)
  const storedSellAmount = parseFloat(storedRecord.amount.sellAmount)
  const storedBuySolAmount = storedRecord.solAmount.buySolAmount 
    ? parseFloat(storedRecord.solAmount.buySolAmount) 
    : null
  const storedSellSolAmount = storedRecord.solAmount.sellSolAmount 
    ? parseFloat(storedRecord.solAmount.sellSolAmount) 
    : null
  
  // ✅ Validate numeric values FIRST (catch NaN from invalid data)
  // This prevents NaN from passing validation due to NaN > 0.0001 being false
  if (isNaN(storedBuyAmount)) {
    errors.push({
      field: 'amount.buyAmount',
      issue: 'Not a valid number',
      expectedValue: 'numeric value',
      actualValue: storedRecord.amount.buyAmount,
    })
  }
  
  if (isNaN(storedSellAmount)) {
    errors.push({
      field: 'amount.sellAmount',
      issue: 'Not a valid number',
      expectedValue: 'numeric value',
      actualValue: storedRecord.amount.sellAmount,
    })
  }
  
  // Validate non-negative amounts
  if (!isNaN(storedBuyAmount) && storedBuyAmount < 0) {
    errors.push({
      field: 'amount.buyAmount',
      issue: 'Amount cannot be negative',
      expectedValue: '>= 0',
      actualValue: storedBuyAmount,
    })
  }
  
  if (!isNaN(storedSellAmount) && storedSellAmount < 0) {
    errors.push({
      field: 'amount.sellAmount',
      issue: 'Amount cannot be negative',
      expectedValue: '>= 0',
      actualValue: storedSellAmount,
    })
  }
  
  // Validate SOL amounts are numeric when not null
  if (storedBuySolAmount !== null && isNaN(storedBuySolAmount)) {
    errors.push({
      field: 'solAmount.buySolAmount',
      issue: 'Not a valid number',
      expectedValue: 'numeric value or null',
      actualValue: storedRecord.solAmount.buySolAmount,
    })
  }
  
  if (storedSellSolAmount !== null && isNaN(storedSellSolAmount)) {
    errors.push({
      field: 'solAmount.sellSolAmount',
      issue: 'Not a valid number',
      expectedValue: 'numeric value or null',
      actualValue: storedRecord.solAmount.sellSolAmount,
    })
  }
  
  // Validate SOL amounts are non-negative when not null
  if (storedBuySolAmount !== null && storedBuySolAmount < 0) {
    errors.push({
      field: 'solAmount.buySolAmount',
      issue: 'SOL amount cannot be negative',
      expectedValue: '>= 0',
      actualValue: storedBuySolAmount,
    })
  }
  
  if (storedSellSolAmount !== null && storedSellSolAmount < 0) {
    errors.push({
      field: 'solAmount.sellSolAmount',
      issue: 'SOL amount cannot be negative',
      expectedValue: '>= 0',
      actualValue: storedSellSolAmount,
    })
  }
  
  // Early return if numeric validation failed
  if (errors.length > 0) {
    return { valid: false, errors }
  }
  
  // Validate amount fields contain actual token amounts
  if (direction === 'BUY') {
    // BUY: buyAmount should be baseAmount, sellAmount should be totalWalletCost ?? 0
    if (Math.abs(storedBuyAmount - amounts.baseAmount) > 0.0001) {
      errors.push({
        field: 'amount.buyAmount',
        issue: 'Does not match Parser V2 baseAmount',
        expectedValue: amounts.baseAmount,
        actualValue: storedBuyAmount,
      })
    }
    
    // ✅ Always validate fallback behavior (undefined → 0)
    const expectedSellAmount = amounts.totalWalletCost ?? 0
    if (Math.abs(storedSellAmount - expectedSellAmount) > 0.0001) {
      errors.push({
        field: 'amount.sellAmount',
        issue: 'Does not match Parser V2 totalWalletCost (or 0 if undefined)',
        expectedValue: expectedSellAmount,
        actualValue: storedSellAmount,
      })
    }
  } else {
    // SELL: buyAmount should be netWalletReceived ?? 0, sellAmount should be baseAmount
    // ✅ Always validate fallback behavior (undefined → 0)
    const expectedBuyAmount = amounts.netWalletReceived ?? 0
    if (Math.abs(storedBuyAmount - expectedBuyAmount) > 0.0001) {
      errors.push({
        field: 'amount.buyAmount',
        issue: 'Does not match Parser V2 netWalletReceived (or 0 if undefined)',
        expectedValue: expectedBuyAmount,
        actualValue: storedBuyAmount,
      })
    }
    
    if (Math.abs(storedSellAmount - amounts.baseAmount) > 0.0001) {
      errors.push({
        field: 'amount.sellAmount',
        issue: 'Does not match Parser V2 baseAmount',
        expectedValue: amounts.baseAmount,
        actualValue: storedSellAmount,
      })
    }
  }
  
  // Validate SOL amounts
  const isQuoteSOL = isSOLMint(quoteAsset.mint)
  const isBaseSOL = isSOLMint(baseAsset.mint)
  
  if (!isQuoteSOL && !isBaseSOL) {
    // No SOL involved - both fields should be null
    if (storedBuySolAmount !== null) {
      errors.push({
        field: 'solAmount.buySolAmount',
        issue: 'Should be null when SOL not involved',
        expectedValue: null,
        actualValue: storedBuySolAmount,
      })
    }
    
    if (storedSellSolAmount !== null) {
      errors.push({
        field: 'solAmount.sellSolAmount',
        issue: 'Should be null when SOL not involved',
        expectedValue: null,
        actualValue: storedSellSolAmount,
      })
    }
  } else {
    // SOL is involved - validate correct fields are populated
    if (direction === 'BUY') {
      // BUY: bought baseAsset, spent quoteAsset
      if (isBaseSOL) {
        // Bought SOL - buySolAmount should match baseAmount
        const expectedBuySolAmount = amounts.baseAmount
        if (storedBuySolAmount === null || Math.abs(storedBuySolAmount - expectedBuySolAmount) > 0.0001) {
          errors.push({
            field: 'solAmount.buySolAmount',
            issue: 'Should match Parser V2 baseAmount when buying SOL',
            expectedValue: expectedBuySolAmount,
            actualValue: storedBuySolAmount,
          })
        }
      } else {
        // Did not buy SOL - buySolAmount should be null
        if (storedBuySolAmount !== null) {
          errors.push({
            field: 'solAmount.buySolAmount',
            issue: 'Should be null when not buying SOL',
            expectedValue: null,
            actualValue: storedBuySolAmount,
          })
        }
      }
      
      if (isQuoteSOL) {
        // Spent SOL - sellSolAmount should match totalWalletCost
        const expectedSellSolAmount = amounts.totalWalletCost ?? null
        if (expectedSellSolAmount !== null) {
          if (storedSellSolAmount === null || Math.abs(storedSellSolAmount - expectedSellSolAmount) > 0.0001) {
            errors.push({
              field: 'solAmount.sellSolAmount',
              issue: 'Should match Parser V2 totalWalletCost when spending SOL',
              expectedValue: expectedSellSolAmount,
              actualValue: storedSellSolAmount,
            })
          }
        }
      } else {
        // Did not spend SOL - sellSolAmount should be null
        if (storedSellSolAmount !== null) {
          errors.push({
            field: 'solAmount.sellSolAmount',
            issue: 'Should be null when not spending SOL',
            expectedValue: null,
            actualValue: storedSellSolAmount,
          })
        }
      }
    } else {
      // SELL: sold baseAsset, received quoteAsset
      if (isQuoteSOL) {
        // Received SOL - buySolAmount should match netWalletReceived
        const expectedBuySolAmount = amounts.netWalletReceived ?? null
        if (expectedBuySolAmount !== null) {
          if (storedBuySolAmount === null || Math.abs(storedBuySolAmount - expectedBuySolAmount) > 0.0001) {
            errors.push({
              field: 'solAmount.buySolAmount',
              issue: 'Should match Parser V2 netWalletReceived when receiving SOL',
              expectedValue: expectedBuySolAmount,
              actualValue: storedBuySolAmount,
            })
          }
        }
      } else {
        // Did not receive SOL - buySolAmount should be null
        if (storedBuySolAmount !== null) {
          errors.push({
            field: 'solAmount.buySolAmount',
            issue: 'Should be null when not receiving SOL',
            expectedValue: null,
            actualValue: storedBuySolAmount,
          })
        }
      }
      
      if (isBaseSOL) {
        // Sold SOL - sellSolAmount should match baseAmount
        const expectedSellSolAmount = amounts.baseAmount
        if (storedSellSolAmount === null || Math.abs(storedSellSolAmount - expectedSellSolAmount) > 0.0001) {
          errors.push({
            field: 'solAmount.sellSolAmount',
            issue: 'Should match Parser V2 baseAmount when selling SOL',
            expectedValue: expectedSellSolAmount,
            actualValue: storedSellSolAmount,
          })
        }
      } else {
        // Did not sell SOL - sellSolAmount should be null
        if (storedSellSolAmount !== null) {
          errors.push({
            field: 'solAmount.sellSolAmount',
            issue: 'Should be null when not selling SOL',
            expectedValue: null,
            actualValue: storedSellSolAmount,
          })
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}
