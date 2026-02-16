import * as fc from 'fast-check'
import { expect, test } from '@jest/globals'
import { SOL_MINT } from '../constants'
import { filter } from '../rentRefundFilter'
import { BalanceChange } from '../types'

const RENT_THRESHOLD = BigInt(10_000_000)

function scaleFor(decimals: number): bigint {
  return BigInt(10) ** BigInt(decimals)
}

function toBalanceChange(
  owner: string,
  mint: string,
  delta: bigint,
  decimals: number
): BalanceChange {
  return {
    mint,
    owner,
    preDelta: BigInt(0),
    postDelta: delta,
    decimals,
    scale: scaleFor(decimals),
  }
}

// Feature: parser-v2-balance-truth-refactor, Property 3: Rent Refund Filtering Preservation
test('negative SOL deltas are never removed', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 5, maxLength: 20 }),
      fc.bigInt({ min: -RENT_THRESHOLD, max: BigInt(-1) }),
      fc.array(
        fc.record({
          mint: fc.string({ minLength: 5, maxLength: 20 }),
          delta: fc.bigInt({ min: BigInt(-1_000_000), max: BigInt(1_000_000) }),
        }),
        { minLength: 0, maxLength: 5 }
      ),
      (owner, solDelta, others) => {
        const solChange = toBalanceChange(owner, SOL_MINT, solDelta, 9)
        const otherChanges = others
          .filter((other) => other.mint !== SOL_MINT)
          .map((other) => toBalanceChange(owner, other.mint, other.delta, 6))

        const result = filter([solChange, ...otherChanges])

        const solEntries = result.filtered.filter(
          (change) => change.mint === SOL_MINT && change.owner === owner
        )

        expect(solEntries).toHaveLength(1)
        expect(solEntries[0].postDelta).toBe(solChange.postDelta)
      }
    ),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 4: Small Positive SOL Filtering
test('small positive SOL removed only when non-SOL delta exists', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 5, maxLength: 20 }),
      fc.bigInt({ min: BigInt(1), max: RENT_THRESHOLD - BigInt(1) }),
      fc.boolean(),
      (owner, solDelta, hasNonSolDelta) => {
        const solChange = toBalanceChange(owner, SOL_MINT, solDelta, 9)
        const nonSolDelta = hasNonSolDelta ? BigInt(1) : BigInt(0)
        const nonSolChange = toBalanceChange(owner, 'TokenMint111111111111111111111111111111111', nonSolDelta, 6)

        const result = filter([solChange, nonSolChange])

        const solEntries = result.filtered.filter(
          (change) => change.mint === SOL_MINT && change.owner === owner
        )

        if (hasNonSolDelta) {
          expect(solEntries).toHaveLength(0)
          expect(result.rentRefundsFiltered).toBe(true)
        } else {
          expect(solEntries).toHaveLength(1)
          expect(result.rentRefundsFiltered).toBe(false)
        }
      }
    ),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 4: Small Positive SOL Filtering
test('positive SOL at threshold is never removed', () => {
  fc.assert(
    fc.property(fc.string({ minLength: 5, maxLength: 20 }), (owner) => {
      const solChange = toBalanceChange(owner, SOL_MINT, RENT_THRESHOLD, 9)
      const nonSolChange = toBalanceChange(
        owner,
        'TokenMint111111111111111111111111111111111',
        BigInt(1),
        6
      )

      const result = filter([solChange, nonSolChange])

      const solEntries = result.filtered.filter(
        (change) => change.mint === SOL_MINT && change.owner === owner
      )

      expect(solEntries).toHaveLength(1)
      expect(result.rentRefundsFiltered).toBe(false)
    }),
    { numRuns: 100 }
  )
})
