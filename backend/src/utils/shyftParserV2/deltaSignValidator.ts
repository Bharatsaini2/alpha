import { AssetDelta, ValidationResult } from './types'

export function validate(activeAssets: AssetDelta[]): ValidationResult {
  let positiveCount = 0
  let negativeCount = 0

  for (const asset of activeAssets) {
    if (asset.delta > BigInt(0)) {
      positiveCount += 1
    } else if (asset.delta < BigInt(0)) {
      negativeCount += 1
    }
  }

  if (positiveCount === 0) {
    return {
      valid: false,
      positiveCount,
      negativeCount,
      reason: 'no_positive_deltas',
    }
  }

  if (negativeCount === 0) {
    return {
      valid: false,
      positiveCount,
      negativeCount,
      reason: 'no_negative_deltas',
    }
  }

  return { valid: true, positiveCount, negativeCount }
}
