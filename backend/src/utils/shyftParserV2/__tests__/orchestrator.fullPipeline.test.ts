import * as fc from 'fast-check'
import { expect, test, jest } from '@jest/globals'
import * as assetDeltaCollector from '../assetDeltaCollector'
import * as dustFilter from '../dustFilter'
import * as splitSwapDetector from '../splitSwapDetector'
import * as swapperIdentifier from '../swapperIdentifier'
import * as directionClassifier from '../directionClassifier'
import { parseTransaction, RawTransaction } from '../index'
import { AssetDelta, BalanceChange, TransactionMeta } from '../types'

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

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
  return { feePayer: 'FeePayer111111111111111111111111111111111', signers: [], instructions }
}

function toMetaWithFeePayer(
  feePayer: string,
  instructions: TransactionMeta['instructions'] = []
): TransactionMeta {
  return { feePayer, signers: [], instructions }
}

function toRawTransaction(
  signature: string,
  balanceChanges: BalanceChange[],
  instructions: TransactionMeta['instructions'] = [],
  timestamp: number = 1,
  protocol: string = 'unknown'
): RawTransaction {
  return {
    signature,
    balanceChanges,
    transactionMeta: toMeta(instructions),
    timestamp,
    protocol,
  }
}

test('valid simple swap -> success', () => {
  const swapper = 'Swapper111111111111111111111111111111111'
  const changes = [
    toBalanceChange(SOL_MINT, swapper, BigInt(-1_000_000_000), 9),
    toBalanceChange('TokenMintNonCore111111111111111111111111111', swapper, BigInt(2_000_000), 6),
  ]

  const result = parseTransaction(toRawTransaction('sig-1', changes))

  expect(result.type).toBe('success')
  if (result.type === 'success') {
    expect(result.swaps).toHaveLength(1)
  }
})

test('valid split swap -> returns 2 records', () => {
  const swapper = 'Swapper222222222222222222222222222222222'
  const changes = [
    toBalanceChange('TokenMintNonCoreA111111111111111111111111111', swapper, BigInt(-2_000_000), 6),
    toBalanceChange('TokenMintNonCoreB222222222222222222222222222', swapper, BigInt(3_000_000), 6),
  ]

  const result = parseTransaction(toRawTransaction('sig-2', changes))

  expect(result.type).toBe('success')
  if (result.type === 'success') {
    expect(result.swaps).toHaveLength(2)
  }
})

test('core-only swap -> ERASE(core_only_swap)', () => {
  const swapper = 'Swapper333333333333333333333333333333333'
  const changes = [
    toBalanceChange(SOL_MINT, swapper, BigInt(-1_000_000_000), 9),
    toBalanceChange(USDC_MINT, swapper, BigInt(2_000_000), 6),
  ]

  const result = parseTransaction(toRawTransaction('sig-3', changes))

  expect(result.type).toBe('erase')
  if (result.type === 'erase') {
    expect(result.error.reason).toBe('core_only_swap')
  }
})

test('pure transfer -> ERASE(pure_transfer)', () => {
  const swapper = 'Swapper444444444444444444444444444444444'
  const changes = [
    toBalanceChange(SOL_MINT, swapper, BigInt(-1_000_000_000), 9),
    toBalanceChange(USDC_MINT, swapper, BigInt(2_000_000), 6),
  ]
  const instructions = [
    { programId: TOKEN_PROGRAM_ID, name: 'transfer' },
  ]

  const result = parseTransaction(toRawTransaction('sig-4', changes, instructions))

  expect(result.type).toBe('erase')
  if (result.type === 'erase') {
    expect(result.error.reason).toBe('pure_transfer')
  }
})

test('invariant violation -> throws', () => {
  const swapper = 'Swapper555555555555555555555555555555555'
  const changes = [
    toBalanceChange('TokenMintEntry', swapper, BigInt(-2_000_000), 6),
    toBalanceChange('TokenMintExit', swapper, BigInt(3_000_000), 6),
  ]

  const mockAssets: AssetDelta[] = [
    {
      mint: 'TokenMintEntry',
      owner: swapper,
      decimals: 6,
      delta: BigInt(-1),
      scale: scaleFor(6),
      role: 'entry',
    },
    {
      mint: 'TokenMintExit',
      owner: swapper,
      decimals: 6,
      delta: BigInt(2),
      scale: scaleFor(6),
      role: 'exit',
    },
    {
      mint: 'TokenMintExtra',
      owner: swapper,
      decimals: 6,
      delta: BigInt(3),
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

  expect(() => parseTransaction(toRawTransaction('sig-5', changes))).toThrow(
    'Invariant violated: splitSwapDetector expects exactly 2 active assets'
  )

  collectSpy.mockRestore()
})

test('order enforcement: swapper before dust, split before direction', () => {
  const callOrder: string[] = []
  const originalIdentify = swapperIdentifier.identify
  const originalDust = dustFilter.filter
  const originalSplit = splitSwapDetector.detect
  const originalDirection = directionClassifier.classifyDirection

  const identifySpy = jest
    .spyOn(swapperIdentifier, 'identify')
    .mockImplementation((changes, meta) => {
      callOrder.push('swapper')
      return originalIdentify(changes, meta)
    })

  const dustSpy = jest
    .spyOn(dustFilter, 'filter')
    .mockImplementation((changes) => {
      callOrder.push('dust')
      return originalDust(changes)
    })

  const splitSpy = jest
    .spyOn(splitSwapDetector, 'detect')
    .mockImplementation((assets) => {
      callOrder.push('split')
      return originalSplit(assets)
    })

  const directionSpy = jest
    .spyOn(directionClassifier, 'classifyDirection')
    .mockImplementation((entry, exit) => {
      callOrder.push('direction')
      return originalDirection(entry, exit)
    })

  const swapper = 'Swapper666666666666666666666666666666666'
  const changes = [
    toBalanceChange(SOL_MINT, swapper, BigInt(-1_000_000_000), 9),
    toBalanceChange('TokenMintNonCore333333333333333333333333333', swapper, BigInt(2_000_000), 6),
  ]

  const result = parseTransaction(toRawTransaction('sig-6', changes))
  expect(result.type).toBe('success')

  const swapperIndex = callOrder.indexOf('swapper')
  const dustIndex = callOrder.indexOf('dust')
  const splitIndex = callOrder.indexOf('split')
  const directionIndex = callOrder.indexOf('direction')

  expect(swapperIndex).toBeGreaterThanOrEqual(0)
  expect(dustIndex).toBeGreaterThanOrEqual(0)
  expect(splitIndex).toBeGreaterThanOrEqual(0)
  expect(directionIndex).toBeGreaterThanOrEqual(0)
  expect(swapperIndex).toBeLessThan(dustIndex)
  expect(splitIndex).toBeLessThan(directionIndex)

  identifySpy.mockRestore()
  dustSpy.mockRestore()
  splitSpy.mockRestore()
  directionSpy.mockRestore()
})

test('split swap does not call direction classifier', () => {
  const directionSpy = jest.spyOn(directionClassifier, 'classifyDirection')

  const swapper = 'Swapper777777777777777777777777777777777'
  const changes = [
    toBalanceChange('TokenMintNonCoreA555555555555555555555555555', swapper, BigInt(-2_000_000), 6),
    toBalanceChange('TokenMintNonCoreB666666666666666666666666666', swapper, BigInt(3_000_000), 6),
  ]

  const result = parseTransaction(toRawTransaction('sig-7', changes))
  expect(result.type).toBe('success')
  expect(directionSpy).not.toHaveBeenCalled()

  directionSpy.mockRestore()
})

// Feature: parser-v2-balance-truth-refactor, Property 18: Final Acceptance Rule
test('accepted iff opposite deltas, non-core token, >=2 assets, swapper delta', () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      (hasOppositeDeltas, hasNonCoreToken, hasEnoughAssets, swapperHasDelta) => {
        const swapper = 'Swapper888888888888888888888888888888888'
        const nonCoreMint = 'TokenMintNonCore777777777777777777777777777'
        const mintA = hasNonCoreToken ? nonCoreMint : SOL_MINT
        const mintB = hasNonCoreToken ? USDC_MINT : USDC_MINT

        let changes: BalanceChange[] = []

        if (!hasEnoughAssets) {
          const delta = swapperHasDelta ? BigInt(1_000) : BigInt(0)
          changes = [toBalanceChange(mintA, swapper, delta, 6)]
        } else {
          let deltaA = BigInt(1_000)
          let deltaB = BigInt(2_000)

          if (hasOppositeDeltas) {
            deltaA = BigInt(-1_000)
            deltaB = BigInt(2_000)
          }

          if (!swapperHasDelta) {
            deltaA = BigInt(0)
            deltaB = BigInt(0)
          }

          changes = [
            toBalanceChange(mintA, swapper, deltaA, 6),
            toBalanceChange(mintB, swapper, deltaB, 6),
          ]
        }

        const result = parseTransaction(toRawTransaction('sig-8', changes))
        const expected =
          hasOppositeDeltas && hasNonCoreToken && hasEnoughAssets && swapperHasDelta

        if (expected) {
          expect(result.type).toBe('success')
        } else {
          expect(result.type).toBe('erase')
        }
      }
    ),
    { numRuns: 100 }
  )
})

test('hybrid recovery accepts single non-core delta with core elsewhere', () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.integer({ min: 2, max: 1_000_000 }),
      fc.integer({ min: 20_000_000, max: 50_000_000 }),
      (isBuy, nonCoreMagnitude, coreMagnitude) => {
        const swapper = 'SwapperHybrid1111111111111111111111111111111'
        const otherOwner = 'OtherOwner111111111111111111111111111111'
        const nonCoreMint = 'TokenMintHybridNonCore1111111111111111111'

        const nonCoreDelta = isBuy
          ? BigInt(nonCoreMagnitude)
          : -BigInt(nonCoreMagnitude)
        const coreDelta = BigInt(coreMagnitude)

        const changes = [
          toBalanceChange(nonCoreMint, swapper, nonCoreDelta, 6),
          toBalanceChange(SOL_MINT, otherOwner, coreDelta, 9),
        ]

        const result = parseTransaction({
          signature: 'sig-hybrid',
          balanceChanges: changes,
          transactionMeta: toMetaWithFeePayer(swapper),
          timestamp: 1,
          protocol: 'unknown',
        })

        expect(result.type).toBe('success')
      }
    ),
    { numRuns: 100 }
  )
})
