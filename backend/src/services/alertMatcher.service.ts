import { AlertType, Priority, AlertConfig, ClusterResult } from '../types/alert.types'
import { UserAlert } from '../models/userAlert.model'
import { User } from '../models/user.model'
import { IWhaleAllTransactionsV2 } from '../models/whaleAllTransactionsV2.model'
import { IInfluencerWhaleTransactionsV2 } from '../models/influencerWhaleTransactionsV2.model'
import whaleAllTransactionModelV2 from '../models/whaleAllTransactionsV2.model'
import influencerWhaleTransactionsModelV2 from '../models/influencerWhaleTransactionsV2.model'
import InfluencerWhalesAddressModelV2 from '../models/Influencer-wallet-whalesV2'
import { telegramService } from './telegram.service'
import logger from '../utils/logger'
import {
  formatWhaleAlert,
  formatClusterAlert,
  formatKOLClusterAlert,
  formatKOLAlert,
  formatKOLProfileAlert,
} from '../utils/telegram.utils'

/**
 * User subscription structure for in-memory cache
 */
interface UserSubscription {
  subscriptionId: string
  userId: string
  chatId: string
  priority: Priority
  config: AlertConfig
}

/**
 * Snapshot stored when a whale cluster alert is sent (for cooldown / re-alert on growth)
 */
interface WhaleClusterSnapshot {
  timestamp: number
  walletCount: number
  totalVolume: number
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
  private kolClusterCache: Map<string, ClusterResult> = new Map()
  private tokenSymbolCache: Map<string, TokenSymbolCacheEntry> = new Map()
  /** Per subscriptionId:tokenAddress — cooldown snapshot after sending whale cluster alert */
  private whaleClusterLastAlerted: Map<string, WhaleClusterSnapshot> = new Map()
  /** Per subscriptionId:tokenAddress — cooldown snapshot after sending KOL cluster alert */
  private kolClusterLastAlerted: Map<string, WhaleClusterSnapshot> = new Map()
  private syncInterval: NodeJS.Timeout | null = null
  private clusterCleanupInterval: NodeJS.Timeout | null = null
  private symbolCacheCleanupInterval: NodeJS.Timeout | null = null
  private snapshotCleanupInterval: NodeJS.Timeout | null = null
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
  // Whale cluster cooldown: re-alert only if cluster grew meaningfully within same window
  private readonly WALLET_GROWTH_THRESHOLD = 2
  private readonly VOLUME_GROWTH_RATIO = 0.5 // 50% increase over snapshot volume
  private readonly SNAPSHOT_MAX_AGE_MS = 60 * 60 * 1000 // 1 hour
  private readonly SNAPSHOT_CLEANUP_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

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

      // Start whale cluster cooldown snapshot cleanup (expire after 1 hour)
      this.startWhaleClusterSnapshotCleanup()

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
          subscriptionId: (alert as any)._id.toString(),
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
        kolClusterCount: this.subscriptionMap.get(AlertType.KOL_CLUSTER)?.length || 0,
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

    // Check if this is a whale transaction OR a KOL/influencer transaction
    // Whale transactions have: tx.whale.address
    // KOL transactions have: tx.whaleAddress (without nested whale object)
    const whaleAddress = tx.whale?.address || tx.whaleAddress
    const isKOLTransaction = !tx.whale && tx.whaleAddress
    
    if (!whaleAddress) {
      logger.debug({
        component: 'AlertMatcherService',
        operation: 'processTransaction',
        txHash: tx.signature,
        message: 'Skipping transaction - no whale or KOL address found',
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
        walletAddress: whaleAddress,
        isKOLTransaction,
        message: 'Starting transaction matching',
      })

      // Match against each alert type
      const matchResults = await Promise.all([
        // Only match ALPHA_STREAM for non-KOL whale transactions
        !isKOLTransaction ? this.matchAlphaStream(tx, correlationId) : Promise.resolve(0),
        // Only match WHALE_CLUSTER for non-KOL whale transactions
        !isKOLTransaction ? this.matchWhaleCluster(tx, correlationId) : Promise.resolve(0),
        // Only match KOL_CLUSTER for KOL/influencer transactions (multiple KOLs, same token, timeframe)
        isKOLTransaction ? this.matchKOLCluster(tx, correlationId) : Promise.resolve(0),
        // Match KOL_ACTIVITY for all transactions (checks if wallet is KOL inside)
        this.matchKOLActivity(tx, correlationId),
        // Match KOL Profile alerts (only for influencer transactions)
        (tx as any).kolAddress || (tx as any).influencerUsername 
          ? this.matchKOLProfile(tx as any, correlationId)
          : Promise.resolve(0),
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
          kolClusterMatches: matchResults[2],
          kolActivityMatches: matchResults[3],
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

        // Get or calculate cluster data (use subscription timeframe or default)
        const tokenAddress = tx.transaction.tokenOut.address || tx.tokenOutAddress
        const timeWindowMinutes = sub.config.timeWindowMinutes ?? this.CLUSTER_TIME_WINDOW_MINUTES
        const clusterData = await this.getClusterData(tokenAddress, timeWindowMinutes)

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

        // Check minimum total buy volume for cluster
        const minInflow = sub.config.minInflowUSD ?? 0
        if (clusterData.totalVolumeUSD < minInflow) {
          logger.debug({
            component: 'AlertMatcherService',
            operation: 'matchWhaleCluster',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.WHALE_CLUSTER,
            txHash: tx.signature,
            matchResult: false,
            totalVolumeUSD: clusterData.totalVolumeUSD,
            minInflowUSD: minInflow,
            message: 'Cluster total volume below minimum',
          })
          continue
        }

        // Cooldown: per subscription + token — send only first alert in window, or re-alert on significant growth
        const cooldownKey = `${sub.subscriptionId}:${tokenAddress}`
        const snapshot = this.whaleClusterLastAlerted.get(cooldownKey)
        const userTimeframeInMs = timeWindowMinutes * 60 * 1000
        const now = Date.now()

        let shouldSend = true
        let isUpdate = false
        let previousWalletCount: number | undefined
        let previousTotalVolume: number | undefined

        if (snapshot) {
          const timeSinceLast = now - snapshot.timestamp
          if (timeSinceLast >= userTimeframeInMs) {
            // Window reset — treat as new cluster
            shouldSend = true
            isUpdate = false
          } else {
            const walletGrowth = clusterData.count - snapshot.walletCount
            const volumeGrowth = clusterData.totalVolumeUSD - snapshot.totalVolume
            const volumeGrowthSignificant =
              snapshot.totalVolume === 0
                ? volumeGrowth > 0
                : volumeGrowth >= snapshot.totalVolume * this.VOLUME_GROWTH_RATIO
            if (walletGrowth >= this.WALLET_GROWTH_THRESHOLD || volumeGrowthSignificant) {
              shouldSend = true
              isUpdate = true
              previousWalletCount = snapshot.walletCount
              previousTotalVolume = snapshot.totalVolume
            } else {
              shouldSend = false
            }
          }
        }

        if (!shouldSend) {
          logger.debug({
            component: 'AlertMatcherService',
            operation: 'matchWhaleCluster',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.WHALE_CLUSTER,
            txHash: tx.signature,
            message: 'Alert suppressed (cooldown, cluster growth below threshold)',
            tokenAddress,
            snapshotWalletCount: snapshot!.walletCount,
            currentWalletCount: clusterData.count,
          })
          continue
        }

        // Resolve token symbol
        const tokenSymbol = this.resolveTokenSymbol(tx)
        const tokenName = tx.transaction?.tokenOut?.name || tokenSymbol
        const marketCap = parseFloat(
          tx.marketCap?.buyMarketCap || tx.transaction?.tokenOut?.marketCap || '0',
        )

        const alertSentAt = now
        const message = formatClusterAlert(
          tokenAddress,
          tokenSymbol,
          clusterData.count,
          clusterData.totalVolumeUSD,
          clusterData.timeWindowMinutes,
          {
            tokenName,
            marketCap: marketCap > 0 ? marketCap : undefined,
            triggeredAt: tx.timestamp ? new Date(tx.timestamp) : new Date(),
            formationTimeMs: clusterData.formationTimeMs,
            lastTxTimestamp: clusterData.lastTxTimestamp,
            alertSentAt,
            isUpdate: isUpdate || undefined,
            previousWalletCount,
            previousTotalVolume,
          },
        )

        const queued = await telegramService.queueAlert(
          sub.userId,
          AlertType.WHALE_CLUSTER,
          tx.signature,
          message,
          sub.priority,
        )

        if (queued) {
          this.whaleClusterLastAlerted.set(cooldownKey, {
            timestamp: now,
            walletCount: clusterData.count,
            totalVolume: clusterData.totalVolumeUSD,
          })
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
            isUpdate: isUpdate || undefined,
            message: isUpdate ? 'WHALE_CLUSTER update alert queued' : 'WHALE_CLUSTER alert matched and queued',
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
   * Match transaction against KOL_CLUSTER subscriptions (KOL Feed Visualise)
   * Same logic as Whale Cluster but for KOL/influencer txns: multiple KOLs, same token, timeframe, min volume.
   * @returns Number of matches
   */
  private async matchKOLCluster(tx: IWhaleAllTransactionsV2, correlationId: string): Promise<number> {
    const subscriptions = this.subscriptionMap.get(AlertType.KOL_CLUSTER) || []
    let matchCount = 0

    for (const sub of subscriptions) {
      try {
        if (!this.matchesKOLClusterFilters(tx, sub.config)) {
          logger.debug({
            component: 'AlertMatcherService',
            operation: 'matchKOLCluster',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.KOL_CLUSTER,
            txHash: tx.signature,
            matchResult: false,
            message: 'Filters did not match',
          })
          continue
        }

        const tokenAddress = tx.transaction?.tokenOut?.address || (tx as any).tokenOutAddress
        if (!tokenAddress) continue

        const timeWindowMinutes = sub.config.timeWindowMinutes ?? this.CLUSTER_TIME_WINDOW_MINUTES
        const clusterData = await this.getKOLClusterData(tokenAddress, timeWindowMinutes)

        if (sub.config.minClusterSize && clusterData.count < sub.config.minClusterSize) {
          logger.debug({
            component: 'AlertMatcherService',
            operation: 'matchKOLCluster',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.KOL_CLUSTER,
            txHash: tx.signature,
            matchResult: false,
            clusterSize: clusterData.count,
            minRequired: sub.config.minClusterSize,
            message: 'KOL cluster size below minimum',
          })
          continue
        }

        const minInflow = sub.config.minInflowUSD ?? 0
        if (clusterData.totalVolumeUSD < minInflow) {
          logger.debug({
            component: 'AlertMatcherService',
            operation: 'matchKOLCluster',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.KOL_CLUSTER,
            txHash: tx.signature,
            matchResult: false,
            totalVolumeUSD: clusterData.totalVolumeUSD,
            minInflowUSD: minInflow,
            message: 'KOL cluster total volume below minimum',
          })
          continue
        }

        // Cooldown: per subscription + token — same logic as whale cluster
        const cooldownKey = `${sub.subscriptionId}:${tokenAddress}`
        const snapshot = this.kolClusterLastAlerted.get(cooldownKey)
        const userTimeframeInMs = timeWindowMinutes * 60 * 1000
        const now = Date.now()

        let shouldSend = true
        let isUpdate = false
        let previousWalletCount: number | undefined
        let previousTotalVolume: number | undefined

        if (snapshot) {
          const timeSinceLast = now - snapshot.timestamp
          if (timeSinceLast >= userTimeframeInMs) {
            shouldSend = true
            isUpdate = false
          } else {
            const walletGrowth = clusterData.count - snapshot.walletCount
            const volumeGrowth = clusterData.totalVolumeUSD - snapshot.totalVolume
            const volumeGrowthSignificant =
              snapshot.totalVolume === 0
                ? volumeGrowth > 0
                : volumeGrowth >= snapshot.totalVolume * this.VOLUME_GROWTH_RATIO
            if (walletGrowth >= this.WALLET_GROWTH_THRESHOLD || volumeGrowthSignificant) {
              shouldSend = true
              isUpdate = true
              previousWalletCount = snapshot.walletCount
              previousTotalVolume = snapshot.totalVolume
            } else {
              shouldSend = false
            }
          }
        }

        if (!shouldSend) {
          logger.debug({
            component: 'AlertMatcherService',
            operation: 'matchKOLCluster',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.KOL_CLUSTER,
            txHash: tx.signature,
            message: 'Alert suppressed (cooldown, cluster growth below threshold)',
            tokenAddress,
            snapshotWalletCount: snapshot!.walletCount,
            currentWalletCount: clusterData.count,
          })
          continue
        }

        const tokenSymbol = this.resolveTokenSymbol(tx)
        const tokenName = tx.transaction?.tokenOut?.name || tokenSymbol
        const marketCap = parseFloat(
          (tx as any).marketCap?.buyMarketCap || tx.transaction?.tokenOut?.marketCap || '0',
        )

        const alertSentAt = now
        const message = formatKOLClusterAlert(
          tokenAddress,
          tokenSymbol,
          clusterData.count,
          clusterData.totalVolumeUSD,
          clusterData.timeWindowMinutes,
          {
            tokenName,
            marketCap: marketCap > 0 ? marketCap : undefined,
            triggeredAt: tx.timestamp ? new Date(tx.timestamp) : new Date(),
            formationTimeMs: clusterData.formationTimeMs,
            lastTxTimestamp: clusterData.lastTxTimestamp,
            alertSentAt,
            isUpdate: isUpdate || undefined,
            previousWalletCount,
            previousTotalVolume,
          },
        )

        const queued = await telegramService.queueAlert(
          sub.userId,
          AlertType.KOL_CLUSTER,
          tx.signature,
          message,
          sub.priority,
        )

        if (queued) {
          this.kolClusterLastAlerted.set(cooldownKey, {
            timestamp: now,
            walletCount: clusterData.count,
            totalVolume: clusterData.totalVolumeUSD,
          })
          matchCount++
          this.metrics.totalMatches++
          const typeCount = this.metrics.matchesByType.get(AlertType.KOL_CLUSTER) || 0
          this.metrics.matchesByType.set(AlertType.KOL_CLUSTER, typeCount + 1)
          logger.info({
            component: 'AlertMatcherService',
            operation: 'matchKOLCluster',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.KOL_CLUSTER,
            txHash: tx.signature,
            matchResult: true,
            kolCount: clusterData.count,
            isUpdate: isUpdate || undefined,
            message: isUpdate ? 'KOL_CLUSTER update alert queued' : 'KOL_CLUSTER alert matched and queued',
          })
        }
      } catch (error) {
        logger.error({
          component: 'AlertMatcherService',
          operation: 'matchKOLCluster',
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
        // Send alerts for BUY and SWAP transactions (skip SELL-only)
        // Transaction types: 'buy', 'sell', 'swap'
        // - 'buy': Pure buy transaction ✅ (includes split swap BUY records)
        // - 'sell': Pure sell transaction ❌
        // - 'swap': Token swap transaction ✅
        // Note: Split swaps now create separate 'buy' and 'sell' records
        if (tx.type === 'sell') {
          logger.debug({
            component: 'AlertMatcherService',
            operation: 'matchKOLActivity',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.KOL_ACTIVITY,
            txHash: tx.signature,
            txType: tx.type,
            matchResult: false,
            message: 'Transaction is SELL-only - skipping alert',
          })
          continue
        }

        // Check if transaction is from a KOL wallet
        const whaleAddress = tx.whale?.address || tx.whaleAddress
        if (!whaleAddress) {
          continue
        }
        
        const kolInfo = await this.getKOLInfo(whaleAddress)
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
   * Match transaction against KOL_PROFILE subscriptions
   * Alerts for specific KOL profiles that users have subscribed to
   * @returns Number of matches
   */
  private async matchKOLProfile(tx: IInfluencerWhaleTransactionsV2, correlationId: string): Promise<number> {
    const subscriptions = this.subscriptionMap.get(AlertType.KOL_PROFILE) || []
    let matchCount = 0

    for (const sub of subscriptions) {
      try {
        // Send alerts for BUY and SWAP transactions (skip SELL-only)
        // Transaction types: 'buy', 'sell', 'swap'
        // - 'buy': Pure buy transaction ✅ (includes split swap BUY records)
        // - 'sell': Pure sell transaction ❌
        // - 'swap': Token swap transaction ✅
        // Note: Split swaps now create separate 'buy' and 'sell' records
        if (tx.type === 'sell') {
          logger.debug({
            component: 'AlertMatcherService',
            operation: 'matchKOLProfile',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.KOL_PROFILE,
            txHash: tx.signature,
            txType: tx.type,
            matchResult: false,
            message: 'Transaction is SELL-only - skipping alert',
          })
          continue
        }

        // Check if transaction is from the target KOL
        const kolAddress = tx.whaleAddress
        const targetKolAddress = sub.config.targetKolAddress

        if (!kolAddress || !targetKolAddress || kolAddress.toLowerCase() !== targetKolAddress.toLowerCase()) {
          continue
        }

        // Check hotness score threshold
        if (sub.config.minHotnessScore && tx.hotnessScore < sub.config.minHotnessScore) {
          logger.debug({
            component: 'AlertMatcherService',
            operation: 'matchKOLProfile',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.KOL_PROFILE,
            txHash: tx.signature,
            hotnessScore: tx.hotnessScore,
            threshold: sub.config.minHotnessScore,
            matchResult: false,
            message: 'Hotness score below threshold',
          })
          continue
        }

        // Check minimum amount
        if (sub.config.minAmount) {
          const usdAmount = parseFloat(tx.transaction.tokenOut.usdAmount || '0')
          if (usdAmount < sub.config.minAmount) {
            logger.debug({
              component: 'AlertMatcherService',
              operation: 'matchKOLProfile',
              correlationId,
              userId: sub.userId,
              alertType: AlertType.KOL_PROFILE,
              txHash: tx.signature,
              amount: usdAmount,
              threshold: sub.config.minAmount,
              matchResult: false,
              message: 'Amount below threshold',
            })
            continue
          }
        }

        // Check market cap range filter
        if (sub.config.minMarketCapUSD !== undefined || sub.config.maxMarketCapUSD !== undefined) {
          const tokenOutMarketCap = parseFloat(tx.transaction.tokenOut.marketCap || '0')
          
          if (sub.config.minMarketCapUSD !== undefined && tokenOutMarketCap < sub.config.minMarketCapUSD) {
            logger.debug({
              component: 'AlertMatcherService',
              operation: 'matchKOLProfile',
              correlationId,
              userId: sub.userId,
              alertType: AlertType.KOL_PROFILE,
              txHash: tx.signature,
              marketCap: tokenOutMarketCap,
              minThreshold: sub.config.minMarketCapUSD,
              matchResult: false,
              message: 'Market cap below minimum threshold',
            })
            continue
          }
          
          if (sub.config.maxMarketCapUSD !== undefined && sub.config.maxMarketCapUSD < 50000000) {
            if (tokenOutMarketCap > sub.config.maxMarketCapUSD) {
              logger.debug({
                component: 'AlertMatcherService',
                operation: 'matchKOLProfile',
                correlationId,
                userId: sub.userId,
                alertType: AlertType.KOL_PROFILE,
                txHash: tx.signature,
                marketCap: tokenOutMarketCap,
                maxThreshold: sub.config.maxMarketCapUSD,
                matchResult: false,
                message: 'Market cap above maximum threshold',
              })
              continue
            }
          }
        }

        // Resolve token symbol (inline for IInfluencerWhaleTransactionsV2)
        const isBuy = tx.type === 'buy'
        const token = isBuy ? tx.transaction.tokenOut : tx.transaction.tokenIn
        const tokenSymbol = token.symbol || 'Unknown'

        // Get KOL info
        const kolName = tx.influencerName || sub.config.targetKolUsername || 'Unknown KOL'
        const kolUsername = tx.influencerUsername || sub.config.targetKolUsername

        // Format message using KOL Profile alert format
        const message = formatKOLProfileAlert(kolName, tx, tokenSymbol, kolUsername)

        // Queue alert
        const queued = await telegramService.queueAlert(
          sub.userId,
          AlertType.KOL_PROFILE,
          tx.signature,
          message,
          sub.priority,
        )

        if (queued) {
          matchCount++
          this.metrics.totalMatches++
          const typeCount = this.metrics.matchesByType.get(AlertType.KOL_PROFILE) || 0
          this.metrics.matchesByType.set(AlertType.KOL_PROFILE, typeCount + 1)

          logger.info({
            component: 'AlertMatcherService',
            operation: 'matchKOLProfile',
            correlationId,
            userId: sub.userId,
            alertType: AlertType.KOL_PROFILE,
            txHash: tx.signature,
            matchResult: true,
            kol: kolUsername,
            hotnessScore: tx.hotnessScore,
            amount: tx.transaction.tokenOut.usdAmount,
            message: 'KOL_PROFILE alert matched and queued',
          })
        }
      } catch (error) {
        logger.error({
          component: 'AlertMatcherService',
          operation: 'matchKOLProfile',
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
   * with hotness score, minimum buy amount, wallet label filters, and market cap range
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

    // Check market cap range filter
    if (config.minMarketCapUSD !== undefined || config.maxMarketCapUSD !== undefined) {
      // Get the market cap of the token being bought (tokenOut)
      const tokenOutMarketCap = parseFloat(tx.transaction.tokenOut.marketCap || '0')
      
      // Check minimum market cap
      if (config.minMarketCapUSD !== undefined && tokenOutMarketCap < config.minMarketCapUSD) {
        return false
      }
      
      // Check maximum market cap (50M+ means no upper limit)
      if (config.maxMarketCapUSD !== undefined && config.maxMarketCapUSD < 50000000) {
        if (tokenOutMarketCap > config.maxMarketCapUSD) {
          return false
        }
      }
      // If maxMarketCapUSD >= 50M, accept all (no upper limit)
    }

    // Check wallet labels with OR logic
    // If ANY wallet labels are specified, accept ALL transactions (with or without labels)
    // that meet the other criteria (USD amount, hotness score, market cap)
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

    // Check market cap range (bought token = tokenOut)
    if (config.minMarketCapUSD !== undefined || config.maxMarketCapUSD !== undefined) {
      const tokenOutMarketCap = parseFloat(tx.transaction.tokenOut.marketCap || '0')
      if (config.minMarketCapUSD !== undefined && tokenOutMarketCap < config.minMarketCapUSD) {
        return false
      }
      if (config.maxMarketCapUSD !== undefined && config.maxMarketCapUSD < 50000000) {
        if (tokenOutMarketCap > config.maxMarketCapUSD) {
          return false
        }
      }
    }

    return true
  }

  /**
   * Check if transaction matches KOL_CLUSTER filters (same as whale cluster: token + market cap)
   */
  private matchesKOLClusterFilters(tx: IWhaleAllTransactionsV2, config: AlertConfig): boolean {
    const tokenAddress = tx.transaction?.tokenOut?.address || (tx as any).tokenOutAddress
    if (config.tokens && config.tokens.length > 0 && tokenAddress && !config.tokens.includes(tokenAddress)) {
      return false
    }
    const tokenOutMarketCap = parseFloat(tx.transaction?.tokenOut?.marketCap || (tx as any).marketCap?.buyMarketCap || '0')
    if (config.minMarketCapUSD !== undefined && tokenOutMarketCap < config.minMarketCapUSD) {
      return false
    }
    if (config.maxMarketCapUSD !== undefined && config.maxMarketCapUSD < 50000000 && tokenOutMarketCap > config.maxMarketCapUSD) {
      return false
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
    // Check hotness score threshold
    if (config.hotnessScoreThreshold !== undefined) {
      const hotnessScore = tx.hotnessScore || 0
      if (hotnessScore < config.hotnessScoreThreshold) {
        return false
      }
    }

    // Check minimum buy amount
    if (config.minBuyAmountUSD !== undefined) {
      const usdAmount = parseFloat(tx.transaction.tokenOut.usdAmount || '0')
      if (usdAmount < config.minBuyAmountUSD) {
        return false
      }
    }

    // Check market cap range filter
    if (config.minMarketCapUSD !== undefined || config.maxMarketCapUSD !== undefined) {
      const tokenOutMarketCap = parseFloat(tx.transaction.tokenOut.marketCap || '0')
      
      if (config.minMarketCapUSD !== undefined && tokenOutMarketCap < config.minMarketCapUSD) {
        return false
      }
      
      if (config.maxMarketCapUSD !== undefined && config.maxMarketCapUSD < 50000000) {
        if (tokenOutMarketCap > config.maxMarketCapUSD) {
          return false
        }
      }
    }

    // Check KOL filter (if specific KOLs are selected)
    if (config.kolIds && config.kolIds.length > 0) {
      if (!config.kolIds.includes(kolUsername)) {
        return false
      }
    }

    // Check token filter (if specific tokens are selected)
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
   * @param tokenAddress - Token (bought) address
   * @param timeWindowMinutes - Window in minutes (default CLUSTER_TIME_WINDOW_MINUTES)
   */
  private async getClusterData(
    tokenAddress: string,
    timeWindowMinutes?: number,
  ): Promise<ClusterResult> {
    const windowMins = timeWindowMinutes ?? this.CLUSTER_TIME_WINDOW_MINUTES
    const cacheKey = `${tokenAddress}_${windowMins}`

    // Check cache first
    const cached = this.clusterCache.get(cacheKey)
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
    const timeWindowStart = new Date(Date.now() - windowMins * 60 * 1000)

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
      if (tx.whale?.address) uniqueWhales.add(tx.whale.address)
      const usdAmount = parseFloat(tx.transaction?.tokenOut?.usdAmount || '0')
      totalVolumeUSD += usdAmount
    }

    let firstTxTimestamp: number | undefined
    let lastTxTimestamp: number | undefined
    let formationTimeMs: number | undefined
    if (transactions.length > 0) {
      const times = transactions.map((t) =>
        t.timestamp instanceof Date ? t.timestamp.getTime() : Number(t.timestamp),
      )
      firstTxTimestamp = Math.min(...times)
      lastTxTimestamp = Math.max(...times)
      formationTimeMs = lastTxTimestamp - firstTxTimestamp
    }

    const result: ClusterResult = {
      count: uniqueWhales.size,
      totalVolumeUSD,
      timeWindowMinutes: windowMins,
      timestamp: Date.now(),
      ...(firstTxTimestamp != null && { firstTxTimestamp }),
      ...(lastTxTimestamp != null && { lastTxTimestamp }),
      ...(formationTimeMs != null && { formationTimeMs }),
    }

    // Cache the result
    this.clusterCache.set(cacheKey, result)

    logger.debug({
      component: 'AlertMatcherService',
      operation: 'getClusterData',
      tokenAddress,
      cacheHit: false,
      whaleCount: result.count,
      totalVolumeUSD: result.totalVolumeUSD,
      timeWindowMinutes: windowMins,
      message: 'Calculated and cached cluster data',
    })

    return result
  }

  /**
   * Get KOL cluster data for a token (count distinct KOL wallets + total buy volume in window)
   * Queries influencer transactions only.
   */
  private async getKOLClusterData(
    tokenAddress: string,
    timeWindowMinutes?: number,
  ): Promise<ClusterResult> {
    const windowMins = timeWindowMinutes ?? this.CLUSTER_TIME_WINDOW_MINUTES
    const cacheKey = `kol_${tokenAddress}_${windowMins}`

    const cached = this.kolClusterCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < this.CLUSTER_CACHE_TTL_MS) {
      return cached
    }

    const timeWindowStart = new Date(Date.now() - windowMins * 60 * 1000)

    const transactions = await influencerWhaleTransactionsModelV2
      .find({
        $or: [
          { 'transaction.tokenOut.address': tokenAddress },
          { tokenOutAddress: tokenAddress },
        ],
        timestamp: { $gte: timeWindowStart },
        type: { $in: ['buy', 'both'] },
      })
      .lean()

    const uniqueKolWallets = new Set<string>()
    let totalVolumeUSD = 0

    for (const tx of transactions) {
      const wallet = (tx as any).whaleAddress
      if (wallet) uniqueKolWallets.add(wallet)
      const usdStr = (tx as any).amount?.buyAmount ?? (tx as any).transaction?.tokenOut?.usdAmount ?? '0'
      totalVolumeUSD += parseFloat(usdStr)
    }

    let firstTxTimestamp: number | undefined
    let lastTxTimestamp: number | undefined
    let formationTimeMs: number | undefined
    if (transactions.length > 0) {
      const times = transactions.map((t) => {
        const ts = (t as any).timestamp
        return ts instanceof Date ? ts.getTime() : Number(ts)
      })
      firstTxTimestamp = Math.min(...times)
      lastTxTimestamp = Math.max(...times)
      formationTimeMs = lastTxTimestamp - firstTxTimestamp
    }

    const result: ClusterResult = {
      count: uniqueKolWallets.size,
      totalVolumeUSD,
      timeWindowMinutes: windowMins,
      timestamp: Date.now(),
      ...(firstTxTimestamp != null && { firstTxTimestamp }),
      ...(lastTxTimestamp != null && { lastTxTimestamp }),
      ...(formationTimeMs != null && { formationTimeMs }),
    }

    this.kolClusterCache.set(cacheKey, result)

    logger.debug({
      component: 'AlertMatcherService',
      operation: 'getKOLClusterData',
      tokenAddress,
      kolCount: result.count,
      totalVolumeUSD: result.totalVolumeUSD,
      timeWindowMinutes: windowMins,
      message: 'Calculated KOL cluster data',
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

      for (const key of expiredKeys) {
        this.clusterCache.delete(key)
      }

      const kolExpiredKeys: string[] = []
      Array.from(this.kolClusterCache.entries()).forEach(([key, value]) => {
        if (now - value.timestamp > this.CLUSTER_CACHE_TTL_MS) {
          kolExpiredKeys.push(key)
        }
      })
      for (const key of kolExpiredKeys) {
        this.kolClusterCache.delete(key)
      }

      if (expiredKeys.length > 0 || kolExpiredKeys.length > 0) {
        logger.debug({
          component: 'AlertMatcherService',
          operation: 'clusterCacheCleanup',
          removedCount: expiredKeys.length + kolExpiredKeys.length,
          cacheSize: this.clusterCache.size,
          kolClusterCacheSize: this.kolClusterCache.size,
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
   * Start cluster cooldown snapshot cleanup (whale + KOL; remove entries older than SNAPSHOT_MAX_AGE_MS)
   */
  private startWhaleClusterSnapshotCleanup(): void {
    this.snapshotCleanupInterval = setInterval(() => {
      const now = Date.now()
      const whaleExpired: string[] = []
      const kolExpired: string[] = []
      Array.from(this.whaleClusterLastAlerted.entries()).forEach(([key, value]) => {
        if (now - value.timestamp > this.SNAPSHOT_MAX_AGE_MS) whaleExpired.push(key)
      })
      Array.from(this.kolClusterLastAlerted.entries()).forEach(([key, value]) => {
        if (now - value.timestamp > this.SNAPSHOT_MAX_AGE_MS) kolExpired.push(key)
      })
      for (const key of whaleExpired) this.whaleClusterLastAlerted.delete(key)
      for (const key of kolExpired) this.kolClusterLastAlerted.delete(key)
      if (whaleExpired.length > 0 || kolExpired.length > 0) {
        logger.debug({
          component: 'AlertMatcherService',
          operation: 'clusterSnapshotCleanup',
          whaleRemoved: whaleExpired.length,
          kolRemoved: kolExpired.length,
          whaleRemaining: this.whaleClusterLastAlerted.size,
          kolRemaining: this.kolClusterLastAlerted.size,
          message: 'Cleaned up expired cluster cooldown snapshots',
        })
      }
    }, this.SNAPSHOT_CLEANUP_INTERVAL_MS)
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
          kolClusterCount: this.subscriptionMap.get(AlertType.KOL_CLUSTER)?.length || 0,
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

    if (this.snapshotCleanupInterval) {
      clearInterval(this.snapshotCleanupInterval)
      this.snapshotCleanupInterval = null
    }

    this.subscriptionMap.clear()
    this.clusterCache.clear()
    this.kolClusterCache.clear()
    this.tokenSymbolCache.clear()
    this.whaleClusterLastAlerted.clear()
    this.kolClusterLastAlerted.clear()
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
