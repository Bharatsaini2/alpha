import * as fc from 'fast-check'
import { expect, test } from '@jest/globals'
import { collect } from '../assetDeltaCollector'
import { AssetDelta, BalanceChange } from '../types'

function scaleFor(decimals: number): bigint {
  return BigInt(10) ** BigInt(decimals)
}

function abs(value: bigint): bigint {
  return value < BigInt(0) ? -value : value
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

function isLargerNormalizedMagnitude(candidate: AssetDelta, current: AssetDelta): boolean {
  const candidateAbs = abs(candidate.delta)
  const currentAbs = abs(current.delta)
  const candidateScaled = candidateAbs * current.scale
  const currentScaled = currentAbs * candidate.scale
  return candidateScaled > currentScaled
}

function selectLargestNegative(assets: AssetDelta[]): AssetDelta {
  let selected = assets[0]
  for (const asset of assets) {
    if (asset.delta < BigInt(0)) {
      if (selected.delta >= BigInt(0)) {
        selected = asset
        continue
      }
      if (isLargerNormalizedMagnitude(asset, selected)) {
        selected = asset
      }
    }
  }
  return selected
}

function selectLargestPositive(assets: AssetDelta[]): AssetDelta {
  let selected = assets[0]
  for (const asset of assets) {
    if (asset.delta > BigInt(0)) {
      if (selected.delta <= BigInt(0)) {
        selected = asset
        continue
      }
      if (isLargerNormalizedMagnitude(asset, selected)) {
        selected = asset
      }
    }
  }
  return selected
}

// Feature: parser-v2-balance-truth-refactor, Property 7: Minimum Asset Count Validation
test('returns erase when swapper has fewer than two assets', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 5, maxLength: 20 }),
      fc.integer({ min: 0, max: 1 }),
      fc.array(
        fc.record({
          owner: fc.string({ minLength: 5, maxLength: 20 }),
          mint: fc.string({ minLength: 5, maxLength: 20 }),
          decimals: fc.integer({ min: 0, max: 18 }),
          delta: fc.bigInt({ min: BigInt(-1_000_000), max: BigInt(1_000_000) }),
        }),
        { minLength: 0, maxLength: 5 }
      ),
      (swapper, swapperCount, otherChanges) => {
        const swapperChanges: BalanceChange[] = []

        for (let i = 0; i < swapperCount; i += 1) {
          swapperChanges.push(
            toBalanceChange(
              swapper,
              `MintSwap${i}`,
              BigInt(1),
              6
            )
          )
        }

        const nonSwapperChanges = otherChanges
          .filter((change) => change.owner !== swapper)
          .map((change, index) =>
            toBalanceChange(change.owner, `${change.mint}${index}`, change.delta, change.decimals)
          )

        const result = collect([...swapperChanges, ...nonSwapperChanges], swapper)
        expect(result).toEqual({ type: 'erase', reason: 'invalid_asset_count' })
      }
    ),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 8: Multi-Asset Collapsing
test('collapses to largest negative and largest positive deterministically', () => {
  const negativeDeltaArb = fc.bigInt({ min: BigInt(-1_000_000), max: BigInt(-1) })
  const positiveDeltaArb = fc.bigInt({ min: BigInt(1), max: BigInt(1_000_000) })

  fc.assert(
    fc.property(
      fc.string({ minLength: 5, maxLength: 20 }),
      fc.tuple(
        fc.record({
          mint: fc.string({ minLength: 5, maxLength: 20 }),
          decimals: fc.integer({ min: 0, max: 18 }),
          delta: negativeDeltaArb,
        }),
        fc.record({
          mint: fc.string({ minLength: 5, maxLength: 20 }),
          decimals: fc.integer({ min: 0, max: 18 }),
          delta: positiveDeltaArb,
        })
      ),
      fc.array(
        fc.record({
          mint: fc.string({ minLength: 5, maxLength: 20 }),
          decimals: fc.integer({ min: 0, max: 18 }),
          delta: fc.oneof(negativeDeltaArb, positiveDeltaArb),
        }),
        { minLength: 1, maxLength: 6 }
      ),
      (swapper, [negBase, posBase], others) => {
        const changes: BalanceChange[] = [
          toBalanceChange(swapper, negBase.mint, negBase.delta, negBase.decimals),
          toBalanceChange(swapper, posBase.mint, posBase.delta, posBase.decimals),
          ...others.map((item, index) =>
            toBalanceChange(swapper, `${item.mint}${index}`, item.delta, item.decimals)
          ),
        ]

        const result = collect(changes, swapper)
        expect(result.type).toBe('success')

        if (result.type !== 'success') {
          return
        }

        expect(result.intermediateAssetsCollapsed).toBe(true)
        expect(result.activeAssets).toHaveLength(2)

        const allAssets = changes.map((change) => ({
          mint: change.mint,
          owner: change.owner,
          decimals: change.decimals,
          delta: change.postDelta - change.preDelta,
          scale: change.scale,
          role: 'intermediate' as const,
        }))

        const expectedEntry = selectLargestNegative(allAssets)
        const expectedExit = selectLargestPositive(allAssets)

        const [entry, exit] = result.activeAssets
        expect(entry.role).toBe('entry')
        expect(exit.role).toBe('exit')
        expect(entry.mint).toBe(expectedEntry.mint)
        expect(exit.mint).toBe(expectedExit.mint)
      }
    ),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 8: Multi-Asset Collapsing
test('tie handling keeps first encountered asset', () => {
  fc.assert(
    fc.property(fc.string({ minLength: 5, maxLength: 20 }), (swapper) => {
      const tieFirst = toBalanceChange(swapper, 'TieA', BigInt(-10), 1)
      const tieSecond = toBalanceChange(swapper, 'TieB', BigInt(-1), 0)
      const positive = toBalanceChange(swapper, 'Exit', BigInt(5), 0)

      const result = collect([tieFirst, tieSecond, positive], swapper)
      expect(result.type).toBe('success')

      if (result.type !== 'success') {
        return
      }

      const [entry] = result.activeAssets
      expect(entry.mint).toBe('TieA')
    }),
    { numRuns: 100 }
  )
})
