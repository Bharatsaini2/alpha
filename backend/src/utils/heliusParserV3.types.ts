/**
 * Helius Parser V3 — Type Definitions
 *
 * Input types for the Helius Enhanced Transaction API and internal
 * delta-collector output types. Output schema types (ParsedSwap,
 * SplitSwapPair, EraseResult, ParserResult) are re-exported from
 * the V2 types module so every downstream consumer stays compatible.
 */

// Re-export output types that V3 shares with V2
export type {
  ParsedSwap,
  SplitSwapPair,
  EraseResult,
  ParserResult,
  ParserOutput,
  FeeBreakdown,
  NormalizedAmounts,
  AssetDelta,
  AssetDeltaMap,
} from './shyftParserV2.types'

export {
  PRIORITY_ASSETS,
  EPSILON,
  isParsedSwap,
  isSplitSwapPair,
  isEraseResult,
} from './shyftParserV2.types'

// ============================================================================
// Helius Enhanced Transaction API — Input Types
// ============================================================================

export interface HeliusTransaction {
  signature: string
  timestamp: number
  fee: number
  feePayer: string
  type: string              // DO NOT use for swap detection
  source: string            // DEX label: PUMP_AMM, JUPITER, PUMP_FUN, RAYDIUM_CP_SWAP, etc.
  transactionError: string | null
  tokenTransfers: HeliusTokenTransfer[]
  accountData: HeliusAccountData[]
  nativeTransfers: HeliusNativeTransfer[]
  instructions: unknown[]
  events: Record<string, unknown>
  description: string
  slot: number
}

export interface HeliusTokenTransfer {
  fromTokenAccount: string
  toTokenAccount: string
  fromUserAccount: string   // Owner wallet address — use this
  toUserAccount: string     // Owner wallet address — use this
  tokenAmount: number       // ALREADY human-readable (pre-divided by decimals)
  mint: string
  tokenStandard: string
}

export interface HeliusNativeTransfer {
  fromUserAccount: string
  toUserAccount: string
  amount: number            // Lamports
}

export interface HeliusAccountData {
  account: string
  nativeBalanceChange: number   // Lamports, signed. Positive = received SOL.
  tokenBalanceChanges: HeliusTokenBalanceChange[]
}

export interface HeliusTokenBalanceChange {
  userAccount: string
  tokenAccount: string
  rawTokenAmount: {
    tokenAmount: string     // RAW integer string — MUST divide by 10^decimals
    decimals: number
  }
  mint: string
}

// ============================================================================
// Delta Collector Output Types
// ============================================================================

export interface TokenDelta {
  mint: string
  net: number               // Human-readable net delta (positive = received)
  grossIn: number           // Total received by swapper (unsigned)
  grossOut: number          // Total sent by swapper (unsigned)
  decimals: number          // 0 when sourced from tokenTransfers (no decimals available)
  source: 'token_transfers' | 'account_data'
}

export interface AssetDeltaResult {
  sol: {
    amount: number             // In SOL (not lamports)
    amountLamports: number
    method: 'wsol_transfers' | 'native_balance' | 'none'
    direction: 'in' | 'out' | 'none'
    wsolIn: number             // Total WSOL received by swapper
    wsolOut: number            // Total WSOL sent by swapper
  }

  tokens: Map<string, TokenDelta>

  /** Tokens with net ≈ 0 but significant gross in/out — multi-hop intermediaries */
  intermediateTokens: Map<string, TokenDelta>

  nativeBalanceChange: number   // Raw lamports (signed)
  hasSignificantSol: boolean
  hasWsolTransfers: boolean
  tokenCount: number
  swapper: string
}

// ============================================================================
// Parser Options
// ============================================================================

export interface HeliusParserOptions {
  hintSwapper?: string
}

// ============================================================================
// Constants
// ============================================================================

export const SOL_MINT = 'So11111111111111111111111111111111111111112'
export const MIN_SOL_LAMPORTS = 1_000_000  // 0.001 SOL
export const DUST_THRESHOLD = 1e-9
