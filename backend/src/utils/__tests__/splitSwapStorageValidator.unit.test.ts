/**
 * Unit Tests for Split Swap Storage Validator
 * 
 * Tests validation framework catches architectural violations:
 * - USD values in amount fields
 * - Fabricated SOL amounts
 * - Merged "both" records for split swaps
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 * Task: Phase A, Task 3.4
 */

import { validateSplitSwapStorage } from '../splitSwapStorageValidator'
import { ParsedSwap, PRIORITY_ASSETS } from '../shyftParserV2.types'
import { IWhaleAllTransactionsV2 } from '../../models/whaleAllTransactionsV2.model'

// Helper to create valid fee breakdown
const createFeeBreakdown = () => ({
  transactionFeeSOL: 0.000005,
  transactionFeeQuote: 0.001,
  platformFee: 0.05,
  priorityFee: 0.00001,
  totalFeeQuote: 0.051,
})

describe('splitSwapStorageValidator', () => {
  describe('validateSplitSwapStorage', () => {
    describe('Amount field validation', () => {
      it('should pass when BUY amounts match Parser V2', () => {
        const parsedSwap: ParsedSwap = {
          signature: 'test123',
          timestamp: Date.now(),
          swapper: 'wallet123',
          direction: 'BUY',
          quoteAsset: { mint: 'USDC_MINT', symbol: 'USDC', decimals: 6 },
          baseAsset: { mint: 'TOKEN_MINT', symbol: 'TOKEN', decimals: 9 },
          amounts: {
            baseAmount: 1000,
            totalWalletCost: 50,
            feeBreakdown: createFeeBreakdown(),
          },
          confidence: 1.0,
          protocol: 'raydium',
          swapperIdentificationMethod: 'fee_payer',
          rentRefundsFiltered: 0,
          intermediateAssetsCollapsed: [],
        }
        
        const storedRecord = {
          amount: { buyAmount: '1000', sellAmount: '50' },
          solAmount: { buySolAmount: null, sellSolAmount: null },
        } as any as IWhaleAllTransactionsV2
        
        const result = validateSplitSwapStorage(parsedSwap, storedRecord)
        
        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
      })
      
      it('should fail when BUY buyAmount does not match baseAmount', () => {
        const parsedSwap: ParsedSwap = {
          signature: 'test123',
          timestamp: Date.now(),
          swapper: 'wallet123',
          direction: 'BUY',
          quoteAsset: { mint: 'USDC_MINT', symbol: 'USDC', decimals: 6 },
          baseAsset: { mint: 'TOKEN_MINT', symbol: 'TOKEN', decimals: 9 },
          amounts: {
            baseAmount: 1000,
            totalWalletCost: 50,
            feeBreakdown: createFeeBreakdown(),
          },
          confidence: 1.0,
          protocol: 'raydium',
          swapperIdentificationMethod: 'fee_payer',
          rentRefundsFiltered: 0,
          intermediateAssetsCollapsed: [],
        }
        
        const storedRecord = {
          amount: { buyAmount: '50', sellAmount: '50' },
          solAmount: { buySolAmount: null, sellSolAmount: null },
        } as any as IWhaleAllTransactionsV2
        
        const result = validateSplitSwapStorage(parsedSwap, storedRecord)
        
        expect(result.valid).toBe(false)
        expect(result.errors).toHaveLength(1)
        expect(result.errors[0].field).toBe('amount.buyAmount')
        expect(result.errors[0].issue).toContain('Does not match Parser V2 baseAmount')
      })
    })
    
    describe('SOL amount validation - non-SOL swaps', () => {
      it('should pass when SOL fields are null for non-SOL swap', () => {
        const parsedSwap: ParsedSwap = {
          signature: 'test123',
          timestamp: Date.now(),
          swapper: 'wallet123',
          direction: 'BUY',
          quoteAsset: { mint: 'USDC_MINT', symbol: 'USDC', decimals: 6 },
          baseAsset: { mint: 'TOKEN_MINT', symbol: 'TOKEN', decimals: 9 },
          amounts: {
            baseAmount: 1000,
            totalWalletCost: 50,
            feeBreakdown: createFeeBreakdown(),
          },
          confidence: 1.0,
          protocol: 'raydium',
          swapperIdentificationMethod: 'fee_payer',
          rentRefundsFiltered: 0,
          intermediateAssetsCollapsed: [],
        }
        
        const storedRecord = {
          amount: { buyAmount: '1000', sellAmount: '50' },
          solAmount: { buySolAmount: null, sellSolAmount: null },
        } as any as IWhaleAllTransactionsV2
        
        const result = validateSplitSwapStorage(parsedSwap, storedRecord)
        
        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
      })
      
      it('should fail when buySolAmount is not null for non-SOL swap', () => {
        const parsedSwap: ParsedSwap = {
          signature: 'test123',
          timestamp: Date.now(),
          swapper: 'wallet123',
          direction: 'BUY',
          quoteAsset: { mint: 'USDC_MINT', symbol: 'USDC', decimals: 6 },
          baseAsset: { mint: 'TOKEN_MINT', symbol: 'TOKEN', decimals: 9 },
          amounts: {
            baseAmount: 1000,
            totalWalletCost: 50,
            feeBreakdown: createFeeBreakdown(),
          },
          confidence: 1.0,
          protocol: 'raydium',
          swapperIdentificationMethod: 'fee_payer',
          rentRefundsFiltered: 0,
          intermediateAssetsCollapsed: [],
        }
        
        const storedRecord = {
          amount: { buyAmount: '1000', sellAmount: '50' },
          solAmount: { buySolAmount: '0.5', sellSolAmount: null },
        } as any as IWhaleAllTransactionsV2
        
        const result = validateSplitSwapStorage(parsedSwap, storedRecord)
        
        expect(result.valid).toBe(false)
        const solError = result.errors.find(e => e.field === 'solAmount.buySolAmount')
        expect(solError).toBeDefined()
        expect(solError?.issue).toContain('Should be null when SOL not involved')
      })
    })
    
    describe('SOL amount validation - SOL swaps', () => {
      it('should pass when buying SOL with correct amounts', () => {
        const parsedSwap: ParsedSwap = {
          signature: 'test123',
          timestamp: Date.now(),
          swapper: 'wallet123',
          direction: 'BUY',
          quoteAsset: { mint: 'USDC_MINT', symbol: 'USDC', decimals: 6 },
          baseAsset: { mint: PRIORITY_ASSETS.SOL, symbol: 'SOL', decimals: 9 },
          amounts: {
            baseAmount: 2.5,
            totalWalletCost: 500,
            feeBreakdown: createFeeBreakdown(),
          },
          confidence: 1.0,
          protocol: 'raydium',
          swapperIdentificationMethod: 'fee_payer',
          rentRefundsFiltered: 0,
          intermediateAssetsCollapsed: [],
        }
        
        const storedRecord = {
          amount: { buyAmount: '2.5', sellAmount: '500' },
          solAmount: { buySolAmount: '2.5', sellSolAmount: null },
        } as any as IWhaleAllTransactionsV2
        
        const result = validateSplitSwapStorage(parsedSwap, storedRecord)
        
        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
      })
      
      it('should pass when spending SOL to buy token', () => {
        const parsedSwap: ParsedSwap = {
          signature: 'test123',
          timestamp: Date.now(),
          swapper: 'wallet123',
          direction: 'BUY',
          quoteAsset: { mint: PRIORITY_ASSETS.SOL, symbol: 'SOL', decimals: 9 },
          baseAsset: { mint: 'TOKEN_MINT', symbol: 'TOKEN', decimals: 9 },
          amounts: {
            baseAmount: 1000,
            totalWalletCost: 0.5,
            feeBreakdown: createFeeBreakdown(),
          },
          confidence: 1.0,
          protocol: 'raydium',
          swapperIdentificationMethod: 'fee_payer',
          rentRefundsFiltered: 0,
          intermediateAssetsCollapsed: [],
        }
        
        const storedRecord = {
          amount: { buyAmount: '1000', sellAmount: '0.5' },
          solAmount: { buySolAmount: null, sellSolAmount: '0.5' },
        } as any as IWhaleAllTransactionsV2
        
        const result = validateSplitSwapStorage(parsedSwap, storedRecord)
        
        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
      })
      
      it('should fail when SOL amount does not match Parser V2', () => {
        const parsedSwap: ParsedSwap = {
          signature: 'test123',
          timestamp: Date.now(),
          swapper: 'wallet123',
          direction: 'BUY',
          quoteAsset: { mint: PRIORITY_ASSETS.SOL, symbol: 'SOL', decimals: 9 },
          baseAsset: { mint: 'TOKEN_MINT', symbol: 'TOKEN', decimals: 9 },
          amounts: {
            baseAmount: 1000,
            totalWalletCost: 0.5,
            feeBreakdown: createFeeBreakdown(),
          },
          confidence: 1.0,
          protocol: 'raydium',
          swapperIdentificationMethod: 'fee_payer',
          rentRefundsFiltered: 0,
          intermediateAssetsCollapsed: [],
        }
        
        const storedRecord = {
          amount: { buyAmount: '1000', sellAmount: '0.5' },
          solAmount: { buySolAmount: null, sellSolAmount: '100' },
        } as any as IWhaleAllTransactionsV2
        
        const result = validateSplitSwapStorage(parsedSwap, storedRecord)
        
        expect(result.valid).toBe(false)
        const solError = result.errors.find(e => e.field === 'solAmount.sellSolAmount')
        expect(solError).toBeDefined()
        expect(solError?.issue).toContain('Should match Parser V2')
      })
    })
    
    describe('Numeric validation', () => {
      it('should fail when buyAmount is NaN', () => {
        const parsedSwap: ParsedSwap = {
          signature: 'test123',
          timestamp: Date.now(),
          swapper: 'wallet123',
          direction: 'BUY',
          quoteAsset: { mint: 'USDC_MINT', symbol: 'USDC', decimals: 6 },
          baseAsset: { mint: 'TOKEN_MINT', symbol: 'TOKEN', decimals: 9 },
          amounts: {
            baseAmount: 1000,
            totalWalletCost: 50,
            feeBreakdown: createFeeBreakdown(),
          },
          confidence: 1.0,
          protocol: 'raydium',
          swapperIdentificationMethod: 'fee_payer',
          rentRefundsFiltered: 0,
          intermediateAssetsCollapsed: [],
        }
        
        const storedRecord = {
          amount: { buyAmount: 'invalid', sellAmount: '50' },
          solAmount: { buySolAmount: null, sellSolAmount: null },
        } as any as IWhaleAllTransactionsV2
        
        const result = validateSplitSwapStorage(parsedSwap, storedRecord)
        
        expect(result.valid).toBe(false)
        const nanError = result.errors.find(e => e.field === 'amount.buyAmount' && e.issue.includes('Not a valid number'))
        expect(nanError).toBeDefined()
      })
      
      it('should fail when amounts are negative', () => {
        const parsedSwap: ParsedSwap = {
          signature: 'test123',
          timestamp: Date.now(),
          swapper: 'wallet123',
          direction: 'BUY',
          quoteAsset: { mint: 'USDC_MINT', symbol: 'USDC', decimals: 6 },
          baseAsset: { mint: 'TOKEN_MINT', symbol: 'TOKEN', decimals: 9 },
          amounts: {
            baseAmount: 1000,
            totalWalletCost: 50,
            feeBreakdown: createFeeBreakdown(),
          },
          confidence: 1.0,
          protocol: 'raydium',
          swapperIdentificationMethod: 'fee_payer',
          rentRefundsFiltered: 0,
          intermediateAssetsCollapsed: [],
        }
        
        const storedRecord = {
          amount: { buyAmount: '-100', sellAmount: '50' },
          solAmount: { buySolAmount: null, sellSolAmount: null },
        } as any as IWhaleAllTransactionsV2
        
        const result = validateSplitSwapStorage(parsedSwap, storedRecord)
        
        expect(result.valid).toBe(false)
        const negativeError = result.errors.find(e => e.field === 'amount.buyAmount' && e.issue.includes('cannot be negative'))
        expect(negativeError).toBeDefined()
      })
      
      it('should fail when SOL amounts are negative', () => {
        const parsedSwap: ParsedSwap = {
          signature: 'test123',
          timestamp: Date.now(),
          swapper: 'wallet123',
          direction: 'BUY',
          quoteAsset: { mint: PRIORITY_ASSETS.SOL, symbol: 'SOL', decimals: 9 },
          baseAsset: { mint: 'TOKEN_MINT', symbol: 'TOKEN', decimals: 9 },
          amounts: {
            baseAmount: 1000,
            totalWalletCost: 0.5,
            feeBreakdown: createFeeBreakdown(),
          },
          confidence: 1.0,
          protocol: 'raydium',
          swapperIdentificationMethod: 'fee_payer',
          rentRefundsFiltered: 0,
          intermediateAssetsCollapsed: [],
        }
        
        const storedRecord = {
          amount: { buyAmount: '1000', sellAmount: '0.5' },
          solAmount: { buySolAmount: null, sellSolAmount: '-0.5' },
        } as any as IWhaleAllTransactionsV2
        
        const result = validateSplitSwapStorage(parsedSwap, storedRecord)
        
        expect(result.valid).toBe(false)
        const negativeError = result.errors.find(e => e.field === 'solAmount.sellSolAmount' && e.issue.includes('cannot be negative'))
        expect(negativeError).toBeDefined()
      })
    })
    
    describe('Undefined fallback validation', () => {
      it('should validate undefined totalWalletCost maps to 0', () => {
        const parsedSwap: ParsedSwap = {
          signature: 'test123',
          timestamp: Date.now(),
          swapper: 'wallet123',
          direction: 'BUY',
          quoteAsset: { mint: 'USDC_MINT', symbol: 'USDC', decimals: 6 },
          baseAsset: { mint: 'TOKEN_MINT', symbol: 'TOKEN', decimals: 9 },
          amounts: {
            baseAmount: 1000,
            // totalWalletCost is undefined
            feeBreakdown: createFeeBreakdown(),
          },
          confidence: 1.0,
          protocol: 'raydium',
          swapperIdentificationMethod: 'fee_payer',
          rentRefundsFiltered: 0,
          intermediateAssetsCollapsed: [],
        }
        
        const storedRecord = {
          amount: { buyAmount: '1000', sellAmount: '0' },
          solAmount: { buySolAmount: null, sellSolAmount: null },
        } as any as IWhaleAllTransactionsV2
        
        const result = validateSplitSwapStorage(parsedSwap, storedRecord)
        
        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
      })
      
      it('should fail when undefined totalWalletCost is not mapped to 0', () => {
        const parsedSwap: ParsedSwap = {
          signature: 'test123',
          timestamp: Date.now(),
          swapper: 'wallet123',
          direction: 'BUY',
          quoteAsset: { mint: 'USDC_MINT', symbol: 'USDC', decimals: 6 },
          baseAsset: { mint: 'TOKEN_MINT', symbol: 'TOKEN', decimals: 9 },
          amounts: {
            baseAmount: 1000,
            // totalWalletCost is undefined
            feeBreakdown: createFeeBreakdown(),
          },
          confidence: 1.0,
          protocol: 'raydium',
          swapperIdentificationMethod: 'fee_payer',
          rentRefundsFiltered: 0,
          intermediateAssetsCollapsed: [],
        }
        
        const storedRecord = {
          amount: { buyAmount: '1000', sellAmount: '5000' },
          solAmount: { buySolAmount: null, sellSolAmount: null },
        } as any as IWhaleAllTransactionsV2
        
        const result = validateSplitSwapStorage(parsedSwap, storedRecord)
        
        expect(result.valid).toBe(false)
        const error = result.errors.find(e => e.field === 'amount.sellAmount')
        expect(error).toBeDefined()
        expect(error?.expectedValue).toBe(0)
        expect(error?.actualValue).toBe(5000)
      })
      
      it('should validate undefined netWalletReceived maps to 0', () => {
        const parsedSwap: ParsedSwap = {
          signature: 'test123',
          timestamp: Date.now(),
          swapper: 'wallet123',
          direction: 'SELL',
          quoteAsset: { mint: 'USDC_MINT', symbol: 'USDC', decimals: 6 },
          baseAsset: { mint: 'TOKEN_MINT', symbol: 'TOKEN', decimals: 9 },
          amounts: {
            baseAmount: 1000,
            // netWalletReceived is undefined
            feeBreakdown: createFeeBreakdown(),
          },
          confidence: 1.0,
          protocol: 'raydium',
          swapperIdentificationMethod: 'fee_payer',
          rentRefundsFiltered: 0,
          intermediateAssetsCollapsed: [],
        }
        
        const storedRecord = {
          amount: { buyAmount: '0', sellAmount: '1000' },
          solAmount: { buySolAmount: null, sellSolAmount: null },
        } as any as IWhaleAllTransactionsV2
        
        const result = validateSplitSwapStorage(parsedSwap, storedRecord)
        
        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
      })
    })
  })
})
