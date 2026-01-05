import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { 
  validateQuickBuyAmount, 
  saveQuickBuyAmount, 
  loadQuickBuyAmount, 
  clearQuickBuyAmount 
} from '../quickBuyValidation'

describe('validateQuickBuyAmount', () => {
  it('should reject null values', () => {
    const result = validateQuickBuyAmount(null)
    expect(result.isValid).toBe(false)
    expect(result.error).toBe('Please enter a Quick Buy amount')
  })

  it('should reject undefined values', () => {
    const result = validateQuickBuyAmount(undefined)
    expect(result.isValid).toBe(false)
    expect(result.error).toBe('Please enter a Quick Buy amount')
  })

  it('should reject empty string', () => {
    const result = validateQuickBuyAmount('')
    expect(result.isValid).toBe(false)
    expect(result.error).toBe('Please enter a Quick Buy amount')
  })

  it('should reject whitespace-only string', () => {
    const result = validateQuickBuyAmount('   ')
    expect(result.isValid).toBe(false)
    expect(result.error).toBe('Please enter a Quick Buy amount')
  })

  it('should reject non-numeric strings', () => {
    const result = validateQuickBuyAmount('abc')
    expect(result.isValid).toBe(false)
    expect(result.error).toBe('Quick Buy amount must be a valid number')
  })

  it('should reject zero', () => {
    const result = validateQuickBuyAmount('0')
    expect(result.isValid).toBe(false)
    expect(result.error).toBe('Quick Buy amount must be greater than 0')
  })

  it('should reject negative numbers', () => {
    const result = validateQuickBuyAmount('-5')
    expect(result.isValid).toBe(false)
    expect(result.error).toBe('Quick Buy amount cannot be negative')
  })

  it('should accept positive numbers as strings', () => {
    const result = validateQuickBuyAmount('10')
    expect(result.isValid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('should accept positive decimal numbers', () => {
    const result = validateQuickBuyAmount('0.5')
    expect(result.isValid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('should accept positive numbers as numbers', () => {
    const result = validateQuickBuyAmount(10)
    expect(result.isValid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('should accept very small positive numbers', () => {
    const result = validateQuickBuyAmount('0.000001')
    expect(result.isValid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('should accept large positive numbers', () => {
    const result = validateQuickBuyAmount('1000000')
    expect(result.isValid).toBe(true)
    expect(result.error).toBeUndefined()
  })
})

describe('Quick Buy Amount Storage', () => {
  beforeEach(() => {
    // Clear session storage before each test
    sessionStorage.clear()
  })

  afterEach(() => {
    // Clean up after each test
    sessionStorage.clear()
  })

  it('should save and load quick buy amount', () => {
    const amount = '10.5'
    saveQuickBuyAmount(amount)
    const loaded = loadQuickBuyAmount()
    expect(loaded).toBe(amount)
  })

  it('should return empty string when no amount is saved', () => {
    const loaded = loadQuickBuyAmount()
    expect(loaded).toBe('')
  })

  it('should clear quick buy amount', () => {
    saveQuickBuyAmount('10')
    clearQuickBuyAmount()
    const loaded = loadQuickBuyAmount()
    expect(loaded).toBe('')
  })

  it('should overwrite existing amount when saving new value', () => {
    saveQuickBuyAmount('10')
    saveQuickBuyAmount('20')
    const loaded = loadQuickBuyAmount()
    expect(loaded).toBe('20')
  })

  it('should persist amount across multiple loads', () => {
    const amount = '15.75'
    saveQuickBuyAmount(amount)
    expect(loadQuickBuyAmount()).toBe(amount)
    expect(loadQuickBuyAmount()).toBe(amount)
    expect(loadQuickBuyAmount()).toBe(amount)
  })
})
