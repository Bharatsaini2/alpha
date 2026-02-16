import { AssetDelta } from './types'

function abs(value: bigint): bigint {
  return value < BigInt(0) ? -value : value
}

function formatAmount(delta: bigint, scale: bigint): string {
  const absDelta = abs(delta)
  const integerPart = absDelta / scale
  const remainder = absDelta % scale

  if (remainder === BigInt(0)) {
    return integerPart.toString()
  }

  const scaleDigits = scale.toString().length - 1
  const fractionalRaw = remainder.toString().padStart(scaleDigits, '0')
  const fractional = fractionalRaw.replace(/0+$/, '')

  if (fractional.length === 0) {
    return integerPart.toString()
  }

  return `${integerPart.toString()}.${fractional}`
}

export function normalizeAmounts(
  entryAsset: AssetDelta,
  exitAsset: AssetDelta,
  direction: 'BUY' | 'SELL'
): {
  baseAmount: string
  totalWalletCost?: string
  netWalletReceived?: string
} {
  if (entryAsset.delta >= BigInt(0)) {
    throw new Error('Invariant violation: entry delta must be negative')
  }

  if (exitAsset.delta <= BigInt(0)) {
    throw new Error('Invariant violation: exit delta must be positive')
  }

  const entryFormatted = formatAmount(entryAsset.delta, entryAsset.scale)
  const exitFormatted = formatAmount(exitAsset.delta, exitAsset.scale)

  if (direction === 'BUY') {
    return {
      baseAmount: exitFormatted,
      totalWalletCost: entryFormatted,
    }
  }

  return {
    baseAmount: entryFormatted,
    netWalletReceived: exitFormatted,
  }
}
