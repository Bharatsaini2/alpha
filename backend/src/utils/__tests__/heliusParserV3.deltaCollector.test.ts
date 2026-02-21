/**
 * Helius Parser V3 — Delta Collector Unit Tests
 *
 * Validates collectDeltas() and getSolAmount() against the 10 real
 * Helius transactions from the migration blueprint (r45-r57).
 *
 * Validation table (from spec):
 * ─────────────────────────────────────────────────────────────────
 * ID   DEX         Dir   SOL       Tokens       Method    Pass
 * r45  PUMP_AMM    SELL  13.605    4,571,785    wsol      ✓
 * r47  PUMP_FUN    SELL  2.558     21,823,786   nbc       ✓
 * r49  PUMP_AMM    BUY   15.000    4,137,939    wsol      ✓
 * r51  PUMP_AMM    BUY   9.991     1,504,289    wsol      ✓
 * r52  PUMP_AMM    BUY   14.987    4,200,073    wsol      ✓
 * r53  PUMP_AMM    BUY   49.955    6,616,508    wsol      ✓
 * r54  PUMP_AMM    BUY   4.000     4,523,274    wsol      ✓
 * r55  JUPITER     SPLIT 0 (T2T)  2 tokens     N/A       ✓
 * r56  PUMP_AMM    BUY   28.884    11,171,404   wsol      ✓
 * r57  FlashX      SELL  6.092     1,036,539    wsol      ✓
 * ─────────────────────────────────────────────────────────────────
 */

import { collectDeltas, getSolAmount } from '../heliusParserV3.deltaCollector'
import type { HeliusTransaction } from '../heliusParserV3.types'

const SOL_MINT = 'So11111111111111111111111111111111111111112'

// ============================================================================
// Helpers
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
    slot: 123456,
    ...overrides,
  }
}

// ============================================================================
// r45: PUMP_AMM SELL — 13.605 SOL, 4,571,785 tokens, WSOL method
// ============================================================================

describe('r45 — Pump.fun AMM SELL', () => {
  const TOKEN_MINT = 'oBeMrKMEtoken45mintaddressxxxxxxxxxxxxxxxxx'
  const swapper = 'SWAPPER_R45'

  const tx = makeTx({
    feePayer: swapper,
    source: 'PUMP_AMM',
    tokenTransfers: [
      // Swapper sends token to pool
      { fromTokenAccount: 'ata1', toTokenAccount: 'ata2', fromUserAccount: swapper, toUserAccount: 'POOL', tokenAmount: 4571784.79, mint: TOKEN_MINT, tokenStandard: 'Fungible' },
      // Pool sends WSOL to swapper
      { fromTokenAccount: 'ata3', toTokenAccount: 'ata4', fromUserAccount: 'POOL', toUserAccount: swapper, tokenAmount: 13.604986, mint: SOL_MINT, tokenStandard: 'Fungible' },
    ],
    accountData: [
      { account: swapper, nativeBalanceChange: 13_450_000_000, tokenBalanceChanges: [] },
    ],
  })

  const deltas = collectDeltas(tx, swapper)

  it('detects WSOL method', () => {
    expect(deltas.sol.method).toBe('wsol_transfers')
    expect(deltas.hasWsolTransfers).toBe(true)
  })

  it('SOL direction is IN (swapper receives SOL)', () => {
    expect(deltas.sol.direction).toBe('in')
  })

  it('wsolIn matches expected', () => {
    expect(deltas.sol.wsolIn).toBeCloseTo(13.604986, 4)
  })

  it('has 1 non-SOL token', () => {
    expect(deltas.tokenCount).toBe(1)
  })

  it('token delta is negative (swapper sold)', () => {
    const tokenDelta = deltas.tokens.get(TOKEN_MINT)
    expect(tokenDelta).toBeDefined()
    expect(tokenDelta!.net).toBeCloseTo(-4571784.79, 0)
  })

  it('getSolAmount for SELL returns wsolIn', () => {
    const { solAmount } = getSolAmount(deltas, 'SELL')
    expect(solAmount).toBeCloseTo(13.604986, 4)
  })
})

// ============================================================================
// r47: PUMP_FUN SELL — 2.558 SOL (nbc fallback), 21,823,786 tokens
// ============================================================================

describe('r47 — Pump.fun Bonding Curve SELL (nbc fallback)', () => {
  const TOKEN_MINT = 'CA3n2WUbtoken47mintaddressxxxxxxxxxxxxxxxxx'
  const swapper = 'SWAPPER_R47'

  const tx = makeTx({
    feePayer: swapper,
    source: 'PUMP_FUN',
    tokenTransfers: [
      // Swapper sends token — NO WSOL transfers (bonding curve)
      { fromTokenAccount: 'ata1', toTokenAccount: 'ata2', fromUserAccount: swapper, toUserAccount: 'BC_POOL', tokenAmount: 21823785.94, mint: TOKEN_MINT, tokenStandard: 'Fungible' },
    ],
    accountData: [
      { account: swapper, nativeBalanceChange: 2_557_607_000, tokenBalanceChanges: [] },
    ],
  })

  const deltas = collectDeltas(tx, swapper)

  it('falls back to native_balance method', () => {
    expect(deltas.sol.method).toBe('native_balance')
    expect(deltas.hasWsolTransfers).toBe(false)
  })

  it('SOL direction is IN', () => {
    expect(deltas.sol.direction).toBe('in')
  })

  it('SOL amount from nbc', () => {
    expect(deltas.sol.amount).toBeCloseTo(2.557607, 4)
  })

  it('has 1 non-SOL token', () => {
    expect(deltas.tokenCount).toBe(1)
  })

  it('token delta is negative (sold)', () => {
    const tokenDelta = deltas.tokens.get(TOKEN_MINT)
    expect(tokenDelta!.net).toBeCloseTo(-21823785.94, 0)
  })

  it('getSolAmount for SELL returns nbc fallback', () => {
    const { solAmount } = getSolAmount(deltas, 'SELL')
    expect(solAmount).toBeCloseTo(2.557607, 4)
  })
})

// ============================================================================
// r49: PUMP_AMM BUY — 15.000 SOL, 4,137,939 tokens, WSOL method
// ============================================================================

describe('r49 — Pump.fun AMM BUY', () => {
  const TOKEN_MINT = 'HaUXAdAWtoken49mintaddressxxxxxxxxxxxxxxxxx'
  const swapper = 'SWAPPER_R49'

  const tx = makeTx({
    feePayer: swapper,
    source: 'PUMP_AMM',
    tokenTransfers: [
      // Swapper sends WSOL to pool (3 transfers: pool + creator fee + protocol fee)
      { fromTokenAccount: 'ata1', toTokenAccount: 'ata2', fromUserAccount: swapper, toUserAccount: 'POOL', tokenAmount: 14.85, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'ata1', toTokenAccount: 'ata3', fromUserAccount: swapper, toUserAccount: 'CREATOR', tokenAmount: 0.1, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'ata1', toTokenAccount: 'ata4', fromUserAccount: swapper, toUserAccount: 'PROTOCOL', tokenAmount: 0.05, mint: SOL_MINT, tokenStandard: 'Fungible' },
      // Pool sends token to swapper
      { fromTokenAccount: 'ata5', toTokenAccount: 'ata6', fromUserAccount: 'POOL', toUserAccount: swapper, tokenAmount: 4137939.46, mint: TOKEN_MINT, tokenStandard: 'Fungible' },
    ],
    accountData: [
      { account: swapper, nativeBalanceChange: -15_160_000_000, tokenBalanceChanges: [] },
    ],
  })

  const deltas = collectDeltas(tx, swapper)

  it('detects WSOL method', () => {
    expect(deltas.sol.method).toBe('wsol_transfers')
  })

  it('SOL direction is OUT (swapper sends SOL)', () => {
    expect(deltas.sol.direction).toBe('out')
  })

  it('wsolOut sums all 3 transfers', () => {
    expect(deltas.sol.wsolOut).toBeCloseTo(15.0, 4)
  })

  it('token delta is positive (received)', () => {
    const tokenDelta = deltas.tokens.get(TOKEN_MINT)
    expect(tokenDelta!.net).toBeCloseTo(4137939.46, 0)
  })

  it('getSolAmount for BUY returns wsolOut', () => {
    const { solAmount } = getSolAmount(deltas, 'BUY')
    expect(solAmount).toBeCloseTo(15.0, 4)
  })

  it('nativeBalanceChange is different from WSOL amount (includes fees)', () => {
    expect(Math.abs(deltas.nativeBalanceChange) / 1e9).not.toBeCloseTo(15.0, 1)
  })
})

// ============================================================================
// r51: PUMP_AMM BUY — 9.991 SOL, 1,504,289 tokens
// ============================================================================

describe('r51 — Pump.fun AMM BUY', () => {
  const TOKEN_MINT = 'HaUXAdAWtoken51mintaddressxxxxxxxxxxxxxxxxx'
  const swapper = 'SWAPPER_R51'

  const tx = makeTx({
    feePayer: swapper,
    source: 'PUMP_AMM',
    tokenTransfers: [
      { fromTokenAccount: 'a1', toTokenAccount: 'a2', fromUserAccount: swapper, toUserAccount: 'POOL', tokenAmount: 9.891, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a1', toTokenAccount: 'a3', fromUserAccount: swapper, toUserAccount: 'CREATOR', tokenAmount: 0.07, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a1', toTokenAccount: 'a4', fromUserAccount: swapper, toUserAccount: 'PROTOCOL', tokenAmount: 0.03, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a5', toTokenAccount: 'a6', fromUserAccount: 'POOL', toUserAccount: swapper, tokenAmount: 1504288.65, mint: TOKEN_MINT, tokenStandard: 'Fungible' },
    ],
    accountData: [
      { account: swapper, nativeBalanceChange: -10_090_000_000, tokenBalanceChanges: [] },
    ],
  })

  const deltas = collectDeltas(tx, swapper)

  it('wsolOut = 9.991', () => {
    expect(deltas.sol.wsolOut).toBeCloseTo(9.991, 3)
  })

  it('token received = ~1,504,289', () => {
    expect(deltas.tokens.get(TOKEN_MINT)!.net).toBeCloseTo(1504288.65, 0)
  })

  it('getSolAmount BUY = wsolOut', () => {
    expect(getSolAmount(deltas, 'BUY').solAmount).toBeCloseTo(9.991, 3)
  })
})

// ============================================================================
// r52: PUMP_AMM BUY — 14.987 SOL, 4,200,073 tokens
// ============================================================================

describe('r52 — Pump.fun AMM BUY', () => {
  const TOKEN_MINT = 'HdvZF538token52mintaddressxxxxxxxxxxxxxxxxx'
  const swapper = 'SWAPPER_R52'

  const tx = makeTx({
    feePayer: swapper,
    source: 'PUMP_AMM',
    tokenTransfers: [
      { fromTokenAccount: 'a1', toTokenAccount: 'a2', fromUserAccount: swapper, toUserAccount: 'POOL', tokenAmount: 14.837, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a1', toTokenAccount: 'a3', fromUserAccount: swapper, toUserAccount: 'CREATOR', tokenAmount: 0.1, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a1', toTokenAccount: 'a4', fromUserAccount: swapper, toUserAccount: 'PROTOCOL', tokenAmount: 0.0495, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a5', toTokenAccount: 'a6', fromUserAccount: 'POOL', toUserAccount: swapper, tokenAmount: 4200072.66, mint: TOKEN_MINT, tokenStandard: 'Fungible' },
    ],
    accountData: [
      { account: swapper, nativeBalanceChange: -15_150_000_000, tokenBalanceChanges: [] },
    ],
  })

  const deltas = collectDeltas(tx, swapper)

  it('wsolOut = ~14.987', () => {
    expect(deltas.sol.wsolOut).toBeCloseTo(14.9865, 2)
  })

  it('token received = ~4,200,073', () => {
    expect(deltas.tokens.get(TOKEN_MINT)!.net).toBeCloseTo(4200072.66, 0)
  })
})

// ============================================================================
// r53: PUMP_AMM BUY — 49.955 SOL, 6,616,508 tokens
// ============================================================================

describe('r53 — Pump.fun AMM BUY (large)', () => {
  const TOKEN_MINT = 'HdvZF538token53mintaddressxxxxxxxxxxxxxxxxx'
  const swapper = 'SWAPPER_R53'

  const tx = makeTx({
    feePayer: swapper,
    source: 'PUMP_AMM',
    tokenTransfers: [
      { fromTokenAccount: 'a1', toTokenAccount: 'a2', fromUserAccount: swapper, toUserAccount: 'POOL', tokenAmount: 49.455, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a1', toTokenAccount: 'a3', fromUserAccount: swapper, toUserAccount: 'CREATOR', tokenAmount: 0.33, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a1', toTokenAccount: 'a4', fromUserAccount: swapper, toUserAccount: 'PROTOCOL', tokenAmount: 0.17, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a5', toTokenAccount: 'a6', fromUserAccount: 'POOL', toUserAccount: swapper, tokenAmount: 6616507.74, mint: TOKEN_MINT, tokenStandard: 'Fungible' },
    ],
    accountData: [
      { account: swapper, nativeBalanceChange: -50_520_000_000, tokenBalanceChanges: [] },
    ],
  })

  const deltas = collectDeltas(tx, swapper)

  it('wsolOut = ~49.955', () => {
    expect(deltas.sol.wsolOut).toBeCloseTo(49.955, 2)
  })

  it('token received = ~6,616,508', () => {
    expect(deltas.tokens.get(TOKEN_MINT)!.net).toBeCloseTo(6616507.74, 0)
  })
})

// ============================================================================
// r54: PUMP_AMM BUY — 4.000 SOL, 4,523,274 tokens
// ============================================================================

describe('r54 — Pump.fun AMM BUY (small)', () => {
  const TOKEN_MINT = 'HdvZF538token54mintaddressxxxxxxxxxxxxxxxxx'
  const swapper = 'SWAPPER_R54'

  const tx = makeTx({
    feePayer: swapper,
    source: 'PUMP_AMM',
    tokenTransfers: [
      { fromTokenAccount: 'a1', toTokenAccount: 'a2', fromUserAccount: swapper, toUserAccount: 'POOL', tokenAmount: 3.96, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a1', toTokenAccount: 'a3', fromUserAccount: swapper, toUserAccount: 'CREATOR', tokenAmount: 0.027, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a1', toTokenAccount: 'a4', fromUserAccount: swapper, toUserAccount: 'PROTOCOL', tokenAmount: 0.013, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a5', toTokenAccount: 'a6', fromUserAccount: 'POOL', toUserAccount: swapper, tokenAmount: 4523273.70, mint: TOKEN_MINT, tokenStandard: 'Fungible' },
    ],
    accountData: [
      { account: swapper, nativeBalanceChange: -4_050_000_000, tokenBalanceChanges: [] },
    ],
  })

  const deltas = collectDeltas(tx, swapper)

  it('wsolOut = 4.000', () => {
    expect(deltas.sol.wsolOut).toBeCloseTo(4.0, 2)
  })

  it('token received = ~4,523,274', () => {
    expect(deltas.tokens.get(TOKEN_MINT)!.net).toBeCloseTo(4523273.70, 0)
  })
})

// ============================================================================
// r55: JUPITER token-to-token — 2 tokens, no significant SOL
// ============================================================================

describe('r55 — Jupiter token-to-token SPLIT', () => {
  const TOKEN_A = 'TOKEN_A_MINT_55xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  const TOKEN_B = 'TOKEN_B_MINT_55xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  const swapper = 'SWAPPER_R55'

  const tx = makeTx({
    feePayer: swapper,
    source: 'JUPITER',
    tokenTransfers: [
      // Swapper sends token A
      { fromTokenAccount: 'a1', toTokenAccount: 'a2', fromUserAccount: swapper, toUserAccount: 'AGG', tokenAmount: 500000, mint: TOKEN_A, tokenStandard: 'Fungible' },
      // Swapper receives token B
      { fromTokenAccount: 'a3', toTokenAccount: 'a4', fromUserAccount: 'AGG', toUserAccount: swapper, tokenAmount: 750000, mint: TOKEN_B, tokenStandard: 'Fungible' },
      // Intermediate WSOL (routing) — both in and out net to ~zero
      { fromTokenAccount: 'a5', toTokenAccount: 'a6', fromUserAccount: swapper, toUserAccount: 'POOL_A', tokenAmount: 9.535841, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a7', toTokenAccount: 'a8', fromUserAccount: 'POOL_B', toUserAccount: swapper, tokenAmount: 9.535841, mint: SOL_MINT, tokenStandard: 'Fungible' },
    ],
    accountData: [
      { account: swapper, nativeBalanceChange: -224_000, tokenBalanceChanges: [] },
    ],
  })

  const deltas = collectDeltas(tx, swapper)

  it('hasSignificantSol is false (nbc < 1M lamports)', () => {
    expect(deltas.hasSignificantSol).toBe(false)
  })

  it('WSOL net is zero (intermediate routing)', () => {
    expect(deltas.sol.wsolIn).toBeCloseTo(deltas.sol.wsolOut, 4)
  })

  it('has 2 non-SOL tokens', () => {
    expect(deltas.tokenCount).toBe(2)
  })

  it('token A delta is negative (sent)', () => {
    expect(deltas.tokens.get(TOKEN_A)!.net).toBeCloseTo(-500000, 0)
  })

  it('token B delta is positive (received)', () => {
    expect(deltas.tokens.get(TOKEN_B)!.net).toBeCloseTo(750000, 0)
  })

  it('hasWsolTransfers is true (WSOL was used as routing)', () => {
    expect(deltas.hasWsolTransfers).toBe(true)
  })
})

// ============================================================================
// r56: PUMP_AMM BUY — 28.884 SOL, 11,171,404 tokens
// ============================================================================

describe('r56 — Pump.fun AMM BUY (large)', () => {
  const TOKEN_MINT = 'HdvZF538token56mintaddressxxxxxxxxxxxxxxxxx'
  const swapper = 'SWAPPER_R56'

  const tx = makeTx({
    feePayer: swapper,
    source: 'PUMP_AMM',
    tokenTransfers: [
      { fromTokenAccount: 'a1', toTokenAccount: 'a2', fromUserAccount: swapper, toUserAccount: 'POOL', tokenAmount: 28.594, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a1', toTokenAccount: 'a3', fromUserAccount: swapper, toUserAccount: 'CREATOR', tokenAmount: 0.195, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a1', toTokenAccount: 'a4', fromUserAccount: swapper, toUserAccount: 'PROTOCOL', tokenAmount: 0.095115, mint: SOL_MINT, tokenStandard: 'Fungible' },
      { fromTokenAccount: 'a5', toTokenAccount: 'a6', fromUserAccount: 'POOL', toUserAccount: swapper, tokenAmount: 11171404.40, mint: TOKEN_MINT, tokenStandard: 'Fungible' },
    ],
    accountData: [
      { account: swapper, nativeBalanceChange: -29_190_000_000, tokenBalanceChanges: [] },
    ],
  })

  const deltas = collectDeltas(tx, swapper)

  it('wsolOut = ~28.884', () => {
    expect(deltas.sol.wsolOut).toBeCloseTo(28.884115, 2)
  })

  it('token received = ~11,171,404', () => {
    expect(deltas.tokens.get(TOKEN_MINT)!.net).toBeCloseTo(11171404.40, 0)
  })
})

// ============================================================================
// r57: FlashX SELL — Helius type=TRANSFER, 6.092 SOL, 1,036,539 tokens
// ============================================================================

describe('r57 — FlashX SELL (Helius type=TRANSFER — must still work)', () => {
  const TOKEN_MINT = 'KIMCHI_MINT_57xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  const swapper = 'SWAPPER_R57'

  const tx = makeTx({
    feePayer: swapper,
    type: 'TRANSFER',       // Helius misclassified this as TRANSFER
    source: 'SYSTEM_PROGRAM',
    tokenTransfers: [
      // Swapper sends token
      { fromTokenAccount: 'a1', toTokenAccount: 'a2', fromUserAccount: swapper, toUserAccount: 'DEX', tokenAmount: 1036538.59, mint: TOKEN_MINT, tokenStandard: 'Fungible' },
      // Swapper receives WSOL
      { fromTokenAccount: 'a3', toTokenAccount: 'a4', fromUserAccount: 'DEX', toUserAccount: swapper, tokenAmount: 6.091966596, mint: SOL_MINT, tokenStandard: 'Fungible' },
    ],
    accountData: [
      { account: swapper, nativeBalanceChange: 6_030_841_931, tokenBalanceChanges: [] },
    ],
  })

  const deltas = collectDeltas(tx, swapper)

  it('works despite type=TRANSFER (no type gating)', () => {
    expect(deltas.sol.method).toBe('wsol_transfers')
  })

  it('SOL direction is IN', () => {
    expect(deltas.sol.direction).toBe('in')
  })

  it('wsolIn = 6.092 (exact DEX amount)', () => {
    expect(deltas.sol.wsolIn).toBeCloseTo(6.091966596, 4)
  })

  it('nbc is different (net of fees)', () => {
    expect(deltas.nativeBalanceChange / 1e9).toBeCloseTo(6.030841931, 4)
    expect(deltas.sol.wsolIn).not.toBeCloseTo(deltas.nativeBalanceChange / 1e9, 2)
  })

  it('token delta is negative (sold)', () => {
    expect(deltas.tokens.get(TOKEN_MINT)!.net).toBeCloseTo(-1036538.59, 0)
  })

  it('getSolAmount SELL = wsolIn (correct, not nbc)', () => {
    const { solAmount } = getSolAmount(deltas, 'SELL')
    expect(solAmount).toBeCloseTo(6.091966596, 4)
  })
})

// ============================================================================
// Edge cases
// ============================================================================

describe('edge cases', () => {
  it('returns method=none when no SOL movement', () => {
    const tx = makeTx({
      tokenTransfers: [],
      accountData: [{ account: 'SWAPPER', nativeBalanceChange: 0, tokenBalanceChanges: [] }],
    })
    const deltas = collectDeltas(tx, 'SWAPPER')
    expect(deltas.sol.method).toBe('none')
    expect(deltas.sol.amount).toBe(0)
  })

  it('filters dust deltas below DUST_THRESHOLD', () => {
    const tx = makeTx({
      tokenTransfers: [
        { fromTokenAccount: 'a', toTokenAccount: 'b', fromUserAccount: 'POOL', toUserAccount: 'SWAPPER', tokenAmount: 1e-12, mint: 'DUST_MINT_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', tokenStandard: 'Fungible' },
      ],
    })
    const deltas = collectDeltas(tx, 'SWAPPER')
    expect(deltas.tokenCount).toBe(0)
  })

  it('falls back to accountData when tokenTransfers is empty', () => {
    const TOKEN_MINT = 'FALLBACK_MINT_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    const tx = makeTx({
      tokenTransfers: [],
      accountData: [
        {
          account: 'SWAPPER',
          nativeBalanceChange: -5_000_000_000,
          tokenBalanceChanges: [
            {
              userAccount: 'SWAPPER',
              tokenAccount: 'ata-fallback',
              rawTokenAmount: { tokenAmount: '5000000000', decimals: 6 },
              mint: TOKEN_MINT,
            },
          ],
        },
      ],
    })
    const deltas = collectDeltas(tx, 'SWAPPER')
    expect(deltas.tokenCount).toBe(1)
    const td = deltas.tokens.get(TOKEN_MINT)!
    expect(td.source).toBe('account_data')
    expect(td.net).toBeCloseTo(5000, 0)  // 5000000000 / 10^6
  })

  it('ignores transfers not involving the swapper', () => {
    const tx = makeTx({
      tokenTransfers: [
        { fromTokenAccount: 'a', toTokenAccount: 'b', fromUserAccount: 'OTHER1', toUserAccount: 'OTHER2', tokenAmount: 999, mint: 'SOME_MINT_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', tokenStandard: 'Fungible' },
      ],
    })
    const deltas = collectDeltas(tx, 'SWAPPER')
    expect(deltas.tokenCount).toBe(0)
  })

  it('handles negative rawTokenAmount in accountData fallback', () => {
    const TOKEN_MINT = 'NEG_MINT_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    const tx = makeTx({
      tokenTransfers: [],
      accountData: [
        {
          account: 'SWAPPER',
          nativeBalanceChange: 2_000_000_000,
          tokenBalanceChanges: [
            {
              userAccount: 'SWAPPER',
              tokenAccount: 'ata-neg',
              rawTokenAmount: { tokenAmount: '-1036538590535931', decimals: 6 },
              mint: TOKEN_MINT,
            },
          ],
        },
      ],
    })
    const deltas = collectDeltas(tx, 'SWAPPER')
    const td = deltas.tokens.get(TOKEN_MINT)!
    expect(td.net).toBeLessThan(0)
    expect(td.source).toBe('account_data')
  })
})
