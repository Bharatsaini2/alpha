/**
 * Comprehensive Integration Tests for Telegram Alert System
 * 
 * This test suite covers:
 * 1. End-to-end alert flow (account linking -> subscription -> matching -> delivery)
 * 2. Subscription sync integration
 * 3. Graceful shutdown integration
 * 4. Backpressure scenario
 * 5. All critical paths
 */

// Set environment variable BEFORE any imports
process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token-integration-12345'

// Mock logger
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}))
jest.mock('node-telegram-bot-api')

import mongoose from 'mongoose'
import { User } from '../../models/user.model'
import { UserAlert } from '../../models/userAlert.model'
import { AlertType, Priority } from '../../types/alert.types'
import { TelegramService } from '../../services/telegram.service'
import { AlertMatcherService } from '../../services/alertMatcher.service'
import whaleAllTransactionModelV2 from '../../models/whaleAllTransactionsV2.model'

describe('Alert System Integration Tests', () => {
  let telegramService: TelegramService
  let alertMatcherService: AlertMatcherService
  let mockBot: any

  beforeAll(async () => {
    // Connect to test database if needed
    // For now, we'll use mocks
  })

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup mock bot
    mockBot = {
      getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
      sendMessage: jest.fn().mockResolvedValue({}),
      close: jest.fn().mockResolvedValue(undefined),
      stopPolling: jest.fn().mockResolvedValue(undefined),
      onText: jest.fn(),
    }

    // Create service instances
    telegramService = new TelegramService()
    ;(telegramService as any).bot = mockBot

    alertMatcherService = new AlertMatcherService()
  })

  afterEach(async () => {
    // Cleanup services
    if ((telegramService as any).isInitialized) {
      await telegramService.shutdown()
    }
    if ((alertMatcherService as any).isInitialized) {
      await alertMatcherService.shutdown()
    }
  })

  /**
   * Integration Test 1: End-to-End Alert Flow
   * 
   * Tests the complete flow from account linking through alert delivery:
   * 1. User generates linking token
   * 2. User links Telegram account
   * 3. User creates alert subscription
   * 4. Transaction matches subscription
   * 5. Alert is queued and delivered
   */
  describe('End-to-End Alert Flow', () => {
    it('should complete full alert flow from linking to delivery', async () => {
      // Step 1: Setup user with linking token
      const userId = new mongoose.Types.ObjectId()
      const chatId = '123456789'
      const linkToken = 'test-link-token-uuid'

      const mockUser = {
        _id: userId,
        email: 'test@example.com',
        telegramChatId: undefined,
        telegramLinkToken: linkToken,
        telegramLinkTokenExpiry: new Date(Date.now() + 10 * 60 * 1000),
        save: jest.fn().mockImplementation(function (this: any) {
          this.telegramChatId = chatId
          this.telegramLinkToken = undefined
          this.telegramLinkTokenExpiry = undefined
          return Promise.resolve(this)
        }),
      }

      // Mock User.findOne for linking
      ;(User.findOne as jest.Mock) = jest.fn().mockResolvedValue(mockUser)

      // Step 2: Link Telegram account
      await telegramService.handleStartCommand(chatId, linkToken)

      expect(mockUser.save).toHaveBeenCalled()
      expect(mockUser.telegramChatId).toBe(chatId)
      expect(mockUser.telegramLinkToken).toBeUndefined()

      // Step 3: Create alert subscription
      const tokenAddress = 'So11111111111111111111111111111111111111112'
      const mockAlert = {
        _id: new mongoose.Types.ObjectId(),
        userId: {
          _id: userId,
          telegramChatId: chatId,
        },
        type: AlertType.ALPHA_STREAM,
        priority: Priority.LOW,
        enabled: true,
        config: {
          tokens: [tokenAddress],
          minAmount: 1000,
        },
      }

      // Mock UserAlert.find for subscription sync
      ;(UserAlert.find as jest.Mock) = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockAlert]),
        }),
      })

      // Step 4: Initialize matcher and sync subscriptions
      await alertMatcherService.syncSubscriptions()

      const subscriptionMap = (alertMatcherService as any).subscriptionMap
      expect(subscriptionMap.has(AlertType.ALPHA_STREAM)).toBe(true)
      expect(subscriptionMap.get(AlertType.ALPHA_STREAM)).toHaveLength(1)

      // Step 5: Create matching transaction
      const mockTransaction = {
        signature: 'test-signature-e2e-12345',
        whale: {
          address: 'test-whale-address',
        },
        transaction: {
          tokenOut: {
            address: tokenAddress,
            symbol: 'SOL',
            amount: '100',
            usdAmount: '5000',
          },
          tokenIn: {
            address: 'other-token',
            symbol: 'USDC',
            amount: '5000',
            usdAmount: '5000',
          },
        },
        type: 'buy' as const,
      }

      // Mock User.findById for alert queuing
      ;(User.findById as jest.Mock) = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: userId,
            telegramChatId: chatId,
          }),
        }),
      })

      // Step 6: Process transaction through matcher
      await alertMatcherService.processTransaction(mockTransaction as any)

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Step 7: Verify alert was queued in TelegramService
      const stats = telegramService.getQueueStats()
      expect(stats.queueSize).toBeGreaterThan(0)

      // Step 8: Process queue and verify delivery
      await telegramService.shutdown() // This drains the queue

      expect(mockBot.sendMessage).toHaveBeenCalled()
      const sendMessageCall = mockBot.sendMessage.mock.calls[0]
      expect(sendMessageCall[0]).toBe(chatId)
      expect(sendMessageCall[1]).toContain('SOL')
      expect(sendMessageCall[1]).toContain('5000')

      const finalStats = telegramService.getQueueStats()
      expect(finalStats.queueSize).toBe(0)
      expect(finalStats.messagesProcessed).toBeGreaterThan(0)
    }, 30000)

    it('should handle multiple users with different subscriptions', async () => {
      // Create 3 users with different alert configurations
      const users = [
        {
          id: new mongoose.Types.ObjectId(),
          chatId: '111111111',
          type: AlertType.ALPHA_STREAM,
          priority: Priority.LOW,
          tokens: ['token1'],
        },
        {
          id: new mongoose.Types.ObjectId(),
          chatId: '222222222',
          type: AlertType.WHALE_CLUSTER,
          priority: Priority.HIGH,
          tokens: ['token2'],
        },
        {
          id: new mongoose.Types.ObjectId(),
          chatId: '333333333',
          type: AlertType.ALPHA_STREAM,
          priority: Priority.LOW,
          tokens: ['token1'], // Same token as user 1
        },
      ]

      const mockAlerts = users.map((user) => ({
        _id: new mongoose.Types.ObjectId(),
        userId: {
          _id: user.id,
          telegramChatId: user.chatId,
        },
        type: user.type,
        priority: user.priority,
        enabled: true,
        config: {
          tokens: user.tokens,
        },
      }))

      ;(UserAlert.find as jest.Mock) = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockAlerts),
        }),
      })

      await alertMatcherService.syncSubscriptions()

      // Create transaction matching token1 (should match users 1 and 3)
      const mockTransaction = {
        signature: 'test-signature-multi-user',
        whale: {
          address: 'test-whale',
        },
        transaction: {
          tokenOut: {
            address: 'token1',
            symbol: 'TKN1',
            amount: '1000',
            usdAmount: '2000',
          },
          tokenIn: {
            address: 'other',
            symbol: 'OTHER',
            amount: '2000',
            usdAmount: '2000',
          },
        },
        type: 'buy' as const,
      }

      ;(User.findById as jest.Mock) = jest.fn().mockImplementation((id) => ({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(
            users.find((u) => u.id.toString() === id.toString()),
          ),
        }),
      }))

      await alertMatcherService.processTransaction(mockTransaction as any)

      await new Promise((resolve) => setTimeout(resolve, 100))

      // Should have queued 2 alerts (for users 1 and 3)
      const stats = telegramService.getQueueStats()
      expect(stats.queueSize).toBe(2)
    }, 30000)
  })

  /**
   * Integration Test 2: Subscription Sync
   * 
   * Tests that subscription map stays synchronized with database:
   * 1. Initial sync loads all alerts
   * 2. Periodic sync picks up new alerts
   * 3. Immediate invalidation on delete
   */
  describe('Subscription Sync Integration', () => {
    it('should sync subscriptions from database on initialization', async () => {
      const mockAlerts = [
        {
          _id: new mongoose.Types.ObjectId(),
          userId: {
            _id: new mongoose.Types.ObjectId(),
            telegramChatId: '111',
          },
          type: AlertType.ALPHA_STREAM,
          priority: Priority.LOW,
          enabled: true,
          config: { minAmount: 1000 },
        },
        {
          _id: new mongoose.Types.ObjectId(),
          userId: {
            _id: new mongoose.Types.ObjectId(),
            telegramChatId: '222',
          },
          type: AlertType.WHALE_CLUSTER,
          priority: Priority.HIGH,
          enabled: true,
          config: { minClusterSize: 5 },
        },
      ]

      ;(UserAlert.find as jest.Mock) = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockAlerts),
        }),
      })

      await alertMatcherService.syncSubscriptions()

      const subscriptionMap = (alertMatcherService as any).subscriptionMap

      expect(subscriptionMap.has(AlertType.ALPHA_STREAM)).toBe(true)
      expect(subscriptionMap.has(AlertType.WHALE_CLUSTER)).toBe(true)
      expect(subscriptionMap.get(AlertType.ALPHA_STREAM)).toHaveLength(1)
      expect(subscriptionMap.get(AlertType.WHALE_CLUSTER)).toHaveLength(1)
    })

    it('should pick up new alerts on periodic sync', async () => {
      // Initial sync with 1 alert
      const initialAlerts = [
        {
          _id: new mongoose.Types.ObjectId(),
          userId: {
            _id: new mongoose.Types.ObjectId(),
            telegramChatId: '111',
          },
          type: AlertType.ALPHA_STREAM,
          priority: Priority.LOW,
          enabled: true,
          config: {},
        },
      ]

      ;(UserAlert.find as jest.Mock) = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(initialAlerts),
        }),
      })

      await alertMatcherService.syncSubscriptions()

      let subscriptionMap = (alertMatcherService as any).subscriptionMap
      expect(subscriptionMap.get(AlertType.ALPHA_STREAM)).toHaveLength(1)

      // Add a new alert
      const updatedAlerts = [
        ...initialAlerts,
        {
          _id: new mongoose.Types.ObjectId(),
          userId: {
            _id: new mongoose.Types.ObjectId(),
            telegramChatId: '222',
          },
          type: AlertType.ALPHA_STREAM,
          priority: Priority.LOW,
          enabled: true,
          config: {},
        },
      ]

      ;(UserAlert.find as jest.Mock) = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(updatedAlerts),
        }),
      })

      // Trigger sync again
      await alertMatcherService.syncSubscriptions()

      subscriptionMap = (alertMatcherService as any).subscriptionMap
      expect(subscriptionMap.get(AlertType.ALPHA_STREAM)).toHaveLength(2)
    })

    it('should immediately invalidate deleted user subscriptions', async () => {
      const userId = new mongoose.Types.ObjectId()
      const mockAlerts = [
        {
          _id: new mongoose.Types.ObjectId(),
          userId: {
            _id: userId,
            telegramChatId: '111',
          },
          type: AlertType.ALPHA_STREAM,
          priority: Priority.LOW,
          enabled: true,
          config: {},
        },
        {
          _id: new mongoose.Types.ObjectId(),
          userId: {
            _id: new mongoose.Types.ObjectId(),
            telegramChatId: '222',
          },
          type: AlertType.ALPHA_STREAM,
          priority: Priority.LOW,
          enabled: true,
          config: {},
        },
      ]

      ;(UserAlert.find as jest.Mock) = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockAlerts),
        }),
      })

      await alertMatcherService.syncSubscriptions()

      let subscriptionMap = (alertMatcherService as any).subscriptionMap
      expect(subscriptionMap.get(AlertType.ALPHA_STREAM)).toHaveLength(2)

      // Invalidate user's subscriptions
      alertMatcherService.invalidateUserSubscriptions(userId.toString())

      subscriptionMap = (alertMatcherService as any).subscriptionMap
      const remainingSubscriptions = subscriptionMap.get(AlertType.ALPHA_STREAM)
      expect(remainingSubscriptions).toHaveLength(1)
      expect(remainingSubscriptions[0].userId).not.toBe(userId.toString())
    })
  })

  /**
   * Integration Test 3: Graceful Shutdown
   * 
   * Tests that system shuts down gracefully:
   * 1. Stops accepting new alerts
   * 2. Drains message queue
   * 3. Closes connections
   */
  describe('Graceful Shutdown Integration', () => {
    it('should drain queue before shutdown completes', async () => {
      const userId = new mongoose.Types.ObjectId()
      const chatId = '123456789'

      ;(User.findById as jest.Mock) = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: userId,
            telegramChatId: chatId,
          }),
        }),
      })

      // Queue multiple messages
      for (let i = 0; i < 10; i++) {
        await telegramService.queueAlert(
          userId.toString(),
          AlertType.ALPHA_STREAM,
          `txhash${i}`,
          `message${i}`,
          Priority.LOW,
        )
      }

      const statsBefore = telegramService.getQueueStats()
      expect(statsBefore.queueSize).toBe(10)

      // Shutdown should drain queue
      await telegramService.shutdown()

      const statsAfter = telegramService.getQueueStats()
      expect(statsAfter.queueSize).toBe(0)
      expect(statsAfter.messagesProcessed).toBe(10)
      expect(mockBot.sendMessage).toHaveBeenCalledTimes(10)
    }, 30000)

    it('should stop accepting new alerts during shutdown', async () => {
      const userId = new mongoose.Types.ObjectId()
      const chatId = '123456789'

      ;(User.findById as jest.Mock) = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: userId,
            telegramChatId: chatId,
          }),
        }),
      })

      // Queue some messages
      await telegramService.queueAlert(
        userId.toString(),
        AlertType.ALPHA_STREAM,
        'txhash1',
        'message1',
        Priority.LOW,
      )

      // Start shutdown (but don't await)
      const shutdownPromise = telegramService.shutdown()

      // Try to queue more messages during shutdown
      const result = await telegramService.queueAlert(
        userId.toString(),
        AlertType.ALPHA_STREAM,
        'txhash2',
        'message2',
        Priority.LOW,
      )

      // Should reject new alerts
      expect(result).toBe(false)

      await shutdownPromise
    }, 30000)

    it('should shutdown both services in correct order', async () => {
      const mockAlerts = [
        {
          _id: new mongoose.Types.ObjectId(),
          userId: {
            _id: new mongoose.Types.ObjectId(),
            telegramChatId: '111',
          },
          type: AlertType.ALPHA_STREAM,
          priority: Priority.LOW,
          enabled: true,
          config: {},
        },
      ]

      ;(UserAlert.find as jest.Mock) = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockAlerts),
        }),
      })

      await alertMatcherService.syncSubscriptions()

      // Shutdown matcher first (stops processing new transactions)
      await alertMatcherService.shutdown()

      expect((alertMatcherService as any).isInitialized).toBe(false)

      // Then shutdown telegram service (drains queue)
      await telegramService.shutdown()

      expect((telegramService as any).isShuttingDown).toBe(true)
    })
  })

  /**
   * Integration Test 4: Backpressure Scenario
   * 
   * Tests system behavior under high load:
   * 1. Queue fills up to capacity
   * 2. Low priority alerts are dropped
   * 3. High priority alerts are preserved
   * 4. System recovers when load decreases
   */
  describe('Backpressure Scenario Integration', () => {
    it('should handle queue overflow with priority-based dropping', async () => {
      const userId = new mongoose.Types.ObjectId()
      const chatId = '123456789'

      ;(User.findById as jest.Mock) = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: userId,
            telegramChatId: chatId,
          }),
        }),
      })

      // Fill queue to capacity with HIGH priority
      for (let i = 0; i < 5000; i++) {
        await telegramService.queueAlert(
          userId.toString(),
          AlertType.WHALE_CLUSTER,
          `txhash_high_${i}`,
          `high_message_${i}`,
          Priority.HIGH,
        )
      }

      let stats = telegramService.getQueueStats()
      expect(stats.queueSize).toBe(5000)

      // Try to add LOW priority - should be dropped
      const lowResult = await telegramService.queueAlert(
        userId.toString(),
        AlertType.ALPHA_STREAM,
        'txhash_low',
        'low_message',
        Priority.LOW,
      )

      expect(lowResult).toBe(false)
      stats = telegramService.getQueueStats()
      expect(stats.queueSize).toBe(5000) // Still at capacity

      // Try to add HIGH priority - should be accepted
      const highResult = await telegramService.queueAlert(
        userId.toString(),
        AlertType.WHALE_CLUSTER,
        'txhash_high_new',
        'high_message_new',
        Priority.HIGH,
      )

      expect(highResult).toBe(true)
      stats = telegramService.getQueueStats()
      expect(stats.queueSize).toBe(5001)
    }, 60000)

    it('should resume normal operation after backpressure resolves', async () => {
      const userId = new mongoose.Types.ObjectId()
      const chatId = '123456789'

      ;(User.findById as jest.Mock) = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: userId,
            telegramChatId: chatId,
          }),
        }),
      })

      // Fill queue past capacity
      for (let i = 0; i < 5100; i++) {
        await telegramService.queueAlert(
          userId.toString(),
          AlertType.WHALE_CLUSTER,
          `txhash_${i}`,
          `message_${i}`,
          Priority.HIGH,
        )
      }

      // LOW priority should be rejected
      let lowResult = await telegramService.queueAlert(
        userId.toString(),
        AlertType.ALPHA_STREAM,
        'txhash_low_1',
        'low_message_1',
        Priority.LOW,
      )
      expect(lowResult).toBe(false)

      // Process some messages to reduce queue size
      // Manually drain queue below threshold
      const queue = (telegramService as any).messageQueue
      while (queue.length > 3900) {
        queue.shift()
      }

      // Now LOW priority should be accepted again
      lowResult = await telegramService.queueAlert(
        userId.toString(),
        AlertType.ALPHA_STREAM,
        'txhash_low_2',
        'low_message_2',
        Priority.LOW,
      )
      expect(lowResult).toBe(true)
    }, 60000)
  })

  /**
   * Integration Test 5: Cluster Alert Flow
   * 
   * Tests cluster detection and alert delivery:
   * 1. Multiple whale transactions for same token
   * 2. Cluster detection triggers
   * 3. Alert includes cluster data
   */
  describe('Cluster Alert Flow Integration', () => {
    it('should detect cluster and deliver alert with cluster data', async () => {
      const userId = new mongoose.Types.ObjectId()
      const chatId = '123456789'
      const tokenAddress = 'cluster-token-address'

      // Setup user with WHALE_CLUSTER subscription
      const mockAlert = {
        _id: new mongoose.Types.ObjectId(),
        userId: {
          _id: userId,
          telegramChatId: chatId,
        },
        type: AlertType.WHALE_CLUSTER,
        priority: Priority.HIGH,
        enabled: true,
        config: {
          tokens: [tokenAddress],
          minClusterSize: 3,
        },
      }

      ;(UserAlert.find as jest.Mock) = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockAlert]),
        }),
      })

      await alertMatcherService.syncSubscriptions()

      // Mock cluster data (5 whales trading the token)
      const mockClusterTransactions = []
      for (let i = 0; i < 5; i++) {
        mockClusterTransactions.push({
          whale: {
            address: `whale-address-${i}`,
          },
          transaction: {
            tokenOut: {
              address: tokenAddress,
              usdAmount: '10000',
            },
          },
          tokenOutAddress: tokenAddress,
          timestamp: new Date(),
        })
      }

      ;(whaleAllTransactionModelV2.find as jest.Mock) = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockClusterTransactions),
      })

      ;(User.findById as jest.Mock) = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: userId,
            telegramChatId: chatId,
          }),
        }),
      })

      // Create transaction that triggers cluster check
      const mockTransaction = {
        signature: 'cluster-tx-signature',
        whale: {
          address: 'whale-address-0',
        },
        transaction: {
          tokenOut: {
            address: tokenAddress,
            symbol: 'CLSTR',
            amount: '1000',
            usdAmount: '10000',
          },
          tokenIn: {
            address: 'other',
            symbol: 'OTHER',
            amount: '10000',
            usdAmount: '10000',
          },
        },
        type: 'buy' as const,
      }

      await alertMatcherService.processTransaction(mockTransaction as any)

      await new Promise((resolve) => setTimeout(resolve, 100))

      // Verify alert was queued
      const stats = telegramService.getQueueStats()
      expect(stats.queueSize).toBeGreaterThan(0)

      // Drain queue and check message content
      await telegramService.shutdown()

      expect(mockBot.sendMessage).toHaveBeenCalled()
      const messageContent = mockBot.sendMessage.mock.calls[0][1]
      
      // Message should contain cluster information
      expect(messageContent).toContain('CLUSTER')
      expect(messageContent).toContain('5') // whale count
      expect(messageContent).toContain('CLSTR') // token symbol
    }, 30000)
  })
})
