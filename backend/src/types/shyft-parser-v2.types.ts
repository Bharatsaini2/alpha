/**
 * Shyft Parser v2 Integration Types
 * 
 * This file defines the core interfaces and types for the Shyft Parser v2 integration,
 * maintaining backward compatibility while enabling enhanced parsing capabilities.
 * 
 * Requirements: 1.1, 1.2, 5.1
 */

import type { ParsedSwap, ShyftTransaction, TokenBalanceChange, TokenSwapped, SwapEvent, Event, Action } from '../utils/shyftParser'

// Import v2 types
export interface ShyftTransactionV2 {
  signature: string
  timestamp: number
  status: string
  fee: number
  fee_payer: string
  signers: string[]
  protocol?: {
    name: string
    address: string
  }
  token_balance_changes: TokenBalanceChange[]
  actions?: Array<{
    type: string
    info?: {
      [key: string]: any
      tokens_swapped?: TokenSwapped[]
      sender?: string
      receiver?: string
      amount?: number
      amount_raw?: number | string
      token_address?: string
    }
    source_protocol?: {
      address: string
      name: string
    }
  }>
}

// Re-export existing types for backward compatibility
export type { ParsedSwap, ShyftTransaction, TokenBalanceChange, TokenSwapped, SwapEvent, Event, Action }

// Enhanced ParsedSwap interface with optional v2 metadata
export interface EnhancedParsedSwap extends ParsedSwap {
  // New v2 fields (optional for backward compatibility)
  v2_metadata?: {
    relayer_proof_applied: boolean
    rent_refund_filtered: boolean
    multi_hop_collapsed: boolean
    erase_validation_passed: boolean
    processing_time_ms: number
    parser_version: 'v1' | 'v2'
  }
}

// Enhanced TokenSwapInfo with v2 features
export interface EnhancedTokenSwapInfo {
  mint: string
  symbol?: string
  amount_raw: string
  decimals: number
  amount: number
  // New v2 fields
  is_core_token?: boolean
  normalized_amount?: number
}

// Parser Adapter Interface
export interface ParserAdapter {
  parseShyftTransaction(tx: ShyftTransaction): ParsedSwap | null
  getPerformanceMetrics(): ParserPerformanceMetrics
  enableV2Features(features: V2FeatureFlags): void
}

// Configuration Manager Interface
export interface ConfigurationManager {
  getCoreTokenList(): string[]
  updateCoreTokenList(tokens: string[]): void
  getFeatureFlags(): ParserFeatureFlags
  setFeatureFlag(flag: string, enabled: boolean): void
  getParserVersion(): 'v1' | 'v2' | 'hybrid'
  setParserVersion(version: 'v1' | 'v2' | 'hybrid'): void
}

// Feature Flags
export interface ParserFeatureFlags {
  useV2Parser: boolean
  enableCoreTokenSuppression: boolean
  enablePerformanceTracking: boolean
  enableSideBySideComparison: boolean
  enableRentRefundFiltering: boolean
  enableMultiHopCollapse: boolean
}

export interface V2FeatureFlags {
  relayerProofIdentification: boolean
  rentRefundFiltering: boolean
  multiHopCollapse: boolean
  enhancedAmountNormalization: boolean
  tokenToTokenSplitProtocol: boolean
  eraseValidation: boolean
}

// Core Token Suppression Service Interface
export interface CoreTokenSuppressionService {
  shouldSuppressSwap(input: TokenInfo, output: TokenInfo): boolean
  isCoreToken(mint: string): boolean
  updateCoreTokenList(tokens: string[]): void
  getSuppressionStats(): SuppressionMetrics
}

export interface TokenInfo {
  mint: string
  symbol?: string
  decimals: number
  amount: number
}

export interface SuppressionMetrics {
  totalSwapsProcessed: number
  swapsSuppressed: number
  suppressionRate: number
  lastUpdated: Date
}

// Performance Monitoring Interface
export interface PerformanceMonitor {
  recordParsingTime(version: 'v1' | 'v2', timeMs: number): void
  recordComparison(v1Result: ParsedSwap | null, v2Result: ParserResult): void
  getPerformanceStats(): PerformanceStats
  getComparisonStats(): ComparisonStats
}

export interface PerformanceStats {
  v1AverageTimeMs: number
  v2AverageTimeMs: number
  v1SuccessRate: number
  v2SuccessRate: number
  totalTransactionsProcessed: number
}

export interface ComparisonStats {
  totalComparisons: number
  matchingResults: number
  v1OnlyResults: number
  v2OnlyResults: number
  differingResults: number
  matchRate: number
}

export interface ParserPerformanceMetrics {
  averageParsingTimeMs: number
  successRate: number
  errorRate: number
  totalTransactionsProcessed: number
  lastUpdated: Date
}

// Parser Result from v2 parser
export interface ParserResult {
  success: boolean
  data?: ParsedSwap | SplitSwapPair
  erase?: EraseResult
  error?: string
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

// Additional types needed for v2 integration
export interface SplitSwapPair {
  signature: string
  timestamp: number
  swapper: string
  splitReason: string
  sellRecord: ParsedSwap
  buyRecord: ParsedSwap
  protocol: string
  swapperIdentificationMethod: string
}

export interface EraseResult {
  signature: string
  timestamp: number
  reason: string
  debugInfo: Record<string, any>
}

// Configuration Data Models
export interface ParserConfiguration {
  version: 'v1' | 'v2' | 'hybrid'
  core_tokens: string[]
  feature_flags: ParserFeatureFlags
  performance_tracking: boolean
  logging_level: 'error' | 'warn' | 'info' | 'debug'
  migration_settings: MigrationSettings
}

export interface MigrationSettings {
  rollout_percentage: number // 0-100
  comparison_mode: boolean
  rollback_threshold_error_rate: number
  rollback_threshold_performance_degradation: number
}

// Error Handling Types
export interface ParserError {
  type: 'parser' | 'configuration' | 'performance' | 'validation' | 'migration'
  code: string
  message: string
  context: Record<string, any>
  timestamp: Date
  transaction_hash?: string
  recovery_suggestion?: string
}

// Default core tokens list - Complete list of stablecoins, wrapped assets, and liquid staking tokens
export const DEFAULT_CORE_TOKENS = [
  // Native & Wrapped SOL
  'So11111111111111111111111111111111111111112', // WSOL (Wrapped SOL)
  
  // Liquid Staking Tokens (LST)
  'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', // jupSOL (Jupiter Staked SOL)
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', // bSOL (Blaze Staked SOL)
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL (Marinade Staked SOL)
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj', // stSOL (Lido Staked SOL)
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // jitoSOL (Jito Staked SOL)
  
  // Stablecoins
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC (USD Coin - Circle)
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT (Tether USD)
  '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo', // PYUSD (PayPal USD)
  'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA', // USDS (Sky Dollar, formerly Dai)
  'EjmyN6qEC1Tf1JxiG1ae7UTJhUxSwk1TCWNWqxWV4J6o', // DAI (Dai - Wormhole)
  '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH', // USDG (Global Dollar - Paxos)
  'JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD', // JupUSD (Jupiter USD)
  '7kbnvuGBxxj8AG9qp8Scn56muWGaRaFqxg1FsRp3PaFT', // UXD (UXD Stablecoin)
  'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB', // USD1 (World Liberty Financial USD)
  'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr', // EURC (Euro Coin - Circle)
  'star9agSpjiFe3M49B3RniVU4CMBBEK3Qnaqn3RGiFM', // USD* (USD Star)
  'USX6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG', // USX (Solstice USX)
  'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH', // CASH (Phantom CASH)
  
  // Yield Stablecoins
  'hyUSD5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E', // hyUSD (High Yield USD)
  'AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUjY', // syrupUSDC (Syrup USDC - Maple)
  'Sj14XLJZSVMcUYpAfajdZRpnfHUpJieZHS4aPektLWvh', // SjlUSD (Jupiter Lend USD)
  'G9fvHrYNw1A8Evpcj7X2yy4k4fT7nNHcA9L6UsamNHAif', // GjlUSD (Jupiter Lend USDG)
  '9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D', // jlUSDC (Jupiter Lend USDC)
  
  // LP Tokens
  '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4', // JLP (Jupiter Perps LP)
  
  // Utility Tokens
  'JUICED7GxATsNMnaC88vdwd2t3mwrFuQwwGvmYPrUQ4D6FotXk', // JUICED (Zeus Network BTC)
  
  // Bridged Assets
  'zBTCug3er3tLyffELcvDNrKkCymbPWysGcWihESYfLg', // zBTC (Zeus Network BTC)
  'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', // cbBTC (Coinbase Wrapped BTC)
  '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E', // wBTC (Wrapped Bitcoin - Wormhole)
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // wETH (Wrapped Ethereum - Wormhole)
]

// Default configuration
export const DEFAULT_PARSER_CONFIGURATION: ParserConfiguration = {
  version: 'v1', // Start with v1 for safety
  core_tokens: DEFAULT_CORE_TOKENS,
  feature_flags: {
    useV2Parser: false,
    enableCoreTokenSuppression: true, // ✅ ENABLED: Suppress core-to-core swaps
    enablePerformanceTracking: true,
    enableSideBySideComparison: false,
    enableRentRefundFiltering: false,
    enableMultiHopCollapse: false,
  },
  performance_tracking: true,
  logging_level: 'info',
  migration_settings: {
    rollout_percentage: 0,
    comparison_mode: false,
    rollback_threshold_error_rate: 0.05, // 5%
    rollback_threshold_performance_degradation: 0.2, // 20%
  },
}