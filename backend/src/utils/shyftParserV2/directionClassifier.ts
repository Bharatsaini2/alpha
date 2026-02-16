import { CORE_TOKENS } from './constants'
import { AssetDelta } from './types'

function isCoreToken(mint: string): boolean {
  return CORE_TOKENS.has(mint)
}

export function classifyDirection(
  entryAsset: AssetDelta,
  exitAsset: AssetDelta
): 'BUY' | 'SELL' {
  if (entryAsset.delta >= BigInt(0)) {
    throw new Error('INVALID_ENTRY_EXIT_SIGN')
  }

  if (exitAsset.delta <= BigInt(0)) {
    throw new Error('INVALID_ENTRY_EXIT_SIGN')
  }

  const entryIsCore = isCoreToken(entryAsset.mint)
  const exitIsCore = isCoreToken(exitAsset.mint)

  if (entryIsCore && !exitIsCore) {
    return 'BUY'
  }

  if (!entryIsCore && exitIsCore) {
    return 'SELL'
  }

  if (entryIsCore && exitIsCore) {
    return 'SELL'
  }

  throw new Error('NON_CORE_TO_NON_CORE_REACHED_DIRECTION')
}
