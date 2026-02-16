import { SOL_EQUIVALENTS } from './constants'
import { BalanceChange } from './types'

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const SOL_DECIMALS = 9
const SOL_SCALE = BigInt(10) ** BigInt(9)

function getDelta(change: BalanceChange): bigint {
  return change.postDelta - change.preDelta
}

export function normalize(balanceChanges: BalanceChange[]): BalanceChange[] {
  const solDeltaByOwner = new Map<string, bigint>()
  const normalized: BalanceChange[] = []
  const solOwnersEmitted = new Set<string>()

  for (const change of balanceChanges) {
    if (!SOL_EQUIVALENTS.has(change.mint)) {
      continue
    }

    const current = solDeltaByOwner.get(change.owner) ?? BigInt(0)
    solDeltaByOwner.set(change.owner, current + getDelta(change))
  }

  for (const change of balanceChanges) {
    if (!SOL_EQUIVALENTS.has(change.mint)) {
      normalized.push({
        mint: change.mint,
        owner: change.owner,
        preDelta: change.preDelta,
        postDelta: change.postDelta,
        decimals: change.decimals,
        scale: change.scale,
      })
      continue
    }

    if (solOwnersEmitted.has(change.owner)) {
      continue
    }

    solOwnersEmitted.add(change.owner)
    const combinedDelta = solDeltaByOwner.get(change.owner) ?? BigInt(0)

    if (combinedDelta === BigInt(0)) {
      continue
    }

    normalized.push({
      mint: SOL_MINT,
      owner: change.owner,
      preDelta: BigInt(0),
      postDelta: combinedDelta,
      decimals: SOL_DECIMALS,
      scale: SOL_SCALE,
    })
  }

  return normalized
}
