import { CORE_TOKENS, SYSTEM_ACCOUNTS } from './constants'
import { BalanceChange, SwapperResult, TransactionMeta } from './types'

function abs(value: bigint): bigint {
  return value < BigInt(0) ? -value : value
}

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const DEX_PROGRAMS = new Set<string>()
const POOL_VAULTS = new Set<string>()

export function isSystemAccount(address: string): boolean {
  return (
    SYSTEM_ACCOUNTS.has(address) ||
    address === TOKEN_PROGRAM_ID ||
    DEX_PROGRAMS.has(address) ||
    POOL_VAULTS.has(address)
  )
}

type OwnerStats = {
  sumAbsDelta: bigint
  hasNonCoreDelta: boolean
}

export function getOwnersWithEconomicDelta(
  balanceChanges: BalanceChange[]
): Map<string, OwnerStats> {
  const sums = new Map<string, OwnerStats>()

  for (const change of balanceChanges) {
    const delta = change.postDelta - change.preDelta
    if (delta === BigInt(0)) {
      continue
    }

    if (isSystemAccount(change.owner)) {
      continue
    }

    const current = sums.get(change.owner) ?? {
      sumAbsDelta: BigInt(0),
      hasNonCoreDelta: false,
    }
    const next = {
      sumAbsDelta: current.sumAbsDelta + abs(delta),
      hasNonCoreDelta: current.hasNonCoreDelta || !CORE_TOKENS.has(change.mint),
    }
    sums.set(change.owner, next)
  }

  return sums
}

export function identify(
  balanceChanges: BalanceChange[],
  transactionMeta: TransactionMeta
): SwapperResult {
  const ownersWithDelta = getOwnersWithEconomicDelta(balanceChanges)
  const nonSystemOwners = [...ownersWithDelta.keys()]

  if (nonSystemOwners.length === 0) {
    return { type: 'erase', reason: 'no_economic_delta' }
  }

  let selectedOwner: string | null = null
  let selectedScore = BigInt(0)

  for (const [owner, stats] of ownersWithDelta.entries()) {
    if (selectedOwner === null) {
      selectedOwner = owner
      selectedScore = stats.sumAbsDelta
      continue
    }

    if (stats.sumAbsDelta > selectedScore) {
      selectedOwner = owner
      selectedScore = stats.sumAbsDelta
    }
  }

  if (!selectedOwner || selectedScore === BigInt(0)) {
    return { type: 'erase', reason: 'no_economic_delta' }
  }

  const topCandidates = [...ownersWithDelta.entries()].filter(
    ([, stats]) => stats.sumAbsDelta === selectedScore
  )

  if (topCandidates.length === 1) {
    return {
      type: 'success',
      swapper: selectedOwner,
      confidence: 70,
      method: 'largest_delta',
    }
  }

  const nonCoreCandidates = topCandidates.filter(
    ([, stats]) => stats.hasNonCoreDelta
  )

  if (nonCoreCandidates.length === 1) {
    return {
      type: 'success',
      swapper: nonCoreCandidates[0][0],
      confidence: 70,
      method: 'largest_delta',
    }
  }

  const feePayerStats = ownersWithDelta.get(transactionMeta.feePayer)
  if (feePayerStats && feePayerStats.sumAbsDelta > BigInt(0)) {
    return {
      type: 'success',
      swapper: transactionMeta.feePayer,
      confidence: 90,
      method: 'tier2',
    }
  }

  return { type: 'erase', reason: 'no_economic_delta' }

}
