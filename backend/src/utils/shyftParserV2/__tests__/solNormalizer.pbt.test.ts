import * as fc from 'fast-check'
import { expect, test } from '@jest/globals'
import { SOL_EQUIVALENTS } from '../constants'
import { normalize } from '../solNormalizer'
import { BalanceChange } from '../types'

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const SOL_SCALE = BigInt(10) ** BigInt(9)

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

// Feature: parser-v2-balance-truth-refactor, Property 21: SOL Variant Normalization
test('SOL variants are merged deterministically per owner', () => {
  const solVariants = Array.from(SOL_EQUIVALENTS).filter((mint) => mint !== SOL_MINT)

  fc.assert(
    fc.property(
      fc.string({ minLength: 5, maxLength: 20 }),
      fc.bigInt({ min: BigInt(-1_000_000), max: BigInt(1_000_000) }),
      fc.bigInt({ min: BigInt(-1_000_000), max: BigInt(1_000_000) }),
      fc.string({ minLength: 5, maxLength: 20 }),
      fc.bigInt({ min: BigInt(-1_000_000), max: BigInt(1_000_000) }),
      (owner, delta1, delta2, otherOwner, otherDelta) => {
        fc.pre(solVariants.length > 0)
        fc.pre(owner !== otherOwner)

        const nonSol = toBalanceChange(
          otherOwner,
          'TokenMint111111111111111111111111111111111',
          otherDelta,
          6
        )
        const input: BalanceChange[] = [
          toBalanceChange(owner, SOL_MINT, delta1, 9),
          toBalanceChange(owner, solVariants[0], delta2, 9),
          toBalanceChange(otherOwner, solVariants[0], BigInt(3), 9),
          toBalanceChange(otherOwner, SOL_MINT, BigInt(-3), 9),
          nonSol,
        ]

        const result = normalize(input)

        const solEntries = result.filter(
          (change) => change.owner === owner && change.mint === SOL_MINT
        )
        const otherOwnerEntries = result.filter(
          (change) => change.owner === otherOwner && change.mint === SOL_MINT
        )
        const expectedDelta = delta1 + delta2
        const otherOwnerDelta = BigInt(0)

        expect(solEntries).toHaveLength(expectedDelta === BigInt(0) ? 0 : 1)
        if (expectedDelta !== BigInt(0)) {
          expect(solEntries[0].postDelta - solEntries[0].preDelta).toBe(expectedDelta)
          expect(solEntries[0].decimals).toBe(9)
          expect(solEntries[0].scale).toBe(SOL_SCALE)
        }

        expect(otherOwnerEntries).toHaveLength(otherOwnerDelta === BigInt(0) ? 0 : 1)

        const nonSolOut = result.filter((change) => change.mint === nonSol.mint)
        expect(nonSolOut).toHaveLength(1)
        expect(nonSolOut[0]).toEqual(nonSol)
        expect(nonSolOut[0]).not.toBe(nonSol)
      }
    ),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 21: SOL Variant Normalization
test('zero-sum SOL variants do not emit a normalized SOL entry', () => {
  const solVariants = Array.from(SOL_EQUIVALENTS).filter((mint) => mint !== SOL_MINT)

  fc.assert(
    fc.property(
      fc.string({ minLength: 5, maxLength: 20 }),
      fc.bigInt({ min: BigInt(-1_000_000), max: BigInt(1_000_000) }),
      (owner, delta) => {
        fc.pre(solVariants.length > 0)

        const input: BalanceChange[] = [
          toBalanceChange(owner, SOL_MINT, delta, 9),
          toBalanceChange(owner, solVariants[0], -delta, 9),
        ]

        const result = normalize(input)
        const solEntries = result.filter(
          (change) => change.owner === owner && change.mint === SOL_MINT
        )

        expect(solEntries).toHaveLength(0)
      }
    ),
    { numRuns: 100 }
  )
})
