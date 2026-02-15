import { Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { User } from '../models/user.model'
import { UserAlert } from '../models/userAlert.model'
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors'
import { alertMatcherService } from '../services/alertMatcher.service'
import { telegramService } from '../services/telegram.service'
import { AlertType, Priority, AlertConfig } from '../types/alert.types'
import { validateSOLBalance } from '../middlewares/premiumGate.middleware'
import logger from '../utils/logger'

/**
 * GET /api/v1/alerts/premium-access
 * Check if user has premium access based on SOL balance
 * Query params: refresh=true to bypass cache
 */
export const checkPremiumAccessStatus = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const bypassCache = req.query.refresh === 'true'

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      })
    }

    try {
      // Get user's wallet address
      const user = await User.findById(userId)

      if (!user || !user.walletAddress) {
        return res.status(400).json({
          success: false,
          message: 'Wallet address not found. Please connect your wallet.',
        })
      }

      // Use walletAddressOriginal if available (correct case), otherwise use walletAddress
      // For users with lowercase legacy addresses, this will gracefully return no access
      const walletForCheck = user.walletAddressOriginal || user.walletAddress

      // Validate SOL balance (with optional cache bypass)
      const result = await validateSOLBalance(walletForCheck, bypassCache)

      logger.info({
        component: 'AlertController',
        operation: 'checkPremiumAccessStatus',
        userId,
        walletAddress: user.walletAddress,
        hasAccess: result.hasAccess,
        currentBalance: result.currentBalance,
        bypassCache,
        message: 'Premium access check completed',
      })

      res.status(200).json({
        success: true,
        data: {
          hasAccess: result.hasAccess,
          currentBalance: result.currentBalance,
          requiredBalance: result.requiredBalance,
          difference: result.difference,
        },
      })
    } catch (error) {
      logger.error({
        component: 'AlertController',
        operation: 'checkPremiumAccessStatus',
        userId,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })

      res.status(503).json({
        success: false,
        message: error instanceof Error ? error.message : 'Unable to verify balance. Please try again.',
      })
    }
  },
)

/**
 * POST /api/v1/alerts/whale-alert
 * Create or update whale alert subscription
 */
export const createWhaleAlert = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const userId = (req as any).userId

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      })
    }

    const { hotnessScoreThreshold, walletLabels, minBuyAmountUSD, minMarketCapUSD, maxMarketCapUSD } = req.body

    // Validate input parameters
    if (hotnessScoreThreshold === undefined || hotnessScoreThreshold === null) {
      return res.status(400).json({
        success: false,
        message: 'Hotness score threshold is required',
      })
    }

    if (hotnessScoreThreshold < 0 || hotnessScoreThreshold > 10) {
      return res.status(400).json({
        success: false,
        message: 'Hotness score must be between 0 and 10',
      })
    }

    if (minBuyAmountUSD === undefined || minBuyAmountUSD === null) {
      return res.status(400).json({
        success: false,
        message: 'Minimum buy amount is required',
      })
    }

    if (minBuyAmountUSD <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Minimum buy amount must be positive',
      })
    }

    // Validate market cap range (optional)
    if (minMarketCapUSD !== undefined && minMarketCapUSD < 1000) {
      return res.status(400).json({
        success: false,
        message: 'Minimum market cap must be at least 1K (1000 USD)',
      })
    }

    if (maxMarketCapUSD !== undefined && maxMarketCapUSD < 1000) {
      return res.status(400).json({
        success: false,
        message: 'Maximum market cap must be at least 1K (1000 USD)',
      })
    }

    if (
      minMarketCapUSD !== undefined &&
      maxMarketCapUSD !== undefined &&
      minMarketCapUSD > maxMarketCapUSD
    ) {
      return res.status(400).json({
        success: false,
        message: 'Minimum market cap cannot be greater than maximum market cap',
      })
    }

    // Validate wallet labels array
    if (!walletLabels || !Array.isArray(walletLabels)) {
      return res.status(400).json({
        success: false,
        message: 'Wallet labels must be an array',
      })
    }

    // Define valid labels (uppercase format as stored in database)
    const validLabels = ['SNIPER', 'SMART MONEY', 'INSIDER', 'HEAVY ACCUMULATOR', 'WHALE', 'FLIPPER', 'COORDINATED GROUP', 'DORMANT WHALE', 'KOL']

    // Label normalization map to handle both uppercase and title case
    const labelMap: Record<string, string> = {
      'SNIPER': 'SNIPER',
      'Sniper': 'SNIPER',
      'SMART MONEY': 'SMART MONEY',
      'Smart Money': 'SMART MONEY',
      'INSIDER': 'INSIDER',
      'Insider': 'INSIDER',
      'HEAVY ACCUMULATOR': 'HEAVY ACCUMULATOR',
      'Heavy Accumulator': 'HEAVY ACCUMULATOR',
      'WHALE': 'WHALE',
      'Whale': 'WHALE',
      'FLIPPER': 'FLIPPER',
      'Flipper': 'FLIPPER',
      'COORDINATED GROUP': 'COORDINATED GROUP',
      'Coordinated Group': 'COORDINATED GROUP',
      'DORMANT WHALE': 'DORMANT WHALE',
      'Dormant Whale': 'DORMANT WHALE',
      'KOL': 'KOL',
    }

    // Empty array is allowed (represents "all labels")
    let normalizedLabels: string[] = []

    if (walletLabels.length > 0) {
      // Normalize labels before validation
      normalizedLabels = walletLabels.map(label => labelMap[label] || label)
      const invalidLabels = normalizedLabels.filter(label => !validLabels.includes(label))

      if (invalidLabels.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid wallet labels: ${invalidLabels.join(', ')}. Must be one of: ${validLabels.join(', ')}`,
        })
      }
    }
    // Empty array is valid - means "All" (accept all transactions)

    try {
      // Get user to verify wallet address and Telegram connection
      const user = await User.findById(userId)

      if (!user || !user.walletAddress) {
        return res.status(400).json({
          success: false,
          message: 'Wallet address not found. Please connect your wallet.',
        })
      }

      // Check if Telegram is connected
      if (!user.telegramChatId) {
        return res.status(400).json({
          success: false,
          message: 'Telegram account not connected. Please connect your Telegram account first.',
        })
      }

      // Use walletAddressOriginal if available (correct case), otherwise use walletAddress
      const walletForCheck = user.walletAddressOriginal || user.walletAddress

      // Check premium access
      const premiumResult = await validateSOLBalance(walletForCheck)

      if (!premiumResult.hasAccess) {
        return res.status(403).json({
          success: false,
          message: `Premium access required. Minimum balance: ${premiumResult.requiredBalance} SOL`,
          data: {
            currentBalance: premiumResult.currentBalance,
            requiredBalance: premiumResult.requiredBalance,
            difference: premiumResult.difference,
          },
        })
      }

      // Normalize and sort wallet labels for consistent comparison
      const sortedNormalizedLabels = normalizedLabels.slice().sort()

      // Create or update whale alert subscription
      const config: Partial<AlertConfig> = {
        hotnessScoreThreshold,
        walletLabels: sortedNormalizedLabels,
        minBuyAmountUSD,
      }

      // Add market cap filters if provided
      if (minMarketCapUSD !== undefined) {
        config.minMarketCapUSD = minMarketCapUSD
      }
      if (maxMarketCapUSD !== undefined) {
        config.maxMarketCapUSD = maxMarketCapUSD
      }

      // Check if an alert with the same hotness score and min buy amount exists
      const existingAlerts = await UserAlert.find({
        userId,
        type: AlertType.ALPHA_STREAM,
        enabled: true,
        'config.hotnessScoreThreshold': hotnessScoreThreshold,
        'config.minBuyAmountUSD': minBuyAmountUSD,
      })

      let alert
      let isDuplicate = false

      // Check each existing alert to see if labels match after normalization
      for (const existingAlert of existingAlerts) {
        // Normalize and sort existing labels for comparison
        const existingLabels = ((existingAlert.config as any).walletLabels || [])
          .map((label: string) => labelMap[label] || label)
          .sort()

        // Compare normalized, sorted arrays
        const labelsMatch = JSON.stringify(existingLabels) === JSON.stringify(sortedNormalizedLabels)

        if (labelsMatch) {
          // Exact match found - update the existing alert timestamp
          isDuplicate = true
          alert = await UserAlert.findByIdAndUpdate(
            existingAlert._id,
            {
              updatedAt: new Date(),
            },
            { new: true }
          )
          break
        }
      }

      // If no duplicate found, create new alert
      if (!isDuplicate) {
        alert = await UserAlert.create({
          userId,
          type: AlertType.ALPHA_STREAM,
          priority: Priority.LOW,
          enabled: true,
          config,
        })
      }

      // Invalidate cache to pick up new subscription
      alertMatcherService.invalidateUserSubscriptions(userId)

      // Send confirmation message to Telegram
      const isUpdate = isDuplicate
      telegramService.sendAlertConfirmation(
        userId,
        AlertType.ALPHA_STREAM,
        config,
        isUpdate,
      ).catch((error) => {
        // Don't fail the request if confirmation fails
        logger.warn({
          component: 'AlertController',
          operation: 'createWhaleAlert',
          userId,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          message: 'Failed to send Telegram confirmation, but alert was created',
        })
      })

      if (!alert) {
        return res.status(500).json({
          success: false,
          message: 'Failed to create or update alert',
        })
      }

      logger.info({
        component: 'AlertController',
        operation: 'createWhaleAlert',
        userId,
        alertId: alert._id,
        config,
        message: 'Whale alert subscription created/updated successfully',
      })

      res.status(200).json({
        success: true,
        data: {
          alertId: alert._id,
          type: alert.type,
          config: alert.config,
          createdAt: alert.createdAt,
          updatedAt: alert.updatedAt,
        },
      })
    } catch (error) {
      logger.error({
        component: 'AlertController',
        operation: 'createWhaleAlert',
        userId,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })

      res.status(500).json({
        success: false,
        message: 'Failed to create whale alert subscription',
      })
    }
  },
)

/**
 * GET /api/v1/alerts/whale-alerts
 * Get user's whale alert subscriptions
 */
export const getWhaleAlerts = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const userId = (req as any).userId

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      })
    }

    try {
      // Query whale alert subscriptions (ALPHA_STREAM type)
      // Get all alerts (hard delete removes them completely, so no need to filter by enabled)
      const alerts = await UserAlert.find({
        userId,
        type: AlertType.ALPHA_STREAM,
      })
        .sort({ createdAt: -1 })
        .lean()

      logger.debug({
        component: 'AlertController',
        operation: 'getWhaleAlerts',
        userId,
        alertCount: alerts.length,
        message: 'Retrieved whale alert subscriptions',
      })

      res.status(200).json({
        success: true,
        data: {
          alerts: alerts.map((alert) => ({
            _id: alert._id,
            type: alert.type,
            priority: alert.priority,
            enabled: alert.enabled,
            config: alert.config,
            createdAt: alert.createdAt,
            updatedAt: alert.updatedAt,
          })),
        },
      })
    } catch (error) {
      logger.error({
        component: 'AlertController',
        operation: 'getWhaleAlerts',
        userId,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })

      res.status(500).json({
        success: false,
        message: 'Failed to retrieve whale alert subscriptions',
      })
    }
  },
)

/**
 * DELETE /api/v1/alerts/whale-alert/:alertId
 * Delete whale alert subscription (soft delete)
 */
export const deleteWhaleAlert = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const { alertId } = req.params

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      })
    }

    if (!alertId) {
      return res.status(400).json({
        success: false,
        message: 'Alert ID is required',
      })
    }

    try {
      // Hard delete - permanently remove from database
      // Verify ownership by including userId in query
      const alert = await UserAlert.findOneAndDelete({
        _id: alertId,
        userId,
        type: AlertType.ALPHA_STREAM,
      })

      if (!alert) {
        return res.status(404).json({
          success: false,
          message: 'Whale alert subscription not found',
        })
      }

      // Trigger immediate cache invalidation
      alertMatcherService.invalidateUserSubscriptions(userId)

      // Send deletion confirmation to Telegram
      telegramService.sendAlertDeletionConfirmation(
        userId,
        AlertType.ALPHA_STREAM,
      ).catch((error) => {
        // Don't fail the request if confirmation fails
        logger.warn({
          component: 'AlertController',
          operation: 'deleteWhaleAlert',
          userId,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          message: 'Failed to send Telegram deletion confirmation',
        })
      })

      logger.info({
        component: 'AlertController',
        operation: 'deleteWhaleAlert',
        userId,
        alertId,
        message: 'Whale alert subscription permanently deleted',
      })

      res.status(200).json({
        success: true,
        message: 'Whale alert subscription deleted successfully',
      })
    } catch (error) {
      logger.error({
        component: 'AlertController',
        operation: 'deleteWhaleAlert',
        userId,
        alertId,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })

      res.status(500).json({
        success: false,
        message: 'Failed to delete whale alert subscription',
      })
    }
  },
)

/**
 * POST /api/v1/alerts/link
 * Generate account linking token for Telegram
 */
export const generateLinkToken = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const userId = (req as any).userId

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      })
    }

    try {
      // Generate UUID token
      const token = uuidv4()

      // Set expiry to 10 minutes from now
      const expiry = new Date(Date.now() + 10 * 60 * 1000)

      // Update user with token and expiry
      const user = await User.findByIdAndUpdate(
        userId,
        {
          telegramLinkToken: token,
          telegramLinkTokenExpiry: expiry,
        },
        { new: true },
      )

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        })
      }

      logger.info({
        component: 'AlertController',
        operation: 'generateLinkToken',
        userId,
        message: 'Link token generated successfully',
      })

      // Get bot username from environment or use default
      const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'AlphaBlockAIbot'

      res.status(200).json({
        success: true,
        data: {
          token,
          expiresAt: expiry.toISOString(),
          botUsername,
          deepLink: `https://t.me/${botUsername}?start=${token}`,
        },
      })
    } catch (error) {
      logger.error({
        component: 'AlertController',
        operation: 'generateLinkToken',
        userId,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })

      res.status(500).json({
        success: false,
        message: 'Failed to generate link token',
      })
    }
  },
)

/**
 * POST /api/v1/alerts/unlink-telegram
 * Disconnect Telegram account and delete all alerts
 */
export const unlinkTelegram = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const userId = (req as any).userId

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      })
    }

    try {
      // Delete all user alerts (hard delete)
      const deleteResult = await UserAlert.deleteMany({ userId })

      // Update user to remove Telegram connection
      const user = await User.findByIdAndUpdate(
        userId,
        {
          $unset: {
            telegramChatId: 1,
            telegramUsername: 1,
            telegramFirstName: 1,
            telegramLinkToken: 1,
            telegramLinkTokenExpiry: 1,
          },
        },
        { new: true },
      )

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        })
      }

      // Invalidate cache to remove user subscriptions
      alertMatcherService.invalidateUserSubscriptions(userId)

      logger.info({
        component: 'AlertController',
        operation: 'unlinkTelegram',
        userId,
        alertsDeleted: deleteResult.deletedCount,
        message: 'Telegram account disconnected and alerts deleted successfully',
      })

      res.status(200).json({
        success: true,
        message: 'Telegram account disconnected successfully',
        data: {
          alertsDeleted: deleteResult.deletedCount,
        },
      })
    } catch (error) {
      logger.error({
        component: 'AlertController',
        operation: 'unlinkTelegram',
        userId,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })

      res.status(500).json({
        success: false,
        message: 'Failed to disconnect Telegram account',
      })
    }
  },
)

/**
 * POST /api/v1/alerts/upsert
 * Create or update alert subscription
 */
export const upsertAlert = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const userId = (req as any).userId

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      })
    }

    const { type, priority, enabled, config, alertId } = req.body

    // Validation
    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Alert type is required',
      })
    }

    // Validate alert type
    if (!Object.values(AlertType).includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid alert type. Must be one of: ${Object.values(AlertType).join(', ')}`,
      })
    }

    // Validate priority if provided
    if (priority && !Object.values(Priority).includes(priority)) {
      return res.status(400).json({
        success: false,
        message: `Invalid priority. Must be one of: ${Object.values(Priority).join(', ')}`,
      })
    }

    try {
      // Build update data
      const updateData: any = {
        userId,
        type,
        priority: priority || Priority.MEDIUM,
        enabled: enabled !== undefined ? enabled : true,
        config: config || {},
      }

      // Use findOneAndUpdate with upsert for atomic operation
      const query = alertId
        ? { _id: alertId, userId } // Update specific alert
        : { userId, type } // Update by user and type

      const alert = await UserAlert.findOneAndUpdate(
        query,
        updateData,
        {
          upsert: true,
          new: true,
          runValidators: true,
        },
      )

      // If alert was disabled, trigger immediate cache invalidation
      if (enabled === false) {
        alertMatcherService.invalidateUserSubscriptions(userId)
      }

      logger.info({
        component: 'AlertController',
        operation: 'upsertAlert',
        userId,
        alertId: alert._id,
        type,
        enabled: alert.enabled,
        message: 'Alert upserted successfully',
      })

      res.status(200).json({
        success: true,
        data: {
          alert: {
            id: alert._id,
            type: alert.type,
            priority: alert.priority,
            enabled: alert.enabled,
            config: alert.config,
            createdAt: alert.createdAt,
            updatedAt: alert.updatedAt,
          },
        },
      })
    } catch (error) {
      logger.error({
        component: 'AlertController',
        operation: 'upsertAlert',
        userId,
        type,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })

      res.status(500).json({
        success: false,
        message: 'Failed to upsert alert',
      })
    }
  },
)

/**
 * GET /api/v1/alerts/my-alerts
 * Get user's alert subscriptions
 */
export const getMyAlerts = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const userId = (req as any).userId

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      })
    }

    try {
      const alerts = await UserAlert.find({ userId, enabled: true })
        .sort({ createdAt: -1 })
        .lean()

      logger.debug({
        component: 'AlertController',
        operation: 'getMyAlerts',
        userId,
        alertCount: alerts.length,
        message: 'Retrieved user alerts',
      })

      res.status(200).json({
        success: true,
        data: {
          alerts: alerts.map((alert) => ({
            id: alert._id,
            type: alert.type,
            priority: alert.priority,
            enabled: alert.enabled,
            config: alert.config,
            createdAt: alert.createdAt,
            updatedAt: alert.updatedAt,
          })),
        },
      })
    } catch (error) {
      logger.error({
        component: 'AlertController',
        operation: 'getMyAlerts',
        userId,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })

      res.status(500).json({
        success: false,
        message: 'Failed to retrieve alerts',
      })
    }
  },
)

/**
 * DELETE /api/v1/alerts/:alertId
 * Delete alert subscription (hard delete - permanently removes from database)
 */
export const deleteAlert = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const { alertId } = req.params

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      })
    }

    if (!alertId) {
      return res.status(400).json({
        success: false,
        message: 'Alert ID is required',
      })
    }

    try {
      // Hard delete - permanently remove from database
      const alert = await UserAlert.findOneAndDelete({
        _id: alertId,
        userId,
      })

      if (!alert) {
        return res.status(404).json({
          success: false,
          message: 'Alert not found',
        })
      }

      // Trigger immediate cache invalidation
      alertMatcherService.invalidateUserSubscriptions(userId)

      logger.info({
        component: 'AlertController',
        operation: 'deleteAlert',
        userId,
        alertId,
        message: 'Alert permanently deleted',
      })

      res.status(200).json({
        success: true,
        message: 'Alert deleted successfully',
      })
    } catch (error) {
      logger.error({
        component: 'AlertController',
        operation: 'deleteAlert',
        userId,
        alertId,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })

      res.status(500).json({
        success: false,
        message: 'Failed to delete alert',
      })
    }
  },
)

/**
 * GET /api/v1/alerts/health
 * Health check endpoint for alert system status
 */
export const getAlertSystemHealth = catchAsyncErrors(
  async (req: Request, res: Response) => {
    try {
      // Get metrics from both services
      const telegramMetrics = telegramService.getMetrics()
      const matcherMetrics = alertMatcherService.getMetrics()

      // Determine overall health status
      let status = 'healthy'
      const issues: string[] = []

      // Check Telegram service
      if (!telegramMetrics.status.isInitialized) {
        status = 'degraded'
        issues.push('Telegram service not initialized')
      }
      if (telegramMetrics.status.isShuttingDown) {
        status = 'degraded'
        issues.push('Telegram service is shutting down')
      }
      if (telegramMetrics.queue.isInBackpressure) {
        status = 'degraded'
        issues.push('Message queue in backpressure mode')
      }
      if (telegramMetrics.delivery.failureRate > 10) {
        status = 'degraded'
        issues.push(`High delivery failure rate: ${telegramMetrics.delivery.failureRate}%`)
      }

      // Check Alert Matcher service
      if (!matcherMetrics.status.isInitialized) {
        status = 'degraded'
        issues.push('Alert matcher service not initialized')
      }

      // If there are critical issues, mark as unhealthy
      if (
        !telegramMetrics.status.isInitialized ||
        !matcherMetrics.status.isInitialized
      ) {
        status = 'unhealthy'
      }

      logger.debug({
        component: 'AlertController',
        operation: 'getAlertSystemHealth',
        status,
        issueCount: issues.length,
        message: 'Health check completed',
      })

      res.status(status === 'unhealthy' ? 503 : 200).json({
        success: true,
        data: {
          status,
          timestamp: new Date().toISOString(),
          issues: issues.length > 0 ? issues : undefined,
          services: {
            telegram: telegramMetrics,
            alertMatcher: matcherMetrics,
          },
        },
      })
    } catch (error) {
      logger.error({
        component: 'AlertController',
        operation: 'getAlertSystemHealth',
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })

      res.status(500).json({
        success: false,
        message: 'Failed to retrieve health status',
      })
    }
  },
)

/**
 * POST /api/v1/alerts/kol-alert
 * Create or update KOL alert subscription
 */
export const createKolAlert = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const userId = (req as any).userId

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      })
    }

    const { hotnessScoreThreshold, minBuyAmountUSD, minMarketCapUSD, maxMarketCapUSD } = req.body

    // Validate input parameters
    if (hotnessScoreThreshold === undefined || hotnessScoreThreshold === null) {
      return res.status(400).json({
        success: false,
        message: 'Hotness score threshold is required',
      })
    }

    if (hotnessScoreThreshold < 0 || hotnessScoreThreshold > 10) {
      return res.status(400).json({
        success: false,
        message: 'Hotness score must be between 0 and 10',
      })
    }

    if (minBuyAmountUSD === undefined || minBuyAmountUSD === null) {
      return res.status(400).json({
        success: false,
        message: 'Minimum buy amount is required',
      })
    }

    if (minBuyAmountUSD <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Minimum buy amount must be positive',
      })
    }

    // Validate market cap range (optional)
    if (minMarketCapUSD !== undefined && minMarketCapUSD < 1000) {
      return res.status(400).json({
        success: false,
        message: 'Minimum market cap must be at least 1K (1000 USD)',
      })
    }

    if (maxMarketCapUSD !== undefined && maxMarketCapUSD < 1000) {
      return res.status(400).json({
        success: false,
        message: 'Maximum market cap must be at least 1K (1000 USD)',
      })
    }

    if (
      minMarketCapUSD !== undefined &&
      maxMarketCapUSD !== undefined &&
      minMarketCapUSD > maxMarketCapUSD
    ) {
      return res.status(400).json({
        success: false,
        message: 'Minimum market cap cannot be greater than maximum market cap',
      })
    }

    try {
      // Get user to verify wallet address and Telegram connection
      const user = await User.findById(userId)

      if (!user || !user.walletAddress) {
        return res.status(400).json({
          success: false,
          message: 'Wallet address not found. Please connect your wallet.',
        })
      }

      // Check if Telegram is connected
      if (!user.telegramChatId) {
        return res.status(400).json({
          success: false,
          message: 'Telegram account not connected. Please connect your Telegram account first.',
        })
      }

      // Use walletAddressOriginal if available (correct case), otherwise use walletAddress
      const walletForCheck = user.walletAddressOriginal || user.walletAddress

      // Check premium access
      const premiumResult = await validateSOLBalance(walletForCheck)

      if (!premiumResult.hasAccess) {
        return res.status(403).json({
          success: false,
          message: `Premium access required. Minimum balance: ${premiumResult.requiredBalance} SOL`,
          data: {
            currentBalance: premiumResult.currentBalance,
            requiredBalance: premiumResult.requiredBalance,
            difference: premiumResult.difference,
          },
        })
      }

      // Create or update KOL alert subscription
      const config: Partial<AlertConfig> = {
        hotnessScoreThreshold,
        minBuyAmountUSD,
      }

      // Add market cap filters if provided
      if (minMarketCapUSD !== undefined) {
        config.minMarketCapUSD = minMarketCapUSD
      }
      if (maxMarketCapUSD !== undefined) {
        config.maxMarketCapUSD = maxMarketCapUSD
      }

      // Check if an alert with the same config exists
      const existingAlert = await UserAlert.findOne({
        userId,
        type: AlertType.KOL_ACTIVITY,
        enabled: true,
        'config.hotnessScoreThreshold': hotnessScoreThreshold,
        'config.minBuyAmountUSD': minBuyAmountUSD,
      })

      let alert
      let isUpdate = false

      if (existingAlert) {
        // Update existing alert timestamp
        isUpdate = true
        alert = await UserAlert.findByIdAndUpdate(
          existingAlert._id,
          { updatedAt: new Date() },
          { new: true }
        )
      } else {
        // Create new alert
        alert = await UserAlert.create({
          userId,
          type: AlertType.KOL_ACTIVITY,
          priority: Priority.MEDIUM,
          enabled: true,
          config,
        })
      }

      // Invalidate cache to pick up new subscription
      alertMatcherService.invalidateUserSubscriptions(userId)

      // Send confirmation message to Telegram
      telegramService.sendAlertConfirmation(
        userId,
        AlertType.KOL_ACTIVITY,
        config,
        isUpdate,
      ).catch((error) => {
        logger.warn({
          component: 'AlertController',
          operation: 'createKolAlert',
          userId,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          message: 'Failed to send Telegram confirmation, but alert was created',
        })
      })

      if (!alert) {
        return res.status(500).json({
          success: false,
          message: 'Failed to create or update alert',
        })
      }

      logger.info({
        component: 'AlertController',
        operation: 'createKolAlert',
        userId,
        alertId: alert._id,
        config,
        message: 'KOL alert subscription created/updated successfully',
      })

      res.status(200).json({
        success: true,
        data: {
          alertId: alert._id,
          type: alert.type,
          config: alert.config,
          createdAt: alert.createdAt,
          updatedAt: alert.updatedAt,
        },
      })
    } catch (error) {
      logger.error({
        component: 'AlertController',
        operation: 'createKolAlert',
        userId,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })

      res.status(500).json({
        success: false,
        message: 'Failed to create KOL alert subscription',
      })
    }
  },
)

/**
 * GET /api/v1/alerts/kol-alerts
 * Get user's KOL alert subscriptions
 */
export const getKolAlerts = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const userId = (req as any).userId

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      })
    }

    try {
      const alerts = await UserAlert.find({
        userId,
        type: AlertType.KOL_ACTIVITY,
      })
        .sort({ createdAt: -1 })
        .lean()

      logger.debug({
        component: 'AlertController',
        operation: 'getKolAlerts',
        userId,
        alertCount: alerts.length,
        message: 'Retrieved KOL alert subscriptions',
      })

      res.status(200).json({
        success: true,
        data: {
          alerts: alerts.map((alert) => ({
            _id: alert._id,
            type: alert.type,
            priority: alert.priority,
            enabled: alert.enabled,
            config: alert.config,
            createdAt: alert.createdAt,
            updatedAt: alert.updatedAt,
          })),
        },
      })
    } catch (error) {
      logger.error({
        component: 'AlertController',
        operation: 'getKolAlerts',
        userId,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })

      res.status(500).json({
        success: false,
        message: 'Failed to retrieve KOL alert subscriptions',
      })
    }
  },
)

/**
 * DELETE /api/v1/alerts/kol-alert/:alertId
 * Delete KOL alert subscription
 */
export const deleteKolAlert = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const { alertId } = req.params

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      })
    }

    if (!alertId) {
      return res.status(400).json({
        success: false,
        message: 'Alert ID is required',
      })
    }

    try {
      // Hard delete - permanently remove from database
      const alert = await UserAlert.findOneAndDelete({
        _id: alertId,
        userId,
        type: AlertType.KOL_ACTIVITY,
      })

      if (!alert) {
        return res.status(404).json({
          success: false,
          message: 'KOL alert subscription not found',
        })
      }

      // Trigger immediate cache invalidation
      alertMatcherService.invalidateUserSubscriptions(userId)

      // Send deletion confirmation to Telegram
      telegramService.sendAlertDeletionConfirmation(
        userId,
        AlertType.KOL_ACTIVITY,
      ).catch((error) => {
        logger.warn({
          component: 'AlertController',
          operation: 'deleteKolAlert',
          userId,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          message: 'Failed to send Telegram deletion confirmation',
        })
      })

      logger.info({
        component: 'AlertController',
        operation: 'deleteKolAlert',
        userId,
        alertId,
        message: 'KOL alert subscription permanently deleted',
      })

      res.status(200).json({
        success: true,
        message: 'KOL alert subscription deleted successfully',
      })
    } catch (error) {
      logger.error({
        component: 'AlertController',
        operation: 'deleteKolAlert',
        userId,
        alertId,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })

      res.status(500).json({
        success: false,
        message: 'Failed to delete KOL alert subscription',
      })
    }
  },
)

/**
 * POST /api/v1/alerts/kol-profile
 * Create or update KOL Profile alert subscription
 */
export const createKolProfileAlert = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const userId = (req as any).userId

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      })
    }

    const { targetKolUsername, targetKolAddress, minHotnessScore, minAmount, minMarketCapUSD, maxMarketCapUSD } = req.body

    // Validate input parameters
    if (!targetKolUsername || !targetKolAddress) {
      return res.status(400).json({
        success: false,
        message: 'Target KOL username and address are required',
      })
    }

    if (minHotnessScore === undefined || minHotnessScore === null) {
      return res.status(400).json({
        success: false,
        message: 'Minimum hotness score is required',
      })
    }

    if (minHotnessScore < 0 || minHotnessScore > 10) {
      return res.status(400).json({
        success: false,
        message: 'Hotness score must be between 0 and 10',
      })
    }

    if (minAmount === undefined || minAmount === null) {
      return res.status(400).json({
        success: false,
        message: 'Minimum amount is required',
      })
    }

    if (minAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Minimum amount must be positive',
      })
    }

    // Validate market cap range (optional)
    if (minMarketCapUSD !== undefined && minMarketCapUSD < 1000) {
      return res.status(400).json({
        success: false,
        message: 'Minimum market cap must be at least $1,000',
      })
    }

    if (maxMarketCapUSD !== undefined && maxMarketCapUSD < 1000) {
      return res.status(400).json({
        success: false,
        message: 'Maximum market cap must be at least $1,000',
      })
    }

    if (
      minMarketCapUSD !== undefined &&
      maxMarketCapUSD !== undefined &&
      minMarketCapUSD > maxMarketCapUSD
    ) {
      return res.status(400).json({
        success: false,
        message: 'Minimum market cap cannot be greater than maximum market cap',
      })
    }

    try {
      // Get user to verify wallet address and Telegram connection
      const user = await User.findById(userId)

      if (!user || !user.walletAddress) {
        return res.status(400).json({
          success: false,
          message: 'Wallet address not found. Please connect your wallet.',
        })
      }

      // Check if Telegram is connected
      if (!user.telegramChatId) {
        return res.status(400).json({
          success: false,
          message: 'Telegram account not connected. Please connect your Telegram account first.',
        })
      }

      // Use walletAddressOriginal if available (correct case), otherwise use walletAddress
      const walletForCheck = user.walletAddressOriginal || user.walletAddress

      // Check premium access
      const premiumResult = await validateSOLBalance(walletForCheck)

      if (!premiumResult.hasAccess) {
        return res.status(403).json({
          success: false,
          message: `Premium access required. Minimum balance: ${premiumResult.requiredBalance} SOL`,
          data: {
            currentBalance: premiumResult.currentBalance,
            requiredBalance: premiumResult.requiredBalance,
            difference: premiumResult.difference,
          },
        })
      }

      // Create or update KOL Profile alert subscription
      const config: Partial<AlertConfig> = {
        targetKolUsername,
        targetKolAddress,
        minHotnessScore,
        minAmount,
      }

      // Add market cap filters if provided
      if (minMarketCapUSD !== undefined) {
        config.minMarketCapUSD = minMarketCapUSD
      }
      if (maxMarketCapUSD !== undefined) {
        config.maxMarketCapUSD = maxMarketCapUSD
      }

      // Check if an alert for this KOL with same config exists
      const existingAlert = await UserAlert.findOne({
        userId,
        type: AlertType.KOL_PROFILE,
        enabled: true,
        'config.targetKolAddress': targetKolAddress,
        'config.minHotnessScore': minHotnessScore,
        'config.minAmount': minAmount,
      })

      let alert
      let isUpdate = false

      if (existingAlert) {
        // Update existing alert timestamp
        isUpdate = true
        alert = await UserAlert.findByIdAndUpdate(
          existingAlert._id,
          { updatedAt: new Date() },
          { new: true }
        )
      } else {
        // Create new alert
        alert = await UserAlert.create({
          userId,
          type: AlertType.KOL_PROFILE,
          priority: Priority.MEDIUM,
          enabled: true,
          config,
        })
      }

      // Invalidate cache to pick up new subscription
      alertMatcherService.invalidateUserSubscriptions(userId)

      // Send confirmation message to Telegram
      telegramService.sendAlertConfirmation(
        userId,
        AlertType.KOL_PROFILE,
        config,
        isUpdate,
      ).catch((error) => {
        logger.warn({
          component: 'AlertController',
          operation: 'createKolProfileAlert',
          userId,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          message: 'Failed to send Telegram confirmation, but alert was created',
        })
      })

      if (!alert) {
        return res.status(500).json({
          success: false,
          message: 'Failed to create or update alert',
        })
      }

      logger.info({
        component: 'AlertController',
        operation: 'createKolProfileAlert',
        userId,
        alertId: alert._id,
        config,
        message: 'KOL Profile alert subscription created/updated successfully',
      })

      res.status(200).json({
        success: true,
        data: {
          alertId: alert._id,
          type: alert.type,
          config: alert.config,
          createdAt: alert.createdAt,
          updatedAt: alert.updatedAt,
        },
      })
    } catch (error) {
      logger.error({
        component: 'AlertController',
        operation: 'createKolProfileAlert',
        userId,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })

      res.status(500).json({
        success: false,
        message: 'Failed to create KOL Profile alert subscription',
      })
    }
  },
)

/**
 * GET /api/v1/alerts/kol-profile-alerts
 * Get user's KOL Profile alert subscriptions
 */
export const getKolProfileAlerts = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const userId = (req as any).userId

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      })
    }

    try {
      const alerts = await UserAlert.find({
        userId,
        type: AlertType.KOL_PROFILE,
      })
        .sort({ createdAt: -1 })
        .lean()

      logger.debug({
        component: 'AlertController',
        operation: 'getKolProfileAlerts',
        userId,
        alertCount: alerts.length,
        message: 'Retrieved KOL Profile alert subscriptions',
      })

      res.status(200).json({
        success: true,
        data: {
          alerts: alerts.map((alert) => ({
            _id: alert._id,
            type: alert.type,
            priority: alert.priority,
            enabled: alert.enabled,
            config: alert.config,
            createdAt: alert.createdAt,
            updatedAt: alert.updatedAt,
          })),
        },
      })
    } catch (error) {
      logger.error({
        component: 'AlertController',
        operation: 'getKolProfileAlerts',
        userId,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })

      res.status(500).json({
        success: false,
        message: 'Failed to retrieve KOL Profile alert subscriptions',
      })
    }
  },
)

/**
 * DELETE /api/v1/alerts/kol-profile/:alertId
 * Delete KOL Profile alert subscription
 */
export const deleteKolProfileAlert = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const userId = (req as any).userId
    const { alertId } = req.params

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
      })
    }

    if (!alertId) {
      return res.status(400).json({
        success: false,
        message: 'Alert ID is required',
      })
    }

    try {
      // Hard delete - permanently remove from database
      const alert = await UserAlert.findOneAndDelete({
        _id: alertId,
        userId,
        type: AlertType.KOL_PROFILE,
      })

      if (!alert) {
        return res.status(404).json({
          success: false,
          message: 'KOL Profile alert subscription not found',
        })
      }

      // Trigger immediate cache invalidation
      alertMatcherService.invalidateUserSubscriptions(userId)

      // Send deletion confirmation to Telegram
      telegramService.sendAlertDeletionConfirmation(
        userId,
        AlertType.KOL_PROFILE,
      ).catch((error) => {
        logger.warn({
          component: 'AlertController',
          operation: 'deleteKolProfileAlert',
          userId,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          message: 'Failed to send Telegram deletion confirmation',
        })
      })

      logger.info({
        component: 'AlertController',
        operation: 'deleteKolProfileAlert',
        userId,
        alertId,
        message: 'KOL Profile alert subscription permanently deleted',
      })

      res.status(200).json({
        success: true,
        message: 'KOL Profile alert subscription deleted successfully',
      })
    } catch (error) {
      logger.error({
        component: 'AlertController',
        operation: 'deleteKolProfileAlert',
        userId,
        alertId,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })

      res.status(500).json({
        success: false,
        message: 'Failed to delete KOL Profile alert subscription',
      })
    }
  },
)
