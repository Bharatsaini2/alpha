import { expect, test } from '@jest/globals'
import { validateSwapperEconomicDelta } from '../swapperEconomicDeltaValidator'
import { AssetDelta } from '../types'

function toAssetDelta(mint: string, delta: bigint): AssetDelta {
  return {
    mint,
    owner: 'Swapper111111111111111111111111111111111',
    decimals: 6,
    delta,
    scale: BigInt(10) ** BigInt(6),
    role: 'intermediate',
  }
}

test('returns invalid when activeAssets is empty', () => {
  const result = validateSwapperEconomicDelta('swapper', [])
  expect(result).toEqual({ valid: false, reason: 'swapper_no_delta' })
})

test('returns valid when activeAssets has one element', () => {
  const assets = [toAssetDelta('MintA', BigInt(1))]
  const result = validateSwapperEconomicDelta('swapper', assets)
  expect(result).toEqual({ valid: true })
})

test('returns valid when activeAssets has multiple elements', () => {
  const assets = [
    toAssetDelta('MintA', BigInt(1)),
    toAssetDelta('MintB', BigInt(-1)),
  ]
  const result = validateSwapperEconomicDelta('swapper', assets)
  expect(result).toEqual({ valid: true })
})

test('does not mutate input array', () => {
  const assets = [toAssetDelta('MintA', BigInt(1))]
  const snapshot = assets.map((asset) => ({ ...asset }))
  validateSwapperEconomicDelta('swapper', assets)
  expect(assets).toEqual(snapshot)
})
