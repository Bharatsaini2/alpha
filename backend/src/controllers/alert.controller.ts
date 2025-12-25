import { Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { User } from '../models/user.model'
import { UserAlert } from '../models/userAlert.model'
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors'
import { alertMatcherService } from '../services/alertMatcher.service'
import { telegramService } from '../services/telegram.service'
import { AlertType, Priority } from '../types/alert.types'
import logger from '../utils/logger'

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

      res.status(200).json({
        success: true,
        data: {
          token,
          expiresAt: expiry.toISOString(),
          botUsername: 'AlphaBlockAIbot',
          deepLink: `https://t.me/AlphaBlockAIbot?start=${token}`,
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
 * Delete alert subscription (soft delete)
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
      // Soft delete by setting enabled to false
      const alert = await UserAlert.findOneAndUpdate(
        { _id: alertId, userId },
        { enabled: false },
        { new: true },
      )

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
        message: 'Alert deleted successfully',
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