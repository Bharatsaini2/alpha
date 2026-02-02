/**
 * SHYFT Parser V2 - QuoteBaseDetector Component
 * 
 * Purpose: Dynamically assign quote and base roles to assets
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10
 * 
 * This component implements:
 * - Two-asset gate validation
 * - Opposite delta signs validation
 * - Priority asset check (SOL, WSOL, USDC, USDT)
 * - Token-to-token split protocol
 */

import logger from './logger'
import {
  AssetDelta,
  AssetDeltaMap,
  QuoteBaseDetector,
  QuoteBaseResult,
  PRIORITY_ASSETS,
} from './shyftParserV2.types'

/**
 * Implementation of QuoteBaseDetector
 * 
 * Detects quote and base assets dynamically based on:
 * 1. Exactly 2 active assets (non-intermediate)
 * 2. Opposite delta signs (one positive, one negative)
 * 3. Priority asset presence (SOL, WSOL, USDC, USDT)
 * 4. Token-to-token split protocol when no priority asset
 */
export class QuoteBaseDetectorImpl implements QuoteBaseDetector {
  
  /**
   * Detect quote and base assets from asset delta map
   * 
   * Requirements:
   * - 3.1: Exactly 2 assets with non-zero delta after rent filtering
   * - 3.2: One asset delta positive, one negative
   * - 3.3: If one asset is SOL/WSOL/stablecoin, it's the quote asset
   * - 3.4: If one asset is SOL/WSOL/stablecoin, the other is the base asset
   * - 3.5: If neither is priority, asset with negative delta is quote
   * - 3.6: If neither is priority, asset with positive delta is base
   * 
   * @param deltaMap - Map of asset deltas with intermediate flags
   * @returns QuoteBaseResult with quote, base, direction, or ERASE reason
   */
  detectQuoteBase(deltaMap: AssetDeltaMap): QuoteBaseResult {
    logger.debug(
      { assetCount: Object.keys(deltaMap).length },
      'QuoteBaseDetector: Starting quote/base detection'
    )

    // Filter out intermediate assets (multi-hop collapse)
    const activeAssets = Object.values(deltaMap).filter(
      (asset) => !asset.isIntermediate
    )

    logger.debug(
      { 
        activeCount: activeAssets.length,
        assets: activeAssets.map(a => ({ mint: a.mint, delta: a.netDelta }))
      },
      'QuoteBaseDetector: Active assets (non-intermediate)'
    )

    // Gate 1: Exactly 2 assets required (Requirement 3.1)
    if (activeAssets.length !== 2) {
      logger.debug(
        { activeCount: activeAssets.length },
        'QuoteBaseDetector: Invalid asset count (not 2)'
      )
      return {
        quote: null,
        base: null,
        direction: null,
        eraseReason: 'invalid_asset_count',
      }
    }

    const asset1 = activeAssets[0]
    const asset2 = activeAssets[1]

    // Gate 2: Opposite delta signs required (Requirement 3.2)
    const hasOppositeSigns =
      (asset1.netDelta > 0 && asset2.netDelta < 0) ||
      (asset1.netDelta < 0 && asset2.netDelta > 0)

    if (!hasOppositeSigns) {
      logger.debug(
        {
          asset1Delta: asset1.netDelta,
          asset2Delta: asset2.netDelta,
        },
        'QuoteBaseDetector: Invalid delta signs (not opposite)'
      )
      return {
        quote: null,
        base: null,
        direction: null,
        eraseReason: 'invalid_delta_signs',
      }
    }

    // Gate 3: Same token validation (CRITICAL FIX)
    // Reject transactions where input and output tokens are the same
    if (asset1.mint === asset2.mint) {
      logger.debug(
        {
          mint: asset1.mint,
          asset1Delta: asset1.netDelta,
          asset2Delta: asset2.netDelta,
        },
        'QuoteBaseDetector: Same input/output token detected - not a swap'
      )
      return {
        quote: null,
        base: null,
        direction: null,
        eraseReason: 'same_input_output_token',
      }
    }

    // Gate 4: Meaningful amounts required (NEW FIX)
    const DUST_THRESHOLD = 0.000001
    const asset1Meaningful = Math.abs(asset1.netDelta) > DUST_THRESHOLD
    const asset2Meaningful = Math.abs(asset2.netDelta) > DUST_THRESHOLD

    if (!asset1Meaningful || !asset2Meaningful) {
      logger.debug(
        {
          asset1Delta: asset1.netDelta,
          asset2Delta: asset2.netDelta,
          dustThreshold: DUST_THRESHOLD,
        },
        'QuoteBaseDetector: One or both assets have dust amounts'
      )
      return {
        quote: null,
        base: null,
        direction: null,
        eraseReason: 'dust_amounts_detected',
      }
    }

    // Check for priority assets (SOL, WSOL, USDC, USDT)
    const priorityMints = new Set<string>(Object.values(PRIORITY_ASSETS))
    const asset1IsPriority = priorityMints.has(asset1.mint)
    const asset2IsPriority = priorityMints.has(asset2.mint)
    const hasPriorityAsset = asset1IsPriority || asset2IsPriority

    logger.debug(
      {
        asset1: { mint: asset1.mint, isPriority: asset1IsPriority },
        asset2: { mint: asset2.mint, isPriority: asset2IsPriority },
        hasPriorityAsset,
      },
      'QuoteBaseDetector: Priority asset check'
    )

    if (hasPriorityAsset) {
      // Standard Classification (1 Trade) - Requirements 3.3, 3.4
      return this.detectStandardSwap(asset1, asset2, asset1IsPriority, asset2IsPriority)
    } else {
      // Split Protocol (Token-to-Token Unstable Pair) - Requirements 3.5, 3.6
      return this.detectSplitSwap(asset1, asset2)
    }
  }

  /**
   * Detect standard swap with priority asset
   * 
   * Requirements:
   * - 3.3: Priority asset is the quote asset
   * - 3.4: Non-priority asset is the base asset
   * 
   * @param asset1 - First asset
   * @param asset2 - Second asset
   * @param asset1IsPriority - Whether asset1 is a priority asset
   * @param asset2IsPriority - Whether asset2 is a priority asset
   * @returns QuoteBaseResult with quote, base, and direction
   */
  private detectStandardSwap(
    asset1: AssetDelta,
    asset2: AssetDelta,
    asset1IsPriority: boolean,
    asset2IsPriority: boolean
  ): QuoteBaseResult {
    let quote: AssetDelta
    let base: AssetDelta

    // Assign quote and base based on priority
    // If both are priority, prefer SOL/WSOL over stablecoins
    if (asset1IsPriority && asset2IsPriority) {
      // Both are priority - prefer SOL/WSOL as quote
      if (asset1.mint === PRIORITY_ASSETS.SOL || asset1.mint === PRIORITY_ASSETS.WSOL) {
        quote = asset1
        base = asset2
      } else if (asset2.mint === PRIORITY_ASSETS.SOL || asset2.mint === PRIORITY_ASSETS.WSOL) {
        quote = asset2
        base = asset1
      } else {
        // Both are stablecoins - use first one as quote
        quote = asset1
        base = asset2
      }
    } else if (asset1IsPriority) {
      quote = asset1
      base = asset2
    } else {
      quote = asset2
      base = asset1
    }

    logger.debug(
      {
        quote: { mint: quote.mint, delta: quote.netDelta },
        base: { mint: base.mint, delta: base.netDelta },
      },
      'QuoteBaseDetector: Standard swap detected'
    )

    // Determine direction
    let direction: 'BUY' | 'SELL' | null = null

    if (quote.netDelta < 0 && base.netDelta > 0) {
      // Sold quote to buy base
      direction = 'BUY'
    } else if (quote.netDelta > 0 && base.netDelta < 0) {
      // Sold base to get quote
      direction = 'SELL'
    } else {
      logger.debug(
        {
          quoteDelta: quote.netDelta,
          baseDelta: base.netDelta,
        },
        'QuoteBaseDetector: Invalid direction (deltas do not match BUY or SELL) - will be caught by ERASE validator'
      )
      // Don't return early - return quote and base so ERASE validator can provide specific reason
      direction = null
    }

    logger.debug(
      { direction },
      'QuoteBaseDetector: Direction determined'
    )

    return {
      quote,
      base,
      direction,
      splitRequired: false,
    }
  }

  /**
   * Detect token-to-token split swap (unstable pair)
   * 
   * Requirements:
   * - 3.5: Asset with negative delta is the quote (outgoing token)
   * - 3.6: Asset with positive delta is the base (incoming token)
   * 
   * This transaction must be split into two records:
   * 1. SELL record for the outgoing token
   * 2. BUY record for the incoming token
   * 
   * Quote values will be derived from counterparty token USD/SOL values.
   * 
   * @param asset1 - First asset
   * @param asset2 - Second asset
   * @returns QuoteBaseResult with splitRequired flag
   */
  private detectSplitSwap(
    asset1: AssetDelta,
    asset2: AssetDelta
  ): QuoteBaseResult {
    // Identify outgoing (sold) and incoming (bought) tokens
    let outgoingToken: AssetDelta
    let incomingToken: AssetDelta

    if (asset1.netDelta < 0) {
      outgoingToken = asset1  // Negative delta = sold
      incomingToken = asset2  // Positive delta = bought
    } else {
      outgoingToken = asset2
      incomingToken = asset1
    }

    logger.debug(
      {
        outgoing: { mint: outgoingToken.mint, delta: outgoingToken.netDelta },
        incoming: { mint: incomingToken.mint, delta: incomingToken.netDelta },
      },
      'QuoteBaseDetector: Token-to-token split swap detected'
    )

    // For split protocol, we return the outgoing token as quote and incoming as base
    // The actual split into two records will be handled by the main parser
    return {
      quote: outgoingToken,
      base: incomingToken,
      direction: null, // Direction will be determined per record in split
      splitRequired: true,
    }
  }
}

/**
 * Factory function to create QuoteBaseDetector instance
 */
export function createQuoteBaseDetector(): QuoteBaseDetector {
  return new QuoteBaseDetectorImpl()
}
