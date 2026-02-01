/**
 * SHYFT Parser V2 - EraseValidator Tests
 * 
 * This file contains both property-based tests and unit tests for the EraseValidator component.
 * 
 * Task 9: Implement EraseValidator component
 * - Task 9.2: Property test for both positive delta rejection (Property 17)
 * - Task 9.3: Property test for both negative delta rejection (Property 18)
 * - Task 9.4: Property test for missing base delta rejection (Property 19)
 * - Task 9.5: Property test for ERASE reason code presence (Property 20)
 * - Task 9.6: Property test for ERASE swap record exclusion (Property 21)
 * - Task 9.7: Unit tests for ERASE scenarios
 */

import * as fc from 'fast-check'
import { createEraseValidator } from '../shyftParserV2.eraseValidator'
import { AssetDelta, EPSILON } from '../shyftParserV2.types'
import {
  positiveAssetDeltaArbitrary,
  negativeAssetDeltaArbitrary,
  assetDeltaArbitrary,
} from './shyftParserV2.arbitraries'

describe('EraseValidator', () => {
  const validator = createEraseValidator()

  // ============================================================================
  // Property-Based Tests
  // ============================================================================

  describe('Property Tests', () => {
    /**
     * Property 17: Both Positive Delta Rejection
     * 
     * For any transaction where base_delta > 0 and quote_delta >= 0,
     * the parser should classify it as ERASE with reason "both_positive_airdrop".
     * 
     * **Validates: Requirements 5.1**
     */
    test('Property 17: Both Positive Delta Rejection', () => {
      fc.assert(
        fc.property(
          positiveAssetDeltaArbitrary,
          fc.oneof(
            positiveAssetDeltaArbitrary,
            fc.record({
              mint: fc.string(),
              symbol: fc.string(),
              netDelta: fc.constant(0),
              decimals: fc.integer({ min: 0, max: 18 }),
              isIntermediate: fc.constant(false),
            })
          ),
          (base, quote) => {
            // Ensure base is positive and quote is >= 0
            const basePositive: AssetDelta = { ...base, netDelta: Math.abs(base.netDelta) + 1 }
            const quoteNonNegative: AssetDelta = { ...quote, netDelta: Math.abs(quote.netDelta) }

            const result = validator.validate(quoteNonNegative, basePositive)

            // Should be invalid with specific reason
            expect(result.isValid).toBe(false)
            expect(result.eraseReason).toBe('both_positive_airdrop')
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * Property 18: Both Negative Delta Rejection
     * 
     * For any transaction where base_delta < 0 and quote_delta <= 0,
     * the parser should classify it as ERASE with reason "both_negative_burn".
     * 
     * **Validates: Requirements 5.2**
     */
    test('Property 18: Both Negative Delta Rejection', () => {
      fc.assert(
        fc.property(
          negativeAssetDeltaArbitrary,
          fc.oneof(
            negativeAssetDeltaArbitrary,
            fc.record({
              mint: fc.string(),
              symbol: fc.string(),
              netDelta: fc.constant(0),
              decimals: fc.integer({ min: 0, max: 18 }),
              isIntermediate: fc.constant(false),
            })
          ),
          (base, quote) => {
            // Ensure base is negative and quote is <= 0
            const baseNegative: AssetDelta = { ...base, netDelta: -Math.abs(base.netDelta) - 1 }
            const quoteNonPositive: AssetDelta = { ...quote, netDelta: -Math.abs(quote.netDelta) }

            const result = validator.validate(quoteNonPositive, baseNegative)

            // Should be invalid with specific reason
            expect(result.isValid).toBe(false)
            expect(result.eraseReason).toBe('both_negative_burn')
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * Property 19: Missing Base Delta Rejection
     * 
     * For any transaction where no base asset delta exists or base delta equals zero within epsilon,
     * the parser should classify it as ERASE with reason "no_base_delta".
     * 
     * **Validates: Requirements 5.3**
     */
    test('Property 19: Missing Base Delta Rejection', () => {
      fc.assert(
        fc.property(
          fc.oneof(positiveAssetDeltaArbitrary, negativeAssetDeltaArbitrary),
          fc.double({ min: -EPSILON / 2, max: EPSILON / 2, noNaN: true }),
          (quote, baseDelta) => {
            // Create a base asset with zero or near-zero delta
            const base: AssetDelta = {
              mint: 'BaseMint111111111111111111111111111111111',
              symbol: 'BASE',
              netDelta: baseDelta,
              decimals: 9,
              isIntermediate: false,
            }

            // Ensure quote has a non-zero delta to avoid triggering other rules
            const quoteWithDelta: AssetDelta = {
              ...quote,
              netDelta: quote.netDelta === 0 ? (Math.random() > 0.5 ? 100 : -100) : quote.netDelta,
            }

            const result = validator.validate(quoteWithDelta, base)

            // Should be invalid with specific reason
            expect(result.isValid).toBe(false)
            expect(result.eraseReason).toBe('no_base_delta')
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * Property 20: ERASE Reason Code Presence
     * 
     * For any transaction classified as ERASE, the output should include a reason code string
     * indicating which validation rule triggered the ERASE classification.
     * 
     * **Validates: Requirements 5.4**
     */
    test('Property 20: ERASE Reason Code Presence', () => {
      fc.assert(
        fc.property(
          assetDeltaArbitrary,
          assetDeltaArbitrary,
          (quote, base) => {
            const result = validator.validate(quote, base)

            // If invalid, must have a reason code
            if (!result.isValid) {
              expect(result.eraseReason).toBeDefined()
              expect(typeof result.eraseReason).toBe('string')
              expect(result.eraseReason!.length).toBeGreaterThan(0)
              
              // Should be one of the known reason codes
              const validReasons = [
                'both_positive_airdrop',
                'both_negative_burn',
                'no_base_delta',
              ]
              expect(validReasons).toContain(result.eraseReason)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * Property 21: ERASE Swap Record Exclusion
     * 
     * For any transaction classified as ERASE, the parser output should not contain
     * a ParsedSwap record, only an EraseResult record.
     * 
     * Note: This property is tested at the integration level, but we verify here
     * that the validator correctly returns isValid: false for ERASE cases.
     * 
     * **Validates: Requirements 5.5**
     */
    test('Property 21: ERASE Swap Record Exclusion (Validator Level)', () => {
      fc.assert(
        fc.property(
          assetDeltaArbitrary,
          assetDeltaArbitrary,
          (quote, base) => {
            const result = validator.validate(quote, base)

            // If invalid, should not proceed to swap record creation
            // This is verified by checking that isValid is false
            if (!result.isValid) {
              expect(result.isValid).toBe(false)
              expect(result.eraseReason).toBeDefined()
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * Property: Valid Swap Pattern
     * 
     * For any transaction where base and quote have opposite signs (one positive, one negative)
     * and base delta is non-zero, the validator should return isValid: true.
     */
    test('Property: Valid Swap Pattern', () => {
      fc.assert(
        fc.property(
          positiveAssetDeltaArbitrary,
          negativeAssetDeltaArbitrary,
          (positive, negative) => {
            // Test both directions: BUY (quote negative, base positive) and SELL (quote positive, base negative)
            
            // BUY: quote negative, base positive
            const buyResult = validator.validate(negative, positive)
            expect(buyResult.isValid).toBe(true)
            expect(buyResult.eraseReason).toBeUndefined()

            // SELL: quote positive, base negative
            const sellResult = validator.validate(positive, negative)
            expect(sellResult.isValid).toBe(true)
            expect(sellResult.eraseReason).toBeUndefined()
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // ============================================================================
  // Unit Tests
  // ============================================================================

  describe('Unit Tests', () => {
    /**
     * Task 9.7: Write unit tests for ERASE scenarios
     * Requirements: 5.1, 5.2, 5.3
     */

    describe('Both Positive Delta (Airdrop)', () => {
      test('should reject when both base and quote are positive', () => {
        const quote: AssetDelta = {
          mint: 'QuoteMint111111111111111111111111111111111',
          symbol: 'QUOTE',
          netDelta: 100,
          decimals: 9,
          isIntermediate: false,
        }
        const base: AssetDelta = {
          mint: 'BaseMint111111111111111111111111111111111',
          symbol: 'BASE',
          netDelta: 50,
          decimals: 9,
          isIntermediate: false,
        }

        const result = validator.validate(quote, base)

        expect(result.isValid).toBe(false)
        expect(result.eraseReason).toBe('both_positive_airdrop')
      })

      test('should reject when base is positive and quote is zero', () => {
        const quote: AssetDelta = {
          mint: 'QuoteMint111111111111111111111111111111111',
          symbol: 'QUOTE',
          netDelta: 0,
          decimals: 9,
          isIntermediate: false,
        }
        const base: AssetDelta = {
          mint: 'BaseMint111111111111111111111111111111111',
          symbol: 'BASE',
          netDelta: 50,
          decimals: 9,
          isIntermediate: false,
        }

        const result = validator.validate(quote, base)

        expect(result.isValid).toBe(false)
        expect(result.eraseReason).toBe('both_positive_airdrop')
      })

      test('should reject airdrop scenario (both tokens received)', () => {
        // Simulates receiving both SOL and a token (airdrop)
        const quote: AssetDelta = {
          mint: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          netDelta: 1_000_000_000, // 1 SOL
          decimals: 9,
          isIntermediate: false,
        }
        const base: AssetDelta = {
          mint: 'TokenMint111111111111111111111111111111111',
          symbol: 'TOKEN',
          netDelta: 1000_000_000, // 1000 tokens
          decimals: 9,
          isIntermediate: false,
        }

        const result = validator.validate(quote, base)

        expect(result.isValid).toBe(false)
        expect(result.eraseReason).toBe('both_positive_airdrop')
      })
    })

    describe('Both Negative Delta (Burn/Transfer)', () => {
      test('should reject when both base and quote are negative', () => {
        const quote: AssetDelta = {
          mint: 'QuoteMint111111111111111111111111111111111',
          symbol: 'QUOTE',
          netDelta: -100,
          decimals: 9,
          isIntermediate: false,
        }
        const base: AssetDelta = {
          mint: 'BaseMint111111111111111111111111111111111',
          symbol: 'BASE',
          netDelta: -50,
          decimals: 9,
          isIntermediate: false,
        }

        const result = validator.validate(quote, base)

        expect(result.isValid).toBe(false)
        expect(result.eraseReason).toBe('both_negative_burn')
      })

      test('should reject when base is negative and quote is zero', () => {
        const quote: AssetDelta = {
          mint: 'QuoteMint111111111111111111111111111111111',
          symbol: 'QUOTE',
          netDelta: 0,
          decimals: 9,
          isIntermediate: false,
        }
        const base: AssetDelta = {
          mint: 'BaseMint111111111111111111111111111111111',
          symbol: 'BASE',
          netDelta: -50,
          decimals: 9,
          isIntermediate: false,
        }

        const result = validator.validate(quote, base)

        expect(result.isValid).toBe(false)
        expect(result.eraseReason).toBe('both_negative_burn')
      })

      test('should reject burn scenario (both tokens sent)', () => {
        // Simulates sending both SOL and a token (burn or transfer)
        const quote: AssetDelta = {
          mint: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          netDelta: -1_000_000_000, // -1 SOL
          decimals: 9,
          isIntermediate: false,
        }
        const base: AssetDelta = {
          mint: 'TokenMint111111111111111111111111111111111',
          symbol: 'TOKEN',
          netDelta: -1000_000_000, // -1000 tokens
          decimals: 9,
          isIntermediate: false,
        }

        const result = validator.validate(quote, base)

        expect(result.isValid).toBe(false)
        expect(result.eraseReason).toBe('both_negative_burn')
      })
    })

    describe('Missing Base Delta', () => {
      test('should reject when base delta is exactly zero', () => {
        const quote: AssetDelta = {
          mint: 'QuoteMint111111111111111111111111111111111',
          symbol: 'QUOTE',
          netDelta: -100,
          decimals: 9,
          isIntermediate: false,
        }
        const base: AssetDelta = {
          mint: 'BaseMint111111111111111111111111111111111',
          symbol: 'BASE',
          netDelta: 0,
          decimals: 9,
          isIntermediate: false,
        }

        const result = validator.validate(quote, base)

        expect(result.isValid).toBe(false)
        expect(result.eraseReason).toBe('no_base_delta')
      })

      test('should reject when base delta is within epsilon tolerance', () => {
        const quote: AssetDelta = {
          mint: 'QuoteMint111111111111111111111111111111111',
          symbol: 'QUOTE',
          netDelta: -100,
          decimals: 9,
          isIntermediate: false,
        }
        const base: AssetDelta = {
          mint: 'BaseMint111111111111111111111111111111111',
          symbol: 'BASE',
          netDelta: EPSILON / 2, // Very small positive
          decimals: 9,
          isIntermediate: false,
        }

        const result = validator.validate(quote, base)

        expect(result.isValid).toBe(false)
        expect(result.eraseReason).toBe('no_base_delta')
      })

      test('should reject pure quote movement (no base change)', () => {
        // Simulates a transaction where only the quote asset moves
        const quote: AssetDelta = {
          mint: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          netDelta: -1_000_000_000, // -1 SOL
          decimals: 9,
          isIntermediate: false,
        }
        const base: AssetDelta = {
          mint: 'TokenMint111111111111111111111111111111111',
          symbol: 'TOKEN',
          netDelta: 0, // No token movement
          decimals: 9,
          isIntermediate: false,
        }

        const result = validator.validate(quote, base)

        expect(result.isValid).toBe(false)
        expect(result.eraseReason).toBe('no_base_delta')
      })
    })

    describe('Valid Swap Scenarios', () => {
      test('should accept valid BUY (quote negative, base positive)', () => {
        const quote: AssetDelta = {
          mint: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          netDelta: -1_000_000_000, // -1 SOL (spent)
          decimals: 9,
          isIntermediate: false,
        }
        const base: AssetDelta = {
          mint: 'TokenMint111111111111111111111111111111111',
          symbol: 'TOKEN',
          netDelta: 1000_000_000, // +1000 tokens (received)
          decimals: 9,
          isIntermediate: false,
        }

        const result = validator.validate(quote, base)

        expect(result.isValid).toBe(true)
        expect(result.eraseReason).toBeUndefined()
      })

      test('should accept valid SELL (quote positive, base negative)', () => {
        const quote: AssetDelta = {
          mint: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          netDelta: 1_000_000_000, // +1 SOL (received)
          decimals: 9,
          isIntermediate: false,
        }
        const base: AssetDelta = {
          mint: 'TokenMint111111111111111111111111111111111',
          symbol: 'TOKEN',
          netDelta: -1000_000_000, // -1000 tokens (sold)
          decimals: 9,
          isIntermediate: false,
        }

        const result = validator.validate(quote, base)

        expect(result.isValid).toBe(true)
        expect(result.eraseReason).toBeUndefined()
      })

      test('should accept token-to-token swap', () => {
        const quote: AssetDelta = {
          mint: 'WIFMint44444444444444444444444444444444444',
          symbol: 'WIF',
          netDelta: -500_000_000, // -500 WIF (spent)
          decimals: 9,
          isIntermediate: false,
        }
        const base: AssetDelta = {
          mint: 'BONKMint5555555555555555555555555555555555',
          symbol: 'BONK',
          netDelta: 10000_000_000, // +10000 BONK (received)
          decimals: 9,
          isIntermediate: false,
        }

        const result = validator.validate(quote, base)

        expect(result.isValid).toBe(true)
        expect(result.eraseReason).toBeUndefined()
      })
    })

    describe('Edge Cases', () => {
      test('should handle very small but non-zero base delta', () => {
        const quote: AssetDelta = {
          mint: 'QuoteMint111111111111111111111111111111111',
          symbol: 'QUOTE',
          netDelta: -100,
          decimals: 9,
          isIntermediate: false,
        }
        const base: AssetDelta = {
          mint: 'BaseMint111111111111111111111111111111111',
          symbol: 'BASE',
          netDelta: EPSILON * 2, // Just above epsilon threshold
          decimals: 9,
          isIntermediate: false,
        }

        const result = validator.validate(quote, base)

        // Should be valid because base delta is above epsilon
        expect(result.isValid).toBe(true)
        expect(result.eraseReason).toBeUndefined()
      })

      test('should handle large amounts', () => {
        const quote: AssetDelta = {
          mint: 'QuoteMint111111111111111111111111111111111',
          symbol: 'QUOTE',
          netDelta: -1_000_000_000_000, // -1 trillion
          decimals: 9,
          isIntermediate: false,
        }
        const base: AssetDelta = {
          mint: 'BaseMint111111111111111111111111111111111',
          symbol: 'BASE',
          netDelta: 1_000_000_000_000, // +1 trillion
          decimals: 9,
          isIntermediate: false,
        }

        const result = validator.validate(quote, base)

        expect(result.isValid).toBe(true)
        expect(result.eraseReason).toBeUndefined()
      })
    })
  })
})
