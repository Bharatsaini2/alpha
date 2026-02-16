import * as fc from 'fast-check'
import { expect, test } from '@jest/globals'
import { SYSTEM_ACCOUNTS } from '../constants'
import { identify } from '../swapperIdentifier'
import { BalanceChange, TransactionMeta } from '../types'

function scaleFor(decimals: number): bigint {
  return BigInt(10) ** BigInt(decimals)
}

function abs(value: bigint): bigint {
  return value < BigInt(0) ? -value : value
}

function toBalanceChange(
  owner: string,
  delta: bigint,
  decimals: number,
  mint: string
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

function toMeta(feePayer: string): TransactionMeta {
  return { feePayer, signers: [], instructions: [] }
}

const systemOwner = Array.from(SYSTEM_ACCOUNTS)[0] ?? '11111111111111111111111111111111'

// Feature: parser-v2-balance-truth-refactor, Property 1: Swapper Identification Correctness
test('tier3 selects largest raw delta among non-system owners deterministically', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 5, maxLength: 20 }),
      fc.string({ minLength: 5, maxLength: 20 }),
      fc.string({ minLength: 5, maxLength: 20 }),
      fc.bigInt({ min: BigInt(-1_000_000), max: BigInt(1_000_000) }),
      fc.bigInt({ min: BigInt(-1_000_000), max: BigInt(1_000_000) }),
      fc.bigInt({ min: BigInt(-1_000_000), max: BigInt(1_000_000) }),
      fc.bigInt({ min: BigInt(-1_000_000), max: BigInt(1_000_000) }),
      fc.bigInt({ min: BigInt(1), max: BigInt(1_000_000) }),
      (ownerA, ownerB, feePayer, a1, a2, b1, b2, systemDelta) => {
        fc.pre(ownerA !== ownerB)
        fc.pre(ownerA !== feePayer)
        fc.pre(ownerB !== feePayer)
        fc.pre(ownerA !== systemOwner)
        fc.pre(ownerB !== systemOwner)
        fc.pre(!ownerA.endsWith('vault') && !ownerA.endsWith('pool'))
        fc.pre(!ownerB.endsWith('vault') && !ownerB.endsWith('pool'))
        fc.pre(a1 !== BigInt(0) || a2 !== BigInt(0))
        fc.pre(b1 !== BigInt(0) || b2 !== BigInt(0))

        const changes: BalanceChange[] = [
          toBalanceChange(ownerA, a1, 6, 'MintA'),
          toBalanceChange(ownerB, b1, 6, 'MintB'),
          toBalanceChange(ownerA, a2, 6, 'MintC'),
          toBalanceChange(ownerB, b2, 6, 'MintD'),
          toBalanceChange(systemOwner, systemDelta, 6, 'MintSYS'),
        ]

        const result = identify(changes, toMeta(feePayer))

        expect(result.type).toBe('success')
        if (result.type !== 'success') {
          return
        }

        const sumA = abs(a1) + abs(a2)
        const sumB = abs(b1) + abs(b2)
        fc.pre(sumA !== sumB)
        const expectedSwapper = sumB > sumA ? ownerB : ownerA

        expect(result.method).toBe('largest_delta')
        expect(result.confidence).toBe(70)
        expect(result.swapper).toBe(expectedSwapper)
      }
    ),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 1: Swapper Identification Correctness
test('tier3 tie without fee payer delta returns erase', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 5, maxLength: 20 }),
      fc.string({ minLength: 5, maxLength: 20 }),
      fc.string({ minLength: 5, maxLength: 20 }),
      fc.bigInt({ min: BigInt(1), max: BigInt(1_000_000) }),
      (ownerA, ownerB, feePayer, magnitude) => {
        fc.pre(ownerA !== ownerB)
        fc.pre(ownerA !== feePayer)
        fc.pre(ownerB !== feePayer)
        fc.pre(ownerA !== systemOwner)
        fc.pre(ownerB !== systemOwner)
        fc.pre(!ownerA.endsWith('vault') && !ownerA.endsWith('pool'))
        fc.pre(!ownerB.endsWith('vault') && !ownerB.endsWith('pool'))

        const changes: BalanceChange[] = [
          toBalanceChange(ownerA, magnitude, 6, 'MintA'),
          toBalanceChange(ownerB, -magnitude, 6, 'MintB'),
        ]

        const result = identify(changes, toMeta(feePayer))

        expect(result).toEqual({ type: 'erase', reason: 'no_economic_delta' })
      }
    ),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 2: No Economic Delta Rejection
test('no economic delta returns erase', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.tuple(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.integer({ min: 0, max: 18 }),
          fc.string({ minLength: 5, maxLength: 20 })
        ),
        { minLength: 1, maxLength: 10 }
      ),
      (items) => {
        const changes: BalanceChange[] = items.map(([owner, mint, decimals, label]) =>
          toBalanceChange(owner, BigInt(0), decimals, label + mint)
        )

        const meta = toMeta('FeePayer111111111111111111111111111111111')
        const result = identify(changes, meta)

        expect(result).toEqual({ type: 'erase', reason: 'no_economic_delta' })
      }
    ),
    { numRuns: 100 }
  )
})
