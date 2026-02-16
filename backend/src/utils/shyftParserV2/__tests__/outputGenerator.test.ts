import * as fc from 'fast-check'
import { expect, test } from '@jest/globals'
import { normalizeAmounts } from '../amountNormalizer'
import { generate, RawTransaction } from '../outputGenerator'
import { AssetDelta, SwapperResult } from '../types'
import { SplitSwapDetectionResult } from '../splitSwapDetector'

function scaleFor(decimals: number): bigint {
  return BigInt(10) ** BigInt(decimals)
}

function toAssetDelta(mint: string, delta: bigint, decimals: number): AssetDelta {
  return {
    mint,
    owner: 'Owner111111111111111111111111111111111',
    decimals,
    delta,
    scale: scaleFor(decimals),
    role: 'intermediate',
  }
}

function toTransaction(signature: string, timestamp: number): RawTransaction {
  return { signature, timestamp }
}

function toSwapperResult(swapper: string): SwapperResult {
  return { type: 'success', swapper, confidence: 90, method: 'tier2' }
}

function toSplitDetection(
  entryAsset: AssetDelta,
  exitAsset: AssetDelta,
  splitRequired: boolean
): SplitSwapDetectionResult {
  return { entryAsset, exitAsset, splitRequired }
}

const metadata = {
  rentRefundsFiltered: false,
  intermediateAssetsCollapsed: false,
  protocol: 'unknown',
}

function containsKey(obj: unknown, key: string): boolean {
  if (!obj || typeof obj !== 'object') {
    return false
  }

  if (Array.isArray(obj)) {
    return obj.some((item) => containsKey(item, key))
  }

  const record = obj as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(record, key)) {
    return true
  }

  return Object.values(record).some((value) => containsKey(value, key))
}

// Feature: parser-v2-balance-truth-refactor, Property 11: Split Signature Preservation
test('split signature preservation', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 5, maxLength: 30 }),
      fc.integer({ min: 1, max: 1_000_000 }),
      fc.string({ minLength: 5, maxLength: 20 }),
      fc.bigInt({ min: BigInt(1), max: BigInt(1_000_000_000) }),
      fc.bigInt({ min: BigInt(1), max: BigInt(1_000_000_000) }),
      (signature, timestamp, swapper, entryAbs, exitAbs) => {
        const entry = toAssetDelta('TokenMintEntry', -entryAbs, 6)
        const exit = toAssetDelta('TokenMintExit', exitAbs, 6)
        const result = generate(
          toTransaction(signature, timestamp),
          toSwapperResult(swapper),
          [entry, exit],
          toSplitDetection(entry, exit, true),
          metadata
        )

        expect(result).toHaveLength(2)
        expect(result[0].signature).toBe(signature)
        expect(result[1].signature).toBe(signature)
        expect(result[0].timestamp).toBe(timestamp)
        expect(result[1].timestamp).toBe(timestamp)
        expect(result[0].swapper).toBe(swapper)
        expect(result[1].swapper).toBe(swapper)
      }
    ),
    { numRuns: 100 }
  )
})

test('invariant crash on entry/exit signs', () => {
  const entryPositive = toAssetDelta('TokenMintEntry', BigInt(1), 6)
  const exitPositive = toAssetDelta('TokenMintExit', BigInt(2), 6)

  expect(() =>
    generate(
      toTransaction('sig-entry', 1),
      toSwapperResult('Swapper'),
      [entryPositive, exitPositive],
      toSplitDetection(entryPositive, exitPositive, false),
      metadata
    )
  ).toThrow('Invariant violated: entry delta must be negative')

  const entryNegative = toAssetDelta('TokenMintEntry', BigInt(-1), 6)
  const exitNegative = toAssetDelta('TokenMintExit', BigInt(-2), 6)

  expect(() =>
    generate(
      toTransaction('sig-exit', 2),
      toSwapperResult('Swapper'),
      [entryNegative, exitNegative],
      toSplitDetection(entryNegative, exitNegative, false),
      metadata
    )
  ).toThrow('Invariant violated: exit delta must be positive')
})

test('no USD fields present', () => {
  const entry = toAssetDelta('So11111111111111111111111111111111111111112', BigInt(-1), 9)
  const exit = toAssetDelta('TokenMintExit', BigInt(2), 6)
  const result = generate(
    toTransaction('sig-usd', 3),
    toSwapperResult('Swapper'),
    [entry, exit],
    toSplitDetection(entry, exit, false),
    metadata
  )[0]

  expect(containsKey(result, 'usdAmount')).toBe(false)
  expect(containsKey(result, 'solPrice')).toBe(false)
  expect(containsKey(result, 'marketCap')).toBe(false)
})

test('non-split BUY mapping uses exit as base and entry as quote', () => {
  const entry = toAssetDelta('So11111111111111111111111111111111111111112', BigInt(-1230000000), 9)
  const exit = toAssetDelta('TokenMintExit', BigInt(4560000), 6)
  const amounts = normalizeAmounts(entry, exit, 'BUY')

  const result = generate(
    toTransaction('sig-buy', 4),
    toSwapperResult('Swapper'),
    [entry, exit],
    toSplitDetection(entry, exit, false),
    metadata
  )[0]

  expect(result.direction).toBe('BUY')
  expect(result.baseAsset.mint).toBe(exit.mint)
  expect(result.quoteAsset.mint).toBe(entry.mint)
  expect(result.amounts).toEqual(amounts)
})

test('non-split SELL mapping uses entry as base and exit as quote', () => {
  const entry = toAssetDelta('TokenMintEntry', BigInt(-7890000), 6)
  const exit = toAssetDelta('So11111111111111111111111111111111111111112', BigInt(1230000000), 9)
  const amounts = normalizeAmounts(entry, exit, 'SELL')

  const result = generate(
    toTransaction('sig-sell', 5),
    toSwapperResult('Swapper'),
    [entry, exit],
    toSplitDetection(entry, exit, false),
    metadata
  )[0]

  expect(result.direction).toBe('SELL')
  expect(result.baseAsset.mint).toBe(entry.mint)
  expect(result.quoteAsset.mint).toBe(exit.mint)
  expect(result.amounts).toEqual(amounts)
})
