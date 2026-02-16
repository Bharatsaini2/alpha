export type RawAmount = bigint

export interface BalanceChange {
  mint: string
  owner: string
  preDelta: RawAmount
  postDelta: RawAmount
  decimals: number
  scale: RawAmount
}

export interface AssetDelta {
  mint: string
  owner: string
  decimals: number
  delta: RawAmount
  scale: RawAmount
  role: 'entry' | 'exit' | 'intermediate'
}

export interface ParsedSwap {
  signature: string
  timestamp: number
  swapper: string
  direction: 'BUY' | 'SELL'
  baseAsset: {
    mint: string
    decimals: number
  }
  quoteAsset: {
    mint: string
    decimals: number
  }
  amounts: {
    baseAmount: string
    totalWalletCost?: string
    netWalletReceived?: string
  }
  confidence: number
  protocol: string
  swapperIdentificationMethod: 'tier1' | 'tier2' | 'largest_delta'
  rentRefundsFiltered: boolean
  intermediateAssetsCollapsed: boolean
}

export interface ParseError {
  signature: string
  reason: EraseReason
  debugInfo: {
    swapper?: string
    assetDeltas?: AssetDelta[]
    positiveCount?: number
    negativeCount?: number
    activeAssetCount?: number
  }
}

export interface Instruction {
  programId: string
  name?: string
  data?: unknown
}

export interface TransactionMeta {
  signers: string[]
  feePayer: string
  instructions: Instruction[]
}

export type SwapperResult =
  | {
      type: 'success'
      swapper: string
      confidence: number
      method: 'tier1' | 'tier2' | 'largest_delta'
    }
  | {
      type: 'erase'
      reason: 'no_economic_delta'
    }

export type EraseReason =
  | 'no_economic_delta'
  | 'invalid_asset_count'
  | 'no_positive_deltas'
  | 'no_negative_deltas'
  | 'core_only_swap'
  | 'pure_transfer'
  | 'swapper_no_delta'

export interface ValidationResult {
  valid: boolean
  reason?: EraseReason
  positiveCount?: number
  negativeCount?: number
}
