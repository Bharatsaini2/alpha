/**
 * Helius Parser V3 — End-to-End Parser Tests
 *
 * Validates the full pipeline (parseHeliusTransactionV3) against the
 * 10 real transactions from the migration blueprint (r45-r57).
 *
 * Each test verifies:
 *  - success flag
 *  - direction (BUY / SELL / split)
 *  - SOL amount
 *  - token amount
 *  - output shape (ParsedSwap vs SplitSwapPair)
 */

import { parseHeliusTransactionV3 } from '../heliusParserV3'
import type { HeliusTransaction, ParsedSwap, SplitSwapPair } from '../heliusParserV3.types'
import { isParsedSwap, isSplitSwapPair } from '../heliusParserV3.types'

const SOL_MINT = 'So11111111111111111111111111111111111111112'

// ============================================================================
// Fixture helper
// ============================================================================

function makeTx(overrides: Partial<HeliusTransaction>): HeliusTransaction {
  return {
    signature: 'test-sig',
    timestamp: 1700000000,
    fee: 5000,
    feePayer: 'SWAPPER',
    type: 'SWAP',
    source: 'PUMP_AMM',
    transactionError: null,
    tokenTransfers: [],
    accountData: [],
    nativeTransfers: [],
    instructions: [],
    events: {},
    description: '',
    slot: 100000,
    ...overrides,
  }
}

// Builds a standard Pump.fun AMM BUY fixture
function pumpAmmBuy(
  swapper: string,
  solTotal: number,
  tokenAmount: number,
  tokenMint: string,
): HeliusTransaction {
  // Distribute SOL as pool (98%) + creator (1.3%) + protocol (0.7%)
  const pool = solTotal * 0.98
  const creator = solTotal * 0.013
  const protocol = solTotal - pool - creator

  return makeTx({
    feePayer: swapper,
    source: 'PUMP_AMM',
    tokenTransfers: [
      { fromTokenAccount: 'a1', toTokenAccount: 'a2', fromUserAccount: swapper, toUserAccount: 'POOL', tokenAmount: pool, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a1', toTokenAccount: 'a3', fromUserAccount: swapper, toUserAccount: 'CREATOR', tokenAmount: creator, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a1', toTokenAccount: 'a4', fromUserAccount: swapper, toUserAccount: 'PROTOCOL', tokenAmount: protocol, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a5', toTokenAccount: 'a6', fromUserAccount: 'POOL', toUserAccount: swapper, tokenAmount, mint: tokenMint, tokenStandard: 'Fungible' },
    ],
    accountData: [
      { account: swapper, nativeBalanceChange: -Math.round(solTotal * 1.01 * 1e9), tokenBalanceChanges: [] },
    ],
  })
}

// ============================================================================
// r45: PUMP_AMM SELL — 13.605 SOL, 4,571,785 tokens
// ============================================================================

describe('r45 — PUMP_AMM SELL', () => {
  const TOKEN = 'oBeMrKMEr45mintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  const swapper = 'WHALE_R45'

  const tx = makeTx({
    feePayer: swapper,
    source: 'PUMP_AMM',
    tokenTransfers: [
      { fromTokenAccount: 'a1', toTokenAccount: 'a2', fromUserAccount: swapper, toUserAccount: 'POOL', tokenAmount: 4571784.79, mint: TOKEN, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a3', toTokenAccount: 'a4', fromUserAccount: 'POOL', toUserAccount: swapper, tokenAmount: 13.604986, mint: SOL_MINT, tokenStandard: 'Fungible' },
    ],
    accountData: [
      { account: swapper, nativeBalanceChange: 13_450_000_000, tokenBalanceChanges: [] },
    ],
  })

  const result = parseHeliusTransactionV3(tx)

  it('succeeds', () => expect(result.success).toBe(true))

  it('is ParsedSwap (not split)', () => {
    expect(isParsedSwap(result.data!)).toBe(true)
  })

  it('direction = SELL', () => {
    const swap = result.data as ParsedSwap
    expect(swap.direction).toBe('SELL')
  })

  it('SOL amount ≈ 13.605', () => {
    const swap = result.data as ParsedSwap
    expect(swap.amounts.netWalletReceived).toBeCloseTo(13.604986, 3)
  })

  it('token amount ≈ 4,571,785', () => {
    const swap = result.data as ParsedSwap
    expect(swap.amounts.baseAmount).toBeCloseTo(4571784.79, 0)
  })

  it('protocol = PUMP_AMM', () => {
    const swap = result.data as ParsedSwap
    expect(swap.protocol).toBe('PUMP_AMM')
  })
})

// ============================================================================
// r47: PUMP_FUN SELL (bonding curve, nbc fallback) — 2.558 SOL
// ============================================================================

describe('r47 — PUMP_FUN SELL (nbc fallback)', () => {
  const TOKEN = 'CA3n2WUbr47mintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  const swapper = 'WHALE_R47'

  const tx = makeTx({
    feePayer: swapper,
    source: 'PUMP_FUN',
    tokenTransfers: [
      { fromTokenAccount: 'a1', toTokenAccount: 'a2', fromUserAccount: swapper, toUserAccount: 'BC', tokenAmount: 21823785.94, mint: TOKEN, tokenStandard: 'Fungible' },
    ],
    accountData: [
      { account: swapper, nativeBalanceChange: 2_557_607_000, tokenBalanceChanges: [] },
    ],
  })

  const result = parseHeliusTransactionV3(tx)

  it('succeeds', () => expect(result.success).toBe(true))

  it('direction = SELL', () => {
    const swap = result.data as ParsedSwap
    expect(swap.direction).toBe('SELL')
  })

  it('SOL amount ≈ 2.558 (nbc fallback)', () => {
    const swap = result.data as ParsedSwap
    expect(swap.amounts.netWalletReceived).toBeCloseTo(2.557607, 3)
  })

  it('token amount ≈ 21,823,786', () => {
    const swap = result.data as ParsedSwap
    expect(swap.amounts.baseAmount).toBeCloseTo(21823785.94, 0)
  })
})

// ============================================================================
// r49: PUMP_AMM BUY — 15.000 SOL, 4,137,939 tokens
// ============================================================================

describe('r49 — PUMP_AMM BUY', () => {
  const TOKEN = 'HaUXAdAWr49mintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  const swapper = 'WHALE_R49'

  const tx = pumpAmmBuy(swapper, 15.0, 4137939.46, TOKEN)
  const result = parseHeliusTransactionV3(tx)

  it('succeeds', () => expect(result.success).toBe(true))
  it('direction = BUY', () => expect((result.data as ParsedSwap).direction).toBe('BUY'))
  it('SOL ≈ 15.000', () => expect((result.data as ParsedSwap).amounts.totalWalletCost).toBeCloseTo(15.0, 2))
  it('token ≈ 4,137,939', () => expect((result.data as ParsedSwap).amounts.baseAmount).toBeCloseTo(4137939.46, 0))
})

// ============================================================================
// r51: PUMP_AMM BUY — 9.991 SOL, 1,504,289 tokens
// ============================================================================

describe('r51 — PUMP_AMM BUY', () => {
  const TOKEN = 'HaUXAdAWr51mintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  const swapper = 'WHALE_R51'

  const tx = pumpAmmBuy(swapper, 9.991, 1504288.65, TOKEN)
  const result = parseHeliusTransactionV3(tx)

  it('succeeds', () => expect(result.success).toBe(true))
  it('direction = BUY', () => expect((result.data as ParsedSwap).direction).toBe('BUY'))
  it('SOL ≈ 9.991', () => expect((result.data as ParsedSwap).amounts.totalWalletCost).toBeCloseTo(9.991, 2))
  it('token ≈ 1,504,289', () => expect((result.data as ParsedSwap).amounts.baseAmount).toBeCloseTo(1504288.65, 0))
})

// ============================================================================
// r52: PUMP_AMM BUY — 14.987 SOL, 4,200,073 tokens
// ============================================================================

describe('r52 — PUMP_AMM BUY', () => {
  const TOKEN = 'HdvZF538r52mintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  const swapper = 'WHALE_R52'

  const tx = pumpAmmBuy(swapper, 14.9865, 4200072.66, TOKEN)
  const result = parseHeliusTransactionV3(tx)

  it('succeeds', () => expect(result.success).toBe(true))
  it('direction = BUY', () => expect((result.data as ParsedSwap).direction).toBe('BUY'))
  it('SOL ≈ 14.987', () => expect((result.data as ParsedSwap).amounts.totalWalletCost).toBeCloseTo(14.9865, 2))
})

// ============================================================================
// r53: PUMP_AMM BUY — 49.955 SOL, 6,616,508 tokens
// ============================================================================

describe('r53 — PUMP_AMM BUY (large)', () => {
  const TOKEN = 'HdvZF538r53mintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  const swapper = 'WHALE_R53'

  const tx = pumpAmmBuy(swapper, 49.955, 6616507.74, TOKEN)
  const result = parseHeliusTransactionV3(tx)

  it('succeeds', () => expect(result.success).toBe(true))
  it('direction = BUY', () => expect((result.data as ParsedSwap).direction).toBe('BUY'))
  it('SOL ≈ 49.955', () => expect((result.data as ParsedSwap).amounts.totalWalletCost).toBeCloseTo(49.955, 2))
})

// ============================================================================
// r54: PUMP_AMM BUY — 4.000 SOL, 4,523,274 tokens
// ============================================================================

describe('r54 — PUMP_AMM BUY (small)', () => {
  const TOKEN = 'HdvZF538r54mintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  const swapper = 'WHALE_R54'

  const tx = pumpAmmBuy(swapper, 4.0, 4523273.70, TOKEN)
  const result = parseHeliusTransactionV3(tx)

  it('succeeds', () => expect(result.success).toBe(true))
  it('direction = BUY', () => expect((result.data as ParsedSwap).direction).toBe('BUY'))
  it('SOL ≈ 4.000', () => expect((result.data as ParsedSwap).amounts.totalWalletCost).toBeCloseTo(4.0, 2))
})

// ============================================================================
// r55: JUPITER token-to-token SPLIT — 2 records
// ============================================================================

describe('r55 — JUPITER token-to-token SPLIT', () => {
  const TOKEN_A = 'TOKEN_A_55xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  const TOKEN_B = 'TOKEN_B_55xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  const swapper = 'WHALE_R55'

  const tx = makeTx({
    feePayer: swapper,
    source: 'JUPITER',
    tokenTransfers: [
      { fromTokenAccount: 'a1', toTokenAccount: 'a2', fromUserAccount: swapper, toUserAccount: 'AGG', tokenAmount: 500000, mint: TOKEN_A, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a3', toTokenAccount: 'a4', fromUserAccount: 'AGG', toUserAccount: swapper, tokenAmount: 750000, mint: TOKEN_B, tokenStandard: 'Fungible' },
      // Intermediate WSOL routing
      { fromTokenAccount: 'a5', toTokenAccount: 'a6', fromUserAccount: swapper, toUserAccount: 'POOL', tokenAmount: 9.535841, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a7', toTokenAccount: 'a8', fromUserAccount: 'POOL', toUserAccount: swapper, tokenAmount: 9.535841, mint: SOL_MINT, tokenStandard: 'Fungible' },
    ],
    accountData: [
      { account: swapper, nativeBalanceChange: -224_000, tokenBalanceChanges: [] },
    ],
  })

  const result = parseHeliusTransactionV3(tx)

  it('succeeds', () => expect(result.success).toBe(true))

  it('is SplitSwapPair', () => {
    expect(isSplitSwapPair(result.data!)).toBe(true)
  })

  it('has SELL + BUY records', () => {
    const split = result.data as SplitSwapPair
    expect(split.sellRecord.direction).toBe('SELL')
    expect(split.buyRecord.direction).toBe('BUY')
  })

  it('SELL record references outgoing token', () => {
    const split = result.data as SplitSwapPair
    // SELL: sold base (outgoing), received quote (incoming)
    expect(split.sellRecord.baseAsset.mint).toBe(TOKEN_A)
  })

  it('BUY record references incoming token', () => {
    const split = result.data as SplitSwapPair
    // BUY: spent quote (outgoing), bought base (incoming)
    expect(split.buyRecord.baseAsset.mint).toBe(TOKEN_B)
  })

  it('protocol = JUPITER', () => {
    const split = result.data as SplitSwapPair
    expect(split.protocol).toBe('JUPITER')
  })
})

// ============================================================================
// r56: PUMP_AMM BUY — 28.884 SOL, 11,171,404 tokens
// ============================================================================

describe('r56 — PUMP_AMM BUY (large)', () => {
  const TOKEN = 'HdvZF538r56mintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  const swapper = 'WHALE_R56'

  const tx = pumpAmmBuy(swapper, 28.884115, 11171404.40, TOKEN)
  const result = parseHeliusTransactionV3(tx)

  it('succeeds', () => expect(result.success).toBe(true))
  it('direction = BUY', () => expect((result.data as ParsedSwap).direction).toBe('BUY'))
  it('SOL ≈ 28.884', () => expect((result.data as ParsedSwap).amounts.totalWalletCost).toBeCloseTo(28.884115, 2))
})

// ============================================================================
// r57: FlashX SELL — Helius type=TRANSFER (must still parse!)
// ============================================================================

describe('r57 — FlashX SELL (type=TRANSFER)', () => {
  const TOKEN = 'KIMCHI_57_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  const swapper = 'WHALE_R57'

  const tx = makeTx({
    feePayer: swapper,
    type: 'TRANSFER',
    source: 'SYSTEM_PROGRAM',
    tokenTransfers: [
      { fromTokenAccount: 'a1', toTokenAccount: 'a2', fromUserAccount: swapper, toUserAccount: 'DEX', tokenAmount: 1036538.59, mint: TOKEN, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a3', toTokenAccount: 'a4', fromUserAccount: 'DEX', toUserAccount: swapper, tokenAmount: 6.091966596, mint: SOL_MINT, tokenStandard: 'Fungible' },
    ],
    accountData: [
      { account: swapper, nativeBalanceChange: 6_030_841_931, tokenBalanceChanges: [] },
    ],
  })

  const result = parseHeliusTransactionV3(tx)

  it('succeeds despite type=TRANSFER', () => {
    expect(result.success).toBe(true)
  })

  it('direction = SELL', () => {
    expect((result.data as ParsedSwap).direction).toBe('SELL')
  })

  it('SOL ≈ 6.092 (WSOL, not nbc)', () => {
    const swap = result.data as ParsedSwap
    expect(swap.amounts.netWalletReceived).toBeCloseTo(6.091966596, 3)
  })

  it('token ≈ 1,036,539', () => {
    const swap = result.data as ParsedSwap
    expect(swap.amounts.baseAmount).toBeCloseTo(1036538.59, 0)
  })
})

// ============================================================================
// Edge-case tests
// ============================================================================

describe('ERASE cases', () => {
  it('erases failed transactions', () => {
    const tx = makeTx({ transactionError: 'InstructionError' as unknown as string })
    const result = parseHeliusTransactionV3(tx)
    expect(result.success).toBe(false)
    expect(result.erase?.reason).toBe('transaction_failed')
  })

  it('erases when no movement detected', () => {
    const tx = makeTx({
      tokenTransfers: [],
      accountData: [{ account: 'SWAPPER', nativeBalanceChange: 0, tokenBalanceChanges: [] }],
    })
    const result = parseHeliusTransactionV3(tx)
    expect(result.success).toBe(false)
    expect(result.erase?.reason).toBe('no_movement_detected')
  })

  it('erases SOL-only transactions (no token)', () => {
    const tx = makeTx({
      tokenTransfers: [
        { fromTokenAccount: 'a1', toTokenAccount: 'a2', fromUserAccount: 'SWAPPER', toUserAccount: 'SOMEONE', tokenAmount: 5.0, mint: SOL_MINT, tokenStandard: 'Fungible' },
      ],
      accountData: [{ account: 'SWAPPER', nativeBalanceChange: -5_000_000_000, tokenBalanceChanges: [] }],
    })
    const result = parseHeliusTransactionV3(tx)
    expect(result.success).toBe(false)
    expect(result.erase?.reason).toBe('sol_only_no_token')
  })

  it('erases micro-transactions below $2', () => {
    const TOKEN = 'MICRO_MINTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    const tx = makeTx({
      feePayer: 'SWAPPER',
      tokenTransfers: [
        { fromTokenAccount: 'a1', toTokenAccount: 'a2', fromUserAccount: 'SWAPPER', toUserAccount: 'POOL', tokenAmount: 0.001, mint: SOL_MINT, tokenStandard: 'Fungible' },
        { fromTokenAccount: 'a3', toTokenAccount: 'a4', fromUserAccount: 'POOL', toUserAccount: 'SWAPPER', tokenAmount: 100, mint: TOKEN, tokenStandard: 'Fungible' },
      ],
      accountData: [{ account: 'SWAPPER', nativeBalanceChange: -1_500_000, tokenBalanceChanges: [] }],
    })
    const result = parseHeliusTransactionV3(tx)
    expect(result.success).toBe(false)
    expect(result.erase?.reason).toBe('below_minimum_value_threshold')
  })
})

describe('hintSwapper fallback', () => {
  it('uses hintSwapper when feePayer has no token activity', () => {
    const TOKEN = 'HINT_MINT_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    const tx = makeTx({
      feePayer: 'RELAYER_ADDRESS',
      tokenTransfers: [
        { fromTokenAccount: 'a1', toTokenAccount: 'a2', fromUserAccount: 'REAL_WHALE', toUserAccount: 'POOL', tokenAmount: 500000, mint: TOKEN, tokenStandard: 'Fungible' },
        { fromTokenAccount: 'a3', toTokenAccount: 'a4', fromUserAccount: 'POOL', toUserAccount: 'REAL_WHALE', tokenAmount: 10.0, mint: SOL_MINT, tokenStandard: 'Fungible' },
      ],
      accountData: [{ account: 'REAL_WHALE', nativeBalanceChange: 9_500_000_000, tokenBalanceChanges: [] }],
    })

    const result = parseHeliusTransactionV3(tx, { hintSwapper: 'REAL_WHALE' })
    expect(result.success).toBe(true)
    const swap = result.data as ParsedSwap
    expect(swap.swapper).toBe('REAL_WHALE')
    expect(swap.direction).toBe('SELL')
  })
})

describe('output shape compatibility', () => {
  it('ParsedSwap has all required fields', () => {
    const TOKEN = 'SHAPE_MINTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    const tx = pumpAmmBuy('SWAPPER', 10.0, 1000000, TOKEN)
    const result = parseHeliusTransactionV3(tx)
    const swap = result.data as ParsedSwap

    expect(swap).toHaveProperty('signature')
    expect(swap).toHaveProperty('timestamp')
    expect(swap).toHaveProperty('swapper')
    expect(swap).toHaveProperty('direction')
    expect(swap).toHaveProperty('quoteAsset')
    expect(swap).toHaveProperty('baseAsset')
    expect(swap).toHaveProperty('amounts')
    expect(swap).toHaveProperty('confidence')
    expect(swap).toHaveProperty('protocol')
    expect(swap).toHaveProperty('swapperIdentificationMethod')
    expect(swap).toHaveProperty('rentRefundsFiltered')
    expect(swap).toHaveProperty('intermediateAssetsCollapsed')
    expect(swap.quoteAsset).toHaveProperty('mint')
    expect(swap.quoteAsset).toHaveProperty('symbol')
    expect(swap.quoteAsset).toHaveProperty('decimals')
    expect(swap.amounts).toHaveProperty('feeBreakdown')
  })

  it('SplitSwapPair has all required fields', () => {
    const TOKEN_A = 'SHAPE_A_MINTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    const TOKEN_B = 'SHAPE_B_MINTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    const tx = makeTx({
      feePayer: 'SWAPPER',
      tokenTransfers: [
        { fromTokenAccount: 'a1', toTokenAccount: 'a2', fromUserAccount: 'SWAPPER', toUserAccount: 'AGG', tokenAmount: 5000, mint: TOKEN_A, tokenStandard: 'Fungible' },
        { fromTokenAccount: 'a3', toTokenAccount: 'a4', fromUserAccount: 'AGG', toUserAccount: 'SWAPPER', tokenAmount: 8000, mint: TOKEN_B, tokenStandard: 'Fungible' },
      ],
      accountData: [{ account: 'SWAPPER', nativeBalanceChange: -200_000, tokenBalanceChanges: [] }],
    })

    const result = parseHeliusTransactionV3(tx)
    const split = result.data as SplitSwapPair

    expect(split).toHaveProperty('signature')
    expect(split).toHaveProperty('timestamp')
    expect(split).toHaveProperty('swapper')
    expect(split).toHaveProperty('splitReason')
    expect(split).toHaveProperty('sellRecord')
    expect(split).toHaveProperty('buyRecord')
    expect(split).toHaveProperty('protocol')
    expect(split.sellRecord).toHaveProperty('direction')
    expect(split.buyRecord).toHaveProperty('direction')
  })
})
