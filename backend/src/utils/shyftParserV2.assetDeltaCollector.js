"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssetDeltaCollectorImpl = void 0;
exports.createAssetDeltaCollector = createAssetDeltaCollector;
var shyftParserV2_types_1 = require("./shyftParserV2.types");
var logger_1 = __importDefault(require("./logger"));
/**
 * Implementation of AssetDeltaCollector
 *
 * Collects and aggregates token balance changes for a specific swapper,
 * identifying intermediate routing tokens (multi-hop swaps) by their zero net delta.
 */
var AssetDeltaCollectorImpl = /** @class */ (function () {
    function AssetDeltaCollectorImpl() {
    }
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
    AssetDeltaCollectorImpl.prototype.collectDeltas = function (economicChanges, swapper) {
        logger_1.default.debug({ swapper: swapper, changeCount: economicChanges.length }, 'AssetDeltaCollector: Starting delta aggregation');
        // DON'T filter by owner - collect ALL economic changes
        // The swapper identification (Stage 1) and rent filtering (Stage 2) already happened
        // Balance changes can have different owners (pools, AMMs, relayers, etc.)
        // This is the key fix for AMM swap detection - V1 bug was filtering by owner
        var relevantChanges = economicChanges;
        if (relevantChanges.length === 0) {
            logger_1.default.debug({ swapper: swapper }, 'AssetDeltaCollector: No economic changes');
            return {};
        }
        // Aggregate by mint
        var deltaMap = {};
        for (var _i = 0, relevantChanges_1 = relevantChanges; _i < relevantChanges_1.length; _i++) {
            var change = relevantChanges_1[_i];
            var mint = change.mint, change_amount = change.change_amount, decimals = change.decimals;
            if (!deltaMap[mint]) {
                // Initialize new asset entry
                deltaMap[mint] = {
                    mint: mint,
                    symbol: this.getSymbolForMint(mint),
                    netDelta: 0,
                    decimals: decimals,
                    isIntermediate: false,
                };
            }
            // Aggregate delta (sum all changes for this mint)
            deltaMap[mint].netDelta += change_amount;
            logger_1.default.debug({
                mint: mint,
                change_amount: change_amount,
                netDelta: deltaMap[mint].netDelta,
            }, 'AssetDeltaCollector: Aggregated delta');
        }
        // Mark intermediates (multi-hop collapse)
        // An asset is intermediate if its net delta is effectively zero
        for (var _a = 0, _b = Object.entries(deltaMap); _a < _b.length; _a++) {
            var _c = _b[_a], mint = _c[0], asset = _c[1];
            if (Math.abs(asset.netDelta) < shyftParserV2_types_1.EPSILON) {
                asset.isIntermediate = true;
                logger_1.default.debug({ mint: mint, netDelta: asset.netDelta }, 'AssetDeltaCollector: Marked as intermediate (zero net delta)');
            }
        }
        logger_1.default.debug({
            assetCount: Object.keys(deltaMap).length,
            intermediateCount: Object.values(deltaMap).filter(function (a) { return a.isIntermediate; }).length,
        }, 'AssetDeltaCollector: Delta aggregation complete');
        return deltaMap;
    };
    /**
     * Get symbol for a mint address
     *
     * This is a simplified implementation that returns known symbols.
     * In production, this would query a token metadata service.
     *
     * @param mint - Token mint address
     * @returns Token symbol or shortened mint address
     */
    AssetDeltaCollectorImpl.prototype.getSymbolForMint = function (mint) {
        // Known token symbols
        var knownSymbols = {
            'So11111111111111111111111111111111111111112': 'SOL',
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
            'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
        };
        if (knownSymbols[mint]) {
            return knownSymbols[mint];
        }
        // Return shortened mint address as fallback
        return "".concat(mint.slice(0, 4), "...").concat(mint.slice(-4));
    };
    return AssetDeltaCollectorImpl;
}());
exports.AssetDeltaCollectorImpl = AssetDeltaCollectorImpl;
/**
 * Factory function to create AssetDeltaCollector instance
 */
function createAssetDeltaCollector() {
    return new AssetDeltaCollectorImpl();
}
