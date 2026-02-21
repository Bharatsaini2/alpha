/**
 * Alert type enumeration
 */
export enum AlertType {
  ALPHA_STREAM = 'ALPHA_STREAM',
  WHALE_CLUSTER = 'WHALE_CLUSTER',
  KOL_ACTIVITY = 'KOL_ACTIVITY',
  KOL_PROFILE = 'KOL_PROFILE',  // NEW: Alerts for specific KOL
}

/**
 * Priority level enumeration
 */
export enum Priority {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/**
 * Alert configuration interface
 */
export interface AlertConfig {
  minAmount?: number
  tokens?: string[]
  wallets?: string[]
  minClusterSize?: number
  /** Time window in minutes for whale cluster (e.g. 15 for 15m). Default 15. */
  timeWindowMinutes?: number
  /** Minimum total buy volume in USD for cluster to trigger. */
  minInflowUSD?: number
  kolIds?: string[]
  // Whale alert specific config
  hotnessScoreThreshold?: number
  walletLabels?: string[]
  minBuyAmountUSD?: number
  // Market cap filter (dual range)
  minMarketCapUSD?: number // Minimum market cap in USD (0 to 50M+)
  maxMarketCapUSD?: number // Maximum market cap in USD (0 to 50M+)
  // KOL Profile alert specific config
  targetKolUsername?: string
  targetKolAddress?: string
  minHotnessScore?: number
}

/**
 * Cluster result cache structure
 */
export interface ClusterResult {
  count: number
  totalVolumeUSD: number
  timeWindowMinutes: number
  timestamp: number
}

/**
 * Queue statistics
 */
export interface QueueStats {
  queueSize: number
  dedupCacheSize: number
  messagesProcessed: number
  messagesDropped: number
  isInBackpressure?: boolean
  isShuttingDown?: boolean
}
