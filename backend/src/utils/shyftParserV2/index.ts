import * as solNormalizer from './solNormalizer'
import * as swapperIdentifier from './swapperIdentifier'
import * as rentRefundFilter from './rentRefundFilter'
import * as dustFilter from './dustFilter'
import * as assetDeltaCollector from './assetDeltaCollector'
import { validateSwapperEconomicDelta } from './swapperEconomicDeltaValidator'
import { validate as validateDeltaSigns } from './deltaSignValidator'
import { detect as detectTransfer } from './transferDetector'
import * as splitSwapDetector from './splitSwapDetector'
import { classifyDirection } from './directionClassifier'
import { normalizeAmounts } from './amountNormalizer'
import { generate as generateOutput } from './outputGenerator'
import { CORE_TOKENS } from './constants'
import {
  AssetDelta,
  BalanceChange,
  EraseReason,
  ParseError,
  ParsedSwap,
  TransactionMeta,
  ValidationResult,
} from './types'

export type RawTransaction = {
  signature: string
  timestamp?: number
  protocol?: string
  balanceChanges: BalanceChange[]
  transactionMeta: TransactionMeta
}

export type Stage8Context = {
  balanceChangesAfterDust: BalanceChange[]
  swapper: string
  activeAssets: AssetDelta[]
  hasNonCoreToken: boolean
  isTransfer: boolean
  rentRefundsFiltered: boolean
  intermediateAssetsCollapsed: boolean
  confidence: number
}

type Stage8Result =
  | { type: 'success'; context: Stage8Context }
  | { type: 'erase'; error: ParseError }

export type FullParseResult =
  | { type: 'success'; swaps: ParsedSwap[] }
  | { type: 'erase'; error: ParseError }

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

function abs(value: bigint): bigint {
  return value < BigInt(0) ? -value : value
}

function isCoreToken(mint: string): boolean {
  return CORE_TOKENS.has(mint)
}

function isTransferInstructionOnly(meta: TransactionMeta): boolean {
  return (
    meta.instructions.length > 0 &&
    meta.instructions.every(
      (instruction) =>
        instruction.programId === TOKEN_PROGRAM_ID &&
        (instruction.name === 'transfer' ||
          instruction.name === 'transferChecked')
    )
  )
}

type CoreDeltaCandidate = {
  mint: string
  owner: string
  decimals: number
  scale: bigint
  magnitude: bigint
}

function collectSwapperAssets(
  balanceChanges: BalanceChange[],
  swapper: string
): AssetDelta[] {
  const byMint = new Map<string, AssetDelta>()

  for (const change of balanceChanges) {
    if (change.owner !== swapper) {
      continue
    }
    const delta = change.postDelta - change.preDelta
    const existing = byMint.get(change.mint)
    if (existing) {
      existing.delta = existing.delta + delta
    } else {
      byMint.set(change.mint, {
        mint: change.mint,
        owner: swapper,
        decimals: change.decimals,
        delta,
        scale: change.scale,
        role: 'intermediate',
      })
    }
  }

  const assets: AssetDelta[] = []
  for (const asset of byMint.values()) {
    if (asset.delta !== BigInt(0)) {
      assets.push(asset)
    }
  }

  return assets
}

function findLargestCoreDelta(
  balanceChanges: BalanceChange[]
): CoreDeltaCandidate | null {
  let best: CoreDeltaCandidate | null = null

  for (const change of balanceChanges) {
    if (!isCoreToken(change.mint)) {
      continue
    }
    const delta = change.postDelta - change.preDelta
    if (delta === BigInt(0)) {
      continue
    }
    const magnitude = abs(delta)
    if (!best || magnitude > best.magnitude) {
      best = {
        mint: change.mint,
        owner: change.owner,
        decimals: change.decimals,
        scale: change.scale,
        magnitude,
      }
    }
  }

  return best
}

function tryHybridRecovery(
  balanceChangesAfterDust: BalanceChange[],
  swapper: string,
  meta: TransactionMeta
): { activeAssets: AssetDelta[]; intermediateAssetsCollapsed: boolean } | null {
  if (swapper !== meta.feePayer) {
    return null
  }

  if (isTransferInstructionOnly(meta)) {
    return null
  }

  const swapperAssets = collectSwapperAssets(balanceChangesAfterDust, swapper)
  if (swapperAssets.length !== 1) {
    return null
  }

  const swapperAsset = swapperAssets[0]
  if (isCoreToken(swapperAsset.mint)) {
    return null
  }

  const coreCandidate = findLargestCoreDelta(balanceChangesAfterDust)
  if (!coreCandidate) {
    return null
  }

  const direction = swapperAsset.delta > BigInt(0) ? 'BUY' : 'SELL'
  const coreDelta =
    direction === 'BUY' ? -coreCandidate.magnitude : coreCandidate.magnitude

  const coreAsset: AssetDelta = {
    mint: coreCandidate.mint,
    owner: coreCandidate.owner,
    decimals: coreCandidate.decimals,
    delta: coreDelta,
    scale: coreCandidate.scale,
    role: coreDelta < BigInt(0) ? 'entry' : 'exit',
  }

  const nonCoreAsset: AssetDelta = {
    mint: swapperAsset.mint,
    owner: swapperAsset.owner,
    decimals: swapperAsset.decimals,
    delta: swapperAsset.delta,
    scale: swapperAsset.scale,
    role: swapperAsset.delta < BigInt(0) ? 'entry' : 'exit',
  }

  return {
    activeAssets: [nonCoreAsset, coreAsset],
    intermediateAssetsCollapsed: false,
  }
}

function toParseError(
  signature: string,
  reason: EraseReason,
  debugInfo: ParseError['debugInfo'] = {}
): ParseError {
  return { signature, reason, debugInfo }
}

function toErase(
  signature: string,
  reason: EraseReason,
  debugInfo: ParseError['debugInfo'] = {}
): Stage8Result {
  return { type: 'erase', error: toParseError(signature, reason, debugInfo) }
}

export function parseTransactionStage1to8(raw: RawTransaction): Stage8Result {
  // Order is strict: normalizeSol -> identifySwapper -> rentRefundFilter -> dustFilter
  const normalizedChanges = solNormalizer.normalize(raw.balanceChanges)

  const swapperResult = swapperIdentifier.identify(
    normalizedChanges,
    raw.transactionMeta
  )

  if (swapperResult.type === 'erase') {
    return toErase(raw.signature, swapperResult.reason)
  }

  const swapper = swapperResult.swapper

  const rentFiltered = rentRefundFilter.filter(normalizedChanges)
  const balanceChangesAfterDust = dustFilter.filter(rentFiltered.filtered)

  const assetResult = assetDeltaCollector.collect(
    balanceChangesAfterDust,
    swapper
  )

  if (assetResult.type === 'erase') {
    return toErase(raw.signature, assetResult.reason)
  }

  const activeAssets = assetResult.activeAssets

  if (activeAssets.length !== 2) {
    throw new Error(
      'Invariant violated: stage1to8 expects exactly 2 active assets'
    )
  }

  const swapperDeltaValidation = validateSwapperEconomicDelta(
    swapper,
    activeAssets
  )

  if (!swapperDeltaValidation.valid) {
    return toErase(raw.signature, 'swapper_no_delta')
  }

  const signValidation: ValidationResult = validateDeltaSigns(activeAssets)
  if (!signValidation.valid) {
    const signReason =
      signValidation.reason ??
      (signValidation.positiveCount === 0
        ? 'no_positive_deltas'
        : 'no_negative_deltas')
    const debugInfo: ParseError['debugInfo'] = {}
    if (signValidation.positiveCount !== undefined) {
      debugInfo.positiveCount = signValidation.positiveCount
    }
    if (signValidation.negativeCount !== undefined) {
      debugInfo.negativeCount = signValidation.negativeCount
    }
    return toErase(raw.signature, signReason, debugInfo)
  }

  const transferResult = detectTransfer(activeAssets, raw.transactionMeta)
  if (!transferResult.hasNonCoreToken) {
    return toErase(raw.signature, 'core_only_swap')
  }

  return {
    type: 'success',
    context: {
      balanceChangesAfterDust,
      swapper,
      activeAssets,
      hasNonCoreToken: transferResult.hasNonCoreToken,
      isTransfer: transferResult.isTransfer,
      rentRefundsFiltered: rentFiltered.rentRefundsFiltered,
      intermediateAssetsCollapsed: assetResult.intermediateAssetsCollapsed,
      confidence: swapperResult.confidence,
    },
  }
}

export function parseTransaction(raw: RawTransaction): FullParseResult {
  const normalizedChanges = solNormalizer.normalize(raw.balanceChanges)

  const swapperResult = swapperIdentifier.identify(
    normalizedChanges,
    raw.transactionMeta
  )

  if (swapperResult.type === 'erase') {
    return { type: 'erase', error: toParseError(raw.signature, swapperResult.reason) }
  }

  const swapper = swapperResult.swapper

  const rentFiltered = rentRefundFilter.filter(normalizedChanges)
  const balanceChangesAfterDust = dustFilter.filter(rentFiltered.filtered)

  const assetResult = assetDeltaCollector.collect(
    balanceChangesAfterDust,
    swapper
  )

  let activeAssets: AssetDelta[]
  let intermediateAssetsCollapsed: boolean

  if (assetResult.type === 'erase') {
    if (assetResult.reason !== 'invalid_asset_count') {
      return { type: 'erase', error: toParseError(raw.signature, assetResult.reason) }
    }

    const hybrid = tryHybridRecovery(
      balanceChangesAfterDust,
      swapper,
      raw.transactionMeta
    )

    if (!hybrid) {
      return { type: 'erase', error: toParseError(raw.signature, assetResult.reason) }
    }

    activeAssets = hybrid.activeAssets
    intermediateAssetsCollapsed = hybrid.intermediateAssetsCollapsed
  } else {
    activeAssets = assetResult.activeAssets
    intermediateAssetsCollapsed = assetResult.intermediateAssetsCollapsed
  }

  const swapperDeltaValidation = validateSwapperEconomicDelta(
    swapper,
    activeAssets
  )

  if (!swapperDeltaValidation.valid) {
    return { type: 'erase', error: toParseError(raw.signature, 'swapper_no_delta') }
  }

  const signValidation: ValidationResult = validateDeltaSigns(activeAssets)
  if (!signValidation.valid) {
    const signReason =
      signValidation.reason ??
      (signValidation.positiveCount === 0
        ? 'no_positive_deltas'
        : 'no_negative_deltas')
    const debugInfo: ParseError['debugInfo'] = {}
    if (signValidation.positiveCount !== undefined) {
      debugInfo.positiveCount = signValidation.positiveCount
    }
    if (signValidation.negativeCount !== undefined) {
      debugInfo.negativeCount = signValidation.negativeCount
    }
    return {
      type: 'erase',
      error: toParseError(raw.signature, signReason, debugInfo),
    }
  }

  const transferResult = detectTransfer(activeAssets, raw.transactionMeta)
  if (!transferResult.hasNonCoreToken) {
    const reason = transferResult.isTransfer ? 'pure_transfer' : 'core_only_swap'
    return { type: 'erase', error: toParseError(raw.signature, reason) }
  }

  const splitDetection = splitSwapDetector.detect(activeAssets)

  if (!splitDetection.splitRequired) {
    const direction = classifyDirection(
      splitDetection.entryAsset,
      splitDetection.exitAsset
    )
    normalizeAmounts(splitDetection.entryAsset, splitDetection.exitAsset, direction)
  }

  const swaps = generateOutput(
    {
      signature: raw.signature,
      timestamp: raw.timestamp ?? 0,
    },
    swapperResult,
    activeAssets,
    splitDetection,
    {
      rentRefundsFiltered: rentFiltered.rentRefundsFiltered,
      intermediateAssetsCollapsed,
      protocol: raw.protocol ?? 'unknown',
    }
  )

  return { type: 'success', swaps }
}
