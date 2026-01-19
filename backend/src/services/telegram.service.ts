import TelegramBot from 'node-telegram-bot-api'
import { AlertType, Priority, QueueStats } from '../types/alert.types'
import { User } from '../models/user.model'
import logger from '../utils/logger'

/**
 * Queued message structure
 */
interface QueuedMessage {
  chatId: string
  message: string
  priority: Priority
  timestamp: number
}

/**
 * Delivery metrics
 */
interface DeliveryMetrics {
  totalDelivered: number
  totalFailed: number
  averageLatencyMs: number
  lastDeliveryAt: number | null
}

/**
 * TelegramService - Manages Telegram bot operations with queue and deduplication
 * 
 * Features:
 * - Deduplication cache with 10-minute TTL
 * - Priority-based message queue with 5000 capacity
 * - Throttled delivery at 25 msg/sec
 * - Backpressure handling with priority-based dropping
 * - Graceful shutdown with queue draining
 * - Comprehensive monitoring and metrics
 */
export class TelegramService {
  private bot: TelegramBot | null = null
  private dedupCache: Map<string, number> = new Map()
  private messageQueue: QueuedMessage[] = []
  private queueProcessor: NodeJS.Timeout | null = null
  private dedupCleanupInterval: NodeJS.Timeout | null = null
  private isShuttingDown: boolean = false
  private messagesProcessed: number = 0
  private messagesDropped: number = 0
  private isInBackpressure: boolean = false

  // Delivery metrics
  private deliveryMetrics: DeliveryMetrics = {
    totalDelivered: 0,
    totalFailed: 0,
    averageLatencyMs: 0,
    lastDeliveryAt: null,
  }
  private deliveryLatencySum: number = 0

  // Constants
  private readonly QUEUE_CAPACITY = 5000
  private readonly BACKPRESSURE_RESUME_THRESHOLD = 4000
  private readonly DEDUP_TTL_MS = 10 * 60 * 1000 // 10 minutes
  private readonly DEDUP_CLEANUP_INTERVAL_MS = 60 * 1000 // 1 minute
  private readonly MESSAGE_RATE_MS = 40 // 25 msg/sec = 1000ms / 25 = 40ms per message
  private readonly TELEGRAM_BOT_TOKEN: string
  private readonly MAX_RETRY_ATTEMPTS = 3
  private readonly RETRY_BASE_DELAY_MS = 1000 // 1 second base delay for exponential backoff

  constructor() {
    // Fail-fast token validation
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) {
      throw new Error(
        'TELEGRAM_BOT_TOKEN is required but not found in environment variables',
      )
    }
    this.TELEGRAM_BOT_TOKEN = token
  }

  /**
   * Initialize the Telegram bot and start queue processor
   */
  async initialize(): Promise<void> {
    try {
      // Initialize bot with polling enabled to receive commands
      this.bot = new TelegramBot(this.TELEGRAM_BOT_TOKEN, { polling: true })

      // Handle polling errors (e.g., duplicate instances)
      this.bot.on('polling_error', (error: any) => {
        if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
          logger.error({
            component: 'TelegramService',
            operation: 'polling_error',
            message: 'CRITICAL: Another bot instance is already running! Only one backend instance should be active.',
            error: error.message,
          })
          console.error('\n❌ TELEGRAM BOT ERROR: Another instance is already running!')
          console.error('   This means you have multiple backend servers running.')
          console.error('   Please kill all other backend processes and restart.\n')
        } else {
          logger.error({
            component: 'TelegramService',
            operation: 'polling_error',
            error: {
              message: error.message,
              code: error.code,
            },
          })
        }
      })

      // Test the bot token by getting bot info
      const botInfo = await this.bot.getMe()
      logger.info({
        component: 'TelegramService',
        operation: 'initialize',
        botUsername: botInfo.username,
        message: 'Telegram bot initialized successfully',
      })

      // Set up command handlers
      this.setupCommandHandlers()

      // Start queue processor
      this.startQueueProcessor()

      // Start deduplication cache cleanup
      this.startDedupCleanup()

      // Setup graceful shutdown handlers
      this.setupShutdownHandlers()

      logger.info({
        component: 'TelegramService',
        operation: 'initialize',
        message: 'TelegramService fully initialized',
      })
    } catch (error) {
      logger.error({
        component: 'TelegramService',
        operation: 'initialize',
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })
      throw new Error('Failed to initialize TelegramService')
    }
  }

  /**
   * Queue an alert for delivery with deduplication
   * @returns true if queued, false if deduplicated or dropped
   */
  async queueAlert(
    userId: string,
    alertType: AlertType,
    txHash: string,
    message: string,
    priority: Priority,
  ): Promise<boolean> {
    if (this.isShuttingDown) {
      logger.warn({
        component: 'TelegramService',
        operation: 'queueAlert',
        message: 'Service is shutting down, rejecting new alerts',
      })
      return false
    }

    try {
      // Generate fingerprint for deduplication
      const fingerprint = `${userId}:${alertType}:${txHash}`

      // Check deduplication cache
      if (this.dedupCache.has(fingerprint)) {
        logger.debug({
          component: 'TelegramService',
          operation: 'queueAlert',
          userId,
          alertType,
          txHash,
          message: 'Alert deduplicated',
        })
        return false
      }

      // Get user's Telegram chat ID
      const user = await User.findById(userId).select('telegramChatId').lean()
      if (!user || !user.telegramChatId) {
        logger.warn({
          component: 'TelegramService',
          operation: 'queueAlert',
          userId,
          message: 'User has no linked Telegram chat ID',
        })
        return false
      }

      // Check backpressure and apply priority-based dropping
      if (this.messageQueue.length >= this.QUEUE_CAPACITY) {
        if (!this.isInBackpressure) {
          this.isInBackpressure = true
          logger.warn({
            component: 'TelegramService',
            operation: 'queueAlert',
            queueSize: this.messageQueue.length,
            message: 'Entering backpressure mode',
          })
        }

        // Drop LOW priority (ALPHA_STREAM) alerts
        if (priority === Priority.LOW) {
          this.messagesDropped++
          logger.warn({
            component: 'TelegramService',
            operation: 'queueAlert',
            userId,
            alertType,
            priority,
            message: 'Alert dropped due to backpressure (LOW priority)',
          })
          return false
        }

        // Drop MEDIUM priority (KOL_ACTIVITY) if still at capacity
        if (priority === Priority.MEDIUM && this.messageQueue.length >= this.QUEUE_CAPACITY) {
          this.messagesDropped++
          logger.warn({
            component: 'TelegramService',
            operation: 'queueAlert',
            userId,
            alertType,
            priority,
            message: 'Alert dropped due to backpressure (MEDIUM priority)',
          })
          return false
        }

        // HIGH priority (WHALE_CLUSTER) always gets through
      }

      // Add to deduplication cache
      this.dedupCache.set(fingerprint, Date.now())

      // Add to message queue
      this.messageQueue.push({
        chatId: user.telegramChatId,
        message,
        priority,
        timestamp: Date.now(),
      })

      // Check if we can exit backpressure mode
      if (
        this.isInBackpressure &&
        this.messageQueue.length < this.BACKPRESSURE_RESUME_THRESHOLD
      ) {
        this.isInBackpressure = false
        logger.info({
          component: 'TelegramService',
          operation: 'queueAlert',
          queueSize: this.messageQueue.length,
          message: 'Exiting backpressure mode',
        })
      }

      logger.debug({
        component: 'TelegramService',
        operation: 'queueAlert',
        userId,
        alertType,
        priority,
        queueSize: this.messageQueue.length,
        message: 'Alert queued successfully',
      })

      return true
    } catch (error) {
      // Handle database connection errors gracefully
      if (error instanceof Error) {
        const isDbError = 
          error.message.includes('buffering timed out') ||
          error.message.includes('connection') ||
          error.message.includes('ECONNREFUSED') ||
          error.name === 'MongooseError' ||
          error.name === 'MongoError'
        
        if (isDbError) {
          logger.error({
            component: 'TelegramService',
            operation: 'queueAlert',
            userId,
            alertType,
            error: {
              message: error.message,
              name: error.name,
              stack: error.stack,
            },
            context: 'Database connection error - alert not queued',
          })
        } else {
          logger.error({
            component: 'TelegramService',
            operation: 'queueAlert',
            userId,
            alertType,
            error: {
              message: error.message,
              stack: error.stack,
            },
          })
        }
      } else {
        logger.error({
          component: 'TelegramService',
          operation: 'queueAlert',
          userId,
          alertType,
          error: {
            message: 'Unknown error',
          },
        })
      }
      return false
    }
  }

  /**
   * Handle /start command for account linking
   */
  async handleStartCommand(
    chatId: string,
    token: string,
    username?: string,
    firstName?: string,
  ): Promise<void> {
    try {
      // Find user with matching token
      const user = await User.findOne({
        telegramLinkToken: token,
      })

      if (!user) {
        await this.sendMessage(
          chatId,
          '❌ Invalid or expired linking token. Please generate a new one from the AlphaBlock website.',
        )
        return
      }

      // Check token expiry
      if (
        !user.telegramLinkTokenExpiry ||
        user.telegramLinkTokenExpiry < new Date()
      ) {
        await this.sendMessage(
          chatId,
          '❌ This linking token has expired. Please generate a new one from the AlphaBlock website.',
        )
        return
      }

      // Link the account atomically with Telegram user info
      user.telegramChatId = chatId
      user.telegramUsername = username
      user.telegramFirstName = firstName
      user.telegramLinkToken = undefined
      user.telegramLinkTokenExpiry = undefined
      await user.save()

      await this.sendMessage(
        chatId,
        '✅ Your Telegram account has been successfully linked to AlphaBlock! You will now receive alerts here.',
      )

      logger.info({
        component: 'TelegramService',
        operation: 'handleStartCommand',
        userId: user._id.toString(),
        chatId,
        username,
        firstName,
        message: 'Account linked successfully',
      })
    } catch (error) {
      logger.error({
        component: 'TelegramService',
        operation: 'handleStartCommand',
        chatId,
        token,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })
      await this.sendMessage(
        chatId,
        '❌ An error occurred while linking your account. Please try again later.',
      )
    }
  }

  /**
   * Setup command handlers for the bot
   */
  private setupCommandHandlers(): void {
    if (!this.bot) {
      throw new Error('Bot not initialized')
    }

    // Handle /start command with token parameter
    this.bot.onText(/\/start (.+)/, async (msg, match) => {
      const chatId = msg.chat.id.toString()
      const token = match?.[1]
      const username = msg.from?.username
      const firstName = msg.from?.first_name

      if (!token) {
        await this.sendMessage(
          chatId,
          '❌ No linking token provided. Please use the link from the AlphaBlock website.',
        )
        return
      }

      await this.handleStartCommand(chatId, token, username, firstName)
    })

    // Handle /start without parameters
    this.bot.onText(/\/start$/, async (msg) => {
      const chatId = msg.chat.id.toString()
      await this.sendMessage(
        chatId,
        '👋 Welcome to AlphaBlock AI!\n\nTo link your account, please generate a linking token from the AlphaBlock website and use the provided link.',
      )
    })

    logger.info({
      component: 'TelegramService',
      operation: 'setupCommandHandlers',
      message: 'Command handlers registered successfully',
    })
  }

  /**
   * Send a confirmation message to user when they create/update an alert
   */
  async sendAlertConfirmation(
    userId: string,
    alertType: AlertType,
    config: any,
    isUpdate: boolean = false,
  ): Promise<boolean> {
    try {
      // Get user's Telegram chat ID
      const user = await User.findById(userId).select('telegramChatId displayName').lean()
      if (!user || !user.telegramChatId) {
        logger.debug({
          component: 'TelegramService',
          operation: 'sendAlertConfirmation',
          userId,
          message: 'User has no linked Telegram chat ID',
        })
        return false
      }

      // Format the confirmation message based on alert type
      let message = ''
      
      if (alertType === AlertType.ALPHA_STREAM) {
        const action = isUpdate ? 'updated' : 'created'
        message = `✅ *Whale Alert ${action.charAt(0).toUpperCase() + action.slice(1)}*\n\n`
        message += `Your whale alert subscription has been ${action} successfully\\!\n\n`
        message += `*Configuration:*\n`
        
        if (config.hotnessScoreThreshold !== undefined) {
          message += `🔥 Hotness Score: ${config.hotnessScoreThreshold}/10\n`
        }
        
        if (config.minBuyAmountUSD !== undefined) {
          const formattedAmount = config.minBuyAmountUSD.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })
          message += `💰 Min Buy Amount: ${formattedAmount}\n`
        }
        
        if (config.walletLabels && config.walletLabels.length > 0) {
          message += `🏷️ Wallet Labels: ${config.walletLabels.join(', ')}\n`
        }
        
        message += `\nYou'll receive alerts here when matching transactions are detected\\!`
      } else if (alertType === AlertType.KOL_ACTIVITY) {
        const action = isUpdate ? 'updated' : 'created'
        message = `✅ *KOL Alert ${action.charAt(0).toUpperCase() + action.slice(1)}*\n\n`
        message += `Your KOL alert subscription has been ${action} successfully\\!\n\n`
        message += `*Configuration:*\n`
        
        if (config.hotnessScoreThreshold !== undefined) {
          message += `🔥 Hotness Score: ${config.hotnessScoreThreshold}/10\n`
        }
        
        if (config.minBuyAmountUSD !== undefined) {
          const formattedAmount = config.minBuyAmountUSD.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })
          message += `💰 Min Buy Amount: ${formattedAmount}\n`
        }
        
        message += `\nYou'll receive alerts here when KOL/Influencer transactions are detected\\!`
      } else {
        // Generic confirmation for other alert types
        const action = isUpdate ? 'updated' : 'created'
        message = `✅ *Alert ${action.charAt(0).toUpperCase() + action.slice(1)}*\n\n`
        message += `Your ${alertType} alert has been ${action} successfully\\!`
      }

      // Send the message directly (bypass queue for confirmations)
      await this.sendMessage(user.telegramChatId, message)

      logger.info({
        component: 'TelegramService',
        operation: 'sendAlertConfirmation',
        userId,
        alertType,
        isUpdate,
        message: 'Confirmation message sent successfully',
      })

      return true
    } catch (error) {
      logger.error({
        component: 'TelegramService',
        operation: 'sendAlertConfirmation',
        userId,
        alertType,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })
      return false
    }
  }

  /**
   * Send a deletion confirmation message to user
   */
  async sendAlertDeletionConfirmation(
    userId: string,
    alertType: AlertType,
  ): Promise<boolean> {
    try {
      // Get user's Telegram chat ID
      const user = await User.findById(userId).select('telegramChatId').lean()
      if (!user || !user.telegramChatId) {
        return false
      }

      const message = `🗑️ *Alert Deleted*\n\nYour ${alertType === AlertType.ALPHA_STREAM ? 'Whale Alert' : alertType === AlertType.KOL_ACTIVITY ? 'KOL Alert' : alertType} subscription has been deleted\\.\n\nYou will no longer receive these alerts\\.`

      // Send the message directly
      await this.sendMessage(user.telegramChatId, message)

      logger.info({
        component: 'TelegramService',
        operation: 'sendAlertDeletionConfirmation',
        userId,
        alertType,
        message: 'Deletion confirmation sent successfully',
      })

      return true
    } catch (error) {
      logger.error({
        component: 'TelegramService',
        operation: 'sendAlertDeletionConfirmation',
        userId,
        alertType,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })
      return false
    }
  }

  /**
   * Graceful shutdown - drain queue before exit
   */
  async shutdown(): Promise<void> {
    logger.info({
      component: 'TelegramService',
      operation: 'shutdown',
      queueSize: this.messageQueue.length,
      message: 'Starting graceful shutdown',
    })

    this.isShuttingDown = true

    // Stop accepting new messages
    if (this.queueProcessor) {
      clearInterval(this.queueProcessor)
      this.queueProcessor = null
    }

    if (this.dedupCleanupInterval) {
      clearInterval(this.dedupCleanupInterval)
      this.dedupCleanupInterval = null
    }

    // Drain the queue
    while (this.messageQueue.length > 0) {
      await this.processNextMessage()
    }

    // Stop polling and close bot connection
    if (this.bot) {
      await this.bot.stopPolling()
      await this.bot.close()
      this.bot = null
    }

    logger.info({
      component: 'TelegramService',
      operation: 'shutdown',
      messagesProcessed: this.messagesProcessed,
      messagesDropped: this.messagesDropped,
      message: 'Graceful shutdown complete',
    })
  }

  /**
   * Get queue statistics and monitoring metrics
   */
  getQueueStats(): QueueStats {
    return {
      queueSize: this.messageQueue.length,
      dedupCacheSize: this.dedupCache.size,
      messagesProcessed: this.messagesProcessed,
      messagesDropped: this.messagesDropped,
      isInBackpressure: this.isInBackpressure,
      isShuttingDown: this.isShuttingDown,
    }
  }

  /**
   * Get comprehensive metrics for monitoring
   */
  getMetrics() {
    const totalAttempts = this.deliveryMetrics.totalDelivered + this.deliveryMetrics.totalFailed
    const successRate = totalAttempts > 0 
      ? Math.round((this.deliveryMetrics.totalDelivered / totalAttempts) * 10000) / 100 
      : 0
    const failureRate = totalAttempts > 0 
      ? Math.round((this.deliveryMetrics.totalFailed / totalAttempts) * 10000) / 100 
      : 0

    return {
      queue: {
        size: this.messageQueue.length,
        capacity: this.QUEUE_CAPACITY,
        utilizationPercent: Math.round((this.messageQueue.length / this.QUEUE_CAPACITY) * 10000) / 100,
        messagesProcessed: this.messagesProcessed,
        messagesDropped: this.messagesDropped,
        isInBackpressure: this.isInBackpressure,
      },
      delivery: {
        totalDelivered: this.deliveryMetrics.totalDelivered,
        totalFailed: this.deliveryMetrics.totalFailed,
        successRate,
        failureRate,
        averageLatencyMs: Math.round(this.deliveryMetrics.averageLatencyMs * 100) / 100,
        lastDeliveryAt: this.deliveryMetrics.lastDeliveryAt,
      },
      deduplication: {
        cacheSize: this.dedupCache.size,
      },
      status: {
        isInitialized: this.bot !== null,
        isShuttingDown: this.isShuttingDown,
      },
    }
  }

  /**
   * Start the queue processor
   */
  private startQueueProcessor(): void {
    this.queueProcessor = setInterval(() => {
      this.processNextMessage().catch((error) => {
        logger.error({
          component: 'TelegramService',
          operation: 'processNextMessage',
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          },
        })
      })
    }, this.MESSAGE_RATE_MS)
  }

  /**
   * Process the next message in the queue
   */
  private async processNextMessage(): Promise<void> {
    if (this.messageQueue.length === 0) {
      return
    }

    const message = this.messageQueue.shift()
    if (!message) {
      return
    }

    const startTime = Date.now()

    try {
      await this.sendMessage(message.chatId, message.message)
      
      const latency = Date.now() - startTime
      this.deliveryLatencySum += latency
      this.deliveryMetrics.totalDelivered++
      this.deliveryMetrics.averageLatencyMs = 
        this.deliveryLatencySum / this.deliveryMetrics.totalDelivered
      this.deliveryMetrics.lastDeliveryAt = Date.now()
      
      this.messagesProcessed++

      logger.debug({
        component: 'TelegramService',
        operation: 'processNextMessage',
        chatId: message.chatId,
        priority: message.priority,
        latency: `${latency}ms`,
        message: 'Message delivered successfully',
      })
    } catch (error) {
      const latency = Date.now() - startTime
      this.deliveryMetrics.totalFailed++
      
      logger.error({
        component: 'TelegramService',
        operation: 'processNextMessage',
        chatId: message.chatId,
        priority: message.priority,
        latency: `${latency}ms`,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      })
      // Don't re-queue failed messages to prevent infinite loops
      this.messagesDropped++
    }
  }

  /**
   * Send a message via Telegram bot with retry logic
   */
  private async sendMessage(chatId: string, message: string): Promise<void> {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized')
    }

    try {
      await this.sendMessageWithRetry(chatId, message, 'MarkdownV2')
    } catch (error) {
      // If MarkdownV2 formatting fails, try plain text fallback
      if (
        error instanceof Error &&
        error.message.includes('parse')
      ) {
        logger.warn({
          component: 'TelegramService',
          operation: 'sendMessage',
          chatId,
          message: 'MarkdownV2 formatting failed, using plain text fallback',
        })
        try {
          await this.sendMessageWithRetry(chatId, message, undefined)
        } catch (fallbackError) {
          logger.error({
            component: 'TelegramService',
            operation: 'sendMessage',
            chatId,
            error: {
              message: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
              stack: fallbackError instanceof Error ? fallbackError.stack : undefined,
            },
            context: 'Plain text fallback also failed',
          })
          throw fallbackError
        }
      } else {
        throw error
      }
    }
  }

  /**
   * Send a message with exponential backoff retry logic
   * @param chatId - Telegram chat ID
   * @param message - Message text
   * @param parseMode - Parse mode (MarkdownV2 or undefined for plain text)
   * @param attempt - Current attempt number (for recursion)
   */
  private async sendMessageWithRetry(
    chatId: string,
    message: string,
    parseMode: 'MarkdownV2' | undefined,
    attempt: number = 1,
  ): Promise<void> {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized')
    }

    try {
      await this.bot.sendMessage(chatId, message, {
        parse_mode: parseMode,
        disable_web_page_preview: false,
      })
    } catch (error) {
      const isRetryableError = this.isRetryableError(error)
      
      if (isRetryableError && attempt < this.MAX_RETRY_ATTEMPTS) {
        const delay = this.calculateExponentialBackoff(attempt)
        
        logger.warn({
          component: 'TelegramService',
          operation: 'sendMessageWithRetry',
          chatId,
          attempt,
          maxAttempts: this.MAX_RETRY_ATTEMPTS,
          retryDelayMs: delay,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          message: 'Retrying message delivery after error',
        })
        
        // Wait before retrying
        await this.sleep(delay)
        
        // Retry with incremented attempt counter
        return this.sendMessageWithRetry(chatId, message, parseMode, attempt + 1)
      } else {
        // Max retries reached or non-retryable error
        logger.error({
          component: 'TelegramService',
          operation: 'sendMessageWithRetry',
          chatId,
          attempt,
          maxAttempts: this.MAX_RETRY_ATTEMPTS,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          },
          message: isRetryableError 
            ? 'Max retry attempts reached' 
            : 'Non-retryable error encountered',
        })
        throw error
      }
    }
  }

  /**
   * Determine if an error is retryable
   * @param error - The error to check
   * @returns true if the error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false
    }

    const message = error.message.toLowerCase()
    
    // Retryable errors:
    // - Network errors (ECONNRESET, ETIMEDOUT, ENOTFOUND, etc.)
    // - Rate limit errors (429)
    // - Server errors (500, 502, 503, 504)
    // - Temporary Telegram API errors
    
    const retryablePatterns = [
      'network',
      'timeout',
      'econnreset',
      'etimedout',
      'enotfound',
      'econnrefused',
      '429',
      'too many requests',
      'rate limit',
      '500',
      '502',
      '503',
      '504',
      'internal server error',
      'bad gateway',
      'service unavailable',
      'gateway timeout',
    ]
    
    return retryablePatterns.some(pattern => message.includes(pattern))
  }

  /**
   * Calculate exponential backoff delay
   * @param attempt - Current attempt number (1-indexed)
   * @returns Delay in milliseconds
   */
  private calculateExponentialBackoff(attempt: number): number {
    // Exponential backoff: base_delay * 2^(attempt - 1)
    // Attempt 1: 1000ms, Attempt 2: 2000ms, Attempt 3: 4000ms
    return this.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1)
  }

  /**
   * Sleep for a specified duration
   * @param ms - Duration in milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Start deduplication cache cleanup
   */
  private startDedupCleanup(): void {
    this.dedupCleanupInterval = setInterval(() => {
      const now = Date.now()
      const expiredKeys: string[] = []

      // Find expired entries
      Array.from(this.dedupCache.entries()).forEach(([key, timestamp]) => {
        if (now - timestamp > this.DEDUP_TTL_MS) {
          expiredKeys.push(key)
        }
      })

      // Remove expired entries
      for (const key of expiredKeys) {
        this.dedupCache.delete(key)
      }

      if (expiredKeys.length > 0) {
        logger.debug({
          component: 'TelegramService',
          operation: 'dedupCleanup',
          removedCount: expiredKeys.length,
          cacheSize: this.dedupCache.size,
          message: 'Cleaned up expired deduplication entries',
        })
      }
    }, this.DEDUP_CLEANUP_INTERVAL_MS)
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdownHandler = async (signal: string) => {
      logger.info({
        component: 'TelegramService',
        operation: 'shutdownHandler',
        signal,
        message: 'Received shutdown signal',
      })
      await this.shutdown()
      process.exit(0)
    }

    process.on('SIGTERM', () => shutdownHandler('SIGTERM'))
    process.on('SIGINT', () => shutdownHandler('SIGINT'))
  }
}

// Export singleton instance
export const telegramService = new TelegramService()

