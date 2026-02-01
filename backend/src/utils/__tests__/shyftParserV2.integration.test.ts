/**
 * SHYFT Parser V2 - Controller Integration Tests
 * 
 * Task 14.2: Write integration tests for controller compatibility
 * Requirements: 7.3, 7.4
 * 
 * This file tests integration with whale.controller.ts and influencer.controller.ts
 * to ensure v2 parser can be used as a drop-in replacement for v1.
 */

import { describe, it, expect } from '@jest/globals'
import { ShyftParserV2, ShyftTransactionV2 } from '../shyftParserV2'
import { parseShyftTransaction, ShyftTransaction } from '../shyftParser'

describe('ShyftParserV2 - Controller Integration Tests', () => {
  const parserV2 = new ShyftParserV2()

  /**
   * Helper to convert v1 transaction to v2 format
   */
  const convertV1ToV2 = (txV1: ShyftTransaction): ShyftTransactionV2 => {
    return {
      signature: txV1.signature || 'test-signature',
      timestamp: typeof txV1.timestamp === 'string' 
        ? new Date(txV1.timestamp).getTime() / 1000 
        : Date.now() / 1000,
      status: txV1.status || 'Success',
      fee: 0.000005,
      fee_payer: txV1.fee_payer || '',
      signers: txV1.signers || [],
      protocol: txV1.actions?.[0]?.type 
        ? { name: txV1.actions[0].type, address: 'unknown' }
        : undefined,
      token_balance_changes: txV1.token_balance_changes || [],
    }
  }

  /**
   * Helper to adapt v2 result to v1 format for controller compatibility
   * This demonstrates how controllers can migrate to v2
   */
  const adaptV2ToV1Format = (resultV2: ReturnType<typeof parserV2.parseTransaction>) => {
    if (!resultV2.success || !resultV2.data) {
      return null
    }

    // Handle split swap pair - for now, return the buy record
    const swap = 'sellRecord' in resultV2.data ? resultV2.data.buyRecord : resultV2.data

    // Map v2 confidence (0-100) to v1 confidence levels
    let confidenceLevel: 'MAX' | 'HIGH' | 'MEDIUM' | 'LOW'
    if (swap.confidence === 100) {
      confidenceLevel = 'MAX'
    } else if (swap.confidence >= 90) {
      confidenceLevel = 'HIGH'
    } else if (swap.confidence >= 80) {
      confidenceLevel = 'MEDIUM'
    } else {
      confidenceLevel = 'LOW'
    }

    // Map v2 output to v1 format
    return {
      swapper: swap.swapper,
      side: swap.direction,
      input: {
        mint: swap.direction === 'BUY' ? swap.quoteAsset.mint : swap.baseAsset.mint,
        amount_raw: swap.direction === 'BUY' 
          ? String(swap.amounts.swapInputAmount || 0)
          : String(swap.amounts.baseAmount),
        decimals: swap.direction === 'BUY' ? swap.quoteAsset.decimals : swap.baseAsset.decimals,
        amount: swap.direction === 'BUY'
          ? (swap.amounts.swapInputAmount || 0) / Math.pow(10, swap.quoteAsset.decimals)
          : swap.amounts.baseAmount / Math.pow(10, swap.baseAsset.decimals),
      },
      output: {
        mint: swap.direction === 'BUY' ? swap.baseAsset.mint : swap.quoteAsset.mint,
        amount_raw: swap.direction === 'BUY'
          ? String(swap.amounts.baseAmount)
          : String(swap.amounts.swapOutputAmount || 0),
        decimals: swap.direction === 'BUY' ? swap.baseAsset.decimals : swap.quoteAsset.decimals,
        amount: swap.direction === 'BUY'
          ? swap.amounts.baseAmount / Math.pow(10, swap.baseAsset.decimals)
          : (swap.amounts.swapOutputAmount || 0) / Math.pow(10, swap.quoteAsset.decimals),
      },
      ata_created: false, // V2 doesn't track this yet
      classification_source: 'token_balance_changes' as const,
      confidence: confidenceLevel,
    }
  }

  describe('Whale Controller Integration', () => {
    it('should provide compatible output for whale transaction processing', () => {
      const txV1: ShyftTransaction = {
        signature: 'whale-tx-1',
        status: 'Success',
        fee_payer: 'WhaleWallet111111111111111111111111111',
        signers: ['WhaleWallet111111111111111111111111111'],
        type: 'SWAP',
        timestamp: '2026-01-23T20:36:46.000Z',
        token_balance_changes: [
          {
            address: 'token-account-1',
            decimals: 6,
            change_amount: 1000000000,
            post_balance: 1000000000,
            pre_balance: 0,
            mint: 'TokenMint1111111111111111111111111111',
            owner: 'WhaleWallet111111111111111111111111111',
          },
          {
            address: 'sol-account-1',
            decimals: 9,
            change_amount: -5000000000,
            post_balance: 1000000000,
            pre_balance: 6000000000,
            mint: 'So11111111111111111111111111111111111111112',
            owner: 'WhaleWallet111111111111111111111111111',
          },
        ],
        actions: [],
        events: [],
      }

      const resultV1 = parseShyftTransaction(txV1)
      const resultV2 = parserV2.parseTransaction(convertV1ToV2(txV1))
      const adaptedV2 = adaptV2ToV1Format(resultV2)

      // Both should detect the swap
      expect(resultV1).not.toBeNull()
      expect(adaptedV2).not.toBeNull()

      if (resultV1 && adaptedV2) {
        // Controller expects these fields
        expect(adaptedV2).toHaveProperty('swapper')
        expect(adaptedV2).toHaveProperty('side')
        expect(adaptedV2).toHaveProperty('input')
        expect(adaptedV2).toHaveProperty('output')
        expect(adaptedV2).toHaveProperty('confidence')
        expect(adaptedV2).toHaveProperty('classification_source')

        // Values should match
        expect(adaptedV2.swapper).toBe(resultV1.swapper)
        expect(adaptedV2.side).toBe(resultV1.side)
        expect(adaptedV2.input.mint).toBe(resultV1.input.mint)
        expect(adaptedV2.output.mint).toBe(resultV1.output.mint)
      }
    })

    it('should handle null result for invalid transactions (controller expects null)', () => {
      const txV1: ShyftTransaction = {
        signature: 'invalid-tx',
        status: 'Failed',
        fee_payer: 'WhaleWallet111111111111111111111111111',
        signers: ['WhaleWallet111111111111111111111111111'],
        type: 'UNKNOWN',
        timestamp: '2026-01-23T20:36:46.000Z',
        token_balance_changes: [],
        actions: [],
        events: [],
      }

      const resultV1 = parseShyftTransaction(txV1)
      const resultV2 = parserV2.parseTransaction(convertV1ToV2(txV1))
      const adaptedV2 = adaptV2ToV1Format(resultV2)

      // Both should return null/null-equivalent
      expect(resultV1).toBeNull()
      expect(adaptedV2).toBeNull()
    })

    it('should support confidence filtering (meetsMinimumConfidence equivalent)', () => {
      const txV1: ShyftTransaction = {
        signature: 'confidence-test',
        status: 'Success',
        fee_payer: 'WhaleWallet111111111111111111111111111',
        signers: ['WhaleWallet111111111111111111111111111'],
        type: 'UNKNOWN',
        timestamp: '2026-01-23T20:36:46.000Z',
        token_balance_changes: [
          {
            address: 'token-account-1',
            decimals: 6,
            change_amount: 1000000000,
            post_balance: 1000000000,
            pre_balance: 0,
            mint: 'TokenMint1111111111111111111111111111',
            owner: 'WhaleWallet111111111111111111111111111',
          },
          {
            address: 'sol-account-1',
            decimals: 9,
            change_amount: -5000000000,
            post_balance: 1000000000,
            pre_balance: 6000000000,
            mint: 'So11111111111111111111111111111111111111112',
            owner: 'WhaleWallet111111111111111111111111111',
          },
        ],
        actions: [],
        events: [],
      }

      const resultV2 = parserV2.parseTransaction(convertV1ToV2(txV1))
      const adaptedV2 = adaptV2ToV1Format(resultV2)

      expect(adaptedV2).not.toBeNull()
      if (adaptedV2) {
        // Controller checks confidence level
        expect(['MAX', 'HIGH', 'MEDIUM', 'LOW']).toContain(adaptedV2.confidence)
        
        // V2 provides numeric confidence for more granular filtering
        if (resultV2.success && resultV2.data) {
          const swap = 'sellRecord' in resultV2.data ? resultV2.data.buyRecord : resultV2.data
          expect(swap.confidence).toBeGreaterThanOrEqual(0)
          expect(swap.confidence).toBeLessThanOrEqual(100)
        }
      }
    })
  })

  describe('Influencer (KOL) Controller Integration', () => {
    it('should provide compatible output for KOL transaction processing', () => {
      const txV1: ShyftTransaction = {
        signature: 'kol-tx-1',
        status: 'Success',
        fee_payer: 'KOLWallet1111111111111111111111111111111',
        signers: ['KOLWallet1111111111111111111111111111111'],
        type: 'SWAP',
        timestamp: '2026-01-23T20:36:46.000Z',
        token_balance_changes: [
          {
            address: 'token-account-1',
            decimals: 6,
            change_amount: -500000000,
            post_balance: 0,
            pre_balance: 500000000,
            mint: 'TokenMint1111111111111111111111111111',
            owner: 'KOLWallet1111111111111111111111111111111',
          },
          {
            address: 'sol-account-1',
            decimals: 9,
            change_amount: 2000000000,
            post_balance: 3000000000,
            pre_balance: 1000000000,
            mint: 'So11111111111111111111111111111111111111112',
            owner: 'KOLWallet1111111111111111111111111111111',
          },
        ],
        actions: [],
        events: [],
      }

      const resultV1 = parseShyftTransaction(txV1)
      const resultV2 = parserV2.parseTransaction(convertV1ToV2(txV1))
      const adaptedV2 = adaptV2ToV1Format(resultV2)

      // Both should detect the swap
      expect(resultV1).not.toBeNull()
      expect(adaptedV2).not.toBeNull()

      if (resultV1 && adaptedV2) {
        // Controller expects these fields
        expect(adaptedV2).toHaveProperty('swapper')
        expect(adaptedV2).toHaveProperty('side')
        expect(adaptedV2).toHaveProperty('input')
        expect(adaptedV2).toHaveProperty('output')
        expect(adaptedV2).toHaveProperty('confidence')
        expect(adaptedV2).toHaveProperty('classification_source')

        // Values should match
        expect(adaptedV2.swapper).toBe(resultV1.swapper)
        expect(adaptedV2.side).toBe(resultV1.side)
        expect(adaptedV2.input.mint).toBe(resultV1.input.mint)
        expect(adaptedV2.output.mint).toBe(resultV1.output.mint)
      }
    })

    it('should handle SELL transactions for KOL alerts', () => {
      const txV1: ShyftTransaction = {
        signature: 'kol-sell-tx',
        status: 'Success',
        fee_payer: 'KOLWallet1111111111111111111111111111111',
        signers: ['KOLWallet1111111111111111111111111111111'],
        type: 'SWAP',
        timestamp: '2026-01-23T20:40:31.000Z',
        token_balance_changes: [
          {
            address: 'token-account-1',
            decimals: 6,
            change_amount: -1000000000,
            post_balance: 0,
            pre_balance: 1000000000,
            mint: 'TokenMint1111111111111111111111111111',
            owner: 'KOLWallet1111111111111111111111111111111',
          },
          {
            address: 'sol-account-1',
            decimals: 9,
            change_amount: 3000000000,
            post_balance: 4000000000,
            pre_balance: 1000000000,
            mint: 'So11111111111111111111111111111111111111112',
            owner: 'KOLWallet1111111111111111111111111111111',
          },
        ],
        actions: [],
        events: [],
      }

      const resultV1 = parseShyftTransaction(txV1)
      const resultV2 = parserV2.parseTransaction(convertV1ToV2(txV1))
      const adaptedV2 = adaptV2ToV1Format(resultV2)

      expect(resultV1).not.toBeNull()
      expect(adaptedV2).not.toBeNull()

      if (resultV1 && adaptedV2) {
        // Both should detect SELL
        expect(resultV1.side).toBe('SELL')
        expect(adaptedV2.side).toBe('SELL')
        
        // Swapper should match
        expect(adaptedV2.swapper).toBe(resultV1.swapper)
      }
    })

    it('should provide debug info for filtered transactions', () => {
      const txV1: ShyftTransaction = {
        signature: 'filtered-tx',
        status: 'Success',
        fee_payer: 'KOLWallet1111111111111111111111111111111',
        signers: ['KOLWallet1111111111111111111111111111111'],
        type: 'UNKNOWN',
        timestamp: '2026-01-23T20:36:46.000Z',
        token_balance_changes: [],
        actions: [],
        events: [],
      }

      const resultV2 = parserV2.parseTransaction(convertV1ToV2(txV1))

      // V2 provides detailed ERASE info for debugging
      expect(resultV2.success).toBe(false)
      expect(resultV2.erase).toBeDefined()
      expect(resultV2.erase?.reason).toBeDefined()
      
      // This is an improvement over v1 which just returns null
      // Controllers can log the reason for better observability
    })
  })

  describe('Adapter Function Compatibility', () => {
    it('should maintain all required fields for controller usage', () => {
      const txV1: ShyftTransaction = {
        signature: 'adapter-test',
        status: 'Success',
        fee_payer: 'TestWallet111111111111111111111111111111',
        signers: ['TestWallet111111111111111111111111111111'],
        type: 'SWAP',
        timestamp: '2026-01-23T20:36:46.000Z',
        token_balance_changes: [
          {
            address: 'token-account-1',
            decimals: 6,
            change_amount: 1000000000,
            post_balance: 1000000000,
            pre_balance: 0,
            mint: 'TokenMint1111111111111111111111111111',
            owner: 'TestWallet111111111111111111111111111111',
          },
          {
            address: 'sol-account-1',
            decimals: 9,
            change_amount: -5000000000,
            post_balance: 1000000000,
            pre_balance: 6000000000,
            mint: 'So11111111111111111111111111111111111111112',
            owner: 'TestWallet111111111111111111111111111111',
          },
        ],
        actions: [],
        events: [],
      }

      const resultV2 = parserV2.parseTransaction(convertV1ToV2(txV1))
      const adapted = adaptV2ToV1Format(resultV2)

      expect(adapted).not.toBeNull()
      if (adapted) {
        // All controller-required fields present
        expect(adapted.swapper).toBeDefined()
        expect(adapted.side).toBeDefined()
        expect(adapted.input).toBeDefined()
        expect(adapted.input.mint).toBeDefined()
        expect(adapted.input.amount_raw).toBeDefined()
        expect(adapted.input.decimals).toBeDefined()
        expect(adapted.input.amount).toBeDefined()
        expect(adapted.output).toBeDefined()
        expect(adapted.output.mint).toBeDefined()
        expect(adapted.output.amount_raw).toBeDefined()
        expect(adapted.output.decimals).toBeDefined()
        expect(adapted.output.amount).toBeDefined()
        expect(adapted.confidence).toBeDefined()
        expect(adapted.classification_source).toBeDefined()
        expect(adapted.ata_created).toBeDefined()

        // Types are correct
        expect(typeof adapted.swapper).toBe('string')
        expect(['BUY', 'SELL', 'SWAP']).toContain(adapted.side)
        expect(typeof adapted.input.mint).toBe('string')
        expect(typeof adapted.input.amount_raw).toBe('string')
        expect(typeof adapted.input.decimals).toBe('number')
        expect(typeof adapted.input.amount).toBe('number')
        expect(['MAX', 'HIGH', 'MEDIUM', 'LOW']).toContain(adapted.confidence)
        expect(typeof adapted.ata_created).toBe('boolean')
      }
    })
  })

  describe('No Breaking Changes', () => {
    it('should not break existing controller logic', () => {
      // Test that v2 can be used as drop-in replacement
      const testCases: ShyftTransaction[] = [
        // BUY case
        {
          signature: 'buy-test',
          status: 'Success',
          fee_payer: 'Wallet11111111111111111111111111111111111',
          signers: ['Wallet11111111111111111111111111111111111'],
          type: 'SWAP',
          timestamp: '2026-01-23T20:36:46.000Z',
          token_balance_changes: [
            {
              address: 'token-account',
              decimals: 6,
              change_amount: 1000000000,
              post_balance: 1000000000,
              pre_balance: 0,
              mint: 'TokenMint1111111111111111111111111111',
              owner: 'Wallet11111111111111111111111111111111111',
            },
            {
              address: 'sol-account',
              decimals: 9,
              change_amount: -5000000000,
              post_balance: 1000000000,
              pre_balance: 6000000000,
              mint: 'So11111111111111111111111111111111111111112',
              owner: 'Wallet11111111111111111111111111111111111',
            },
          ],
          actions: [],
          events: [],
        },
        // SELL case
        {
          signature: 'sell-test',
          status: 'Success',
          fee_payer: 'Wallet11111111111111111111111111111111111',
          signers: ['Wallet11111111111111111111111111111111111'],
          type: 'SWAP',
          timestamp: '2026-01-23T20:40:31.000Z',
          token_balance_changes: [
            {
              address: 'token-account',
              decimals: 6,
              change_amount: -1000000000,
              post_balance: 0,
              pre_balance: 1000000000,
              mint: 'TokenMint1111111111111111111111111111',
              owner: 'Wallet11111111111111111111111111111111111',
            },
            {
              address: 'sol-account',
              decimals: 9,
              change_amount: 3000000000,
              post_balance: 4000000000,
              pre_balance: 1000000000,
              mint: 'So11111111111111111111111111111111111111112',
              owner: 'Wallet11111111111111111111111111111111111',
            },
          ],
          actions: [],
          events: [],
        },
      ]

      for (const testCase of testCases) {
        const resultV1 = parseShyftTransaction(testCase)
        const resultV2 = parserV2.parseTransaction(convertV1ToV2(testCase))
        const adaptedV2 = adaptV2ToV1Format(resultV2)

        // Both should produce results
        expect(resultV1).not.toBeNull()
        expect(adaptedV2).not.toBeNull()

        if (resultV1 && adaptedV2) {
          // Key fields should match
          expect(adaptedV2.side).toBe(resultV1.side)
          expect(adaptedV2.swapper).toBe(resultV1.swapper)
          expect(adaptedV2.input.mint).toBe(resultV1.input.mint)
          expect(adaptedV2.output.mint).toBe(resultV1.output.mint)
        }
      }
    })
  })
})
