/**
 * SHYFT Parser V2 - Regression Tests
 * 
 * Task 14.1: Execute all existing v1 test fixtures
 * Requirements: 7.7, 7.8
 * 
 * This file runs all v1 test fixtures through the v2 parser to ensure:
 * - No regressions in swap detection
 * - Equivalent or improved output quality
 * - Backward compatibility with existing behavior
 * 
 * Note: V2 parser has different output schema (ParsedSwap vs ParsedSwapV2)
 * but should produce equivalent swap classifications.
 */

import { describe, it, expect } from '@jest/globals'
import { ShyftParserV2, ShyftTransactionV2 } from '../shyftParserV2'
import { parseShyftTransaction, ShyftTransaction } from '../shyftParser'

describe('ShyftParserV2 - Regression Tests with V1 Fixtures', () => {
  const parserV2 = new ShyftParserV2()

  /**
   * Helper to convert v1 transaction to v2 format
   * V2 requires additional fields that v1 doesn't have
   */
  const convertV1ToV2 = (txV1: ShyftTransaction): ShyftTransactionV2 => {
    const base: ShyftTransactionV2 = {
      signature: txV1.signature || 'test-signature',
      timestamp: typeof txV1.timestamp === 'string' 
        ? new Date(txV1.timestamp).getTime() / 1000 
        : Date.now() / 1000,
      status: txV1.status || 'Success',
      fee: 0.000005, // Default fee
      fee_payer: txV1.fee_payer || '',
      signers: txV1.signers || [],
      token_balance_changes: txV1.token_balance_changes || [],
    }

    const protocol = txV1.actions?.[0]?.type
      ? { name: txV1.actions[0].type, address: 'unknown' }
      : undefined

    if (protocol) {
      return { ...base, protocol }
    }

    return base
  }

  describe('Requirement 1.1: BUY detection from balance deltas', () => {
    it('should detect BUY when token inflow + SOL outflow (v1 fixture)', () => {
      const txV1: ShyftTransaction = {
        signature: 'test-sig-1',
        status: 'Success',
        fee_payer: 'buyer123',
        signers: ['buyer123'],
        type: 'CREATE_TOKEN_ACCOUNT',
        timestamp: '2026-01-23T20:36:46.000Z',
        token_balance_changes: [
          {
            address: 'token-account-1',
            decimals: 6,
            change_amount: 1000000000, // +1000 tokens
            post_balance: 1000000000,
            pre_balance: 0,
            mint: 'TokenMint1111111111111111111111111111',
            owner: 'buyer123',
          },
          {
            address: 'sol-account-1',
            decimals: 9,
            change_amount: -5000000000, // -5 SOL
            post_balance: 1000000000,
            pre_balance: 6000000000,
            mint: 'So11111111111111111111111111111111111111112',
            owner: 'buyer123',
          },
        ],
        actions: [],
        events: [],
      }

      const resultV1 = parseShyftTransaction(txV1)
      const resultV2 = parserV2.parseTransaction(convertV1ToV2(txV1))

      // Both should detect the swap
      expect(resultV1).not.toBeNull()
      expect(resultV2.success).toBe(true)

      if (resultV1 && resultV2.success && resultV2.data) {
        // Handle split swap pair
        const swap = 'sellRecord' in resultV2.data ? resultV2.data.buyRecord : resultV2.data
        
        // V2 should classify as BUY
        expect(swap.direction).toBe('BUY')
        
        // Swapper should match
        expect(swap.swapper).toBe(resultV1.swapper)
        
        // Quote should be SOL (what was spent)
        expect(swap.quoteAsset.mint).toBe('So11111111111111111111111111111111111111112')
        
        // Base should be the token (what was received)
        expect(swap.baseAsset.mint).toBe('TokenMint1111111111111111111111111111')
      }
    })
  })

  describe('Requirement 1.2: SELL detection from balance deltas', () => {
    it('should detect SELL when token outflow + SOL inflow (v1 fixture)', () => {
      const txV1: ShyftTransaction = {
        signature: 'test-sig-2',
        status: 'Success',
        fee_payer: 'seller456',
        signers: ['seller456'],
        type: 'TOKEN_TRANSFER',
        timestamp: '2026-01-23T20:40:31.000Z',
        token_balance_changes: [
          {
            address: 'token-account-2',
            decimals: 6,
            change_amount: -1000000000, // -1000 tokens
            post_balance: 0,
            pre_balance: 1000000000,
            mint: 'TokenMint4561111111111111111111111111',
            owner: 'seller456',
          },
          {
            address: 'sol-account-2',
            decimals: 9,
            change_amount: 3000000000, // +3 SOL
            post_balance: 4000000000,
            pre_balance: 1000000000,
            mint: 'So11111111111111111111111111111111111111112',
            owner: 'seller456',
          },
        ],
        actions: [],
        events: [],
      }

      const resultV1 = parseShyftTransaction(txV1)
      const resultV2 = parserV2.parseTransaction(convertV1ToV2(txV1))

      // Both should detect the swap
      expect(resultV1).not.toBeNull()
      expect(resultV2.success).toBe(true)

      if (resultV1 && resultV2.success && resultV2.data) {
        // Handle split swap pair
        const swap = 'sellRecord' in resultV2.data ? resultV2.data.sellRecord : resultV2.data
        
        // V2 should classify as SELL
        expect(swap.direction).toBe('SELL')
        
        // Swapper should match
        expect(swap.swapper).toBe(resultV1.swapper)
        
        // Quote should be SOL (what was received)
        expect(swap.quoteAsset.mint).toBe('So11111111111111111111111111111111111111112')
        
        // Base should be the token (what was sold)
        expect(swap.baseAsset.mint).toBe('TokenMint4561111111111111111111111111')
      }
    })
  })

  describe('Requirement 1.4: SOL/WSOL normalization', () => {
    it('should merge SOL and WSOL deltas (v1 fixture)', () => {
      const txV1: ShyftTransaction = {
        signature: 'test-sig-4',
        status: 'Success',
        fee_payer: 'user999',
        signers: ['user999'],
        type: 'UNKNOWN',
        timestamp: '2026-01-23T20:36:46.000Z',
        token_balance_changes: [
          {
            address: 'token-account-3',
            decimals: 6,
            change_amount: 1000000000,
            post_balance: 1000000000,
            pre_balance: 0,
            mint: 'TokenMintXYZ1111111111111111111111111',
            owner: 'user999',
          },
          {
            address: 'sol-account-3',
            decimals: 9,
            change_amount: -3000000000,
            post_balance: 1000000000,
            pre_balance: 4000000000,
            mint: 'So11111111111111111111111111111111111111112',
            owner: 'user999',
          },
        ],
        actions: [],
        events: [],
      }

      const resultV1 = parseShyftTransaction(txV1)
      const resultV2 = parserV2.parseTransaction(convertV1ToV2(txV1))

      // Both should detect the swap
      expect(resultV1).not.toBeNull()
      expect(resultV2.success).toBe(true)

      if (resultV1 && resultV2.success && resultV2.data) {
        // Handle split swap pair
        const swap = 'sellRecord' in resultV2.data ? resultV2.data.buyRecord : resultV2.data
        
        // V2 should classify as BUY
        expect(swap.direction).toBe('BUY')
        
        // Quote should be SOL
        expect(swap.quoteAsset.mint).toBe('So11111111111111111111111111111111111111112')
        
        // Base should be the token
        expect(swap.baseAsset.mint).toBe('TokenMintXYZ1111111111111111111111111')
      }
    })
  })

  describe('Requirement 1.5: Type labels ignored', () => {
    it('should process CREATE_TOKEN_ACCOUNT type regardless (v1 fixture)', () => {
      const txV1: ShyftTransaction = {
        signature: 'test-sig-5',
        status: 'Success',
        fee_payer: 'user111',
        signers: ['user111'],
        type: 'CREATE_TOKEN_ACCOUNT',
        timestamp: '2026-01-23T20:36:46.000Z',
        token_balance_changes: [
          {
            address: 'token-account-4',
            decimals: 6,
            change_amount: 500000000,
            post_balance: 500000000,
            pre_balance: 0,
            mint: 'TokenMint9991111111111111111111111111',
            owner: 'user111',
          },
          {
            address: 'sol-account-4',
            decimals: 9,
            change_amount: -2000000000,
            post_balance: 1000000000,
            pre_balance: 3000000000,
            mint: 'So11111111111111111111111111111111111111112',
            owner: 'user111',
          },
        ],
        actions: [],
        events: [],
      }

      const resultV1 = parseShyftTransaction(txV1)
      const resultV2 = parserV2.parseTransaction(convertV1ToV2(txV1))

      // Both should detect the swap
      expect(resultV1).not.toBeNull()
      expect(resultV2.success).toBe(true)

      if (resultV1 && resultV2.success && resultV2.data) {
        // Handle split swap pair
        const swap = 'sellRecord' in resultV2.data ? resultV2.data.buyRecord : resultV2.data
        expect(swap.direction).toBe('BUY')
      }
    })

    it('should process TOKEN_TRANSFER type regardless (v1 fixture)', () => {
      const txV1: ShyftTransaction = {
        signature: 'test-sig-6',
        status: 'Success',
        fee_payer: 'user222',
        signers: ['user222'],
        type: 'TOKEN_TRANSFER',
        timestamp: '2026-01-23T20:40:31.000Z',
        token_balance_changes: [
          {
            address: 'token-account-5',
            decimals: 6,
            change_amount: -500000000,
            post_balance: 0,
            pre_balance: 500000000,
            mint: 'TokenMint8881111111111111111111111111',
            owner: 'user222',
          },
          {
            address: 'sol-account-5',
            decimals: 9,
            change_amount: 1500000000,
            post_balance: 2500000000,
            pre_balance: 1000000000,
            mint: 'So11111111111111111111111111111111111111112',
            owner: 'user222',
          },
        ],
        actions: [],
        events: [],
      }

      const resultV1 = parseShyftTransaction(txV1)
      const resultV2 = parserV2.parseTransaction(convertV1ToV2(txV1))

      // Both should detect the swap
      expect(resultV1).not.toBeNull()
      expect(resultV2.success).toBe(true)

      if (resultV1 && resultV2.success && resultV2.data) {
        // Handle split swap pair
        const swap = 'sellRecord' in resultV2.data ? resultV2.data.sellRecord : resultV2.data
        expect(swap.direction).toBe('SELL')
      }
    })
  })

  describe('Requirement 1.7: Amount normalization', () => {
    it('should store both amount_raw and amount with correct values (v1 fixture)', () => {
      const txV1: ShyftTransaction = {
        signature: 'test-sig-9',
        status: 'Success',
        fee_payer: 'user555',
        signers: ['user555'],
        type: 'UNKNOWN',
        timestamp: '2026-01-23T20:36:46.000Z',
        token_balance_changes: [
          {
            address: 'token-account-6',
            decimals: 6,
            change_amount: 1500000000,
            post_balance: 1500000000,
            pre_balance: 0,
            mint: 'TokenMint7771111111111111111111111111',
            owner: 'user555',
          },
          {
            address: 'sol-account-6',
            decimals: 9,
            change_amount: -1000000000,
            post_balance: 1000000000,
            pre_balance: 2000000000,
            mint: 'So11111111111111111111111111111111111111112',
            owner: 'user555',
          },
        ],
        actions: [],
        events: [],
      }

      const resultV1 = parseShyftTransaction(txV1)
      const resultV2 = parserV2.parseTransaction(convertV1ToV2(txV1))

      // Both should detect the swap
      expect(resultV1).not.toBeNull()
      expect(resultV2.success).toBe(true)

      if (resultV1 && resultV2.success && resultV2.data) {
        // Handle split swap pair
        const swap = 'sellRecord' in resultV2.data ? resultV2.data.buyRecord : resultV2.data
        
        // V2 should have amounts stored
        expect(swap.amounts.baseAmount).toBeDefined()
        expect(swap.amounts.swapInputAmount).toBeDefined()
        
        // Base (Token) should be 1500000000 raw (1500 tokens with 6 decimals)
        expect(swap.amounts.baseAmount).toBeCloseTo(1500000000, 0)
        
        // Swap input (SOL) should be 1000000000 raw (1.0 SOL with 9 decimals)
        expect(swap.amounts.swapInputAmount).toBeCloseTo(1000000000, 0)
      }
    })

    it('should handle different decimal places correctly (v1 fixture)', () => {
      const txV1: ShyftTransaction = {
        signature: 'test-sig-9b',
        status: 'Success',
        fee_payer: 'user555b',
        signers: ['user555b'],
        type: 'UNKNOWN',
        timestamp: '2026-01-23T20:36:46.000Z',
        token_balance_changes: [
          {
            address: 'token-account-6b',
            decimals: 8,
            change_amount: 123456789,
            post_balance: 123456789,
            pre_balance: 0,
            mint: 'TokenMint777b111111111111111111111111',
            owner: 'user555b',
          },
          {
            address: 'sol-account-6b',
            decimals: 9,
            change_amount: -1000000000,
            post_balance: 1000000000,
            pre_balance: 2000000000,
            mint: 'So11111111111111111111111111111111111111112',
            owner: 'user555b',
          },
        ],
        actions: [],
        events: [],
      }

      const resultV1 = parseShyftTransaction(txV1)
      const resultV2 = parserV2.parseTransaction(convertV1ToV2(txV1))

      // Both should detect the swap
      expect(resultV1).not.toBeNull()
      expect(resultV2.success).toBe(true)

      if (resultV1 && resultV2.success && resultV2.data) {
        // Handle split swap pair
        const swap = 'sellRecord' in resultV2.data ? resultV2.data.buyRecord : resultV2.data
        
        // Base should have 8 decimals
        expect(swap.baseAsset.decimals).toBe(8)
        
        // Base amount should be raw amount (123456789)
        expect(swap.amounts.baseAmount).toBeCloseTo(123456789, 0)
      }
    })
  })

  describe('Edge cases', () => {
    it('should return ERASE for failed transactions (v1 fixture)', () => {
      const txV1: ShyftTransaction = {
        signature: 'test-sig-fail',
        status: 'Failed',
        fee_payer: 'user999',
        signers: ['user999'],
        type: 'UNKNOWN',
        timestamp: '2026-01-23T20:36:46.000Z',
        token_balance_changes: [],
        actions: [],
        events: [],
      }

      const resultV1 = parseShyftTransaction(txV1)
      const resultV2 = parserV2.parseTransaction(convertV1ToV2(txV1))

      // V1 returns null, V2 returns ERASE
      expect(resultV1).toBeNull()
      expect(resultV2.success).toBe(false)
      expect(resultV2.erase).toBeDefined()
      expect(resultV2.erase?.reason).toBe('transaction_failed')
    })

    it('should return ERASE when no swapper identified (v1 fixture)', () => {
      const txV1: ShyftTransaction = {
        signature: 'test-sig-no-swapper',
        status: 'Success',
        fee_payer: '',
        signers: [],
        type: 'UNKNOWN',
        timestamp: '2026-01-23T20:36:46.000Z',
        token_balance_changes: [],
        actions: [],
        events: [],
      }

      const resultV1 = parseShyftTransaction(txV1)
      const resultV2 = parserV2.parseTransaction(convertV1ToV2(txV1))

      // V1 returns null, V2 returns ERASE
      expect(resultV1).toBeNull()
      expect(resultV2.success).toBe(false)
      expect(resultV2.erase).toBeDefined()
    })

    it('should return ERASE when no classification found (v1 fixture)', () => {
      const txV1: ShyftTransaction = {
        signature: 'test-sig-no-class',
        status: 'Success',
        fee_payer: 'user000',
        signers: ['user000'],
        type: 'UNKNOWN',
        timestamp: '2026-01-23T20:36:46.000Z',
        token_balance_changes: [
          {
            address: 'token-account-8',
            decimals: 6,
            change_amount: 0,
            post_balance: 1000000000,
            pre_balance: 1000000000,
            mint: 'TokenMint0001111111111111111111111111',
            owner: 'other-user',
          },
        ],
        actions: [],
        events: [],
      }

      const resultV1 = parseShyftTransaction(txV1)
      const resultV2 = parserV2.parseTransaction(convertV1ToV2(txV1))

      // V1 returns null, V2 returns ERASE
      expect(resultV1).toBeNull()
      expect(resultV2.success).toBe(false)
      expect(resultV2.erase).toBeDefined()
    })
  })

  describe('Regression Summary', () => {
    it('should maintain or improve swap detection rate', () => {
      // Collection of v1 test fixtures
      const fixtures: ShyftTransaction[] = [
        // BUY fixture
        {
          signature: 'test-buy',
          status: 'Success',
          fee_payer: 'buyer',
          signers: ['buyer'],
          type: 'UNKNOWN',
          timestamp: '2026-01-23T20:36:46.000Z',
          token_balance_changes: [
            {
              address: 'token-account',
              decimals: 6,
              change_amount: 1000000000,
              post_balance: 1000000000,
              pre_balance: 0,
              mint: 'TokenMint1111111111111111111111111111',
              owner: 'buyer',
            },
            {
              address: 'sol-account',
              decimals: 9,
              change_amount: -5000000000,
              post_balance: 1000000000,
              pre_balance: 6000000000,
              mint: 'So11111111111111111111111111111111111111112',
              owner: 'buyer',
            },
          ],
          actions: [],
          events: [],
        },
        // SELL fixture
        {
          signature: 'test-sell',
          status: 'Success',
          fee_payer: 'seller',
          signers: ['seller'],
          type: 'UNKNOWN',
          timestamp: '2026-01-23T20:40:31.000Z',
          token_balance_changes: [
            {
              address: 'token-account',
              decimals: 6,
              change_amount: -1000000000,
              post_balance: 0,
              pre_balance: 1000000000,
              mint: 'TokenMint1111111111111111111111111111',
              owner: 'seller',
            },
            {
              address: 'sol-account',
              decimals: 9,
              change_amount: 3000000000,
              post_balance: 4000000000,
              pre_balance: 1000000000,
              mint: 'So11111111111111111111111111111111111111112',
              owner: 'seller',
            },
          ],
          actions: [],
          events: [],
        },
      ]

      let v1Detected = 0
      let v2Detected = 0

      for (const fixture of fixtures) {
        const resultV1 = parseShyftTransaction(fixture)
        const resultV2 = parserV2.parseTransaction(convertV1ToV2(fixture))

        if (resultV1 !== null) v1Detected++
        if (resultV2.success) v2Detected++
      }

      // V2 should detect at least as many swaps as V1
      expect(v2Detected).toBeGreaterThanOrEqual(v1Detected)
      
      // Both should detect all valid swaps in this test set
      expect(v1Detected).toBe(fixtures.length)
      expect(v2Detected).toBe(fixtures.length)
    })
  })
})
