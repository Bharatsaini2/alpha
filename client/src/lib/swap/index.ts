/**
 * Centralized exports for Jupiter Swap functionality
 * Provides easy access to all swap-related utilities, types, and API functions
 */

// Export all types
export type {
  TokenInfo,
  TokenBalance,
  QuoteParams,
  QuoteResponse,
  PlatformFee,
  SwapParams,
  SwapTransactionResponse,
  TrackTradeParams,
  TrackTradeResponse,
  SwapState,
  SwapApiError,
  TransactionStatus,
  TransactionState,
  WalletState,
  TokenSelectorProps,
  SwapButtonProps,
  SwapDetailsProps,
  FormatNumberOptions,
  FormatTokenAmountOptions,
  ValidationResult,
  SwapValidation,
} from "../../types/swap.types"

// Export transaction status enum
export { TransactionStatus } from "../../types/swap.types"

// Export Solana utilities
export {
  isValidSolanaAddress,
  validateSolanaAddress,
  areAddressesEqual,
  deserializeTransaction,
  serializeTransaction,
  getTransactionSignature,
  uiAmountToRaw,
  rawAmountToUi,
  stringAmountToRaw,
  getExplorerUrl,
  getAddressExplorerUrl,
  getSolscanUrl,
  shortenAddress,
  copyToClipboard,
  COMMON_TOKENS,
  isNativeSOL,
  getCommonTokenSymbol,
} from "../solanaUtils"

// Export swap API functions
export {
  fetchQuote,
  generateSwapTransaction,
  trackCompletedTrade,
  handleSwapApiError,
  retryApiCall,
  formatNumber,
  formatCompactNumber,
  formatTokenAmount,
  formatPrice,
  formatPercentage,
  parseNumberInput,
  validateNumberInput,
  calculateExchangeRate,
  calculatePriceImpact,
  calculatePlatformFee,
  calculateMinimumReceived,
  swapApiClient,
} from "../swapApi"
