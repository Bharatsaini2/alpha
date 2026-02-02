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
   * @returns AssetDeltaMap with net deltas and intermediate flags
   */
  collectDeltas(
    economicChanges: TokenBalanceChange[],
    swapper: string
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

    logger.debug(
      {
        assetCount: Object.keys(deltaMap).length,
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

