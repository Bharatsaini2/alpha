import { BalanceChange } from './types'

function abs(value: bigint): bigint {
  return value < BigInt(0) ? -value : value
}

export function getDustThreshold(decimals: number): bigint {
  if (decimals <= 6) {
    return BigInt(1)
  }

  return BigInt(10)
}

export function filter(balanceChanges: BalanceChange[]): BalanceChange[] {
  return balanceChanges.filter((change) => {
    const delta = change.postDelta - change.preDelta
    const threshold = getDustThreshold(change.decimals)
    return abs(delta) > threshold
  })
}
