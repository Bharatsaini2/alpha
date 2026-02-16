import { AssetDelta, BalanceChange } from './types'

function abs(value: bigint): bigint {
  return value < BigInt(0) ? -value : value
}

function isLargerNormalizedMagnitude(candidate: AssetDelta, current: AssetDelta): boolean {
  const candidateAbs = abs(candidate.delta)
  const currentAbs = abs(current.delta)
  const candidateScaled = candidateAbs * current.scale
  const currentScaled = currentAbs * candidate.scale
  return candidateScaled > currentScaled
}

function toAssetDelta(change: BalanceChange): AssetDelta {
  return {
    mint: change.mint,
    owner: change.owner,
    decimals: change.decimals,
    delta: change.postDelta - change.preDelta,
    scale: change.scale,
    role: 'intermediate',
  }
}

export function collect(
  balanceChanges: BalanceChange[],
  swapper: string
):
  | { type: 'success'; activeAssets: AssetDelta[]; intermediateAssetsCollapsed: boolean }
  | { type: 'erase'; reason: 'invalid_asset_count' } {
  const swapperChanges = balanceChanges.filter((change) => change.owner === swapper)
  const assetDeltas = swapperChanges.map((change) => toAssetDelta(change))

  if (assetDeltas.length < 2) {
    return { type: 'erase', reason: 'invalid_asset_count' }
  }

  if (assetDeltas.length === 2) {
    for (const asset of assetDeltas) {
      if (asset.delta < BigInt(0)) {
        asset.role = 'entry'
      } else if (asset.delta > BigInt(0)) {
        asset.role = 'exit'
      }
    }

    return {
      type: 'success',
      activeAssets: assetDeltas,
      intermediateAssetsCollapsed: false,
    }
  }

  let entryAsset: AssetDelta | null = null
  let exitAsset: AssetDelta | null = null

  for (const asset of assetDeltas) {
    if (asset.delta < BigInt(0)) {
      if (!entryAsset || isLargerNormalizedMagnitude(asset, entryAsset)) {
        entryAsset = asset
      }
    } else if (asset.delta > BigInt(0)) {
      if (!exitAsset || isLargerNormalizedMagnitude(asset, exitAsset)) {
        exitAsset = asset
      }
    }
  }

  if (!entryAsset || !exitAsset) {
    const first = assetDeltas[0]
    const second = assetDeltas[1]

    if (!entryAsset && !exitAsset) {
      entryAsset = first
      exitAsset = second
    } else if (!entryAsset) {
      entryAsset = first === exitAsset ? second : first
    } else if (!exitAsset) {
      exitAsset = first === entryAsset ? second : first
    }
  }

  const entry = entryAsset ?? assetDeltas[0]
  const exit =
    exitAsset ?? assetDeltas.find((asset) => asset !== entry) ?? entry

  entry.role = 'entry'
  exit.role = 'exit'

  return {
    type: 'success',
      activeAssets: [entry, exit],
    intermediateAssetsCollapsed: true,
  }
}
