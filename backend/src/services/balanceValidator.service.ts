import { User } from '../models/user.model'
import { UserAlert } from '../models/userAlert.model'
import { validateSOLBalance, PREMIUM_BALANCE_THRESHOLD } from '../middlewares/premiumGate.middleware'
import { telegramService } from './telegram.service'
import logger from '../utils/logger'

/**
 * Balance Validator Service
 * 
 * Continuously validates that users with active Telegram connections
 * maintain the required ALPHA token balance (500,000).
 * 
 * If a user's balance drops below the threshold:
 * - Disconnects their Telegram
 * - Disables their alerts
 * - Sends them a notification
 */
export class BalanceValidatorService {
  private validationInterval: NodeJS.Timeout | null = null
  private isRunning: boolean = false
  private readonly VALIDATION_INTERVAL_MS = 60 * 60 * 1000 // 1 hour
  private readonly BATCH_SIZE = 10 // Process users in batches to avoid overload

  /**
   * Start the balance validation service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn({
        component: 'BalanceValidatorService',
        operation: 'start',
        message: 'Service already running',
      })
      return
    }

    this.isRunning = true
    logger.info({
      component: 'BalanceValidatorService',
      operation: 'start',
      message: `Starting balance validation service (interval: ${this.VALIDATION_INTERVAL_MS}ms)`,
    })

    // Run immediately on start
    await this.validateAllBalances()

    // Then run periodically
    this.validationInterval = setInterval(
      () => this.validateAllBalances(),
      this.VALIDATION_INTERVAL_MS,
    )
  }

  /**
   * Stop the balance validation service
   */
  async stop(): Promise<void> {
    if (this.validationInterval) {
      clearInterval(this.validationInterval)
      this.validationInterval = null
    }
    this.isRunning = false
    logger.info({
      component: 'BalanceValidatorService',
      operation: 'stop',
      message: 'Balance validation service stopped',
    })
  }

  /**
   * Validate all users with active Telegram connections
   */
  private async validateAllBalances(): Promise<void> {
    try {
      logger.info({
        component: 'BalanceValidatorService',
        operation: 'validateAllBalances',
        message: 'Starting balance validation cycle',
      })

      // Find all users with Telegram connections
      const usersWithTelegram = await User.find({
        telegramChatId: { $exists: true, $ne: null },
      })

      logger.debug({
        component: 'BalanceValidatorService',
        operation: 'validateAllBalances',
        userCount: usersWithTelegram.length,
        message: `Found ${usersWithTelegram.length} users with Telegram connections`,
      })

      let processedCount = 0
      let disconnectedCount = 0
      let errorCount = 0

      // Process in batches
      for (let i = 0; i < usersWithTelegram.length; i += this.BATCH_SIZE) {
        const batch = usersWithTelegram.slice(i, i + this.BATCH_SIZE)

        await Promise.all(
          batch.map(async (user) => {
            try {
              processedCount++
              await this.validateUserBalance(user)
            } catch (error) {
              errorCount++
              logger.error({
                component: 'BalanceValidatorService',
                operation: 'validateAllBalances',
                userId: user._id,
                error: {
                  message: error instanceof Error ? error.message : 'Unknown error',
                },
              })
            }
          }),
        )
      }

      logger.info({
        component: 'BalanceValidatorService',
        operation: 'validateAllBalances',
        processedCount,
        disconnectedCount,
        errorCount,
        message: 'Balance validation cycle complete',
      })
    } catch (error) {
      logger.error({
        component: 'BalanceValidatorService',
        operation: 'validateAllBalances',
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })
    }
  }

  /**
   * Validate a single user's balance
   */
  private async validateUserBalance(user: any): Promise<void> {
    const walletForCheck = user.walletAddressOriginal || user.walletAddress
    const usedWalletSource = user.walletAddressOriginal ? 'walletAddressOriginal' : 'walletAddress'

    if (!walletForCheck) {
      logger.debug({
        component: 'BalanceValidatorService',
        operation: 'validateUserBalance',
        userId: user._id,
        message: 'User has no wallet address',
      })
      return
    }

    try {
      // Check ALPHA balance (use cache for initial check)
      const balanceResult = await validateSOLBalance(walletForCheck, false)

      logger.debug({
        component: 'BalanceValidatorService',
        operation: 'validateUserBalance',
        userId: user._id,
        walletAddress: walletForCheck,
        walletSource: usedWalletSource,
        balance: balanceResult.currentBalance,
        hasAccess: balanceResult.hasAccess,
      })

      // If balance is below threshold, RE-VERIFY with fresh RPC before disconnecting
      // This prevents false disconnects from stale cache or RPC flakiness
      if (!balanceResult.hasAccess) {
        let reverifyResult
        try {
          reverifyResult = await validateSOLBalance(walletForCheck, true) // bypass cache
        } catch (reverifyError) {
          // RPC failed on re-check - do NOT disconnect; we cannot confirm low balance
          logger.warn({
            component: 'BalanceValidatorService',
            operation: 'validateUserBalance',
            userId: user._id,
            walletAddress: walletForCheck,
            message: 'Re-verification failed (RPC error) - skipping disconnect to avoid false positive',
          })
          return
        }

        if (reverifyResult.hasAccess) {
          // Fresh check shows they have access - cache was stale, do NOT disconnect
          logger.warn({
            component: 'BalanceValidatorService',
            operation: 'validateUserBalance',
            userId: user._id,
            walletAddress: walletForCheck,
            cachedBalance: balanceResult.currentBalance,
            liveBalance: reverifyResult.currentBalance,
            message: 'Stale cache would have caused false disconnect - user kept connected',
          })
          return
        }

        await this.disconnectUserForLowBalance(user, reverifyResult.currentBalance, usedWalletSource)
      }
    } catch (error) {
      // RPC error - DO NOT disconnect user
      // Log the error and skip this user for now
      logger.error({
        component: 'BalanceValidatorService',
        operation: 'validateUserBalance',
        userId: user._id,
        walletAddress: walletForCheck,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        message: '⚠️ RPC error checking balance - skipping user (will not disconnect)',
      })
      // Don't throw - continue with other users
    }
  }

  /**
   * Disconnect a user due to low ALPHA balance
   */
  private async disconnectUserForLowBalance(
    user: any,
    currentBalance: number,
    walletSource?: string,
  ): Promise<void> {
    try {
      const walletForCheck = user.walletAddressOriginal || user.walletAddress
      logger.info({
        component: 'BalanceValidatorService',
        operation: 'disconnectUserForLowBalance',
        userId: user._id,
        walletAddress: walletForCheck,
        walletSource: walletSource ?? 'unknown',
        currentBalance,
        requiredBalance: PREMIUM_BALANCE_THRESHOLD,
        message: 'Disconnecting user due to low ALPHA balance (confirmed via fresh RPC)',
      })

      // Send notification message via TelegramService
      try {
        const message = `⚠️ *ALERT DISCONNECTED - Insufficient ALPHA Balance*\n\nYour ALPHA balance has dropped below the required *${PREMIUM_BALANCE_THRESHOLD.toLocaleString()} tokens*.\n\n*Current balance:* ${currentBalance.toLocaleString()} ALPHA\n*Required:* ${PREMIUM_BALANCE_THRESHOLD.toLocaleString()} ALPHA\n\nYour Telegram alerts have been automatically disconnected to maintain platform integrity.\n\nOnce you acquire more ALPHA tokens and reach ${PREMIUM_BALANCE_THRESHOLD.toLocaleString()}+, you can reconnect and re-enable your alerts.\n\nThank you for understanding! 🙏`

        // Use TelegramService to send notification (avoids creating new bot instance)
        await telegramService.sendSystemNotification(user.telegramChatId, message)
        
        logger.debug({
          component: 'BalanceValidatorService',
          operation: 'disconnectUserForLowBalance',
          userId: user._id,
          message: 'Notification sent to Telegram via TelegramService',
        })
      } catch (telegramError) {
        logger.warn({
          component: 'BalanceValidatorService',
          operation: 'disconnectUserForLowBalance',
          userId: user._id,
          error: {
            message: telegramError instanceof Error ? telegramError.message : 'Unknown error',
          },
          message: 'Failed to send Telegram notification',
        })
      }

      // Disable all alerts
      const disabledAlerts = await UserAlert.updateMany(
        { userId: user._id },
        { enabled: false },
      )

      logger.debug({
        component: 'BalanceValidatorService',
        operation: 'disconnectUserForLowBalance',
        userId: user._id,
        disabledCount: disabledAlerts.modifiedCount,
        message: 'Alerts disabled',
      })

      // Disconnect Telegram
      await User.findByIdAndUpdate(user._id, {
        $unset: {
          telegramChatId: 1,
          telegramUsername: 1,
          telegramFirstName: 1,
          telegramLinkToken: 1,
          telegramLinkTokenExpiry: 1,
        },
      })

      logger.info({
        component: 'BalanceValidatorService',
        operation: 'disconnectUserForLowBalance',
        userId: user._id,
        message: 'User successfully disconnected',
      })
    } catch (error) {
      logger.error({
        component: 'BalanceValidatorService',
        operation: 'disconnectUserForLowBalance',
        userId: user._id,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })
      throw error
    }
  }

  /**
   * Get service status
   */
  getStatus(): {
    isRunning: boolean
    validationIntervalMs: number
  } {
    return {
      isRunning: this.isRunning,
      validationIntervalMs: this.VALIDATION_INTERVAL_MS,
    }
  }
}

// Export singleton instance
export const balanceValidatorService = new BalanceValidatorService()
