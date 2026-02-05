/**
 * SHYFT Parser V2 - AssetDeltaCollector Component
 * 
 * Purpose: Aggregate net deltas per asset, excluding intermediate routing tokens
 * 
 * Task 5.1: Create delta aggregation logic
 * Requirements: 4.1, 4.2
 * 
 * This component:
 * 1. Aggregates balance changes by mint to calculate net deltas
 * 2. Identifies intermediate routing assets (zero net delta)
 * 3. Returns AssetDeltaMap with intermediate flags for multi-hop collapse
 */

import {
  TokenBalanceChange,
  AssetDelta,
  AssetDeltaMap,
  AssetDeltaCollector,
  EPSILON,
} from './shyftParserV2.types'
import logger from './logger'

/**
 * Implementation of AssetDeltaCollector
 * 
 * Collects and aggregates token balance changes for a specific swapper,
 * identifying intermediate routing tokens (multi-hop swaps) by their zero net delta.
 */
export class AssetDeltaCollectorImpl implements AssetDeltaCollector {
  /**
   * Collect and aggregate asset deltas from economic balance changes
   * 
   * Algorithm:
   * 1. Filter balance changes for the swapper
   * 2. Aggregate deltas by mint (sum all changes for each token)
   * 3. Mark assets with zero net delta as intermediate (multi-hop collapse)
   * 4. Return AssetDeltaMap with intermediate flags
   * 
   * @param economicChanges - Filtered balance changes (rent noise already removed)
   * @param swapper - The wallet address of the swapper
   * @param swapActions - Optional SWAP actions for fallback when balance changes are missing
   * @returns AssetDeltaMap with net deltas and intermediate flags
   */
  collectDeltas(
    economicChanges: TokenBalanceChange[],
    swapper: string,
    swapActions?: Array<{
      type: string
      info?: any
    }>
  ): AssetDeltaMap {
    logger.debug(
      { swapper, changeCount: economicChanges.length },
      'AssetDeltaCollector: Starting delta aggregation'
    )

    // CRITICAL FIX: Filter by swapper owner only
    // The spec says "economic balance changes define truth" but we need to focus on the swapper's changes
    // Other balance changes (pools, AMMs, etc.) are not relevant for the swapper's trade
    const relevantChanges = economicChanges.filter(
      (change) => change.owner === swapper
    )

    if (relevantChanges.length === 0) {
      logger.debug({ swapper }, 'AssetDeltaCollector: No economic changes for swapper')
      return {}
    }

    // Aggregate by mint
    const deltaMap: AssetDeltaMap = {}

    for (const change of relevantChanges) {
      const { mint, change_amount, decimals } = change

      if (!deltaMap[mint]) {
        // Initialize new asset entry
        deltaMap[mint] = {
          mint,
          symbol: this.getSymbolForMint(mint),
          netDelta: 0,
          decimals,
          isIntermediate: false,
        }
      }

      // Aggregate delta (sum all changes for this mint)
      deltaMap[mint].netDelta += change_amount

      logger.debug(
        {
          mint,
          change_amount,
          netDelta: deltaMap[mint].netDelta,
        },
        'AssetDeltaCollector: Aggregated delta'
      )
    }

    // CRITICAL FIX: Fallback to SWAP actions if we only have 1 asset
    // This handles cases where balance changes are incomplete/missing from SHYFT
    // 
    // ✅ REFINED LOGIC: Use fallback when we have 1 asset AND a SWAP action
    // We don't check for transfer actions because:
    // 1. Transfer actions might be fees, not the actual swap
    // 2. SHYFT sometimes has incomplete balance_changes but complete SWAP actions
    // 3. The SWAP action is more reliable for determining what was swapped
    
    logger.debug(
      { 
        swapper, 
        assetCount: Object.keys(deltaMap).length,
        hasSwapActions: swapActions && swapActions.length > 0,
        actionTypes: swapActions ? swapActions.map(a => a.type) : [],
        willUseFallback: Object.keys(deltaMap).length === 1 && swapActions && swapActions.length > 0
      },
      'AssetDeltaCollector: Checking fallback conditions'
    )
    
    if (Object.keys(deltaMap).length === 1 && swapActions && swapActions.length > 0) {
      logger.debug(
        { swapper, assetCount: Object.keys(deltaMap).length },
        'AssetDeltaCollector: Only 1 asset found, checking SWAP actions for missing asset'
      )

      // Find SWAP action for this swapper
      const swapAction = swapActions.find(
        (action) =>
          action.type === 'SWAP' &&
          action.info?.swapper === swapper &&
          action.info?.tokens_swapped
      )

      if (swapAction?.info?.tokens_swapped) {
        const tokensIn = swapAction.info.tokens_swapped.in
        const tokensOut = swapAction.info.tokens_swapped.out

        logger.debug(
          {
            swapper,
            tokensIn: tokensIn?.token_address,
            tokensOut: tokensOut?.token_address,
          },
          'AssetDeltaCollector: Found SWAP action with tokens_swapped data'
        )

        // Add missing IN token (what user sent)
        if (tokensIn && tokensIn.token_address && tokensIn.amount_raw) {
          const inMint = tokensIn.token_address
          const inAmountRaw =
            typeof tokensIn.amount_raw === 'string'
              ? parseFloat(tokensIn.amount_raw)
              : tokensIn.amount_raw
          
          // ✅ CRITICAL FIX: amount_raw is already in raw units (not normalized)
          // The amount normalizer expects raw units, so we use it directly
          // BUT we need to ensure decimals are correct
          const inDecimals = tokensIn.decimals || 9

          if (!deltaMap[inMint]) {
            deltaMap[inMint] = {
              mint: inMint,
              symbol: tokensIn.symbol || this.getSymbolForMint(inMint),
              netDelta: -inAmountRaw, // Negative because user sent it (raw units)
              decimals: inDecimals, // Use actual decimals from SWAP action
              isIntermediate: false,
            }

            logger.debug(
              {
                mint: inMint,
                symbol: deltaMap[inMint].symbol,
                netDelta: -inAmountRaw,
                decimals: inDecimals,
              },
              'AssetDeltaCollector: Added missing IN token from SWAP action'
            )
          }
        }

        // Add missing OUT token (what user received)
        if (tokensOut && tokensOut.token_address && tokensOut.amount_raw) {
          const outMint = tokensOut.token_address
          const outAmountRaw =
            typeof tokensOut.amount_raw === 'string'
              ? parseFloat(tokensOut.amount_raw)
              : tokensOut.amount_raw
          
          // ✅ CRITICAL FIX: amount_raw is already in raw units (not normalized)
          // The amount normalizer expects raw units, so we use it directly
          // BUT we need to ensure decimals are correct
          const outDecimals = tokensOut.decimals || 9

          if (!deltaMap[outMint]) {
            deltaMap[outMint] = {
              mint: outMint,
              symbol: tokensOut.symbol || this.getSymbolForMint(outMint),
              netDelta: outAmountRaw, // Positive because user received it (raw units)
              decimals: outDecimals, // Use actual decimals from SWAP action
              isIntermediate: false,
            }

            logger.debug(
              {
                mint: outMint,
                symbol: deltaMap[outMint].symbol,
                netDelta: outAmountRaw,
                decimals: outDecimals,
              },
              'AssetDeltaCollector: Added missing OUT token from SWAP action'
            )
          }
        }
      }
    }

    // CRITICAL FIX: Merge SOL and WSOL deltas FIRST (before counting assets)
    // Pump swaps create multiple SOL deltas (pool payouts, fees, rebates)
    // which makes it look like more than 2 assets. We need to merge them into one.
    const SOL_MINT = 'So11111111111111111111111111111111111111112'
    const WSOL_MINT = 'So11111111111111111111111111111111111111112' // Same as SOL
    
    let totalSolDelta = 0
    // ✅ FIX: SOL and WSOL have the same mint address, so only check once
    // Using both in the array was causing double-counting (2x multiplication bug)
    const solMints = [SOL_MINT] // Only need to check once since SOL_MINT === WSOL_MINT
    
    // Sum all SOL/WSOL deltas
    for (const mint of solMints) {
      if (deltaMap[mint]) {
        totalSolDelta += deltaMap[mint].netDelta
        logger.debug(
          { mint, delta: deltaMap[mint].netDelta, totalSolDelta },
          'AssetDeltaCollector: Accumulating SOL/WSOL delta'
        )
      }
    }
    
    // Remove individual SOL/WSOL entries
    for (const mint of solMints) {
      if (deltaMap[mint]) {
        delete deltaMap[mint]
      }
    }
    
    // Add single merged SOL entry
    if (Math.abs(totalSolDelta) > EPSILON) {
      deltaMap[SOL_MINT] = {
        mint: SOL_MINT,
        symbol: 'SOL',
        netDelta: totalSolDelta,
        decimals: 9,
        isIntermediate: false,
      }
      
      logger.debug(
        { totalSolDelta },
        'AssetDeltaCollector: Merged all SOL/WSOL deltas into single SOL entry'
      )
    }

    // Mark intermediates (multi-hop collapse)
    // An asset is intermediate if its net delta is effectively zero
    for (const [mint, asset] of Object.entries(deltaMap)) {
      if (Math.abs(asset.netDelta) < EPSILON) {
        asset.isIntermediate = true
        logger.debug(
          { mint, netDelta: asset.netDelta },
          'AssetDeltaCollector: Marked as intermediate (zero net delta)'
        )
      }
    }

    // CRITICAL FIX: Enhanced multi-hop collapse for 3+ asset swaps
    // If we have more than 2 active assets after zero-delta filtering,
    // identify entry/exit assets and mark middle tokens as intermediate
    const activeAssets = Object.values(deltaMap).filter(a => !a.isIntermediate)
    
    if (activeAssets.length > 2) {
      logger.debug(
        { 
          activeCount: activeAssets.length,
          assets: activeAssets.map(a => ({ mint: a.mint, delta: a.netDelta, symbol: a.symbol }))
        },
        'AssetDeltaCollector: More than 2 active assets detected - applying enhanced multi-hop collapse'
      )

      // Find entry asset (largest negative delta = what user spent)
      const negativeAssets = activeAssets.filter(a => a.netDelta < 0)
      const entryAsset = negativeAssets.reduce((max, asset) => 
        Math.abs(asset.netDelta) > Math.abs(max.netDelta) ? asset : max
      , negativeAssets[0])

      // Find exit asset (largest positive delta = what user received)
      const positiveAssets = activeAssets.filter(a => a.netDelta > 0)
      const exitAsset = positiveAssets.reduce((max, asset) => 
        Math.abs(asset.netDelta) > Math.abs(max.netDelta) ? asset : max
      , positiveAssets[0])

      if (entryAsset && exitAsset) {
        // Mark all other assets as intermediate (routing tokens)
        for (const [mint, asset] of Object.entries(deltaMap)) {
          if (mint !== entryAsset.mint && mint !== exitAsset.mint && !asset.isIntermediate) {
            asset.isIntermediate = true
            logger.debug(
              { 
                mint, 
                symbol: asset.symbol,
                netDelta: asset.netDelta,
                reason: 'multi_hop_routing_token'
              },
              'AssetDeltaCollector: Marked as intermediate (multi-hop routing token)'
            )
          }
        }

        logger.debug(
          {
            entryAsset: { mint: entryAsset.mint, symbol: entryAsset.symbol, delta: entryAsset.netDelta },
            exitAsset: { mint: exitAsset.mint, symbol: exitAsset.symbol, delta: exitAsset.netDelta },
            intermediateCount: Object.values(deltaMap).filter(a => a.isIntermediate).length
          },
          'AssetDeltaCollector: Enhanced multi-hop collapse complete - identified entry/exit assets'
        )
      }
    }

    logger.debug(
      {
        assetCount: Object.keys(deltaMap).length,
        activeCount: Object.values(deltaMap).filter(a => !a.isIntermediate).length,
        intermediateCount: Object.values(deltaMap).filter((a) => a.isIntermediate).length,
      },
      'AssetDeltaCollector: Delta aggregation complete'
    )

    return deltaMap
  }

  /**
   * Get symbol for a mint address
   * 
   * This is a simplified implementation that returns known symbols.
   * In production, this would query a token metadata service.
   * 
   * @param mint - Token mint address
   * @returns Token symbol or shortened mint address
   */
  private getSymbolForMint(mint: string): string {
    // Known token symbols
    const knownSymbols: { [mint: string]: string } = {
      'So11111111111111111111111111111111111111112': 'SOL',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
    }

    if (knownSymbols[mint]) {
      return knownSymbols[mint]
    }

    // Return shortened mint address as fallback
    return `${mint.slice(0, 4)}...${mint.slice(-4)}`
  }
}

/**
 * Factory function to create AssetDeltaCollector instance
 */
export function createAssetDeltaCollector(): AssetDeltaCollector {
  return new AssetDeltaCollectorImpl()
}

