/**
 * SHYFT Parser V2 - QuoteBaseDetector Tests
 * 
 * Task 6.3: Write property test for two-asset requirement
 * Task 6.4: Write property test for opposite delta signs
 * Task 6.5: Write property test for priority asset quote selection
 * Task 6.6: Write property test for token-to-token split protocol
 * Task 6.7: Write property test for intermediate asset exclusion
 * Task 6.8: Write unit tests for split protocol examples
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.3
 */

import * as fc from 'fast-check'
import { createQuoteBaseDetector } from '../shyftParserV2.quoteBaseDetector'
import {
  AssetDelta,
  AssetDeltaMap,
  PRIORITY_ASSETS,
} from '../shyftParserV2.types'
import { arbitraries } from './shyftParserV2.arbitraries'

describe('QuoteBaseDetector - Unit Tests', () => {
  const detector = createQuoteBaseDetector()

  describe('Standard swap detection (with priority asset)', () => {
    it('should detect BUY when SOL outflow + token inflow', () => {
      const deltaMap: AssetDeltaMap = {
        [PRIORITY_ASSETS.SOL]: {
          mint: PRIORITY_ASSETS.SOL,
          symbol: 'SOL',
          netDelta: -5000000000, // -5 SOL
          decimals: 9,
          isIntermediate: false,
        },
        'TokenMint123': {
          mint: 'TokenMint123',
          symbol: 'TOKEN',
          netDelta: 1000000000, // +1000 tokens
          decimals: 6,
          isIntermediate: false,
        },
      }

      const result = detector.detectQuoteBase(deltaMap)

      expect(result.quote).not.toBeNull()
      expect(result.base).not.toBeNull()
      expect(result.direction).toBe('BUY')
      expect(result.splitRequired).toBe(false)
      expect(result.quote?.mint).toBe(PRIORITY_ASSETS.SOL)
      expect(result.base?.mint).toBe('TokenMint123')
    })

    it('should detect SELL when token outflow + SOL inflow', () => {
      const deltaMap: AssetDeltaMap = {
        'TokenMint456': {
          mint: 'TokenMint456',
          symbol: 'TOKEN',
          netDelta: -1000000000, // -1000 tokens
          decimals: 6,
          isIntermediate: false,
        },
        [PRIORITY_ASSETS.SOL]: {
          mint: PRIORITY_ASSETS.SOL,
          symbol: 'SOL',
          netDelta: 3000000000, // +3 SOL
          decimals: 9,
          isIntermediate: false,
        },
      }

      const result = detector.detectQuoteBase(deltaMap)

      expect(result.quote).not.toBeNull()
      expect(result.base).not.toBeNull()
      expect(result.direction).toBe('SELL')
      expect(result.splitRequired).toBe(false)
      expect(result.quote?.mint).toBe(PRIORITY_ASSETS.SOL)
      expect(result.base?.mint).toBe('TokenMint456')
    })

    it('should detect BUY when USDC outflow + token inflow', () => {
      const deltaMap: AssetDeltaMap = {
        [PRIORITY_ASSETS.USDC]: {
          mint: PRIORITY_ASSETS.USDC,
          symbol: 'USDC',
          netDelta: -100000000, // -100 USDC
          decimals: 6,
          isIntermediate: false,
        },
        'TokenMint789': {
          mint: 'TokenMint789',
          symbol: 'TOKEN',
          netDelta: 500000000, // +500 tokens
          decimals: 6,
          isIntermediate: false,
        },
      }

      const result = detector.detectQuoteBase(deltaMap)

      expect(result.quote).not.toBeNull()
      expect(result.base).not.toBeNull()
      expect(result.direction).toBe('BUY')
      expect(result.splitRequired).toBe(false)
      expect(result.quote?.mint).toBe(PRIORITY_ASSETS.USDC)
      expect(result.base?.mint).toBe('TokenMint789')
    })

    it('should detect SELL when token outflow + USDT inflow', () => {
      const deltaMap: AssetDeltaMap = {
        'TokenMintABC': {
          mint: 'TokenMintABC',
          symbol: 'TOKEN',
          netDelta: -250000000, // -250 tokens
          decimals: 6,
          isIntermediate: false,
        },
        [PRIORITY_ASSETS.USDT]: {
          mint: PRIORITY_ASSETS.USDT,
          symbol: 'USDT',
          netDelta: 50000000, // +50 USDT
          decimals: 6,
          isIntermediate: false,
        },
      }

      const result = detector.detectQuoteBase(deltaMap)

      expect(result.quote).not.toBeNull()
      expect(result.base).not.toBeNull()
      expect(result.direction).toBe('SELL')
      expect(result.splitRequired).toBe(false)
      expect(result.quote?.mint).toBe(PRIORITY_ASSETS.USDT)
      expect(result.base?.mint).toBe('TokenMintABC')
    })
  })

  describe('Token-to-token split protocol (no priority asset)', () => {
    it('should detect split swap for WIF → BONK', () => {
      const deltaMap: AssetDeltaMap = {
        'WIFMint44444444444444444444444444444444444': {
          mint: 'WIFMint44444444444444444444444444444444444',
          symbol: 'WIF',
          netDelta: -1000000000, // -1000 WIF
          decimals: 6,
          isIntermediate: false,
        },
        'BONKMint5555555555555555555555555555555555': {
          mint: 'BONKMint5555555555555555555555555555555555',
          symbol: 'BONK',
          netDelta: 5000000000, // +5000 BONK
          decimals: 5,
          isIntermediate: false,
        },
      }

      const result = detector.detectQuoteBase(deltaMap)

      expect(result.quote).not.toBeNull()
      expect(result.base).not.toBeNull()
      expect(result.direction).toBeNull() // Direction determined per record in split
      expect(result.splitRequired).toBe(true)
      expect(result.quote?.mint).toBe('WIFMint44444444444444444444444444444444444') // Outgoing
      expect(result.base?.mint).toBe('BONKMint5555555555555555555555555555555555') // Incoming
    })

    it('should detect split swap for BONK → WIF', () => {
      const deltaMap: AssetDeltaMap = {
        'BONKMint5555555555555555555555555555555555': {
          mint: 'BONKMint5555555555555555555555555555555555',
          symbol: 'BONK',
          netDelta: -5000000000, // -5000 BONK
          decimals: 5,
          isIntermediate: false,
        },
        'WIFMint44444444444444444444444444444444444': {
          mint: 'WIFMint44444444444444444444444444444444444',
          symbol: 'WIF',
          netDelta: 1000000000, // +1000 WIF
          decimals: 6,
          isIntermediate: false,
        },
      }

      const result = detector.detectQuoteBase(deltaMap)

      expect(result.quote).not.toBeNull()
      expect(result.base).not.toBeNull()
      expect(result.direction).toBeNull()
      expect(result.splitRequired).toBe(true)
      expect(result.quote?.mint).toBe('BONKMint5555555555555555555555555555555555') // Outgoing
      expect(result.base?.mint).toBe('WIFMint44444444444444444444444444444444444') // Incoming
    })

    it('should detect split swap for TOKEN1 → TOKEN2', () => {
      const deltaMap: AssetDeltaMap = {
        'TokenMint111111111111111111111111111111111': {
          mint: 'TokenMint111111111111111111111111111111111',
          symbol: 'TOKEN1',
          netDelta: -750000000, // -750 TOKEN1
          decimals: 6,
          isIntermediate: false,
        },
        'TokenMint222222222222222222222222222222222': {
          mint: 'TokenMint222222222222222222222222222222222',
          symbol: 'TOKEN2',
          netDelta: 250000000, // +250 TOKEN2
          decimals: 6,
          isIntermediate: false,
        },
      }

      const result = detector.detectQuoteBase(deltaMap)

      expect(result.quote).not.toBeNull()
      expect(result.base).not.toBeNull()
      expect(result.direction).toBeNull()
      expect(result.splitRequired).toBe(true)
      expect(result.quote?.netDelta).toBeLessThan(0) // Outgoing
      expect(result.base?.netDelta).toBeGreaterThan(0) // Incoming
    })
  })

  describe('Intermediate asset exclusion', () => {
    it('should exclude intermediate assets from quote/base detection', () => {
      const deltaMap: AssetDeltaMap = {
        [PRIORITY_ASSETS.SOL]: {
          mint: PRIORITY_ASSETS.SOL,
          symbol: 'SOL',
          netDelta: -2000000000, // -2 SOL
          decimals: 9,
          isIntermediate: false,
        },
        [PRIORITY_ASSETS.USDC]: {
          mint: PRIORITY_ASSETS.USDC,
          symbol: 'USDC',
          netDelta: 0, // Zero net delta (intermediate)
          decimals: 6,
          isIntermediate: true,
        },
        'TokenMintXYZ': {
          mint: 'TokenMintXYZ',
          symbol: 'TOKEN',
          netDelta: 1000000000, // +1000 tokens
          decimals: 6,
          isIntermediate: false,
        },
      }

      const result = detector.detectQuoteBase(deltaMap)

      expect(result.quote).not.toBeNull()
      expect(result.base).not.toBeNull()
      expect(result.direction).toBe('BUY')
      expect(result.splitRequired).toBe(false)
      expect(result.quote?.mint).toBe(PRIORITY_ASSETS.SOL)
      expect(result.base?.mint).toBe('TokenMintXYZ')
      // USDC should be excluded (intermediate)
    })

    it('should handle multi-hop with multiple intermediates', () => {
      const deltaMap: AssetDeltaMap = {
        [PRIORITY_ASSETS.SOL]: {
          mint: PRIORITY_ASSETS.SOL,
          symbol: 'SOL',
          netDelta: -1500000000, // -1.5 SOL
          decimals: 9,
          isIntermediate: false,
        },
        [PRIORITY_ASSETS.USDC]: {
          mint: PRIORITY_ASSETS.USDC,
          symbol: 'USDC',
          netDelta: 0, // Intermediate
          decimals: 6,
          isIntermediate: true,
        },
        [PRIORITY_ASSETS.USDT]: {
          mint: PRIORITY_ASSETS.USDT,
          symbol: 'USDT',
          netDelta: 0, // Intermediate
          decimals: 6,
          isIntermediate: true,
        },
        'TokenMintFinal': {
          mint: 'TokenMintFinal',
          symbol: 'FINAL',
          netDelta: 500000000, // +500 tokens
          decimals: 6,
          isIntermediate: false,
        },
      }

      const result = detector.detectQuoteBase(deltaMap)

      expect(result.quote).not.toBeNull()
      expect(result.base).not.toBeNull()
      expect(result.direction).toBe('BUY')
      expect(result.splitRequired).toBe(false)
      expect(result.quote?.mint).toBe(PRIORITY_ASSETS.SOL)
      expect(result.base?.mint).toBe('TokenMintFinal')
    })
  })

  describe('ERASE conditions', () => {
    it('should return ERASE for invalid asset count (0 assets)', () => {
      const deltaMap: AssetDeltaMap = {}

      const result = detector.detectQuoteBase(deltaMap)

      expect(result.quote).toBeNull()
      expect(result.base).toBeNull()
      expect(result.direction).toBeNull()
      expect(result.eraseReason).toBe('invalid_asset_count')
    })

    it('should return ERASE for invalid asset count (1 asset)', () => {
      const deltaMap: AssetDeltaMap = {
        [PRIORITY_ASSETS.SOL]: {
          mint: PRIORITY_ASSETS.SOL,
          symbol: 'SOL',
          netDelta: 1000000000,
          decimals: 9,
          isIntermediate: false,
        },
      }

      const result = detector.detectQuoteBase(deltaMap)

      expect(result.quote).toBeNull()
      expect(result.base).toBeNull()
      expect(result.direction).toBeNull()
      expect(result.eraseReason).toBe('invalid_asset_count')
    })

    it('should return ERASE for invalid asset count (3+ assets)', () => {
      const deltaMap: AssetDeltaMap = {
        [PRIORITY_ASSETS.SOL]: {
          mint: PRIORITY_ASSETS.SOL,
          symbol: 'SOL',
          netDelta: -1000000000,
          decimals: 9,
          isIntermediate: false,
        },
        'TokenMint1': {
          mint: 'TokenMint1',
          symbol: 'TOKEN1',
          netDelta: 500000000,
          decimals: 6,
          isIntermediate: false,
        },
        'TokenMint2': {
          mint: 'TokenMint2',
          symbol: 'TOKEN2',
          netDelta: 500000000,
          decimals: 6,
          isIntermediate: false,
        },
      }

      const result = detector.detectQuoteBase(deltaMap)

      expect(result.quote).toBeNull()
      expect(result.base).toBeNull()
      expect(result.direction).toBeNull()
      expect(result.eraseReason).toBe('invalid_asset_count')
    })

    it('should return ERASE for both positive deltas', () => {
      const deltaMap: AssetDeltaMap = {
        [PRIORITY_ASSETS.SOL]: {
          mint: PRIORITY_ASSETS.SOL,
          symbol: 'SOL',
          netDelta: 1000000000, // Positive
          decimals: 9,
          isIntermediate: false,
        },
        'TokenMint123': {
          mint: 'TokenMint123',
          symbol: 'TOKEN',
          netDelta: 500000000, // Positive
          decimals: 6,
          isIntermediate: false,
        },
      }

      const result = detector.detectQuoteBase(deltaMap)

      expect(result.quote).toBeNull()
      expect(result.base).toBeNull()
      expect(result.direction).toBeNull()
      expect(result.eraseReason).toBe('invalid_delta_signs')
    })

    it('should return ERASE for both negative deltas', () => {
      const deltaMap: AssetDeltaMap = {
        [PRIORITY_ASSETS.SOL]: {
          mint: PRIORITY_ASSETS.SOL,
          symbol: 'SOL',
          netDelta: -1000000000, // Negative
          decimals: 9,
          isIntermediate: false,
        },
        'TokenMint456': {
          mint: 'TokenMint456',
          symbol: 'TOKEN',
          netDelta: -500000000, // Negative
          decimals: 6,
          isIntermediate: false,
        },
      }

      const result = detector.detectQuoteBase(deltaMap)

      expect(result.quote).toBeNull()
      expect(result.base).toBeNull()
      expect(result.direction).toBeNull()
      expect(result.eraseReason).toBe('invalid_delta_signs')
    })
  })
})

describe('QuoteBaseDetector - Property-Based Tests', () => {
  const detector = createQuoteBaseDetector()

  /**
   * Property 8: Two-Asset Requirement
   * **Validates: Requirements 3.1**
   * 
   * For any transaction after rent filtering and intermediate collapse, if the number of
   * assets with non-zero deltas is not exactly 2, the transaction should be classified as ERASE.
   */
  it('Property 8: Two-Asset Requirement', () => {
    fc.assert(
      fc.property(
        fc.record({
          // Generate 0, 1, or 3+ active assets (not 2)
          assetCount: fc.constantFrom(0, 1, 3, 4, 5),
          assets: fc.array(arbitraries.assetDelta, { minLength: 0, maxLength: 5 }),
        }),
        ({ assetCount, assets }) => {
          // Create delta map with specified number of active assets
          const deltaMap: AssetDeltaMap = {}
          
          for (let i = 0; i < Math.min(assetCount, assets.length); i++) {
            const asset = assets[i]
            deltaMap[`mint_${i}`] = {
              ...asset,
              mint: `mint_${i}`,
              isIntermediate: false,
            }
          }

          const result = detector.detectQuoteBase(deltaMap)

          // If not exactly 2 assets, should return ERASE
          if (Object.keys(deltaMap).length !== 2) {
            expect(result.eraseReason).toBe('invalid_asset_count')
            expect(result.quote).toBeNull()
            expect(result.base).toBeNull()
            expect(result.direction).toBeNull()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 9: Opposite Delta Signs Requirement
   * **Validates: Requirements 3.2**
   * 
   * For any transaction with exactly 2 active assets, if both deltas have the same sign
   * (both positive or both negative), the transaction should be classified as ERASE.
   */
  it('Property 9: Opposite Delta Signs Requirement', () => {
    fc.assert(
      fc.property(
        fc.record({
          // Generate two assets with same sign
          sameSign: fc.boolean(),
          delta1: fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }).filter(d => d !== 0),
          delta2: fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }).filter(d => d !== 0),
        }),
        ({ sameSign, delta1, delta2 }) => {
          const adjustedDelta2 = sameSign
            ? Math.abs(delta2) * Math.sign(delta1) // Same sign
            : Math.abs(delta2) * -Math.sign(delta1) // Opposite sign

          const deltaMap: AssetDeltaMap = {
            'mint1': {
              mint: 'mint1',
              symbol: 'TOKEN1',
              netDelta: delta1,
              decimals: 6,
              isIntermediate: false,
            },
            'mint2': {
              mint: 'mint2',
              symbol: 'TOKEN2',
              netDelta: adjustedDelta2,
              decimals: 6,
              isIntermediate: false,
            },
          }

          const result = detector.detectQuoteBase(deltaMap)

          if (sameSign) {
            // Same sign should return ERASE
            expect(result.eraseReason).toBe('invalid_delta_signs')
            expect(result.quote).toBeNull()
            expect(result.base).toBeNull()
            expect(result.direction).toBeNull()
          } else {
            // Opposite signs should not return ERASE for delta signs
            expect(result.eraseReason).not.toBe('invalid_delta_signs')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 10: Priority Asset Quote Selection
   * **Validates: Requirements 3.3, 3.4**
   * 
   * For any transaction with exactly 2 active assets where one asset is SOL, WSOL, or a
   * known stablecoin (USDC, USDT), the priority asset should be designated as the quote
   * asset and the other as the base asset.
   */
  it('Property 10: Priority Asset Quote Selection', () => {
    fc.assert(
      fc.property(
        fc.record({
          priorityMint: arbitraries.priorityAssetMint,
          tokenMint: arbitraries.tokenMint,
          priorityDelta: fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }).filter(d => d !== 0),
          tokenDelta: fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }).filter(d => d !== 0),
        }),
        ({ priorityMint, tokenMint, priorityDelta, tokenDelta }) => {
          // Ensure opposite signs
          const adjustedTokenDelta = Math.abs(tokenDelta) * -Math.sign(priorityDelta)

          const deltaMap: AssetDeltaMap = {
            [priorityMint]: {
              mint: priorityMint,
              symbol: 'PRIORITY',
              netDelta: priorityDelta,
              decimals: 9,
              isIntermediate: false,
            },
            [tokenMint]: {
              mint: tokenMint,
              symbol: 'TOKEN',
              netDelta: adjustedTokenDelta,
              decimals: 6,
              isIntermediate: false,
            },
          }

          const result = detector.detectQuoteBase(deltaMap)

          // Priority asset should be quote, token should be base
          expect(result.quote).not.toBeNull()
          expect(result.base).not.toBeNull()
          expect(result.quote?.mint).toBe(priorityMint)
          expect(result.base?.mint).toBe(tokenMint)
          expect(result.splitRequired).toBe(false)
          
          // Direction should be determined
          expect(result.direction).not.toBeNull()
          if (priorityDelta < 0 && adjustedTokenDelta > 0) {
            expect(result.direction).toBe('BUY')
          } else if (priorityDelta > 0 && adjustedTokenDelta < 0) {
            expect(result.direction).toBe('SELL')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 11: Token-to-Token Split Protocol
   * **Validates: Requirements 3.5, 3.6**
   * 
   * For any transaction with exactly 2 active assets where neither is a priority asset
   * (SOL, WSOL, stablecoin), the parser should split the transaction into two distinct
   * records: one SELL record for the outgoing token (negative delta) and one BUY record
   * for the incoming token (positive delta), with quote values derived from the
   * counterparty token's USD/SOL value.
   */
  it('Property 11: Token-to-Token Split Protocol', () => {
    fc.assert(
      fc.property(
        fc.record({
          token1Mint: arbitraries.tokenMint,
          token2Mint: arbitraries.tokenMint,
          delta1: fc.integer({ min: -1_000_000_000, max: -1 }), // Negative (outgoing)
          delta2: fc.integer({ min: 1, max: 1_000_000_000 }), // Positive (incoming)
        }).filter(({ token1Mint, token2Mint }) => token1Mint !== token2Mint),
        ({ token1Mint, token2Mint, delta1, delta2 }) => {
          const deltaMap: AssetDeltaMap = {
            [token1Mint]: {
              mint: token1Mint,
              symbol: 'TOKEN1',
              netDelta: delta1,
              decimals: 6,
              isIntermediate: false,
            },
            [token2Mint]: {
              mint: token2Mint,
              symbol: 'TOKEN2',
              netDelta: delta2,
              decimals: 6,
              isIntermediate: false,
            },
          }

          const result = detector.detectQuoteBase(deltaMap)

          // Should require split
          expect(result.splitRequired).toBe(true)
          expect(result.quote).not.toBeNull()
          expect(result.base).not.toBeNull()
          
          // Quote should be outgoing (negative delta)
          expect(result.quote?.netDelta).toBeLessThan(0)
          expect(result.quote?.mint).toBe(token1Mint)
          
          // Base should be incoming (positive delta)
          expect(result.base?.netDelta).toBeGreaterThan(0)
          expect(result.base?.mint).toBe(token2Mint)
          
          // Direction should be null (determined per record in split)
          expect(result.direction).toBeNull()
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 13: Intermediate Asset Exclusion
   * **Validates: Requirements 4.3**
   * 
   * For any transaction with intermediate assets, those assets should be excluded from
   * quote/base detection, and only non-intermediate assets should be considered for
   * swap classification.
   */
  it('Property 13: Intermediate Asset Exclusion', () => {
    fc.assert(
      fc.property(
        fc.record({
          activeMint1: arbitraries.tokenMint,
          activeMint2: arbitraries.tokenMint,
          intermediateMints: fc.array(arbitraries.tokenMint, { minLength: 1, maxLength: 3 }),
          delta1: fc.integer({ min: -1_000_000_000, max: -1 }),
          delta2: fc.integer({ min: 1, max: 1_000_000_000 }),
        }).filter(({ activeMint1, activeMint2, intermediateMints }) => {
          // Ensure all mints are unique
          const allMints = [activeMint1, activeMint2, ...intermediateMints]
          return new Set(allMints).size === allMints.length
        }),
        ({ activeMint1, activeMint2, intermediateMints, delta1, delta2 }) => {
          const deltaMap: AssetDeltaMap = {
            [activeMint1]: {
              mint: activeMint1,
              symbol: 'ACTIVE1',
              netDelta: delta1,
              decimals: 6,
              isIntermediate: false,
            },
            [activeMint2]: {
              mint: activeMint2,
              symbol: 'ACTIVE2',
              netDelta: delta2,
              decimals: 6,
              isIntermediate: false,
            },
          }

          // Add intermediate assets
          intermediateMints.forEach((mint, index) => {
            deltaMap[mint] = {
              mint,
              symbol: `INTERMEDIATE${index}`,
              netDelta: 0,
              decimals: 6,
              isIntermediate: true,
            }
          })

          const result = detector.detectQuoteBase(deltaMap)

          // Should only consider active assets (not intermediates)
          expect(result.quote).not.toBeNull()
          expect(result.base).not.toBeNull()
          
          // Quote and base should be from active assets only
          const activeMints = [activeMint1, activeMint2]
          expect(activeMints).toContain(result.quote?.mint)
          expect(activeMints).toContain(result.base?.mint)
          
          // Should not include intermediate mints
          expect(intermediateMints).not.toContain(result.quote?.mint)
          expect(intermediateMints).not.toContain(result.base?.mint)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 14: Multi-Hop Quote Preservation
   * **Validates: Requirements 4.4**
   * 
   * For any multi-hop transaction (e.g., SOL → USDC → TOKEN), the parser should preserve
   * the first quote asset outflow (SOL) in the final swap record, ignoring intermediate
   * assets (USDC).
   */
  it('Property 14: Multi-Hop Quote Preservation', () => {
    fc.assert(
      fc.property(
        fc.record({
          // First quote asset (outflow) - must be priority asset for standard swap
          quoteMint: arbitraries.priorityAssetMint,
          quoteDelta: fc.integer({ min: -1_000_000_000, max: -1 }), // Negative (outflow)
          
          // Final base asset (inflow)
          baseMint: arbitraries.tokenMint,
          baseDelta: fc.integer({ min: 1, max: 1_000_000_000 }), // Positive (inflow)
          
          // Intermediate assets (zero net delta)
          intermediateMints: fc.array(
            fc.oneof(arbitraries.priorityAssetMint, arbitraries.tokenMint),
            { minLength: 1, maxLength: 3 }
          ),
        }).filter(({ quoteMint, baseMint, intermediateMints }) => {
          // Ensure all mints are unique
          const allMints = [quoteMint, baseMint, ...intermediateMints]
          return new Set(allMints).size === allMints.length
        }),
        ({ quoteMint, quoteDelta, baseMint, baseDelta, intermediateMints }) => {
          // Build delta map with quote, base, and intermediates
          const deltaMap: AssetDeltaMap = {
            [quoteMint]: {
              mint: quoteMint,
              symbol: 'QUOTE',
              netDelta: quoteDelta,
              decimals: 9,
              isIntermediate: false,
            },
            [baseMint]: {
              mint: baseMint,
              symbol: 'BASE',
              netDelta: baseDelta,
              decimals: 6,
              isIntermediate: false,
            },
          }

          // Add intermediate assets (zero net delta)
          intermediateMints.forEach((mint, index) => {
            deltaMap[mint] = {
              mint,
              symbol: `INTERMEDIATE${index}`,
              netDelta: 0, // Zero net delta = intermediate
              decimals: 6,
              isIntermediate: true,
            }
          })

          const result = detector.detectQuoteBase(deltaMap)

          // Should preserve the first quote asset (not intermediates)
          expect(result.quote).not.toBeNull()
          expect(result.quote?.mint).toBe(quoteMint)
          expect(result.quote?.netDelta).toBe(quoteDelta)
          
          // Should not use intermediate assets as quote
          expect(intermediateMints).not.toContain(result.quote?.mint)
          
          // Should detect as BUY (quote outflow, base inflow)
          expect(result.direction).toBe('BUY')
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 15: Multi-Hop Base Preservation
   * **Validates: Requirements 4.5**
   * 
   * For any multi-hop transaction (e.g., SOL → USDC → TOKEN), the parser should preserve
   * the final base asset inflow (TOKEN) in the final swap record, ignoring intermediate
   * assets (USDC).
   */
  it('Property 15: Multi-Hop Base Preservation', () => {
    fc.assert(
      fc.property(
        fc.record({
          // First quote asset (outflow) - must be priority asset for standard swap
          quoteMint: arbitraries.priorityAssetMint,
          quoteDelta: fc.integer({ min: -1_000_000_000, max: -1 }), // Negative (outflow)
          
          // Final base asset (inflow)
          baseMint: arbitraries.tokenMint,
          baseDelta: fc.integer({ min: 1, max: 1_000_000_000 }), // Positive (inflow)
          
          // Intermediate assets (zero net delta)
          intermediateMints: fc.array(
            fc.oneof(arbitraries.priorityAssetMint, arbitraries.tokenMint),
            { minLength: 1, maxLength: 3 }
          ),
        }).filter(({ quoteMint, baseMint, intermediateMints }) => {
          // Ensure all mints are unique
          const allMints = [quoteMint, baseMint, ...intermediateMints]
          return new Set(allMints).size === allMints.length
        }),
        ({ quoteMint, quoteDelta, baseMint, baseDelta, intermediateMints }) => {
          // Build delta map with quote, base, and intermediates
          const deltaMap: AssetDeltaMap = {
            [quoteMint]: {
              mint: quoteMint,
              symbol: 'QUOTE',
              netDelta: quoteDelta,
              decimals: 9,
              isIntermediate: false,
            },
            [baseMint]: {
              mint: baseMint,
              symbol: 'BASE',
              netDelta: baseDelta,
              decimals: 6,
              isIntermediate: false,
            },
          }

          // Add intermediate assets (zero net delta)
          intermediateMints.forEach((mint, index) => {
            deltaMap[mint] = {
              mint,
              symbol: `INTERMEDIATE${index}`,
              netDelta: 0, // Zero net delta = intermediate
              decimals: 6,
              isIntermediate: true,
            }
          })

          const result = detector.detectQuoteBase(deltaMap)

          // Should preserve the final base asset (not intermediates)
          expect(result.base).not.toBeNull()
          expect(result.base?.mint).toBe(baseMint)
          expect(result.base?.netDelta).toBe(baseDelta)
          
          // Should not use intermediate assets as base
          expect(intermediateMints).not.toContain(result.base?.mint)
          
          // Should detect as BUY (quote outflow, base inflow)
          expect(result.direction).toBe('BUY')
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 16: Single or Split Trade Emission
   * **Validates: Requirements 4.6**
   * 
   * For any transaction that produces a valid swap result, the parser should emit exactly
   * one trade record for standard swaps (with priority quote asset), or exactly two trade
   * records (one SELL + one BUY) for token-to-token unstable pair swaps, regardless of
   * the number of intermediate routing steps.
   */
  it('Property 16: Single or Split Trade Emission', () => {
    fc.assert(
      fc.property(
        fc.record({
          // Generate either standard swap or token-to-token swap
          swapType: fc.constantFrom('standard', 'token-to-token'),
          
          // For standard swap
          priorityMint: arbitraries.priorityAssetMint,
          tokenMint: arbitraries.tokenMint,
          
          // For token-to-token swap
          token1Mint: arbitraries.tokenMint,
          token2Mint: arbitraries.tokenMint,
          
          // Deltas
          outflowDelta: fc.integer({ min: -1_000_000_000, max: -1 }),
          inflowDelta: fc.integer({ min: 1, max: 1_000_000_000 }),
          
          // Intermediate assets
          intermediateMints: fc.array(
            fc.oneof(arbitraries.priorityAssetMint, arbitraries.tokenMint),
            { minLength: 0, maxLength: 3 }
          ),
        }).filter(({ swapType, priorityMint, tokenMint, token1Mint, token2Mint, intermediateMints }) => {
          // Ensure all mints are unique
          if (swapType === 'standard') {
            const allMints = [priorityMint, tokenMint, ...intermediateMints]
            return new Set(allMints).size === allMints.length
          } else {
            const allMints = [token1Mint, token2Mint, ...intermediateMints]
            return new Set(allMints).size === allMints.length && token1Mint !== token2Mint
          }
        }),
        ({ swapType, priorityMint, tokenMint, token1Mint, token2Mint, outflowDelta, inflowDelta, intermediateMints }) => {
          let deltaMap: AssetDeltaMap

          if (swapType === 'standard') {
            // Standard swap: priority asset + token
            deltaMap = {
              [priorityMint]: {
                mint: priorityMint,
                symbol: 'PRIORITY',
                netDelta: outflowDelta,
                decimals: 9,
                isIntermediate: false,
              },
              [tokenMint]: {
                mint: tokenMint,
                symbol: 'TOKEN',
                netDelta: inflowDelta,
                decimals: 6,
                isIntermediate: false,
              },
            }
          } else {
            // Token-to-token swap: two non-priority tokens
            deltaMap = {
              [token1Mint]: {
                mint: token1Mint,
                symbol: 'TOKEN1',
                netDelta: outflowDelta,
                decimals: 6,
                isIntermediate: false,
              },
              [token2Mint]: {
                mint: token2Mint,
                symbol: 'TOKEN2',
                netDelta: inflowDelta,
                decimals: 6,
                isIntermediate: false,
              },
            }
          }

          // Add intermediate assets
          intermediateMints.forEach((mint, index) => {
            deltaMap[mint] = {
              mint,
              symbol: `INTERMEDIATE${index}`,
              netDelta: 0,
              decimals: 6,
              isIntermediate: true,
            }
          })

          const result = detector.detectQuoteBase(deltaMap)

          // Should always produce a valid result (not ERASE)
          expect(result.quote).not.toBeNull()
          expect(result.base).not.toBeNull()

          if (swapType === 'standard') {
            // Standard swap: should emit single trade (splitRequired = false)
            expect(result.splitRequired).toBe(false)
            expect(result.direction).not.toBeNull()
            expect(result.direction).toBe('BUY') // Priority outflow, token inflow
          } else {
            // Token-to-token swap: should require split (splitRequired = true)
            expect(result.splitRequired).toBe(true)
            expect(result.direction).toBeNull() // Direction determined per record in split
          }

          // Regardless of intermediate count, should produce consistent result
          // (single trade for standard, split for token-to-token)
        }
      ),
      { numRuns: 100 }
    )
  })
})
