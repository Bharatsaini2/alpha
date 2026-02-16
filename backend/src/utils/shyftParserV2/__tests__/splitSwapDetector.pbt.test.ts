import * as fc from 'fast-check'
import { expect, test } from '@jest/globals'
import { CORE_TOKENS } from '../constants'
import { detect } from '../splitSwapDetector'
import { AssetDelta } from '../types'

function scaleFor(decimals: number): bigint {
  return BigInt(10) ** BigInt(decimals)
}

function toAssetDelta(mint: string, delta: bigint, index: number): AssetDelta {
  return {
    mint,
    owner: `Owner${index}`,
    decimals: 6,
    delta,
    scale: scaleFor(6),
    role: 'intermediate',
  }
}

const coreMintArb = fc.constantFrom(...Array.from(CORE_TOKENS))
const nonCoreMintArb = fc
  .string({ minLength: 5, maxLength: 20 })
  .filter((mint) => !CORE_TOKENS.has(mint))

const negativeDeltaArb = fc.bigInt({ min: BigInt(-1_000_000), max: BigInt(-1) })
const positiveDeltaArb = fc.bigInt({ min: BigInt(1), max: BigInt(1_000_000) })

// Feature: parser-v2-balance-truth-refactor, Property 10A: Non-Core Pair Requires Split
test('non-core pair requires split', () => {
  fc.assert(
    fc.property(nonCoreMintArb, nonCoreMintArb, negativeDeltaArb, positiveDeltaArb,
      (entryMint, exitMint, negativeDelta, positiveDelta) => {
        fc.pre(entryMint !== exitMint)
        const entry = toAssetDelta(entryMint, negativeDelta, 0)
        const exit = toAssetDelta(exitMint, positiveDelta, 1)
        const result = detect([entry, exit])
        expect(result.splitRequired).toBe(true)
      }),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 10B: Core + Non-Core Does Not Split
test('core and non-core does not split', () => {
  fc.assert(
    fc.property(coreMintArb, nonCoreMintArb, negativeDeltaArb, positiveDeltaArb,
      (coreMint, nonCoreMint, negativeDelta, positiveDelta) => {
        const entry = toAssetDelta(coreMint, negativeDelta, 0)
        const exit = toAssetDelta(nonCoreMint, positiveDelta, 1)
        const result = detect([entry, exit])
        expect(result.splitRequired).toBe(false)
      }),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 10C: Invariant Crash
test('throws on invalid asset count or same sign deltas', () => {
  fc.assert(
    fc.property(
      fc.array(nonCoreMintArb, { minLength: 0, maxLength: 4 }),
      (mints) => {
        fc.pre(mints.length !== 2)
        const assets = mints.map((mint, index) =>
          toAssetDelta(mint, BigInt(1), index)
        )
        expect(() => detect(assets)).toThrow(
          'Invariant violated: splitSwapDetector expects exactly 2 active assets'
        )
      }
    ),
    { numRuns: 100 }
  )

  fc.assert(
    fc.property(
      nonCoreMintArb,
      nonCoreMintArb,
      positiveDeltaArb,
      fc.boolean(),
      (mintA, mintB, magnitude, useNegative) => {
        fc.pre(mintA !== mintB)
        const delta = useNegative ? -magnitude : magnitude
        const assets = [
          toAssetDelta(mintA, delta, 0),
          toAssetDelta(mintB, delta, 1),
        ]
        expect(() => detect(assets)).toThrow(
          'Invariant violated: splitSwapDetector expects one positive and one negative delta'
        )
      }
    ),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 10D: Deterministic Entry/Exit
test('entry is negative and exit is positive deterministically', () => {
  fc.assert(
    fc.property(nonCoreMintArb, nonCoreMintArb, negativeDeltaArb, positiveDeltaArb,
      (entryMint, exitMint, negativeDelta, positiveDelta) => {
        fc.pre(entryMint !== exitMint)
        const entry = toAssetDelta(entryMint, negativeDelta, 0)
        const exit = toAssetDelta(exitMint, positiveDelta, 1)
        const result = detect([entry, exit])
        expect(result.entryAsset.delta < BigInt(0)).toBe(true)
        expect(result.exitAsset.delta > BigInt(0)).toBe(true)
      }),
    { numRuns: 100 }
  )
})
