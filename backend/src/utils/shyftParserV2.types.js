"use strict";
/**
 * SHYFT Parser V2 - Type Definitions
 *
 * This file contains all TypeScript interfaces and types for the v2 parser components.
 * These interfaces support enhanced swap detection with:
 * - Rent refund noise filtering
 * - Relayer-proof swapper identification
 * - Dynamic quote/base asset detection
 * - Multi-hop route collapse
 * - Token-to-token split protocol
 * - Stricter ERASE validation
 * - Enhanced amount normalization
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KNOWN_AMM_POOLS = exports.RENT_NOISE_THRESHOLD_SOL = exports.EPSILON = exports.PRIORITY_ASSETS = void 0;
exports.isParsedSwap = isParsedSwap;
exports.isSplitSwapPair = isSplitSwapPair;
exports.isEraseResult = isEraseResult;
// ============================================================================
// Constants
// ============================================================================
/**
 * Known priority assets (SOL, WSOL, stablecoins)
 */
exports.PRIORITY_ASSETS = {
    SOL: 'So11111111111111111111111111111111111111112',
    WSOL: 'So11111111111111111111111111111111111111112', // SHYFT normalizes WSOL to SOL
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
};
/**
 * Epsilon for zero detection in floating point comparisons
 */
exports.EPSILON = 1e-9;
/**
 * Rent noise threshold (0.01 SOL)
 */
exports.RENT_NOISE_THRESHOLD_SOL = 0.01;
/**
 * Known AMM pool addresses to exclude from swapper identification
 */
exports.KNOWN_AMM_POOLS = new Set([
    // Raydium
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
    // Orca
    '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
    // Jupiter
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
]);
/**
 * Type guard to check if output is ParsedSwap
 */
function isParsedSwap(output) {
    return 'direction' in output && !('splitReason' in output);
}
/**
 * Type guard to check if output is SplitSwapPair
 */
function isSplitSwapPair(output) {
    return 'splitReason' in output;
}
/**
 * Type guard to check if output is EraseResult
 */
function isEraseResult(output) {
    return 'reason' in output && 'debugInfo' in output;
}
