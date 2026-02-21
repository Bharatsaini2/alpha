/**
 * Helius Parser V3 — Main Parser
 *
 * Self-contained parser that consumes Helius Enhanced Transaction API
 * responses directly. Uses balance-only swap detection — NEVER type
 * labels from any provider.
 *
 * Pipeline:
 *  Stage 0  — Input validation + transactionError gate (NO type blacklist)
 *  Stage 1  — Swapper identification (feePayer + hintSwapper fallback)
 *  Stage 2-3 — collectDeltas (SOL via WSOL sum + nbc fallback, tokens via tokenTransfers)
 *  Stage 4  — Pattern classification (A-F) + direction detection
 *  Stage 5  — Core token suppression, ERASE validation, minimum value filter
 *  Stage 6  — Output generation (ParsedSwap / SplitSwapPair / EraseResult)
 *
 * Output types are identical to V2 so every downstream consumer
 * (storeTransactionInDB, alertMatcher, WebSocket broadcast) works unchanged.
 */

import logger from './logger'
import { collectDeltas, getSolAmount } from './heliusParserV3.deltaCollector'
import { getCoreTokenSuppressionService } from '../services/core-token-suppression.service'
import { DEFAULT_CORE_TOKENS } from '../types/shyft-parser-v2.types'
import axios from 'axios'

import type {
  HeliusTransaction,
  HeliusParserOptions,
  AssetDeltaResult,
  TokenDelta,
  ParsedSwap,
  SplitSwapPair,
  EraseResult,
  ParserResult,
  FeeBreakdown,
} from './heliusParserV3.types'

import { SOL_MINT, PRIORITY_ASSETS } from './heliusParserV3.types'

// ============================================================================
// CONSTANTS
// ============================================================================

const MINIMUM_USD_VALUE = 2.0

// ============================================================================
// CLASS
// ============================================================================

const CORE_TOKEN_SET = new Set(DEFAULT_CORE_TOKENS)

export class HeliusParserV3 {
  private coreTokenSuppression = getCoreTokenSuppressionService(DEFAULT_CORE_TOKENS, true)

  private static solPriceCache: { price: number; timestamp: number } | null = null
  private static readonly SOL_PRICE_CACHE_TTL = 5 * 60 * 1000
  private cachedSolPrice = 94

  // --------------------------------------------------------------------------
  // Public entry point
  // --------------------------------------------------------------------------

  parseTransaction(
    tx: HeliusTransaction,
    options?: HeliusParserOptions,
  ): ParserResult {
    const startTime = Date.now()

    try {
      this.refreshSolPriceCache()

      // ====================================================================
      // Stage 0 — Input validation (NO type blacklist)
      // ====================================================================

      const validationError = this.validateInput(tx)
      if (validationError) {
        return this.erase(tx, 'invalid_input', { validationError }, startTime)
      }

      if (tx.transactionError !== null) {
        return this.erase(tx, 'transaction_failed', {}, startTime)
      }

      // ====================================================================
      // Stage 1 — Swapper identification
      // ====================================================================

      const swapper = this.identifySwapper(tx, options)
      if (!swapper) {
        return this.erase(tx, 'swapper_identification_failed', {}, startTime)
      }

      // ====================================================================
      // Stage 2-3 — Delta collection
      // ====================================================================

      const deltas = collectDeltas(tx, swapper)

      logger.debug(
        {
          signature: tx.signature,
          swapper,
          solMethod: deltas.sol.method,
          solAmount: deltas.sol.amount,
          tokenCount: deltas.tokenCount,
          hasSignificantSol: deltas.hasSignificantSol,
        },
        'HeliusV3: Deltas collected',
      )

      // ====================================================================
      // Stage 4 — Pattern classification + direction detection
      // ====================================================================

      const classification = this.classifyPattern(deltas, tx)

      if (classification.erase) {
        return this.erase(tx, classification.erase, { deltas: this.deltaSummary(deltas) }, startTime)
      }

      // ====================================================================
      // Stage 5 — Suppression, validation, minimum value
      // ====================================================================

      if (classification.type === 'standard') {
        const { direction, tokenMint, tokenAmount, solAmount } = classification

        // Core token suppression
        if (this.shouldSuppressCoreSwap(SOL_MINT, tokenMint)) {
          return this.erase(tx, 'core_to_core_swap_suppressed', { tokenMint }, startTime)
        }

        // Minimum value filter
        const usdValue = solAmount * this.cachedSolPrice
        if (usdValue < MINIMUM_USD_VALUE) {
          return this.erase(tx, 'below_minimum_value_threshold', { usdValue }, startTime)
        }

        // ====================================================================
        // Stage 6 — Output (standard BUY/SELL)
        // ====================================================================

        const tokenDelta = deltas.tokens.values().next().value as TokenDelta
        const swap = this.buildParsedSwap(tx, swapper, direction, solAmount, tokenAmount, tokenMint, tokenDelta)

        return {
          success: true,
          data: swap,
          processingTimeMs: Date.now() - startTime,
        }
      }

      if (classification.type === 'standard_token_quote') {
        const { direction, baseMint, baseAmount, baseDecimals, quoteMint, quoteAmount, quoteDecimals } = classification

        if (this.shouldSuppressCoreSwap(quoteMint, baseMint)) {
          return this.erase(tx, 'core_to_core_swap_suppressed', { quoteMint, baseMint }, startTime)
        }

        const swap = this.buildCoreQuoteSwap(
          tx, swapper, direction,
          { mint: baseMint, amount: baseAmount, decimals: baseDecimals },
          { mint: quoteMint, amount: quoteAmount, decimals: quoteDecimals },
        )

        return {
          success: true,
          data: swap,
          processingTimeMs: Date.now() - startTime,
        }
      }

      if (classification.type === 'split') {
        const { positiveTokens, negativeTokens } = classification

        const posMint = positiveTokens[0].mint
        const negMint = negativeTokens[0].mint
        if (this.shouldSuppressCoreSwap(negMint, posMint)) {
          return this.erase(tx, 'core_to_core_swap_suppressed', { negMint, posMint }, startTime)
        }

        const splitPair = this.buildSplitSwapPair(tx, swapper, negativeTokens[0], positiveTokens[0])

        return {
          success: true,
          data: splitPair,
          processingTimeMs: Date.now() - startTime,
        }
      }

      // Unreachable in practice, but TypeScript needs it
      return this.erase(tx, 'classification_error', {}, startTime)

    } catch (error) {
      logger.error(
        {
          signature: tx.signature,
          error: error instanceof Error ? error.message : String(error),
        },
        'HeliusV3: Unexpected error',
      )
      return this.erase(tx, 'parsing_error', {
        error: error instanceof Error ? error.message : String(error),
      }, startTime)
    }
  }

  // --------------------------------------------------------------------------
  // Stage 0 helpers
  // --------------------------------------------------------------------------

  private validateInput(tx: HeliusTransaction): string | null {
    if (!tx.signature) return 'Missing signature'
    if (!tx.feePayer) return 'Missing feePayer'
    if (tx.timestamp === undefined || tx.timestamp === null) return 'Missing timestamp'
    if (!Array.isArray(tx.tokenTransfers)) return 'Missing tokenTransfers'
    if (!Array.isArray(tx.accountData)) return 'Missing accountData'
    return null
  }

  // --------------------------------------------------------------------------
  // Stage 1 helpers
  // --------------------------------------------------------------------------

  private identifySwapper(tx: HeliusTransaction, options?: HeliusParserOptions): string | null {
    // Primary: feePayer (correct 99%+ of memecoin trades)
    const swapper = tx.feePayer
    if (!swapper) return null

    // hintSwapper fallback: when feePayer doesn't appear in token activity
    // (relay/gasless transactions for whale tracking)
    if (options?.hintSwapper && options.hintSwapper !== swapper) {
      const feePayerHasActivity = tx.tokenTransfers.some(
        (tt) => tt.fromUserAccount === swapper || tt.toUserAccount === swapper,
      )
      if (!feePayerHasActivity) {
        logger.debug(
          { feePayer: swapper, hintSwapper: options.hintSwapper },
          'HeliusV3: feePayer has no token activity, using hintSwapper',
        )
        return options.hintSwapper
      }
    }

    return swapper
  }

  // --------------------------------------------------------------------------
  // Stage 4 — Pattern classification
  // --------------------------------------------------------------------------

  private classifyPattern(
    deltas: AssetDeltaResult,
    tx: HeliusTransaction,
  ): ClassificationResult {
    const { tokenCount, hasSignificantSol, nativeBalanceChange, tokens } = deltas

    // Pattern F: Nothing at all
    if (tokenCount === 0 && !hasSignificantSol) {
      return { type: 'erase_only', erase: 'no_movement_detected' }
    }

    // Pattern D: SOL only, no tokens
    if (tokenCount === 0 && hasSignificantSol) {
      return { type: 'erase_only', erase: 'sol_only_no_token' }
    }

    // ================================================================
    // RULE SET (applies to all patterns):
    //   Core token → Non-core token = BUY
    //   Non-core token → Core token = SELL
    //   Non-core → Non-core = SWAP (split into BUY + SELL)
    //
    // SOL (via WSOL/nbc) is always a core token.
    // Other core tokens (USDC, USDT, LSTs) are in CORE_TOKEN_SET.
    // ================================================================

    // Pattern A: 1 non-SOL token + significant SOL
    // SOL is core → swapper spending SOL = BUY, receiving SOL = SELL
    if (tokenCount === 1 && hasSignificantSol) {
      const [tokenMint, tokenDelta] = [...tokens.entries()][0]
      const tokenPositive = tokenDelta.net > 0
      const solPositive = nativeBalanceChange > 0

      let direction: 'BUY' | 'SELL'
      if (tokenPositive && !solPositive) direction = 'BUY'
      else if (!tokenPositive && solPositive) direction = 'SELL'
      else if (tokenPositive) direction = 'BUY'
      else direction = 'SELL'

      const { solAmount } = getSolAmount(deltas, direction)
      const tokenAmount = Math.abs(tokenDelta.net)

      return { type: 'standard', direction, tokenMint, tokenAmount, solAmount }
    }

    // Pattern E: 1 token + no significant SOL
    if (tokenCount === 1 && !hasSignificantSol) {
      // E-special: SOL-routed token-to-token swap
      // When WSOL in ≈ WSOL out (SOL was routing) AND there's an intermediate
      // token (net=0 but significant gross flows), this is a multi-hop
      // token-to-token swap (e.g. TokenA → SOL → TokenB). Classify as SPLIT.
      const solIsRouting = deltas.hasWsolTransfers && deltas.sol.direction === 'none'
      if (solIsRouting && deltas.intermediateTokens.size > 0) {
        const [, tokenDelta] = [...tokens.entries()][0]
        const [, intermediateDelta] = [...deltas.intermediateTokens.entries()][0]

        // Positive net → swapper gained this token; intermediate was the source
        // Negative net → swapper lost this token; intermediate was the destination
        // Both cases: treat as token-to-token split
        if (tokenDelta.net > 0) {
          return {
            type: 'split',
            positiveTokens: [{ mint: tokenDelta.mint, amount: tokenDelta.net, decimals: tokenDelta.decimals }],
            negativeTokens: [{ mint: intermediateDelta.mint, amount: intermediateDelta.grossOut, decimals: intermediateDelta.decimals }],
          }
        } else {
          return {
            type: 'split',
            positiveTokens: [{ mint: intermediateDelta.mint, amount: intermediateDelta.grossIn, decimals: intermediateDelta.decimals }],
            negativeTokens: [{ mint: tokenDelta.mint, amount: Math.abs(tokenDelta.net), decimals: tokenDelta.decimals }],
          }
        }
      }

      // E-standard: tiny swap where SOL movement is below threshold but WSOL exists
      if (deltas.hasWsolTransfers && !solIsRouting) {
        const [tokenMint, tokenDelta] = [...tokens.entries()][0]
        const direction: 'BUY' | 'SELL' = tokenDelta.net > 0 ? 'BUY' : 'SELL'
        const { solAmount } = getSolAmount(deltas, direction)
        const tokenAmount = Math.abs(tokenDelta.net)
        return { type: 'standard', direction, tokenMint, tokenAmount, solAmount }
      }

      return { type: 'erase_only', erase: 'single_token_no_sol' }
    }

    // Pattern B & C: 2+ non-SOL tokens
    if (tokenCount >= 2) {
      const entries = [...tokens.entries()]
      const positiveTokens = entries
        .filter(([, d]) => d.net > 0)
        .map(([mint, d]) => ({ mint, amount: d.net, decimals: d.decimals }))
      const negativeTokens = entries
        .filter(([, d]) => d.net < 0)
        .map(([mint, d]) => ({ mint, amount: Math.abs(d.net), decimals: d.decimals }))

      // Sub-case C1: 1 positive token + 0 negative + significant SOL → BUY (SOL is core)
      if (positiveTokens.length === 1 && negativeTokens.length === 0 && hasSignificantSol) {
        const { solAmount } = getSolAmount(deltas, 'BUY')
        return {
          type: 'standard',
          direction: 'BUY',
          tokenMint: positiveTokens[0].mint,
          tokenAmount: positiveTokens[0].amount,
          solAmount,
        }
      }

      // Sub-case C2: 0 positive + 1 negative + significant SOL → SELL (SOL is core)
      if (negativeTokens.length === 1 && positiveTokens.length === 0 && hasSignificantSol) {
        const { solAmount } = getSolAmount(deltas, 'SELL')
        return {
          type: 'standard',
          direction: 'SELL',
          tokenMint: negativeTokens[0].mint,
          tokenAmount: negativeTokens[0].amount,
          solAmount,
        }
      }

      // Token-to-token: check if one side has a core token
      if (positiveTokens.length >= 1 && negativeTokens.length >= 1) {
        const coreReceived = positiveTokens.find(t => CORE_TOKEN_SET.has(t.mint))
        const coreSent = negativeTokens.find(t => CORE_TOKEN_SET.has(t.mint))
        const nonCoreReceived = positiveTokens.find(t => !CORE_TOKEN_SET.has(t.mint))
        const nonCoreSent = negativeTokens.find(t => !CORE_TOKEN_SET.has(t.mint))

        // Core sent + non-core received → BUY (spending core to get token)
        if (coreSent && nonCoreReceived) {
          return {
            type: 'standard_token_quote',
            direction: 'BUY',
            baseMint: nonCoreReceived.mint,
            baseAmount: nonCoreReceived.amount,
            baseDecimals: nonCoreReceived.decimals,
            quoteMint: coreSent.mint,
            quoteAmount: coreSent.amount,
            quoteDecimals: coreSent.decimals,
          }
        }

        // Non-core sent + core received → SELL (selling token to get core)
        if (nonCoreSent && coreReceived) {
          return {
            type: 'standard_token_quote',
            direction: 'SELL',
            baseMint: nonCoreSent.mint,
            baseAmount: nonCoreSent.amount,
            baseDecimals: nonCoreSent.decimals,
            quoteMint: coreReceived.mint,
            quoteAmount: coreReceived.amount,
            quoteDecimals: coreReceived.decimals,
          }
        }

        // Non-core → Non-core: split into SELL + BUY pair
        return {
          type: 'split',
          positiveTokens,
          negativeTokens,
        }
      }

      // All positive or all negative → transfer, not a swap
      return { type: 'erase_only', erase: 'unidirectional_multi_token' }
    }

    return { type: 'erase_only', erase: 'unclassified_pattern' }
  }

  // --------------------------------------------------------------------------
  // Stage 5 helpers
  // --------------------------------------------------------------------------

  private shouldSuppressCoreSwap(mintA: string, mintB: string): boolean {
    return this.coreTokenSuppression.shouldSuppressSwap(
      { mint: mintA, symbol: '', amount: 0, decimals: 0 },
      { mint: mintB, symbol: '', amount: 0, decimals: 0 },
    )
  }

  // --------------------------------------------------------------------------
  // Stage 6 — Output builders
  // --------------------------------------------------------------------------

  private buildParsedSwap(
    tx: HeliusTransaction,
    swapper: string,
    direction: 'BUY' | 'SELL',
    solAmount: number,
    tokenAmount: number,
    tokenMint: string,
    tokenDelta: TokenDelta,
  ): ParsedSwap {
    const feeBreakdown: FeeBreakdown = {
      transactionFeeSOL: tx.fee / 1e9,
      transactionFeeQuote: tx.fee / 1e9,
      platformFee: 0,
      priorityFee: 0,
      totalFeeQuote: tx.fee / 1e9,
    }

    const tokenSymbol = this.symbolForMint(tokenMint)

    const amounts = direction === 'BUY'
      ? {
          totalWalletCost: solAmount,
          baseAmount: tokenAmount,
          feeBreakdown,
        }
      : {
          netWalletReceived: solAmount,
          baseAmount: tokenAmount,
          feeBreakdown,
        }

    return {
      signature: tx.signature,
      timestamp: tx.timestamp,
      swapper,
      direction,
      quoteAsset: { mint: SOL_MINT, symbol: 'SOL', decimals: 9 },
      baseAsset: { mint: tokenMint, symbol: tokenSymbol, decimals: tokenDelta.decimals },
      amounts,
      confidence: 100,
      protocol: tx.source || 'unknown',
      swapperIdentificationMethod: 'fee_payer',
      rentRefundsFiltered: 0,
      intermediateAssetsCollapsed: [],
    }
  }

  private buildCoreQuoteSwap(
    tx: HeliusTransaction,
    swapper: string,
    direction: 'BUY' | 'SELL',
    base: { mint: string; amount: number; decimals: number },
    quote: { mint: string; amount: number; decimals: number },
  ): ParsedSwap {
    const feeBreakdown: FeeBreakdown = {
      transactionFeeSOL: tx.fee / 1e9,
      transactionFeeQuote: 0,
      platformFee: 0,
      priorityFee: 0,
      totalFeeQuote: 0,
    }

    const baseSymbol = this.symbolForMint(base.mint)
    const quoteSymbol = this.symbolForMint(quote.mint)

    const amounts = direction === 'BUY'
      ? { totalWalletCost: quote.amount, baseAmount: base.amount, feeBreakdown }
      : { netWalletReceived: quote.amount, baseAmount: base.amount, feeBreakdown }

    return {
      signature: tx.signature,
      timestamp: tx.timestamp,
      swapper,
      direction,
      quoteAsset: { mint: quote.mint, symbol: quoteSymbol, decimals: quote.decimals },
      baseAsset: { mint: base.mint, symbol: baseSymbol, decimals: base.decimals },
      amounts,
      confidence: 100,
      protocol: tx.source || 'unknown',
      swapperIdentificationMethod: 'fee_payer',
      rentRefundsFiltered: 0,
      intermediateAssetsCollapsed: [],
    }
  }

  private buildSplitSwapPair(
    tx: HeliusTransaction,
    swapper: string,
    outgoing: { mint: string; amount: number; decimals: number },
    incoming: { mint: string; amount: number; decimals: number },
  ): SplitSwapPair {
    const feeBreakdown: FeeBreakdown = {
      transactionFeeSOL: tx.fee / 1e9,
      transactionFeeQuote: 0,
      platformFee: 0,
      priorityFee: 0,
      totalFeeQuote: 0,
    }

    const outSymbol = this.symbolForMint(outgoing.mint)
    const inSymbol = this.symbolForMint(incoming.mint)

    // SELL: sold base (outgoing), received quote (incoming)
    const sellRecord: ParsedSwap = {
      signature: tx.signature,
      timestamp: tx.timestamp,
      swapper,
      direction: 'SELL',
      quoteAsset: { mint: incoming.mint, symbol: inSymbol, decimals: incoming.decimals },
      baseAsset: { mint: outgoing.mint, symbol: outSymbol, decimals: outgoing.decimals },
      amounts: {
        netWalletReceived: 0,
        baseAmount: outgoing.amount,
        feeBreakdown,
      },
      confidence: 100,
      protocol: tx.source || 'unknown',
      swapperIdentificationMethod: 'fee_payer',
      rentRefundsFiltered: 0,
      intermediateAssetsCollapsed: [],
    }

    // BUY: spent quote (outgoing), bought base (incoming). Set totalWalletCost = quote spent (outgoing amount).
    const buyRecord: ParsedSwap = {
      signature: tx.signature,
      timestamp: tx.timestamp,
      swapper,
      direction: 'BUY',
      quoteAsset: { mint: outgoing.mint, symbol: outSymbol, decimals: outgoing.decimals },
      baseAsset: { mint: incoming.mint, symbol: inSymbol, decimals: incoming.decimals },
      amounts: {
        totalWalletCost: outgoing.amount,
        swapInputAmount: outgoing.amount,
        baseAmount: incoming.amount,
        feeBreakdown,
      },
      confidence: 100,
      protocol: tx.source || 'unknown',
      swapperIdentificationMethod: 'fee_payer',
      rentRefundsFiltered: 0,
      intermediateAssetsCollapsed: [],
    }

    return {
      signature: tx.signature,
      timestamp: tx.timestamp,
      swapper,
      splitReason: 'token_to_token_unstable_pair',
      sellRecord,
      buyRecord,
      protocol: tx.source || 'unknown',
      swapperIdentificationMethod: 'fee_payer',
    }
  }

  // --------------------------------------------------------------------------
  // ERASE helper
  // --------------------------------------------------------------------------

  private erase(
    tx: HeliusTransaction,
    reason: string,
    extra: Record<string, unknown>,
    startTime: number,
  ): ParserResult {
    const eraseResult: EraseResult = {
      signature: tx.signature || 'unknown',
      timestamp: tx.timestamp || 0,
      reason,
      debugInfo: {
        feePayer: tx.feePayer || 'unknown',
        signers: [tx.feePayer || ''],
        assetDeltas: {},
        ...extra,
      },
    }
    return {
      success: false,
      erase: eraseResult,
      processingTimeMs: Date.now() - startTime,
    }
  }

  // --------------------------------------------------------------------------
  // Utility helpers
  // --------------------------------------------------------------------------

  private symbolForMint(mint: string): string {
    if (mint === PRIORITY_ASSETS.SOL) return 'SOL'
    if (mint === PRIORITY_ASSETS.USDC) return 'USDC'
    if (mint === PRIORITY_ASSETS.USDT) return 'USDT'
    return `${mint.slice(0, 4)}...${mint.slice(-4)}`
  }

  private deltaSummary(d: AssetDeltaResult): Record<string, unknown> {
    return {
      solAmount: d.sol.amount,
      solMethod: d.sol.method,
      tokenCount: d.tokenCount,
      tokens: [...d.tokens.entries()].map(([m, td]) => ({
        mint: m.slice(0, 8),
        net: td.net,
      })),
    }
  }

  private refreshSolPriceCache(): void {
    const now = Date.now()
    if (
      !HeliusParserV3.solPriceCache ||
      now - HeliusParserV3.solPriceCache.timestamp > HeliusParserV3.SOL_PRICE_CACHE_TTL
    ) {
      this.fetchSolPrice().catch(() => {})
    } else {
      this.cachedSolPrice = HeliusParserV3.solPriceCache.price
    }
  }

  private async fetchSolPrice(): Promise<void> {
    try {
      const resp = await axios.get(
        'https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112',
        { timeout: 5000 },
      )
      const price = resp.data?.['So11111111111111111111111111111111111111112']?.usdPrice || 94
      HeliusParserV3.solPriceCache = { price, timestamp: Date.now() }
      this.cachedSolPrice = price
    } catch {
      // Keep existing cached price or default
    }
  }
}

// ============================================================================
// Classification result types (internal)
// ============================================================================

type ClassificationResult =
  | { type: 'standard'; direction: 'BUY' | 'SELL'; tokenMint: string; tokenAmount: number; solAmount: number; erase?: undefined }
  | { type: 'standard_token_quote'; direction: 'BUY' | 'SELL'; baseMint: string; baseAmount: number; baseDecimals: number; quoteMint: string; quoteAmount: number; quoteDecimals: number; erase?: undefined }
  | { type: 'split'; positiveTokens: TokenEntry[]; negativeTokens: TokenEntry[]; erase?: undefined }
  | { type: 'erase_only'; erase: string }

interface TokenEntry {
  mint: string
  amount: number
  decimals: number
}

// ============================================================================
// Factory + convenience functions
// ============================================================================

export function createHeliusParserV3(): HeliusParserV3 {
  return new HeliusParserV3()
}

export function parseHeliusTransactionV3(
  tx: HeliusTransaction,
  options?: HeliusParserOptions,
): ParserResult {
  const parser = createHeliusParserV3()
  return parser.parseTransaction(tx, options)
}
