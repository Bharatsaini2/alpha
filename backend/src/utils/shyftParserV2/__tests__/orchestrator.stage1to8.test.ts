import { expect, test } from '@jest/globals'
import * as assetDeltaCollector from '../assetDeltaCollector'
import * as dustFilter from '../dustFilter'
import * as swapperIdentifier from '../swapperIdentifier'
import { parseTransactionStage1to8, RawTransaction } from '../index'
import { AssetDelta, BalanceChange, TransactionMeta } from '../types'

function scaleFor(decimals: number): bigint {
  return BigInt(10) ** BigInt(decimals)
}

function toBalanceChange(
  mint: string,
  owner: string,
  delta: bigint,
  decimals: number
): BalanceChange {
  return {
    mint,
    owner,
    preDelta: BigInt(0),
    postDelta: delta,
    decimals,
    scale: scaleFor(decimals),
  }
}

function toMeta(instructions: TransactionMeta['instructions']): TransactionMeta {
  return {
    feePayer: 'FeePayer111111111111111111111111111111111',
    signers: [],
    instructions,
  }
}

function toRawTransaction(
  signature: string,
  balanceChanges: BalanceChange[],
  instructions: TransactionMeta['instructions'] = []
): RawTransaction {
  return {
    signature,
    balanceChanges,
    transactionMeta: toMeta(instructions),
  }
}

test('Case 1 — Simple Valid Swap (2 assets)', () => {
  const callOrder: string[] = []
  const originalIdentify = swapperIdentifier.identify
  const originalDust = dustFilter.filter

  const identifySpy = jest
    .spyOn(swapperIdentifier, 'identify')
    .mockImplementation((changes, meta) => {
      callOrder.push('identify')
      return originalIdentify(changes, meta)
    })

  const dustSpy = jest
    .spyOn(dustFilter, 'filter')
    .mockImplementation((changes) => {
      callOrder.push('dust')
      return originalDust(changes)
    })

  const swapper = 'Swapper111111111111111111111111111111111'
  const changes = [
    toBalanceChange('TokenA', swapper, BigInt(-100), 6),
    toBalanceChange('TokenB', swapper, BigInt(200), 6),
  ]

  const result = parseTransactionStage1to8(
    toRawTransaction('sig-1', changes)
  )

  expect(result.type).toBe('success')
  expect(callOrder).toEqual(['identify', 'dust'])

  identifySpy.mockRestore()
  dustSpy.mockRestore()
})

test('Case 2 — Core Only Swap', () => {
  const swapper = 'Swapper222222222222222222222222222222222'
  const changes = [
    toBalanceChange('So11111111111111111111111111111111111111112', swapper, BigInt(-500), 9),
    toBalanceChange('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', swapper, BigInt(1000), 6),
  ]

  const result = parseTransactionStage1to8(
    toRawTransaction('sig-2', changes)
  )

  expect(result.type).toBe('erase')
  if (result.type === 'erase') {
    expect(result.error.reason).toBe('core_only_swap')
  }
})

test('Case 3 — No Opposite Deltas', () => {
  const swapper = 'Swapper333333333333333333333333333333333'
  const changes = [
    toBalanceChange('TokenC', swapper, BigInt(100), 6),
    toBalanceChange('TokenD', swapper, BigInt(200), 6),
  ]

  const result = parseTransactionStage1to8(
    toRawTransaction('sig-3', changes)
  )

  expect(result.type).toBe('erase')
  if (result.type === 'erase') {
    expect(result.error.reason).toBe('no_negative_deltas')
  }
})

test('Case 4 — Invariant Violation', () => {
  const swapper = 'Swapper444444444444444444444444444444444'
  const changes = [
    toBalanceChange('TokenE', swapper, BigInt(-100), 6),
    toBalanceChange('TokenF', swapper, BigInt(200), 6),
  ]

  const mockAssets: AssetDelta[] = [
    {
      mint: 'TokenE',
      owner: swapper,
      decimals: 6,
      delta: BigInt(-100),
      scale: scaleFor(6),
      role: 'entry',
    },
    {
      mint: 'TokenF',
      owner: swapper,
      decimals: 6,
      delta: BigInt(200),
      scale: scaleFor(6),
      role: 'exit',
    },
    {
      mint: 'TokenG',
      owner: swapper,
      decimals: 6,
      delta: BigInt(300),
      scale: scaleFor(6),
      role: 'intermediate',
    },
  ]

  const collectSpy = jest
    .spyOn(assetDeltaCollector, 'collect')
    .mockReturnValue({
      type: 'success',
      activeAssets: mockAssets,
      intermediateAssetsCollapsed: false,
    })

  expect(() =>
    parseTransactionStage1to8(toRawTransaction('sig-4', changes))
  ).toThrow('Invariant violated: stage1to8 expects exactly 2 active assets')

  collectSpy.mockRestore()
})
