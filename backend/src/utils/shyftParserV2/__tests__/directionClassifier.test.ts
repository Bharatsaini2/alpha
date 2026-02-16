import { expect, test } from '@jest/globals'
import { classifyDirection } from '../directionClassifier'
import { AssetDelta } from '../types'

function toAssetDelta(mint: string, delta: bigint): AssetDelta {
  return {
    mint,
    owner: 'Owner111111111111111111111111111111111',
    decimals: 6,
    delta,
    scale: BigInt(10) ** BigInt(6),
    role: 'intermediate',
  }
}

test('core -> non-core = BUY', () => {
  const entry = toAssetDelta('So11111111111111111111111111111111111111112', BigInt(-1))
  const exit = toAssetDelta('TokenMint111111111111111111111111111111111', BigInt(1))
  expect(classifyDirection(entry, exit)).toBe('BUY')
})

test('non-core -> core = SELL', () => {
  const entry = toAssetDelta('TokenMint111111111111111111111111111111111', BigInt(-1))
  const exit = toAssetDelta('So11111111111111111111111111111111111111112', BigInt(1))
  expect(classifyDirection(entry, exit)).toBe('SELL')
})

test('core -> core = SELL', () => {
  const entry = toAssetDelta('So11111111111111111111111111111111111111112', BigInt(-1))
  const exit = toAssetDelta('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', BigInt(1))
  expect(classifyDirection(entry, exit)).toBe('SELL')
})

test('non-core -> non-core throws', () => {
  const entry = toAssetDelta('TokenMint111111111111111111111111111111111', BigInt(-1))
  const exit = toAssetDelta('TokenMint222222222222222222222222222222222', BigInt(1))
  expect(() => classifyDirection(entry, exit)).toThrow(
    'NON_CORE_TO_NON_CORE_REACHED_DIRECTION'
  )
})

test('entry.delta >= 0 throws', () => {
  const entry = toAssetDelta('So11111111111111111111111111111111111111112', BigInt(0))
  const exit = toAssetDelta('TokenMint111111111111111111111111111111111', BigInt(1))
  expect(() => classifyDirection(entry, exit)).toThrow('INVALID_ENTRY_EXIT_SIGN')
})

test('exit.delta <= 0 throws', () => {
  const entry = toAssetDelta('So11111111111111111111111111111111111111112', BigInt(-1))
  const exit = toAssetDelta('TokenMint111111111111111111111111111111111', BigInt(0))
  expect(() => classifyDirection(entry, exit)).toThrow('INVALID_ENTRY_EXIT_SIGN')
})
