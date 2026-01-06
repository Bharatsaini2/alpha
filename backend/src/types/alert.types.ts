/**
 * Alert type enumeration
 */
export enum AlertType {
  ALPHA_STREAM = 'ALPHA_STREAM',
  WHALE_CLUSTER = 'WHALE_CLUSTER',
  KOL_ACTIVITY = 'KOL_ACTIVITY',
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
  kolIds?: string[]
  // Whale alert specific config
  hotnessScoreThreshold?: number
  walletLabels?: string[]
  minBuyAmountUSD?: number
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
