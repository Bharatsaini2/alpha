/**
 * SHYFT Parser V2 - QuoteBaseDetector Component
 * 
 * Purpose: Dynamically assign quote and base roles to assets
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10
 * 
 * This component implements:
 * - Two-asset gate validation
 * - Opposite delta signs validation
 * - Core token check (30 core tokens including SOL, stablecoins, LSTs, BTC, ETH)
 * - Token-to-token split protocol (only when BOTH tokens are non-core)
 */

import logger from './logger'
import {
  AssetDelta,
  AssetDeltaMap,
  QuoteBaseDetector,
  QuoteBaseResult,
  PRIORITY_ASSETS,
} from './shyftParserV2.types'
import { getCoreTokenSuppressionService } from '../services/core-token-suppression.service'

// Get core token list (30 tokens)
const DEFAULT_CORE_TOKENS = [
  'So11111111111111111111111111111111111111112', // SOL
  'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', // jupSOL
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', // bSOL
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj', // stSOL
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // jitoSOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo', // PYUSD
  'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA', // USDS
  'EjmyN6qEC1Tf1JxiG1ae7UTJhUxSwk1TCWNWqxWV4J6o', // DAI
  '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH', // USDG
  'JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD', // JupUSD
  '7kbnvuGBxxj8AG9qp8Scn56muWGaRaFqxg1FsRp3PaFT', // UXD
  'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB', // USD1
  'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr', // EURC
  'star9agSpjiFe3M49B3RniVU4CMBBEK3Qnaqn3RGiFM', // USD*
  'USX6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG', // USX
  'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH', // CASH
  'hyUSD5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E', // hyUSD
  'AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUjY', // syrupUSDC
  'Sj14XLJZSVMcUYpAfajdZRpnfHUpJieZHS4aPektLWvh', // SjlUSD
  'G9fvHrYNw1A8Evpcj7X2yy4k4fT7nNHcA9L6UsamNHAif', // GjlUSD
  '9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D', // jlUSDC
  '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4', // JLP
  'JUICED7GxATsNMnaC88vdwd2t3mwrFuQwwGvmYPrUQ4D6FotXk', // JUICED
  'zBTCug3er3tLyffELcvDNrKkCymbPWysGcWihESYfLg', // zBTC
  'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', // cbBTC
  '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E', // wBTC
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // wETH
]

const coreTokenService = getCoreTokenSuppressionService(DEFAULT_CORE_TOKENS, true)

/**
 * SOL-equivalent tokens (LSTs and wrapped SOL)
 * These should all be treated as SOL for asset counting and normalization
 */
const SOL_EQUIVALENTS = new Set([
  PRIORITY_ASSETS.SOL,
  PRIORITY_ASSETS.WSOL,
  'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', // jupSOL
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1',  // bSOL
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',  // mSOL
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj',  // stSOL
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',  // jitoSOL
])

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
   * Normalize all SOL-equivalent tokens (SOL, WSOL, LSTs) into a single SOL value
   * AND filter out dust amounts
   * 
   * CRITICAL FIX: PUMP.fun and Jupiter often route through LSTs (jupSOL, bSOL, mSOL, stSOL)
   * These create multiple "SOL-like" deltas that should be treated as a single SOL asset.
   * 
   * Also filters out:
   * - Temporary WSOL accounts with near-zero balance
   * - Fee rebates with dust amounts
   * - Route tokens with net-zero deltas
   * 
   * This method:
   * 1. Identifies all SOL-equivalent assets (SOL, WSOL, jupSOL, bSOL, mSOL, stSOL, jitoSOL)
   * 2. Merges their deltas into a single SOL asset
   * 3. Removes assets with dust amounts (< 0.000001 normalized)
   * 4. Returns the normalized asset list
   * 
   * @param assets - List of active assets
   * @returns Normalized list with all SOL-equivalents merged and dust filtered
   */
  private normalizeCoreSol(assets: AssetDelta[]): AssetDelta[] {
    const DUST_THRESHOLD = 0.000001 // Dust threshold for normalized amounts
    
    // Separate SOL-equivalent assets from others
    const solLikeAssets = assets.filter(a => SOL_EQUIVALENTS.has(a.mint))
    const otherAssets = assets.filter(a => !SOL_EQUIVALENTS.has(a.mint))

    // Filter out dust from other assets FIRST
    const meaningfulOtherAssets = otherAssets.filter(a => {
      const normalizedDelta = Math.abs(a.netDelta) / Math.pow(10, a.decimals)
      return normalizedDelta > DUST_THRESHOLD
    })

    // If no SOL-equivalent assets, return filtered other assets
    if (solLikeAssets.length === 0) {
      logger.debug(
        {
          beforeCount: otherAssets.length,
          afterCount: meaningfulOtherAssets.length,
          filtered: otherAssets.length - meaningfulOtherAssets.length,
        },
        'QuoteBaseDetector: Filtered dust amounts (no SOL assets)'
      )
      return meaningfulOtherAssets
    }

    // Merge all SOL-equivalent deltas into a single SOL asset
    const totalSolDelta = solLikeAssets.reduce((sum, asset) => sum + asset.netDelta, 0)

    logger.debug(
      {
        solLikeCount: solLikeAssets.length,
        individualDeltas: solLikeAssets.map(a => ({ 
          mint: a.mint.substring(0, 8) + '...', 
          symbol: a.symbol,
          delta: a.netDelta 
        })),
        totalSolDelta,
      },
      'QuoteBaseDetector: Merging SOL-equivalent assets (SOL/WSOL/LSTs)'
    )

    // Create merged SOL asset
    const mergedSol: AssetDelta = {
      mint: PRIORITY_ASSETS.SOL,
      symbol: 'SOL',
      netDelta: totalSolDelta,
      decimals: 9,
      isIntermediate: false,
    }

    // Check if merged SOL is meaningful
    const solNormalizedDelta = Math.abs(totalSolDelta) / Math.pow(10, 9)
    const solIsMeaningful = solNormalizedDelta > DUST_THRESHOLD

    // Combine meaningful assets
    const normalized = [
      ...(solIsMeaningful ? [mergedSol] : []),
      ...meaningfulOtherAssets
    ]

    logger.debug(
      {
        beforeCount: assets.length,
        afterCount: normalized.length,
        dustFiltered: assets.length - normalized.length,
        normalizedAssets: normalized.map(a => ({ 
          mint: a.mint.substring(0, 8) + '...', 
          symbol: a.symbol,
          delta: a.netDelta,
          normalizedDelta: Math.abs(a.netDelta) / Math.pow(10, a.decimals)
        })),
      },
      'QuoteBaseDetector: Core SOL normalization and dust filtering complete'
    )

    return normalized
  }

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
    let activeAssets = Object.values(deltaMap).filter(
      (asset) => !asset.isIntermediate
    )

    logger.debug(
      { 
        activeCount: activeAssets.length,
        assets: activeAssets.map(a => ({ mint: a.mint, delta: a.netDelta }))
      },
      'QuoteBaseDetector: Active assets (non-intermediate)'
    )

    // CRITICAL FIX: Normalize SOL-equivalents (SOL/WSOL/LSTs) BEFORE asset count check
    // PUMP.fun and Jupiter often route through LSTs (jupSOL, bSOL, mSOL, stSOL, jitoSOL)
    // These create multiple "SOL-like" deltas that should be treated as a single SOL asset
    activeAssets = this.normalizeCoreSol(activeAssets)

    logger.debug(
      { 
        normalizedCount: activeAssets.length,
        assets: activeAssets.map(a => ({ mint: a.mint, delta: a.netDelta }))
      },
      'QuoteBaseDetector: After SOL/WSOL normalization'
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

    // Check for core tokens (30 tokens including SOL, stablecoins, LSTs, BTC, ETH)
    // If at least one token is core, it's a standard swap (BUY/SELL)
    // If both are non-core, it's a split swap (token-to-token)
    const asset1IsCore = coreTokenService.isCoreToken(asset1.mint)
    const asset2IsCore = coreTokenService.isCoreToken(asset2.mint)
    const hasCoreToken = asset1IsCore || asset2IsCore

    logger.debug(
      {
        asset1: { mint: asset1.mint, isCore: asset1IsCore },
        asset2: { mint: asset2.mint, isCore: asset2IsCore },
        hasCoreToken,
      },
      'QuoteBaseDetector: Core token check'
    )

    if (hasCoreToken) {
      // Standard Classification (1 Trade) - at least one token is core
      return this.detectStandardSwap(asset1, asset2, asset1IsCore, asset2IsCore)
    } else {
      // Split Protocol (Token-to-Token) - both tokens are non-core
      return this.detectSplitSwap(asset1, asset2)
    }
  }

  /**
   * Detect standard swap with core token
   * 
   * Requirements:
   * - 3.3: Core token is the quote asset
   * - 3.4: Non-core token is the base asset
   * 
   * @param asset1 - First asset
   * @param asset2 - Second asset
   * @param asset1IsCore - Whether asset1 is a core token
   * @param asset2IsCore - Whether asset2 is a core token
   * @returns QuoteBaseResult with quote, base, and direction
   */
  private detectStandardSwap(
    asset1: AssetDelta,
    asset2: AssetDelta,
    asset1IsCore: boolean,
    asset2IsCore: boolean
  ): QuoteBaseResult {
    let quote: AssetDelta
    let base: AssetDelta

    // Assign quote and base based on core token status
    // If both are core, prefer SOL/WSOL over stablecoins
    if (asset1IsCore && asset2IsCore) {
      // Both are core - prefer SOL/WSOL as quote
      if (asset1.mint === PRIORITY_ASSETS.SOL || asset1.mint === PRIORITY_ASSETS.WSOL) {
        quote = asset1
        base = asset2
      } else if (asset2.mint === PRIORITY_ASSETS.SOL || asset2.mint === PRIORITY_ASSETS.WSOL) {
        quote = asset2
        base = asset1
      } else {
        // Both are non-SOL core tokens - use first one as quote
        quote = asset1
        base = asset2
      }
    } else if (asset1IsCore) {
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
      'QuoteBaseDetector: Initial quote/base assignment'
    )

    // Determine direction
    // Market convention:
    // - Quote = pricing currency (SOL, USDC) - the priority asset
    // - Base = asset being traded (the token)
    // 
    // For BUY: User spends quote (SOL/USDC) to buy base (token)
    //   - quote.netDelta < 0 (spending SOL/USDC)
    //   - base.netDelta > 0 (receiving token)
    // 
    // For SELL: User sells base (token) to receive quote (SOL/USDC)
    //   - quote.netDelta > 0 (receiving SOL/USDC)
    //   - base.netDelta < 0 (selling token)
    let direction: 'BUY' | 'SELL' | null = null

    if (quote.netDelta < 0 && base.netDelta > 0) {
      // Spent quote (SOL/USDC) to buy base (token)
      direction = 'BUY'
      logger.debug(
        {
          quote: { mint: quote.mint, delta: quote.netDelta },
          base: { mint: base.mint, delta: base.netDelta },
        },
        'QuoteBaseDetector: BUY detected - user spent quote to buy base'
      )
    } else if (quote.netDelta > 0 && base.netDelta < 0) {
      // Sold base (token) to receive quote (SOL/USDC)
      direction = 'SELL'
      logger.debug(
        {
          quote: { mint: quote.mint, delta: quote.netDelta },
          base: { mint: base.mint, delta: base.netDelta },
        },
        'QuoteBaseDetector: SELL detected - user sold base to receive quote'
      )
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
      { 
        direction,
        finalQuote: { mint: quote.mint, delta: quote.netDelta },
        finalBase: { mint: base.mint, delta: base.netDelta }
      },
      'QuoteBaseDetector: Direction determined and quote/base finalized'
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
