import { AlertType, Priority, AlertConfig, ClusterResult } from '../types/alert.types'
import { UserAlert } from '../models/userAlert.model'
import { User } from '../models/user.model'
import { IWhaleAllTransactionsV2 } from '../models/whaleAllTransactionsV2.model'
import whaleAllTransactionModelV2 from '../models/whaleAllTransactionsV2.model'
import InfluencerWhalesAddressModelV2 from '../models/Influencer-wallet-whalesV2'
import { telegramService } from './telegram.service'
import logger from '../utils/logger'
import {
  formatWhaleAlert,
  formatClusterAlert,
  formatKOLAlert,
} from '../utils/telegram.utils'

/**
 * User subscription structure for in-memory cache
 */
interface UserSubscription {
  userId: string
  chatId: string
  priority: Priority
  config: AlertConfig
}

/**
 * Token symbol cache entry
 */
interface TokenSymbolCacheEntry {
  symbol: string
  timestamp: number
}

/**
 * Matching metrics
 */
interface MatchingMetrics {
  totalMatches: number
  matchesByType: Map<AlertType, number>
  totalProcessed: number
  averageLatencyMs: number
  lastProcessedAt: number | null
}

/**
 * AlertMatcherService - Matches transactions against user alert subscriptions
 * 
 * Features:
 * - In-memory Subscription Map grouped by alert type
 * - 2-minute database sync interval
 * - Cluster cache with 1-minute TTL
 * - Token symbol resolution with 24-hour caching
 * - Filter matching logic for each alert type
 * - Immediate cache invalidation for deleted alerts
 * - Comprehensive monitoring and metrics
 */
export class AlertMatcherService {
  private subscriptionMap: Map<AlertType, UserSubscription[]> = new Map()
  private clusterCache: Map<string, ClusterResult> = new Map()
  private tokenSymbolCache: Map<string, TokenSymbolCacheEntry> = new Map()
  private syncInterval: NodeJS.Timeout | null = null
  private clusterCleanupInterval: NodeJS.Timeout | null = null
  private symbolCacheCleanupInterval: NodeJS.Timeout | null = null
  private isInitialized: boolean = false

  // Metrics
  private metrics: MatchingMetrics = {
    totalMatches: 0,
    matchesByType: new Map(),
    totalProcessed: 0,
    averageLatencyMs: 0,
    lastProcessedAt: null,
  }
  private clusterCacheHits: number = 0
  private clusterCacheMisses: number = 0
  private symbolCacheHits: number = 0
  private symbolCacheMisses: number = 0
  private latencySum: number = 0

  // Constants
  private readonly SYNC_INTERVAL_MS = 2 * 60 * 1000 // 2 minutes
  private readonly CLUSTER_CACHE_TTL_MS = 60 * 1000 // 1 minute
  private readonly CLUSTER_CLEANUP_INTERVAL_MS = 60 * 1000 // 1 minute
  private readonly CLUSTER_TIME_WINDOW_MINUTES = 15 // Time window for cluster checks
  private readonly TOKEN_SYMBOL_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
  private readonly SYMBOL_CACHE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

  /**
   * Initialize the service and start sync interval
   */
  async initialize(): Promise<void> {
    try {
      logger.info({
        component: 'AlertMatcherService',
        operation: 'initialize',
        message: 'Initializing AlertMatcherService',
      })

      // Initial sync
      await this.syncSubscriptions()

      // Start periodic sync
      this.syncInterval = setInterval(() => {
        this.syncSubscriptions().catch((error) => {
          logger.error({
            component: 'AlertMatcherService',
            operation: 'syncInterval',
            error: {
              message: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined,
            },
          })
        })
      }, this.SYNC_INTERVAL_MS)

      // Start cluster cache cleanup
      this.startClusterCacheCleanup()

      // Start token symbol cache cleanup
      this.startSymbolCacheCleanup()

      this.isInitialized = true

      logger.info({
        component: 'AlertMatcherService',
        operation: 'initialize',
        message: 'AlertMatcherService initialized successfully',
      })
    } catch (error) {
      logger.error({
        component: 'AlertMatcherService',
        operation: 'initialize',
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })
      throw new Error('Failed to initialize AlertMatcherService')
    }
  }

  /**
   * Sync subscriptions from database to in-memory map
   */
  async syncSubscriptions(): Promise<void> {
    try {
      logger.debug({
        component: 'AlertMatcherService',
        operation: 'syncSubscriptions',
        message: 'Starting subscription sync',
      })

      // Fetch all enabled alerts with user data
      const alerts = await UserAlert.find({ enabled: true })
        .populate('userId', 'telegramChatId')
        .lean()

      // Clear existing map
      this.subscriptionMap.clear()

      // Group by alert type
      for (const alert of alerts) {
        const user = alert.userId as any

        // Skip if user doesn't have telegram linked
        if (!user || !user.telegramChatId) {
          continue
        }

        // Safety check: ensure user._id exists and is valid
        if (!user._id) {
          logger.warn({
            component: 'AlertMatcherService',
            operation: 'syncSubscriptions',
            alertId: alert._id,
            message: 'Alert has invalid userId structure, skipping',
          })
          continue
        }

        const subscription: UserSubscription = {
          userId: user._id.toString(),
          chatId: user.telegramChatId,
          priority: alert.priority,
          config: alert.config,
        }

        // Add to map grouped by type
        const existing = this.subscriptionMap.get(alert.type) || []
        existing.push(subscription)
        this.subscriptionMap.set(alert.type, existing)
      }

      logger.info({
        component: 'AlertMatcherService',
        operation: 'syncSubscriptions',
        alphaStreamCount: this.subscriptionMap.get(AlertType.ALPHA_STREAM)?.length || 0,
        whaleClusterCount: this.subscriptionMap.get(AlertType.WHALE_CLUSTER)?.length || 0,
        kolActivityCount: this.subscriptionMap.get(AlertType.KOL_ACTIVITY)?.length || 0,
        message: 'Subscription sync complete',
      })
    } catch (error) {
      logger.error({
        component: 'AlertMatcherService',
        operation: 'syncSubscriptions',
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })
      throw error
    }
  }

  /**
   * Process a transaction and match against subscriptions
   */
  async processTransaction(tx: IWhaleAllTransactionsV2): Promise<void> {
    if (!this.isInitialized) {
      logger.warn({
        component: 'AlertMatcherService',
        operation: 'processTransaction',
        message: 'Service not initialized, skipping transaction',
      })
      return
    }

    // Skip if this is not a whale transaction (e.g., KOL/influencer transaction)
    if (!tx.whale || !tx.whale.address) {
      logger.debug({
        component: 'AlertMatcherService',
        operation: 'processTransaction',
        txHash: tx.signature,
        message: 'Skipping non-whale transaction (no whale object)',
      })
      return
    }

    const startTime = Date.now()
    const correlationId = `${tx.signature.substring(0, 8)}-${Date.now()}`

    try {
      logger.debug({
        component: 'AlertMatcherService',
        operation: 'processTransaction',
        correlationId,
        txHash: tx.signature,
        walletAddress: tx.whale?.address || tx.whaleAddress || 'unknown',
        message: 'Starting transaction matching',
      })

      // Match against each alert type
      const matchResults = await Promise.all([
        this.matchAlphaStream(tx, correlationId),
        this.matchWhaleCluster(tx, correlationId),
        this.matchKOLActivity(tx, correlationId),
      ])

      // Calculate latency
      const latency = Date.now() - startTime
      this.latencySum += latency
      this.metrics.totalProcessed++
      this.metrics.averageLatencyMs = this.latencySum / this.metrics.totalProcessed
      this.metrics.lastProcessedAt = Date.now()

      // Count total matches
      const totalMatches = matchResults.reduce((sum, count) => sum + count, 0)

      logger.info({
        component: 'AlertMatcherService',
        operation: 'processTransaction',
        correlationId,
        txHash: tx.signature,
        matchResult: {
          alphaStreamMatches: matchResults[0],
          whaleClusterMatches: matchResults[1],
          kolActivityMatches: matchResults[2],
          totalMatches,
        },
        latency: `${latency}ms`,
        message: 'Transaction matching completed',
      })
    } catch (error) {
      const latency = Date.now() - startTime

      logger.error({
        component: 'AlertMatcherService',
        operation: 'processTransaction',
        correlationId,
        txHash: tx.signature,
        latency: `${latency}ms`,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })
      // Don't throw - we don't want to block transaction processing
    }
  }

  /**
   * Match transaction against ALPHA_STREAM subscriptions
   * @returns Number of matches
   */
  private async matchAlphaStream(tx: IWhaleAllTransactionsV2, correlationId: string): Promise<number> {
    const subscriptions = this.subscriptionMap.get(AlertType.ALPHA_STREAM) || []
    let matchCount = 0

    // Skip KOL/Influencer transactions for ALPHA_STREAM alerts
    // KOL transactions will be handled by KOL_ACTIVITY alerts separately
    const whaleAddress = tx.whale?.address || tx.whaleAddress
    const isKOL = await this.getKOLInfo(whaleAddress)
    if (isKOL) {
      logger.debug({
        component: 'AlertMatcherService',
        operation: 'matchAlphaStream',
        correlationId,
        txHash: tx.signature,
        whaleAddress,
        kolUsername: isKOL.username,
        message: 'Transaction is from KOL/Influencer - skipping ALPHA_STREAM alert',
      })
      return 0
    }

    for (const sub of subscriptions) {
      try {
        // Determine if this is a whale alert subscription (has whale-specific config)
        const isWhaleAlert = sub.config.hotnessScoreThreshold !== undefined ||
          sub.config.walletLabels !== undefined ||
          sub.config.minBuyAmountUSD !== undefined

        // ONLY send alerts for BUY transactions (skip SELL-only)
        if (tx.type === 'sell') {
          logger.debug({
            component: 'AlertMatcherService',
            operation: 'matchAlphaStream',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.ALPHA_STREAM,
            isWhaleAlert,
            txHash: tx.signature,
            txType: tx.type,
            matchResult: false,
            message: 'Transaction is SELL-only - skipping alert',
          })
          continue
        }

        // Use appropriate matching logic
        let matches = false
        if (isWhaleAlert) {
          matches = this.evaluateWhaleAlert(tx, sub.config)
        } else {
          matches = this.matchesAlphaStreamFilters(tx, sub.config)
        }

        if (!matches) {
          logger.debug({
            component: 'AlertMatcherService',
            operation: 'matchAlphaStream',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.ALPHA_STREAM,
            isWhaleAlert,
            txHash: tx.signature,
            matchResult: false,
            message: 'Filters did not match',
          })
          continue
        }

        // Resolve token symbol
        const tokenSymbol = this.resolveTokenSymbol(tx)

        // Format message
        const message = formatWhaleAlert(tx, tokenSymbol)

        // Queue alert
        const queued = await telegramService.queueAlert(
          sub.userId,
          AlertType.ALPHA_STREAM,
          tx.signature,
          message,
          sub.priority,
        )

        if (queued) {
          matchCount++
          this.metrics.totalMatches++
          const typeCount = this.metrics.matchesByType.get(AlertType.ALPHA_STREAM) || 0
          this.metrics.matchesByType.set(AlertType.ALPHA_STREAM, typeCount + 1)

          logger.info({
            component: 'AlertMatcherService',
            operation: 'matchAlphaStream',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.ALPHA_STREAM,
            isWhaleAlert,
            txHash: tx.signature,
            matchResult: true,
            message: 'ALPHA_STREAM alert matched and queued',
          })
        }
      } catch (error) {
        logger.error({
          component: 'AlertMatcherService',
          operation: 'matchAlphaStream',
          correlationId,
          userId: sub.userId,
          txHash: tx.signature,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          },
        })
      }
    }

    return matchCount
  }

  /**
   * Match transaction against WHALE_CLUSTER subscriptions
   * @returns Number of matches
   */
  private async matchWhaleCluster(tx: IWhaleAllTransactionsV2, correlationId: string): Promise<number> {
    const subscriptions = this.subscriptionMap.get(AlertType.WHALE_CLUSTER) || []
    let matchCount = 0

    for (const sub of subscriptions) {
      try {
        // Check filters
        if (!this.matchesWhaleClusterFilters(tx, sub.config)) {
          logger.debug({
            component: 'AlertMatcherService',
            operation: 'matchWhaleCluster',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.WHALE_CLUSTER,
            txHash: tx.signature,
            matchResult: false,
            message: 'Filters did not match',
          })
          continue
        }

        // Get or calculate cluster data
        const tokenAddress = tx.transaction.tokenOut.address || tx.tokenOutAddress
        const clusterData = await this.getClusterData(tokenAddress)

        // Check if cluster size meets minimum
        if (sub.config.minClusterSize && clusterData.count < sub.config.minClusterSize) {
          logger.debug({
            component: 'AlertMatcherService',
            operation: 'matchWhaleCluster',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.WHALE_CLUSTER,
            txHash: tx.signature,
            matchResult: false,
            clusterSize: clusterData.count,
            minRequired: sub.config.minClusterSize,
            message: 'Cluster size below minimum',
          })
          continue
        }

        // Resolve token symbol
        const tokenSymbol = this.resolveTokenSymbol(tx)

        // Format message
        const message = formatClusterAlert(
          tokenAddress,
          tokenSymbol,
          clusterData.count,
          clusterData.totalVolumeUSD,
          clusterData.timeWindowMinutes,
        )

        // Queue alert
        const queued = await telegramService.queueAlert(
          sub.userId,
          AlertType.WHALE_CLUSTER,
          tx.signature,
          message,
          sub.priority,
        )

        if (queued) {
          matchCount++
          this.metrics.totalMatches++
          const typeCount = this.metrics.matchesByType.get(AlertType.WHALE_CLUSTER) || 0
          this.metrics.matchesByType.set(AlertType.WHALE_CLUSTER, typeCount + 1)

          logger.info({
            component: 'AlertMatcherService',
            operation: 'matchWhaleCluster',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.WHALE_CLUSTER,
            txHash: tx.signature,
            matchResult: true,
            whaleCount: clusterData.count,
            message: 'WHALE_CLUSTER alert matched and queued',
          })
        }
      } catch (error) {
        logger.error({
          component: 'AlertMatcherService',
          operation: 'matchWhaleCluster',
          correlationId,
          userId: sub.userId,
          txHash: tx.signature,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          },
        })
      }
    }

    return matchCount
  }

  /**
   * Match transaction against KOL_ACTIVITY subscriptions
   * @returns Number of matches
   */
  private async matchKOLActivity(tx: IWhaleAllTransactionsV2, correlationId: string): Promise<number> {
    const subscriptions = this.subscriptionMap.get(AlertType.KOL_ACTIVITY) || []
    let matchCount = 0

    for (const sub of subscriptions) {
      try {
        // Check if transaction is from a KOL wallet
        const kolInfo = await this.getKOLInfo(tx.whale.address)
        if (!kolInfo) {
          continue
        }

        // Check filters
        if (!this.matchesKOLActivityFilters(tx, sub.config, kolInfo.username)) {
          logger.debug({
            component: 'AlertMatcherService',
            operation: 'matchKOLActivity',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.KOL_ACTIVITY,
            txHash: tx.signature,
            matchResult: false,
            message: 'Filters did not match',
          })
          continue
        }

        // Resolve token symbol
        const tokenSymbol = this.resolveTokenSymbol(tx)

        // Format message with KOL username for X link
        const message = formatKOLAlert(kolInfo.name || kolInfo.username, tx, tokenSymbol, kolInfo.username)

        // Queue alert
        const queued = await telegramService.queueAlert(
          sub.userId,
          AlertType.KOL_ACTIVITY,
          tx.signature,
          message,
          sub.priority,
        )

        if (queued) {
          matchCount++
          this.metrics.totalMatches++
          const typeCount = this.metrics.matchesByType.get(AlertType.KOL_ACTIVITY) || 0
          this.metrics.matchesByType.set(AlertType.KOL_ACTIVITY, typeCount + 1)

          logger.info({
            component: 'AlertMatcherService',
            operation: 'matchKOLActivity',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.KOL_ACTIVITY,
            txHash: tx.signature,
            matchResult: true,
            kol: kolInfo.username,
            message: 'KOL_ACTIVITY alert matched and queued',
          })
        }
      } catch (error) {
        logger.error({
          component: 'AlertMatcherService',
          operation: 'matchKOLActivity',
          correlationId,
          userId: sub.userId,
          txHash: tx.signature,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          },
        })
      }
    }

    return matchCount
  }

  /**
   * Check if transaction matches ALPHA_STREAM filters
   */
  private matchesAlphaStreamFilters(tx: IWhaleAllTransactionsV2, config: AlertConfig): boolean {
    // Check minimum amount
    if (config.minAmount) {
      const usdAmount = parseFloat(tx.transaction.tokenOut.usdAmount || '0')
      if (usdAmount < config.minAmount) {
        return false
      }
    }

    // Check token filter
    if (config.tokens && config.tokens.length > 0) {
      const tokenAddress = tx.transaction.tokenOut.address || tx.tokenOutAddress
      if (!config.tokens.includes(tokenAddress)) {
        return false
      }
    }

    // Check wallet filter
    if (config.wallets && config.wallets.length > 0) {
      if (!config.wallets.includes(tx.whale.address)) {
        return false
      }
    }

    return true
  }

  /**
   * Evaluate if a transaction matches whale alert subscription criteria
   * This method implements the whale alert matching logic for ALPHA_STREAM alerts
   * with hotness score, minimum buy amount, and wallet label filters
   * 
   * @param tx - The whale transaction to evaluate
   * @param config - The alert subscription configuration
   * @returns true if transaction matches all criteria, false otherwise
   */
  evaluateWhaleAlert(tx: IWhaleAllTransactionsV2, config: AlertConfig): boolean {
    // Check hotness score threshold
    if (config.hotnessScoreThreshold !== undefined) {
      if (tx.hotnessScore < config.hotnessScoreThreshold) {
        return false
      }
    }

    // Check minimum buy amount
    if (config.minBuyAmountUSD !== undefined && config.minBuyAmountUSD > 0) {
      const buyAmountUSD = parseFloat(tx.transaction.tokenOut.usdAmount || '0')
      if (buyAmountUSD < config.minBuyAmountUSD) {
        return false
      }
    }

    // Check wallet labels with OR logic
    // If ANY wallet labels are specified, accept ALL transactions (with or without labels)
    // that meet the other criteria (USD amount, hotness score)
    // This is intentional - selecting labels means "I want to see whale activity"
    // regardless of whether the wallet is labeled yet
    if (config.walletLabels && config.walletLabels.length > 0) {
      // Labels are selected, but we accept all transactions
      // The label filter is just an indicator that user wants whale alerts
      return true
    }

    return true
  }

  /**
   * Check if transaction matches WHALE_CLUSTER filters
   */
  private matchesWhaleClusterFilters(tx: IWhaleAllTransactionsV2, config: AlertConfig): boolean {
    // Check token filter
    if (config.tokens && config.tokens.length > 0) {
      const tokenAddress = tx.transaction.tokenOut.address || tx.tokenOutAddress
      if (!config.tokens.includes(tokenAddress)) {
        return false
      }
    }

    return true
  }

  /**
   * Check if transaction matches KOL_ACTIVITY filters
   */
  private matchesKOLActivityFilters(
    tx: IWhaleAllTransactionsV2,
    config: AlertConfig,
    kolUsername: string,
  ): boolean {
    // Check KOL filter
    if (config.kolIds && config.kolIds.length > 0) {
      if (!config.kolIds.includes(kolUsername)) {
        return false
      }
    }

    // Check token filter
    if (config.tokens && config.tokens.length > 0) {
      const tokenAddress = tx.transaction.tokenOut.address || tx.tokenOutAddress
      if (!config.tokens.includes(tokenAddress)) {
        return false
      }
    }

    return true
  }

  /**
   * Get or calculate cluster data for a token
   */
  private async getClusterData(tokenAddress: string): Promise<ClusterResult> {
    // Check cache first
    const cached = this.clusterCache.get(tokenAddress)
    if (cached && Date.now() - cached.timestamp < this.CLUSTER_CACHE_TTL_MS) {
      this.clusterCacheHits++
      logger.debug({
        component: 'AlertMatcherService',
        operation: 'getClusterData',
        tokenAddress,
        cacheHit: true,
        message: 'Using cached cluster data',
      })
      return cached
    }

    this.clusterCacheMisses++

    // Calculate cluster data
    const timeWindowStart = new Date(Date.now() - this.CLUSTER_TIME_WINDOW_MINUTES * 60 * 1000)

    // Query transactions for this token in the time window
    const transactions = await whaleAllTransactionModelV2
      .find({
        $or: [
          { 'transaction.tokenOut.address': tokenAddress },
          { tokenOutAddress: tokenAddress },
        ],
        timestamp: { $gte: timeWindowStart },
      })
      .lean()

    // Calculate unique whale count and total volume
    const uniqueWhales = new Set<string>()
    let totalVolumeUSD = 0

    for (const tx of transactions) {
      uniqueWhales.add(tx.whale.address)
      const usdAmount = parseFloat(tx.transaction.tokenOut.usdAmount || '0')
      totalVolumeUSD += usdAmount
    }

    const result: ClusterResult = {
      count: uniqueWhales.size,
      totalVolumeUSD,
      timeWindowMinutes: this.CLUSTER_TIME_WINDOW_MINUTES,
      timestamp: Date.now(),
    }

    // Cache the result
    this.clusterCache.set(tokenAddress, result)

    logger.debug({
      component: 'AlertMatcherService',
      operation: 'getClusterData',
      tokenAddress,
      cacheHit: false,
      whaleCount: result.count,
      totalVolumeUSD: result.totalVolumeUSD,
      message: 'Calculated and cached cluster data',
    })

    return result
  }

  /**
   * Get KOL info for a wallet address
   */
  private async getKOLInfo(
    walletAddress: string,
  ): Promise<{ username: string; name?: string } | null> {
    try {
      const kol = await InfluencerWhalesAddressModelV2.findOne({
        whalesAddress: walletAddress,
      }).lean()

      if (!kol) {
        return null
      }

      return {
        username: kol.influencerUsername,
        name: kol.influencerName,
      }
    } catch (error) {
      logger.error({
        component: 'AlertMatcherService',
        operation: 'getKOLInfo',
        walletAddress,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })
      return null
    }
  }

  /**
   * Resolve token symbol from transaction with 24-hour caching
   */
  private resolveTokenSymbol(tx: IWhaleAllTransactionsV2): string {
    const tokenAddress = tx.transaction.tokenOut.address || tx.tokenOutAddress

    // Check cache first
    const cached = this.tokenSymbolCache.get(tokenAddress)
    if (cached && Date.now() - cached.timestamp < this.TOKEN_SYMBOL_CACHE_TTL_MS) {
      this.symbolCacheHits++
      return cached.symbol
    }

    this.symbolCacheMisses++

    // Try to get symbol from transaction data
    let symbol: string
    if (tx.transaction.tokenOut.symbol) {
      symbol = tx.transaction.tokenOut.symbol
    } else if (tx.tokenOutSymbol) {
      symbol = tx.tokenOutSymbol
    } else {
      // Fallback to address
      symbol = tokenAddress || 'Unknown'
    }

    // Cache the resolved symbol
    this.tokenSymbolCache.set(tokenAddress, {
      symbol,
      timestamp: Date.now(),
    })

    return symbol
  }

  /**
   * Invalidate specific user's subscriptions (for immediate cache update on delete)
   */
  invalidateUserSubscriptions(userId: string): void {
    logger.info({
      component: 'AlertMatcherService',
      operation: 'invalidateUserSubscriptions',
      userId,
      message: 'Invalidating user subscriptions',
    })

    // Remove user's subscriptions from all alert types
    Array.from(this.subscriptionMap.entries()).forEach(([type, subscriptions]) => {
      const filtered = subscriptions.filter((sub) => sub.userId !== userId)
      this.subscriptionMap.set(type, filtered)
    })
  }

  /**
   * Start cluster cache cleanup
   */
  private startClusterCacheCleanup(): void {
    this.clusterCleanupInterval = setInterval(() => {
      const now = Date.now()
      const expiredKeys: string[] = []

      // Find expired entries
      Array.from(this.clusterCache.entries()).forEach(([key, value]) => {
        if (now - value.timestamp > this.CLUSTER_CACHE_TTL_MS) {
          expiredKeys.push(key)
        }
      })

      // Remove expired entries
      for (const key of expiredKeys) {
        this.clusterCache.delete(key)
      }

      if (expiredKeys.length > 0) {
        logger.debug({
          component: 'AlertMatcherService',
          operation: 'clusterCacheCleanup',
          removedCount: expiredKeys.length,
          cacheSize: this.clusterCache.size,
          message: 'Cleaned up expired cluster cache entries',
        })
      }
    }, this.CLUSTER_CLEANUP_INTERVAL_MS)
  }

  /**
   * Start token symbol cache cleanup
   */
  private startSymbolCacheCleanup(): void {
    this.symbolCacheCleanupInterval = setInterval(() => {
      const now = Date.now()
      const expiredKeys: string[] = []

      // Find expired entries
      Array.from(this.tokenSymbolCache.entries()).forEach(([key, value]) => {
        if (now - value.timestamp > this.TOKEN_SYMBOL_CACHE_TTL_MS) {
          expiredKeys.push(key)
        }
      })

      // Remove expired entries
      for (const key of expiredKeys) {
        this.tokenSymbolCache.delete(key)
      }

      if (expiredKeys.length > 0) {
        logger.debug({
          component: 'AlertMatcherService',
          operation: 'symbolCacheCleanup',
          removedCount: expiredKeys.length,
          cacheSize: this.tokenSymbolCache.size,
          message: 'Cleaned up expired token symbol cache entries',
        })
      }
    }, this.SYMBOL_CACHE_CLEANUP_INTERVAL_MS)
  }

  /**
   * Get comprehensive metrics for monitoring
   */
  getMetrics() {
    const clusterCacheTotal = this.clusterCacheHits + this.clusterCacheMisses
    const symbolCacheTotal = this.symbolCacheHits + this.symbolCacheMisses

    return {
      matching: {
        totalMatches: this.metrics.totalMatches,
        matchesByType: Object.fromEntries(this.metrics.matchesByType),
        totalProcessed: this.metrics.totalProcessed,
        averageLatencyMs: Math.round(this.metrics.averageLatencyMs * 100) / 100,
        lastProcessedAt: this.metrics.lastProcessedAt,
      },
      caches: {
        subscription: {
          alphaStreamCount: this.subscriptionMap.get(AlertType.ALPHA_STREAM)?.length || 0,
          whaleClusterCount: this.subscriptionMap.get(AlertType.WHALE_CLUSTER)?.length || 0,
          kolActivityCount: this.subscriptionMap.get(AlertType.KOL_ACTIVITY)?.length || 0,
          totalSubscriptions: Array.from(this.subscriptionMap.values()).reduce(
            (sum, subs) => sum + subs.length,
            0,
          ),
        },
        cluster: {
          size: this.clusterCache.size,
          hits: this.clusterCacheHits,
          misses: this.clusterCacheMisses,
          hitRate: clusterCacheTotal > 0
            ? Math.round((this.clusterCacheHits / clusterCacheTotal) * 10000) / 100
            : 0,
        },
        tokenSymbol: {
          size: this.tokenSymbolCache.size,
          hits: this.symbolCacheHits,
          misses: this.symbolCacheMisses,
          hitRate: symbolCacheTotal > 0
            ? Math.round((this.symbolCacheHits / symbolCacheTotal) * 10000) / 100
            : 0,
        },
      },
      status: {
        isInitialized: this.isInitialized,
      },
    }
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    logger.info({
      component: 'AlertMatcherService',
      operation: 'shutdown',
      message: 'Shutting down AlertMatcherService',
    })

    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }

    if (this.clusterCleanupInterval) {
      clearInterval(this.clusterCleanupInterval)
      this.clusterCleanupInterval = null
    }

    if (this.symbolCacheCleanupInterval) {
      clearInterval(this.symbolCacheCleanupInterval)
      this.symbolCacheCleanupInterval = null
    }

    this.subscriptionMap.clear()
    this.clusterCache.clear()
    this.tokenSymbolCache.clear()
    this.isInitialized = false

    logger.info({
      component: 'AlertMatcherService',
      operation: 'shutdown',
      message: 'AlertMatcherService shutdown complete',
    })
  }
}

// Export singleton instance
export const alertMatcherService = new AlertMatcherService()
