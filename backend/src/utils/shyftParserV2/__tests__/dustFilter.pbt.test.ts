import * as fc from 'fast-check'
import { expect, test } from '@jest/globals'
import { filter, getDustThreshold } from '../dustFilter'
import { BalanceChange } from '../types'

function scaleFor(decimals: number): bigint {
  return BigInt(10) ** BigInt(decimals)
}

function abs(value: bigint): bigint {
  return value < BigInt(0) ? -value : value
}

const balanceChangeArbitrary: fc.Arbitrary<BalanceChange> = fc
  .tuple(
    fc.string({ minLength: 5, maxLength: 20 }),
    fc.string({ minLength: 5, maxLength: 20 }),
    fc.integer({ min: 0, max: 18 }),
    fc.bigInt({ min: BigInt(-1_000_000_000_000), max: BigInt(1_000_000_000_000) })
  )
  .map(([mint, owner, decimals, delta]) => ({
    mint,
    owner,
    preDelta: BigInt(0),
    postDelta: delta,
    decimals,
    scale: scaleFor(decimals),
  }))

// Feature: parser-v2-balance-truth-refactor, Property 5: Dust Threshold Calculation
test('dust threshold is 1 for decimals <= 6, otherwise 10', () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 18 }), (decimals) => {
      const threshold = getDustThreshold(decimals)
      if (decimals <= 6) {
        expect(threshold).toBe(BigInt(1))
      } else {
        expect(threshold).toBe(BigInt(10))
      }
    }),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 6: Dust Filtering Application
test('filters by strict abs(delta) > threshold without mutation', () => {
  fc.assert(
    fc.property(fc.array(balanceChangeArbitrary, { minLength: 1, maxLength: 20 }), (changes) => {
      const originalSnapshot = changes.map((change) => ({ ...change }))
      const result = filter(changes)

      const expected = changes.filter((change) => {
        const delta = change.postDelta - change.preDelta
        const threshold = getDustThreshold(change.decimals)
        return abs(delta) > threshold
      })

      expect(result).toEqual(expected)
      expect(changes).toEqual(originalSnapshot)
    }),
    { numRuns: 100 }
  )
})
