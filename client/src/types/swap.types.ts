/**
 * TypeScript type definitions for Jupiter Swap functionality
 * Provides comprehensive type safety for swap operations
 */

// ============================================================================
// Token Types
// ============================================================================

export interface TokenInfo {
  address: string
  symbol: string
  name: string
  decimals: number
  logoURI?: string
  balance?: number
  balanceRaw?: string
  price?: number
  verified?: boolean
  tags?: string[]
}

export interface TokenBalance {
  mint: string
  amount: number
  decimals: number
  uiAmount: number
  symbol?: string
  name?: string
  logoURI?: string
}

// ============================================================================
// Quote Types
// ============================================================================

export interface QuoteParams {
  inputMint: string
  outputMint: string
  amount: number
  slippageBps?: number
}

export interface PlatformFee {
  amount: string
  mint: string
  pct: number
}

export interface QuoteResponse {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  otherAmountThreshold: string
  swapMode: string
  slippageBps: number
  platformFee?: PlatformFee
  priceImpactPct: string
  routePlan: Array<any>
}

// ============================================================================
// Swap Transaction Types
// ============================================================================

export interface SwapParams {
  quoteResponse: QuoteResponse
  userPublicKey: string
  wrapUnwrapSOL?: boolean
  prioritizationFeeLamports?: number
}

export interface SwapTransactionResponse {
  swapTransaction: string
  lastValidBlockHeight: number
}

// ============================================================================
// Trade Tracking Types
// ============================================================================

export interface TrackTradeParams {
  signature: string
  walletAddress: string
  inputMint: string
  outputMint: string
  inputAmount: number
  outputAmount: number
  platformFee: number
}

export interface TrackTradeResponse {
  success: boolean
  message: string
  trade?: any
}

// ============================================================================
// Swap State Types
// ============================================================================

export interface SwapState {
  inputToken: TokenInfo | null
  outputToken: TokenInfo | null
  inputAmount: string
  outputAmount: string
  quote: QuoteResponse | null
  isLoadingQuote: boolean
  isLoadingSwap: boolean
  isLoadingTrack: boolean
  slippage: number
  error: SwapApiError | null
}

export interface SwapApiError {
  code: string
  message: string
  details?: any
}

// ============================================================================
// Transaction Status Types
// ============================================================================

export enum TransactionStatus {
  IDLE = "IDLE",
  FETCHING_QUOTE = "FETCHING_QUOTE",
  QUOTE_READY = "QUOTE_READY",
  GENERATING_TRANSACTION = "GENERATING_TRANSACTION",
  AWAITING_SIGNATURE = "AWAITING_SIGNATURE",
  SUBMITTING = "SUBMITTING",
  CONFIRMING = "CONFIRMING",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
}

export interface TransactionState {
  status: TransactionStatus
  signature?: string
  error?: SwapApiError
  explorerUrl?: string
}

// ============================================================================
// Wallet Types
// ============================================================================

export interface WalletState {
  connected: boolean
  connecting: boolean
  disconnecting: boolean
  publicKey: string | null
  balance: number
  error?: string
}

// ============================================================================
// UI Component Props Types
// ============================================================================

export interface TokenSelectorProps {
  selectedToken: TokenInfo | null
  onTokenSelect: (token: TokenInfo) => void
  label: string
  disabled?: boolean
  excludeToken?: string
}

export interface SwapButtonProps {
  disabled: boolean
  loading: boolean
  onClick: () => void
  text?: string
}

export interface SwapDetailsProps {
  quote: QuoteResponse | null
  inputToken: TokenInfo | null
  outputToken: TokenInfo | null
  slippage: number
}

// ============================================================================
// Formatting Options Types
// ============================================================================

export interface FormatNumberOptions {
  decimals?: number
  compact?: boolean
  currency?: boolean
  currencySymbol?: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}

export interface FormatTokenAmountOptions {
  decimals?: number
  showSymbol?: boolean
  compact?: boolean
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
  isValid: boolean
  error?: string
}

export interface SwapValidation {
  hasValidTokens: boolean
  hasValidAmount: boolean
  hasSufficientBalance: boolean
  hasValidQuote: boolean
  isWalletConnected: boolean
  errors: string[]
}
