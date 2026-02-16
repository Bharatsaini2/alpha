import { CORE_TOKENS } from './constants'
import { AssetDelta } from './types'

export type SplitSwapDetectionResult = {
  splitRequired: boolean
  entryAsset: AssetDelta
  exitAsset: AssetDelta
}

export function detect(activeAssets: AssetDelta[]): SplitSwapDetectionResult {
  if (activeAssets.length !== 2) {
    throw new Error(
      'Invariant violated: splitSwapDetector expects exactly 2 active assets'
    )
  }

  const first = activeAssets[0]
  const second = activeAssets[1]

  let entryAsset: AssetDelta | null = null
  let exitAsset: AssetDelta | null = null

  if (first.delta < BigInt(0)) {
    entryAsset = first
  } else if (first.delta > BigInt(0)) {
    exitAsset = first
  }

  if (second.delta < BigInt(0)) {
    entryAsset = second
  } else if (second.delta > BigInt(0)) {
    exitAsset = second
  }

  if (!entryAsset || !exitAsset) {
    throw new Error(
      'Invariant violated: splitSwapDetector expects one positive and one negative delta'
    )
  }

  const entryIsCore = CORE_TOKENS.has(entryAsset.mint)
  const exitIsCore = CORE_TOKENS.has(exitAsset.mint)
  const splitRequired = !entryIsCore && !exitIsCore

  return { splitRequired, entryAsset, exitAsset }
}
