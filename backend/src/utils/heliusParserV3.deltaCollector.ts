/**
 * Helius Parser V3 — Asset Delta Collector
 *
 * Collects and normalises asset deltas for the swapper from a Helius
 * Enhanced Transaction API response. Drop-in replacement for the
 * SHYFT-based assetDeltaCollector.
 *
 * DATA SOURCE PRIORITY:
 *   SOL:    tokenTransfers WSOL sum  (primary)  → nativeBalanceChange (fallback)
 *   Tokens: tokenTransfers           (primary)  → accountData.tokenBalanceChanges (fallback)
 *
 * Validated against 10 real Helius responses (r45-r57) covering
 * Pump.fun AMM, Pump.fun Bonding Curve, Jupiter, FlashX, Raydium.
 */

import type {
  HeliusTransaction,
  AssetDeltaResult,
  TokenDelta,
} from './heliusParserV3.types'

import {
  SOL_MINT,
  MIN_SOL_LAMPORTS,
  DUST_THRESHOLD,
} from './heliusParserV3.types'

import logger from './logger'

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Collect asset deltas for the swapper from a Helius Enhanced Transaction.
 *
 * Steps:
 *  1. Find swapper's nativeBalanceChange from accountData
 *  2. Extract SOL amount from WSOL tokenTransfers (primary)
 *  3. Build SOL result object (wsol_transfers | native_balance | none)
 *  4. Collect non-SOL token deltas from tokenTransfers (primary)
 *  5. Fallback to accountData.tokenBalanceChanges when tokenTransfers empty
 *  6. Filter dust from multi-hop intermediates
 */
export function collectDeltas(
  tx: HeliusTransaction,
  swapper: string,
): AssetDeltaResult {

  // =========================================================================
  // STEP 1 — swapper's nativeBalanceChange
  // =========================================================================
  // Net SOL change. Includes swap amount, tx fee, Jito tip, protocol fee,
  // creator fee, rent deposits/refunds. Used for direction detection,
  // significance check, and SOL fallback.

  const swapperAccountData = tx.accountData.find(
    (acc) => acc.account === swapper,
  )
  const nativeBalanceChange = swapperAccountData?.nativeBalanceChange ?? 0
  const hasSignificantSol = Math.abs(nativeBalanceChange) >= MIN_SOL_LAMPORTS

  // =========================================================================
  // STEP 2 — SOL from WSOL tokenTransfers (PRIMARY)
  // =========================================================================
  // WSOL transfers give the EXACT DEX swap amount, not the net-of-fees
  // number that nativeBalanceChange returns.
  //
  // BUY:  wsolOut = sum of all WSOL sent by swapper (pool + creator + protocol fees)
  // SELL: wsolIn  = sum of all WSOL received by swapper
  //
  // Fallback: bonding-curve sells have zero WSOL entries; use nbc instead.

  let wsolIn = 0
  let wsolOut = 0
  let hasWsolTransfers = false

  for (const tt of tx.tokenTransfers) {
    if (tt.mint !== SOL_MINT) continue

    const isFrom = tt.fromUserAccount === swapper
    const isTo = tt.toUserAccount === swapper
    if (!isFrom && !isTo) continue

    hasWsolTransfers = true
    if (isTo) wsolIn += tt.tokenAmount
    if (isFrom) wsolOut += tt.tokenAmount
  }

  // =========================================================================
  // STEP 3 — build SOL result
  // =========================================================================

  let sol: AssetDeltaResult['sol']

  if (hasWsolTransfers) {
    const netWsol = wsolIn - wsolOut
    const direction: 'in' | 'out' | 'none' =
      netWsol > 0 ? 'in' : netWsol < 0 ? 'out' : 'none'

    sol = {
      amount: Math.max(wsolIn, wsolOut),
      amountLamports: Math.round(Math.max(wsolIn, wsolOut) * 1e9),
      method: 'wsol_transfers',
      direction,
      wsolIn,
      wsolOut,
    }
  } else if (hasSignificantSol) {
    sol = {
      amount: Math.abs(nativeBalanceChange) / 1e9,
      amountLamports: Math.abs(nativeBalanceChange),
      method: 'native_balance',
      direction:
        nativeBalanceChange > 0 ? 'in' : nativeBalanceChange < 0 ? 'out' : 'none',
      wsolIn: 0,
      wsolOut: 0,
    }
  } else {
    sol = {
      amount: 0,
      amountLamports: 0,
      method: 'none',
      direction: 'none',
      wsolIn: 0,
      wsolOut: 0,
    }
  }

  // =========================================================================
  // STEP 4 — non-SOL token deltas from tokenTransfers (PRIMARY)
  // =========================================================================
  // tokenTransfers is primary because accountData.tokenBalanceChanges is
  // often EMPTY for the swapper in Pump.fun AMM transactions.
  // tokenAmount is already human-readable — DO NOT divide again.

  const tokens = new Map<string, TokenDelta>()

  for (const tt of tx.tokenTransfers) {
    if (tt.mint === SOL_MINT) continue

    const isFrom = tt.fromUserAccount === swapper
    const isTo = tt.toUserAccount === swapper
    if (!isFrom && !isTo) continue

    if (!tokens.has(tt.mint)) {
      tokens.set(tt.mint, {
        mint: tt.mint,
        net: 0,
        grossIn: 0,
        grossOut: 0,
        decimals: 0,
        source: 'token_transfers',
      })
    }

    const entry = tokens.get(tt.mint)!
    if (isTo) {
      entry.net += tt.tokenAmount
      entry.grossIn += tt.tokenAmount
    }
    if (isFrom) {
      entry.net -= tt.tokenAmount
      entry.grossOut += tt.tokenAmount
    }
  }

  // =========================================================================
  // STEP 5 — merge accountData.tokenBalanceChanges (so we don't miss second token)
  // =========================================================================
  // Helius sometimes has one leg in tokenTransfers and the other only in
  // accountData. Merge so token-to-token swaps get tokenCount=2 and classify as split.
  // rawTokenAmount.tokenAmount is a RAW integer string — divide by 10^decimals.

  if (swapperAccountData) {
    for (const tbc of swapperAccountData.tokenBalanceChanges) {
      if (tbc.mint === SOL_MINT) continue

      const rawStr = tbc.rawTokenAmount.tokenAmount
      const decimals = tbc.rawTokenAmount.decimals
      const rawBig = BigInt(rawStr)
      const humanAmt = Number(rawBig) / Math.pow(10, decimals)

      if (tokens.has(tbc.mint)) {
        const existing = tokens.get(tbc.mint)!
        if (existing.decimals === 0 && decimals > 0) {
          existing.decimals = decimals
        }
        continue
      }

      tokens.set(tbc.mint, {
        mint: tbc.mint,
        net: humanAmt,
        grossIn: humanAmt > 0 ? humanAmt : 0,
        grossOut: humanAmt < 0 ? Math.abs(humanAmt) : 0,
        decimals,
        source: 'account_data',
      })
    }

    if (tokens.size > 0) {
      logger.debug(
        { swapper, tokenCount: tokens.size },
        'HeliusDeltaCollector: token deltas (tokenTransfers + accountData)',
      )
    }
  }

  // =========================================================================
  // STEP 6 — filter dust & detect intermediates
  // =========================================================================
  // Multi-hop routes leave tiny residuals on intermediate tokens.
  // Tokens that net to ≈0 but had significant gross volume (both in AND out)
  // are SOL-routed intermediates in a token-to-token swap (e.g. TokenA → SOL → TokenB
  // where TokenA perfectly cancels in the swapper's account).

  const INTERMEDIATE_MIN_GROSS = 0.01

  const intermediateTokens = new Map<string, TokenDelta>()

  for (const [mint, delta] of tokens) {
    if (Math.abs(delta.net) < DUST_THRESHOLD) {
      if (delta.grossIn > INTERMEDIATE_MIN_GROSS && delta.grossOut > INTERMEDIATE_MIN_GROSS) {
        intermediateTokens.set(mint, delta)
      }
      tokens.delete(mint)
    }
  }

  // =========================================================================
  // RETURN
  // =========================================================================

  return {
    sol,
    tokens,
    intermediateTokens,
    nativeBalanceChange,
    hasSignificantSol,
    hasWsolTransfers,
    tokenCount: tokens.size,
    swapper,
  }
}

// ============================================================================
// SOL AMOUNT RESOLVER
// ============================================================================

/**
 * Resolve the correct SOL amount after direction is known.
 *
 * BUY:  swapper SENDS SOL   → wsolOut (total cost)
 * SELL: swapper RECEIVES SOL → wsolIn  (total received)
 *
 * Falls back to abs(nativeBalanceChange)/1e9 when no WSOL transfers exist.
 */
export function getSolAmount(
  deltas: AssetDeltaResult,
  direction: 'BUY' | 'SELL',
): { solAmount: number; solAmountLamports: number } {
  if (deltas.hasWsolTransfers) {
    const solHuman = direction === 'BUY' ? deltas.sol.wsolOut : deltas.sol.wsolIn

    return {
      solAmount: solHuman,
      solAmountLamports: Math.round(solHuman * 1e9),
    }
  }

  return {
    solAmount: Math.abs(deltas.nativeBalanceChange) / 1e9,
    solAmountLamports: Math.abs(deltas.nativeBalanceChange),
  }
}
