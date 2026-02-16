import { AssetDelta, ValidationResult } from './types'

export function validateSwapperEconomicDelta(
  swapper: string,
  activeAssets: AssetDelta[]
): ValidationResult {
  if (activeAssets.length === 0) {
    return { valid: false, reason: 'swapper_no_delta' }
  }

  return { valid: true }
}
