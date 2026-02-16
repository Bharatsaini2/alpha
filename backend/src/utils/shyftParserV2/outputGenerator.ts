import { normalizeAmounts } from './amountNormalizer'
import { classifyDirection } from './directionClassifier'
import { AssetDelta, ParsedSwap, SwapperResult } from './types'
import { SplitSwapDetectionResult } from './splitSwapDetector'

export type RawTransaction = {
  signature: string
  timestamp: number
}

type OutputMetadata = {
  rentRefundsFiltered: boolean
  intermediateAssetsCollapsed: boolean
  protocol: string
}

export function generate(
  transaction: RawTransaction,
  swapperResult: SwapperResult,
  activeAssets: AssetDelta[],
  splitDetection: SplitSwapDetectionResult,
  metadata: OutputMetadata
): ParsedSwap[] {
  void activeAssets

  if (swapperResult.type !== 'success') {
    throw new Error('Invariant violated: swapperResult must be success')
  }

  const entryAsset = splitDetection.entryAsset
  const exitAsset = splitDetection.exitAsset

  if (entryAsset.delta >= BigInt(0)) {
    throw new Error('Invariant violated: entry delta must be negative')
  }

  if (exitAsset.delta <= BigInt(0)) {
    throw new Error('Invariant violated: exit delta must be positive')
  }

  const baseSwap = {
    signature: transaction.signature,
    timestamp: transaction.timestamp,
    swapper: swapperResult.swapper,
    confidence: swapperResult.confidence,
    protocol: metadata.protocol,
    swapperIdentificationMethod: swapperResult.method,
    rentRefundsFiltered: metadata.rentRefundsFiltered,
    intermediateAssetsCollapsed: metadata.intermediateAssetsCollapsed,
  }

  if (!splitDetection.splitRequired) {
    const direction = classifyDirection(entryAsset, exitAsset)
    const amounts = normalizeAmounts(entryAsset, exitAsset, direction)

    if (direction === 'BUY') {
      return [
        {
          ...baseSwap,
          direction,
          baseAsset: {
            mint: exitAsset.mint,
            decimals: exitAsset.decimals,
          },
          quoteAsset: {
            mint: entryAsset.mint,
            decimals: entryAsset.decimals,
          },
          amounts,
        },
      ]
    }

    return [
      {
        ...baseSwap,
        direction,
        baseAsset: {
          mint: entryAsset.mint,
          decimals: entryAsset.decimals,
        },
        quoteAsset: {
          mint: exitAsset.mint,
          decimals: exitAsset.decimals,
        },
        amounts,
      },
    ]
  }

  const sellAmounts = normalizeAmounts(entryAsset, exitAsset, 'SELL')
  const buyAmounts = normalizeAmounts(entryAsset, exitAsset, 'BUY')

  const sellRecord: ParsedSwap = {
    ...baseSwap,
    direction: 'SELL',
    baseAsset: {
      mint: entryAsset.mint,
      decimals: entryAsset.decimals,
    },
    quoteAsset: {
      mint: exitAsset.mint,
      decimals: exitAsset.decimals,
    },
    amounts: sellAmounts,
  }

  const buyRecord: ParsedSwap = {
    ...baseSwap,
    direction: 'BUY',
    baseAsset: {
      mint: exitAsset.mint,
      decimals: exitAsset.decimals,
    },
    quoteAsset: {
      mint: entryAsset.mint,
      decimals: entryAsset.decimals,
    },
    amounts: buyAmounts,
  }

  return [sellRecord, buyRecord]
}
