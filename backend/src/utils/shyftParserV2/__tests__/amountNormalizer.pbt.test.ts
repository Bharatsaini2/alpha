import * as fc from 'fast-check'
import { expect, test } from '@jest/globals'
import { normalizeAmounts } from '../amountNormalizer'
import { AssetDelta } from '../types'

function scaleFor(decimals: number): bigint {
  return BigInt(10) ** BigInt(decimals)
}

function toAssetDelta(
  mint: string,
  delta: bigint,
  decimals: number,
  index: number
): AssetDelta {
  return {
    mint,
    owner: `Owner${index}`,
    decimals,
    delta,
    scale: scaleFor(decimals),
    role: 'intermediate',
  }
}

function toRawValue(amount: string, scale: bigint): bigint {
  const scaleDigits = scale.toString().length - 1
  const [integerPart, fractionalPart = ''] = amount.split('.')
  const paddedFractional = fractionalPart.padEnd(scaleDigits, '0')
  const raw = `${integerPart}${paddedFractional}`
  return BigInt(raw)
}

// Feature: parser-v2-balance-truth-refactor, Property 12: Exact Formatting
test('formats amounts exactly to string with no precision loss', () => {
  const positiveDeltaArb = fc.bigInt({
    min: BigInt(1),
    max: BigInt('1000000000000000000'),
  })

  fc.assert(
    fc.property(
      positiveDeltaArb,
      positiveDeltaArb,
      fc.integer({ min: 0, max: 18 }),
      fc.integer({ min: 0, max: 18 }),
      (entryAbs, exitAbs, entryDecimals, exitDecimals) => {
        const entry = toAssetDelta('EntryMint', -entryAbs, entryDecimals, 0)
        const exit = toAssetDelta('ExitMint', exitAbs, exitDecimals, 1)

        const result = normalizeAmounts(entry, exit, 'BUY')

        const entryRaw = toRawValue(result.totalWalletCost ?? '0', entry.scale)
        const exitRaw = toRawValue(result.baseAmount, exit.scale)

        expect(entryRaw).toBe(entryAbs)
        expect(exitRaw).toBe(exitAbs)
      }
    ),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 13: BUY Assignment
test('BUY assigns baseAmount to exit and totalWalletCost to entry', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: BigInt(1), max: BigInt('1000000000000000') }),
      fc.bigInt({ min: BigInt(1), max: BigInt('1000000000000000') }),
      fc.integer({ min: 0, max: 18 }),
      fc.integer({ min: 0, max: 18 }),
      (entryAbs, exitAbs, entryDecimals, exitDecimals) => {
        const entry = toAssetDelta('EntryMint', -entryAbs, entryDecimals, 0)
        const exit = toAssetDelta('ExitMint', exitAbs, exitDecimals, 1)

        const result = normalizeAmounts(entry, exit, 'BUY')

        expect(result.baseAmount).toBeDefined()
        expect(result.totalWalletCost).toBeDefined()
        expect(result.netWalletReceived).toBeUndefined()
      }
    ),
    { numRuns: 100 }
  )
})

// Feature: parser-v2-balance-truth-refactor, Property 14: SELL Assignment
test('SELL assigns baseAmount to entry and netWalletReceived to exit', () => {
  fc.assert(
    fc.property(
      fc.bigInt({ min: BigInt(1), max: BigInt('1000000000000000') }),
      fc.bigInt({ min: BigInt(1), max: BigInt('1000000000000000') }),
      fc.integer({ min: 0, max: 18 }),
      fc.integer({ min: 0, max: 18 }),
      (entryAbs, exitAbs, entryDecimals, exitDecimals) => {
        const entry = toAssetDelta('EntryMint', -entryAbs, entryDecimals, 0)
        const exit = toAssetDelta('ExitMint', exitAbs, exitDecimals, 1)

        const result = normalizeAmounts(entry, exit, 'SELL')

        expect(result.baseAmount).toBeDefined()
        expect(result.netWalletReceived).toBeDefined()
        expect(result.totalWalletCost).toBeUndefined()
      }
    ),
    { numRuns: 100 }
  )
})
