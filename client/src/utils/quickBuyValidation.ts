/**
 * Validation utilities for Quick Buy amount
 */

export interface QuickBuyValidationResult {
  isValid: boolean
  error?: string
}

/**
 * Validates a Quick Buy amount input
 * Rejects negative, zero, and non-numeric values
 * 
 * @param value - The input value to validate
 * @returns Validation result with isValid flag and optional error message
 */
export function validateQuickBuyAmount(value: string | number | null | undefined): QuickBuyValidationResult {
  // Handle empty/null/undefined
  if (value === null || value === undefined || value === '') {
    return {
      isValid: false,
      error: 'Please enter a Quick Buy amount'
    }
  }

  // Convert to string for validation
  const strValue = String(value).trim()

  // Check if empty after trim
  if (strValue === '') {
    return {
      isValid: false,
      error: 'Please enter a Quick Buy amount'
    }
  }

  // Check if numeric
  const numValue = parseFloat(strValue)
  if (isNaN(numValue)) {
    return {
      isValid: false,
      error: 'Quick Buy amount must be a valid number'
    }
  }

  // Check if positive
  if (numValue <= 0) {
    return {
      isValid: false,
      error: 'Quick Buy amount must be greater than 0'
    }
  }

  // Check if negative
  if (numValue < 0) {
    return {
      isValid: false,
      error: 'Quick Buy amount cannot be negative'
    }
  }

  return {
    isValid: true
  }
}

/**
 * Storage key for Quick Buy amount in localStorage
 */
const QUICK_BUY_AMOUNT_KEY = 'quickBuyAmount'

/**
 * Saves Quick Buy amount to local storage
 * 
 * @param amount - The amount to save
 */
export function saveQuickBuyAmount(amount: string): void {
  try {
    localStorage.setItem(QUICK_BUY_AMOUNT_KEY, amount)
  } catch (error) {
    console.error('Failed to save Quick Buy amount to local storage:', error)
  }
}

/**
 * Loads Quick Buy amount from local storage
 * 
 * @returns The saved amount or empty string if not found
 */
export function loadQuickBuyAmount(): string {
  try {
    return localStorage.getItem(QUICK_BUY_AMOUNT_KEY) || ''
  } catch (error) {
    console.error('Failed to load Quick Buy amount from local storage:', error)
    return ''
  }
}

/**
 * Clears Quick Buy amount from local storage
 */
export function clearQuickBuyAmount(): void {
  try {
    localStorage.removeItem(QUICK_BUY_AMOUNT_KEY)
  } catch (error) {
    console.error('Failed to clear Quick Buy amount from local storage:', error)
  }
}
