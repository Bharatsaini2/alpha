import { SOL_MINT } from './constants'
import { BalanceChange } from './types'

const RENT_THRESHOLD = BigInt(10_000_000)

function getDelta(change: BalanceChange): bigint {
  return change.postDelta - change.preDelta
}

export function filter(
  balanceChanges: BalanceChange[]
): { filtered: BalanceChange[]; rentRefundsFiltered: boolean } {
  let hasNonSolDelta = false

  for (const change of balanceChanges) {
    if (change.mint !== SOL_MINT) {
      const delta = getDelta(change)
      if (delta !== BigInt(0)) {
        hasNonSolDelta = true
        break
      }
    }
  }

  let rentRefundsFiltered = false
  const filtered = balanceChanges.filter((change) => {
    if (change.mint !== SOL_MINT) {
      return true
    }

    const delta = getDelta(change)
    if (delta < BigInt(0)) {
      return true
    }

    if (delta > BigInt(0) && delta < RENT_THRESHOLD && hasNonSolDelta) {
      rentRefundsFiltered = true
      return false
    }

    return true
  })

  return { filtered, rentRefundsFiltered }
}
