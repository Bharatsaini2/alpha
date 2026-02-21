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

// ============================================================================
// Core Data Types
// ============================================================================

/**
 * Token balance change record from SHYFT API (or Helius adapter).
 * When the upstream (e.g. SHYFT) provides symbol/name, we use it; otherwise
 * the parser uses getSymbolForMint (SOL/USDC/USDT or shortened). Helius does
 * NOT return token symbol/name – we backfill via Birdeye in resolveSymbol().
 */
export interface TokenBalanceChange {
  address: string
  decimals: number
  change_amount: number
  post_balance: number
  pre_balance: number
  mint: string
  owner: string
  /** Optional: set by SHYFT (or other sources); when missing we use Birdeye/fallback in the controller */
  symbol?: string
  name?: string
}

/**
 * Asset delta with metadata
 */
export interface AssetDelta {
  mint: string
  symbol: string
  netDelta: number
  decimals: number
  isIntermediate: boolean
}

/**
 * Map of mint address to asset delta
 */
export interface AssetDeltaMap {
  [mint: string]: AssetDelta
}

/**
 * Fee data from transaction
 */
export interface FeeData {
  transactionFee: number  // SOL
  platformFee?: number    // In quote asset
  priorityFee?: number    // SOL
}

/**
 * Fee breakdown in quote asset terms
 */
export interface FeeBreakdown {
  transactionFeeSOL: number
  transactionFeeQuote: number  // Converted to quote asset
  platformFee: number
  priorityFee: number
  totalFeeQuote: number
}

// ============================================================================
// Component Interfaces
// ============================================================================

/**
 * RentRefundFilter Component
 * 
 * Purpose: Identify and flag non-economic SOL rent refunds
 * Requirement: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */
export interface RentRefundFilter {
  filterRentNoise(
    balanceChanges: TokenBalanceChange[],
    swapperAddress: string
  ): FilteredBalanceChanges
}

export interface FilteredBalanceChanges {
  economicChanges: TokenBalanceChange[]
  rentRefunds: TokenBalanceChange[]
}

/**
 * SwapperIdentifier Component
 * 
 * Purpose: Determine the actual swapper wallet using escalation logic
 * Requirement: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10
 */
export interface SwapperIdentifier {
  identifySwapper(
    feePayer: string,
    signers: string[],
    tokenBalanceChanges: TokenBalanceChange[]
  ): SwapperResult
}

export interface SwapperResult {
  swapper: string | null
  confidence: 'high' | 'medium' | 'low'
  method: 'fee_payer' | 'signer' | 'owner_analysis' | 'erase'
}

/**
 * AssetDeltaCollector Component
 * 
 * Purpose: Aggregate net deltas per asset, excluding intermediate routing tokens
 * Requirement: 4.1, 4.2, 4.3
 */
export interface AssetDeltaCollector {
  collectDeltas(
    economicChanges: TokenBalanceChange[],
    swapper: string,
    swapActions?: Array<{
      type: string
      info?: any
    }>
  ): AssetDeltaMap
}

/**
 * QuoteBaseDetector Component
 * 
 * Purpose: Dynamically assign quote and base roles to assets
 * Requirement: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10
 */
export interface QuoteBaseDetector {
  detectQuoteBase(deltaMap: AssetDeltaMap): QuoteBaseResult
}

export interface QuoteBaseResult {
  quote: AssetDelta | null
  base: AssetDelta | null
  direction: 'BUY' | 'SELL' | null
  splitRequired?: boolean
  eraseReason?: string
}

/**
 * EraseValidator Component
 * 
 * Purpose: Apply strict rules to reject non-swap transactions
 * Requirement: 5.1, 5.2, 5.3, 5.4, 5.5
 */
export interface EraseValidator {
  validate(quote: AssetDelta, base: AssetDelta): ValidationResult
}

export interface ValidationResult {
  isValid: boolean
  eraseReason?: string
}

/**
 * AmountNormalizer Component
 * 
 * Purpose: Calculate both swap amounts and total wallet costs
 * Requirement: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
 */
export interface AmountNormalizer {
  normalize(
    quote: AssetDelta,
    base: AssetDelta,
    direction: 'BUY' | 'SELL',
    fees: FeeData
  ): NormalizedAmounts
}

export interface NormalizedAmounts {
  // For BUY
  swapInputAmount?: number      // Quote sent to pool
  totalWalletCost?: number      // Input + all fees in quote terms
  
  // For SELL
  swapOutputAmount?: number     // Quote received from pool (gross)
  netWalletReceived?: number    // Output - all fees in quote terms
  
  // Common
  baseAmount: number            // Base asset amount (always positive)
  feeBreakdown: FeeBreakdown
}

// ============================================================================
// Output Schema Types
// ============================================================================

/**
 * Parsed swap result (standard single trade)
 * Requirement: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.11
 */
export interface ParsedSwap {
  signature: string
  timestamp: number
  swapper: string
  direction: 'BUY' | 'SELL'
  
  // Assets
  quoteAsset: {
    mint: string
    symbol: string
    decimals: number
  }
  baseAsset: {
    mint: string
    symbol: string
    decimals: number
  }
  
  // Amounts
  amounts: {
    // For BUY
    swapInputAmount?: number
    totalWalletCost?: number
    
    // For SELL
    swapOutputAmount?: number
    netWalletReceived?: number
    
    // Common
    baseAmount: number
    feeBreakdown: FeeBreakdown
  }
  
  // Metadata
  confidence: number
  protocol: string
  swapperIdentificationMethod: 'fee_payer' | 'signer' | 'owner_analysis'
  
  // Debug info
  rentRefundsFiltered: number
  intermediateAssetsCollapsed: string[]
}

/**
 * Split swap pair for token-to-token unstable pairs
 * Requirement: 3.5, 3.6, 4.6
 */
export interface SplitSwapPair {
  signature: string
  timestamp: number
  swapper: string
  splitReason: 'token_to_token_unstable_pair'
  
  // Two distinct records
  sellRecord: ParsedSwap  // The SELL of the outgoing token
  buyRecord: ParsedSwap   // The BUY of the incoming token
  
  // Metadata
  protocol: string
  swapperIdentificationMethod: 'fee_payer' | 'signer' | 'owner_analysis'
}

/**
 * ERASE result for rejected transactions
 * Requirement: 5.4, 5.5, 8.10
 */
export interface EraseResult {
  signature: string
  timestamp: number
  reason: string
  debugInfo: {
    feePayer: string
    signers: string[]
    assetDeltas: AssetDeltaMap
    [key: string]: any  // Allow additional debug fields like validationError, error, etc.
  }
}

/**
 * Parser output union type
 */
export type ParserOutput = ParsedSwap | SplitSwapPair | EraseResult

/**
 * Parser result wrapper
 * Requirement: 7.1
 */
export interface ParserResult {
  success: boolean
  data?: ParsedSwap | SplitSwapPair
  erase?: EraseResult
  processingTimeMs: number
  performanceMetrics?: {
    totalMs: number
    components: Array<{
      component: string
      durationMs: number
    }>
    signature: string
    timestamp: number
  }
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Known priority assets (SOL, WSOL, stablecoins)
 */
export const PRIORITY_ASSETS = {
  SOL: 'So11111111111111111111111111111111111111112',
  WSOL: 'So11111111111111111111111111111111111111112', // SHYFT normalizes WSOL to SOL
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
} as const

/**
 * Epsilon for zero detection in floating point comparisons
 */
export const EPSILON = 1e-9

/**
 * Rent noise threshold (0.01 SOL)
 */
export const RENT_NOISE_THRESHOLD_SOL = 0.01

/**
 * Known AMM pool addresses to exclude from swapper identification
 */
export const KNOWN_AMM_POOLS = new Set([
  // Raydium
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
  // Orca
  '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  // Jupiter
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
])

/**
 * Type guard to check if output is ParsedSwap
 */
export function isParsedSwap(output: ParserOutput): output is ParsedSwap {
  return 'direction' in output && !('splitReason' in output)
}

/**
 * Type guard to check if output is SplitSwapPair
 */
export function isSplitSwapPair(output: ParserOutput): output is SplitSwapPair {
  return 'splitReason' in output
}

/**
 * Type guard to check if output is EraseResult
 */
export function isEraseResult(output: ParserOutput): output is EraseResult {
  return 'reason' in output && 'debugInfo' in output
}
