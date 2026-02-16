import * as fc from 'fast-check'
import { expect, test } from '@jest/globals'
import { validate } from '../deltaSignValidator'
import { AssetDelta } from '../types'

function scaleFor(decimals: number): bigint {
  return BigInt(10) ** BigInt(decimals)
}

function toAssetDelta(delta: bigint, index: number, decimals: number): AssetDelta {
  return {
    mint: `Mint${index}`,
    owner: 'Swapper111111111111111111111111111111111',
    decimals,
    delta,
    scale: scaleFor(decimals),
    role: 'intermediate',
  }
}

// Feature: parser-v2-balance-truth-refactor, Property 9: Delta Sign Validation
test('all positive deltas are invalid with no_negative_deltas', () => {
  fc.assert(
    fc.property(
      fc.array(fc.bigInt({ min: BigInt(1), max: BigInt(1_000_000) }), {
        minLength: 1,
        maxLength: 20,
      }),
      fc.integer({ min: 0, max: 18 }),
      (deltas, decimals) => {
        const assets = deltas.map((delta, index) =>
          toAssetDelta(delta, index, decimals)
        )

        const result = validate(assets)

        expect(result).toEqual({
          valid: false,
          positiveCount: deltas.length,
          negativeCount: 0,
          reason: 'no_negative_deltas',
        })
      }
    ),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 9: Delta Sign Validation
test('all negative deltas are invalid with no_positive_deltas', () => {
  fc.assert(
    fc.property(
      fc.array(fc.bigInt({ min: BigInt(-1_000_000), max: BigInt(-1) }), {
        minLength: 1,
        maxLength: 20,
      }),
      fc.integer({ min: 0, max: 18 }),
      (deltas, decimals) => {
        const assets = deltas.map((delta, index) =>
          toAssetDelta(delta, index, decimals)
        )

        const result = validate(assets)

        expect(result).toEqual({
          valid: false,
          positiveCount: 0,
          negativeCount: deltas.length,
          reason: 'no_positive_deltas',
        })
      }
    ),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 9: Delta Sign Validation
test('mixed signs are valid and counts are deterministic', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: BigInt(1), max: BigInt(1_000_000) }),
      fc.bigInt({ min: BigInt(-1_000_000), max: BigInt(-1) }),
      fc.array(
        fc.bigInt({ min: BigInt(-1_000_000), max: BigInt(1_000_000) }),
        { minLength: 0, maxLength: 10 }
      ),
      fc.integer({ min: 0, max: 18 }),
      (positive, negative, rest, decimals) => {
        const deltas = [positive, negative, ...rest]
        const assets = deltas.map((delta, index) =>
          toAssetDelta(delta, index, decimals)
        )
        const snapshot = assets.map((asset) => ({ ...asset }))

        const result = validate(assets)

        const positiveCount = deltas.filter((delta) => delta > BigInt(0)).length
        const negativeCount = deltas.filter((delta) => delta < BigInt(0)).length

        expect(result).toEqual({
          valid: true,
          positiveCount,
          negativeCount,
        })
        expect(assets).toEqual(snapshot)
      }
    ),
    { numRuns: 100 }
  )
})
