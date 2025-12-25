import * as fc from 'fast-check'
import { AlertType, Priority } from '../../types/alert.types'
import { User } from '../../models/user.model'
import mongoose from 'mongoose'

// Mock logger before importing service
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}

// Mock dependencies BEFORE importing TelegramService
jest.mock('node-telegram-bot-api')
jest.mock('../../utils/logger', () => mockLogger)
jest.mock('../../models/user.model')

// Set environment variable before importing service
process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token-12345'

import { TelegramService } from '../telegram.service'

describe('TelegramService Property-Based Tests', () => {
  let service: TelegramService
  let mockUser: any

  // Helper to generate valid MongoDB ObjectId hex strings (24 hex characters)
  const objectIdArb = fc.array(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'), { minLength: 24, maxLength: 24 }).map(arr => arr.join(''))

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks()

    // Setup mock user
    mockUser = {
      _id: new mongoose.Types.ObjectId(),
      telegramChatId: '123456789',
      save: jest.fn().mockResolvedValue(true),
    }

    // Mock User.findById
    ;(User.findById as jest.Mock) = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockUser),
      }),
    })

    // Mock User.findOne
    ;(User.findOne as jest.Mock) = jest.fn().mockResolvedValue(mockUser)

    // Create service instance
    service = new TelegramService()
  })

  /**
   * **Feature: telegram-alert-system, Property 10: Deduplication prevents duplicate delivery**
   * 
   * For any alert with a specific userId, alertType, and txHash, if the same combination
   * is queued twice within a 10-minute window, only the first alert must be queued for
   * delivery and the second must be dropped.
   * 
   * **Validates: Requirements 4.1, 4.3, 4.4**
   */
  describe('Property 10: Deduplication prevents duplicate delivery', () => {
    it('should deduplicate alerts with same userId, alertType, and txHash', async () => {
      await fc.assert(
        fc.asyncProperty(
          objectIdArb,
          fc.constantFrom(...Object.values(AlertType)),
          fc.string({ minLength: 64, maxLength: 64 }),
          fc.string({ minLength: 10, maxLength: 200 }),
          fc.constantFrom(...Object.values(Priority)),
          async (userId: string, alertType: AlertType, txHash: string, message: string, priority: Priority) => {
            const testService = new TelegramService()
            const testUser = {
              _id: new mongoose.Types.ObjectId(userId),
              telegramChatId: '123456789',
            }
            
            ;(User.findById as jest.Mock) = jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(testUser),
              }),
            })

            const mockBot = {
              getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
              sendMessage: jest.fn().mockResolvedValue({}),
              close: jest.fn().mockResolvedValue(undefined),
            }
            ;(testService as any).bot = mockBot

            const firstResult = await testService.queueAlert(userId, alertType, txHash, message, priority)
            const secondResult = await testService.queueAlert(userId, alertType, txHash, message, priority)

            expect(firstResult).toBe(true)
            expect(secondResult).toBe(false)

            const stats = testService.getQueueStats()
            expect(stats.queueSize).toBe(1)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  /**
   * **Feature: telegram-alert-system, Property 12: Rate limiting compliance**
   * 
   * For any time window of 1 second during message delivery, the number of messages
   * sent must not exceed 25.
   * 
   * **Validates: Requirements 5.3**
   */
  describe('Property 12: Rate limiting compliance', () => {
    it('should not exceed 25 messages per second', async () => {
      const testService = new TelegramService()
      const mockBot = {
        getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
        sendMessage: jest.fn().mockResolvedValue({}),
        close: jest.fn().mockResolvedValue(undefined),
      }
      ;(testService as any).bot = mockBot
      
      const MESSAGE_RATE_MS = (testService as any).MESSAGE_RATE_MS
      expect(MESSAGE_RATE_MS).toBe(40)
      
      const messagesPerSecond = 1000 / MESSAGE_RATE_MS
      expect(messagesPerSecond).toBeLessThanOrEqual(25)
    })
  })

  /**
   * **Feature: telegram-alert-system, Property 14: Backpressure drops low-priority first**
   * 
   * For any state where the message queue exceeds 5000 pending messages, new ALPHA_STREAM
   * (LOW priority) alerts must be dropped while WHALE_CLUSTER (HIGH priority) alerts must
   * still be queued.
   * 
   * **Validates: Requirements 5.5, 6.1, 6.5**
   */
  describe('Property 14: Backpressure drops low-priority first', () => {
    it('should drop LOW priority alerts when queue exceeds capacity', async () => {
      const testService = new TelegramService()
      const testUser = {
        _id: new mongoose.Types.ObjectId(),
        telegramChatId: '123456789',
      }
      
      ;(User.findById as jest.Mock) = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(testUser),
        }),
      })
      
      const mockBot = {
        getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
        sendMessage: jest.fn().mockResolvedValue({}),
        close: jest.fn().mockResolvedValue(undefined),
      }
      ;(testService as any).bot = mockBot
      
      for (let i = 0; i < 5000; i++) {
        await testService.queueAlert(testUser._id.toString(), AlertType.WHALE_CLUSTER, `txhash${i}`, `message${i}`, Priority.HIGH)
      }
      
      let stats = testService.getQueueStats()
      expect(stats.queueSize).toBe(5000)
      
      const lowPriorityResult = await testService.queueAlert(testUser._id.toString(), AlertType.ALPHA_STREAM, 'txhash_low', 'message_low', Priority.LOW)
      expect(lowPriorityResult).toBe(false)
      
      const highPriorityResult = await testService.queueAlert(testUser._id.toString(), AlertType.WHALE_CLUSTER, 'txhash_high', 'message_high', Priority.HIGH)
      expect(highPriorityResult).toBe(true)
    })
  })

  /**
   * **Feature: telegram-alert-system, Property 21: Graceful shutdown drains queue**
   * 
   * For any graceful shutdown initiated via SIGTERM or SIGINT, the shutdown process must
   * not complete until the message queue is empty (all pending messages delivered).
   * 
   * **Validates: Requirements 9.3**
   */
  describe('Property 21: Graceful shutdown drains queue', () => {
    it('should drain all messages before shutdown completes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (messageCount: number) => {
            const testService = new TelegramService()
            const testUser = {
              _id: new mongoose.Types.ObjectId(),
              telegramChatId: '123456789',
            }
            
            ;(User.findById as jest.Mock) = jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(testUser),
              }),
            })
            
            const mockBot = {
              getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
              sendMessage: jest.fn().mockResolvedValue({}),
              close: jest.fn().mockResolvedValue(undefined),
              stopPolling: jest.fn().mockResolvedValue(undefined),
            }
            ;(testService as any).bot = mockBot
            
            for (let i = 0; i < messageCount; i++) {
              await testService.queueAlert(testUser._id.toString(), AlertType.ALPHA_STREAM, `txhash${i}`, `message${i}`, Priority.LOW)
            }
            
            let stats = testService.getQueueStats()
            expect(stats.queueSize).toBe(messageCount)
            
            await testService.shutdown()
            
            stats = testService.getQueueStats()
            expect(stats.queueSize).toBe(0)
            expect(stats.messagesProcessed).toBe(messageCount)
          },
        ),
        { numRuns: 20 },
      )
    })
  })

  /**
   * **Feature: telegram-alert-system, Property 22: Bot token never appears in logs**
   * 
   * For any log message generated by the Alert System, the log content must not contain
   * the value of process.env.TELEGRAM_BOT_TOKEN.
   * 
   * **Validates: Requirements 10.3**
   */
  describe('Property 22: Bot token never appears in logs', () => {
    it('should never log the bot token', async () => {
      const testService = new TelegramService()
      const botToken = process.env.TELEGRAM_BOT_TOKEN!
      
      const testUser = {
        _id: new mongoose.Types.ObjectId(),
        telegramChatId: '123456789',
      }
      
      ;(User.findById as jest.Mock) = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(testUser),
        }),
      })
      
      const mockBot = {
        getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
        sendMessage: jest.fn().mockResolvedValue({}),
        close: jest.fn().mockResolvedValue(undefined),
      }
      ;(testService as any).bot = mockBot
      
      mockLogger.info.mockClear()
      mockLogger.warn.mockClear()
      mockLogger.error.mockClear()
      mockLogger.debug.mockClear()
      
      await testService.queueAlert(testUser._id.toString(), AlertType.ALPHA_STREAM, 'txhash', 'message', Priority.LOW)
      
      const allLogCalls = [
        ...mockLogger.info.mock.calls,
        ...mockLogger.warn.mock.calls,
        ...mockLogger.error.mock.calls,
        ...mockLogger.debug.mock.calls,
      ]
      
      for (const call of allLogCalls) {
        const logContent = JSON.stringify(call)
        expect(logContent).not.toContain(botToken)
      }
    })
  })

  /**
   * **Feature: telegram-alert-system, Property 2: Token linking creates correct association**
   * 
   * For any valid linking token and Telegram chat ID, after successful linking, querying
   * the user account must return the exact chat ID that was provided.
   * 
   * **Validates: Requirements 1.2**
   */
  describe('Property 2: Token linking creates correct association', () => {
    it('should correctly associate chat ID with user account', async () => {
      const token = 'test-token-uuid-1234'
      const chatId = '123456789'
      const testUser = {
        _id: new mongoose.Types.ObjectId(),
        telegramChatId: undefined,
        telegramLinkToken: token,
        telegramLinkTokenExpiry: new Date(Date.now() + 10 * 60 * 1000),
        save: jest.fn().mockResolvedValue(true),
      }
      
      ;(User.findOne as jest.Mock) = jest.fn().mockResolvedValue(testUser)
      
      const testService = new TelegramService()
      const mockBot = {
        getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
        sendMessage: jest.fn().mockResolvedValue({}),
        close: jest.fn().mockResolvedValue(undefined),
        stopPolling: jest.fn().mockResolvedValue(undefined),
        onText: jest.fn(),
      }
      ;(testService as any).bot = mockBot
      
      await testService.handleStartCommand(chatId, token)
      
      expect(testUser.save).toHaveBeenCalled()
      expect(testUser.telegramChatId).toBe(chatId)
      expect(testUser.telegramLinkToken).toBeUndefined()
      expect(testUser.telegramLinkTokenExpiry).toBeUndefined()
    })
  })

  /**
   * **Feature: telegram-alert-system, Property 3: Token invalidation prevents reuse**
   * 
   * For any linking token, after it has been successfully used once, any subsequent
   * attempt to use the same token must be rejected with an error.
   * 
   * **Validates: Requirements 1.3**
   */
  describe('Property 3: Token invalidation prevents reuse', () => {
    it('should prevent token reuse after successful linking', async () => {
      const token = 'test-token-uuid-5678'
      const chatId1 = '111111111'
      const chatId2 = '222222222'
      const testUser = {
        _id: new mongoose.Types.ObjectId(),
        telegramChatId: undefined,
        telegramLinkToken: token,
        telegramLinkTokenExpiry: new Date(Date.now() + 10 * 60 * 1000),
        save: jest.fn().mockImplementation(function(this: any) {
          this.telegramLinkToken = undefined
          this.telegramLinkTokenExpiry = undefined
          return Promise.resolve(true)
        }),
      }
      
      let findOneCallCount = 0
      ;(User.findOne as jest.Mock) = jest.fn().mockImplementation(() => {
        findOneCallCount++
        if (findOneCallCount === 1) {
          return Promise.resolve(testUser)
        } else {
          return Promise.resolve(null)
        }
      })
      
      const testService = new TelegramService()
      const mockBot = {
        getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
        sendMessage: jest.fn().mockResolvedValue({}),
        close: jest.fn().mockResolvedValue(undefined),
        stopPolling: jest.fn().mockResolvedValue(undefined),
        onText: jest.fn(),
      }
      ;(testService as any).bot = mockBot
      
      await testService.handleStartCommand(chatId1, token)
      
      expect(testUser.save).toHaveBeenCalled()
      expect(testUser.telegramChatId).toBe(chatId1)
      
      await testService.handleStartCommand(chatId2, token)
      
      // Check that the second call received an error message
      const secondCallArgs = mockBot.sendMessage.mock.calls[1]
      expect(secondCallArgs[0]).toBe(chatId2)
      expect(secondCallArgs[1]).toContain('Invalid or expired')
    })
  })

  /**
   * **Feature: telegram-alert-system, Property 4: Expired tokens are rejected**
   * 
   * For any linking token with an expiry time in the past, any linking attempt must be
   * rejected regardless of the token's validity.
   * 
   * **Validates: Requirements 1.4**
   */
  describe('Property 4: Expired tokens are rejected', () => {
    it('should reject expired tokens', async () => {
      const token = 'test-token-uuid-9999'
      const chatId = '987654321'
      const testUser = {
        _id: new mongoose.Types.ObjectId(),
        telegramChatId: undefined,
        telegramLinkToken: token,
        telegramLinkTokenExpiry: new Date(Date.now() - 60000), // Expired 1 minute ago
        save: jest.fn().mockResolvedValue(true),
      }
      
      ;(User.findOne as jest.Mock) = jest.fn().mockResolvedValue(testUser)
      
      const testService = new TelegramService()
      const mockBot = {
        getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
        sendMessage: jest.fn().mockResolvedValue({}),
        close: jest.fn().mockResolvedValue(undefined),
        stopPolling: jest.fn().mockResolvedValue(undefined),
        onText: jest.fn(),
      }
      ;(testService as any).bot = mockBot
      
      await testService.handleStartCommand(chatId, token)
      
      expect(testUser.save).not.toHaveBeenCalled()
      expect(testUser.telegramChatId).toBeUndefined()
      
      // Check that an error message was sent
      const callArgs = mockBot.sendMessage.mock.calls[0]
      expect(callArgs[0]).toBe(chatId)
      expect(callArgs[1]).toContain('expired')
    })
  })

  /**
   * **Feature: telegram-alert-system, Property 13: Delivery failures do not crash system**
   * 
   * For any message delivery that fails due to Telegram API errors, the system must log
   * the error and continue processing subsequent messages without throwing unhandled exceptions.
   * 
   * **Validates: Requirements 5.4**
   */
  describe('Property 13: Delivery failures do not crash system', () => {
    it('should handle delivery failures gracefully without crashing', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 3, max: 10 }),
          fc.integer({ min: 0, max: 2 }),
          async (messageCount: number, failureIndex: number) => {
            const testService = new TelegramService()
            const testUser = {
              _id: new mongoose.Types.ObjectId(),
              telegramChatId: '123456789',
            }
            
            ;(User.findById as jest.Mock) = jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(testUser),
              }),
            })
            
            let callCount = 0
            const mockBot = {
              getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
              sendMessage: jest.fn().mockImplementation(() => {
                const currentCall = callCount++
                // Make the message at failureIndex fail permanently (non-retryable error)
                if (currentCall === failureIndex) {
                  return Promise.reject(new Error('Bad Request: chat not found'))
                }
                return Promise.resolve({})
              }),
              close: jest.fn().mockResolvedValue(undefined),
              stopPolling: jest.fn().mockResolvedValue(undefined),
            }
            ;(testService as any).bot = mockBot
            
            // Queue multiple messages
            for (let i = 0; i < messageCount; i++) {
              await testService.queueAlert(
                testUser._id.toString(),
                AlertType.ALPHA_STREAM,
                `txhash${i}`,
                `message${i}`,
                Priority.LOW
              )
            }
            
            const statsBefore = testService.getQueueStats()
            expect(statsBefore.queueSize).toBe(messageCount)
            
            // Process all messages - should not throw
            await expect(testService.shutdown()).resolves.not.toThrow()
            
            const statsAfter = testService.getQueueStats()
            expect(statsAfter.queueSize).toBe(0)
            
            // One message should have failed and been dropped
            expect(statsAfter.messagesDropped).toBe(1)
            
            // The rest should have been processed successfully
            expect(statsAfter.messagesProcessed).toBe(messageCount - 1)
            
            return true
          },
        ),
        { numRuns: 50 },
      )
    })

    it('should continue processing after multiple consecutive failures', async () => {
      const testService = new TelegramService()
      const testUser = {
        _id: new mongoose.Types.ObjectId(),
        telegramChatId: '123456789',
      }
      
      ;(User.findById as jest.Mock) = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(testUser),
        }),
      })
      
      let callCount = 0
      const mockBot = {
        getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
        sendMessage: jest.fn().mockImplementation(() => {
          const currentCall = callCount++
          // Fail the first 3 calls with non-retryable errors
          if (currentCall < 3) {
            return Promise.reject(new Error('Bad Request: chat not found'))
          }
          return Promise.resolve({})
        }),
        close: jest.fn().mockResolvedValue(undefined),
        stopPolling: jest.fn().mockResolvedValue(undefined),
      }
      ;(testService as any).bot = mockBot
      
      // Queue 5 messages
      for (let i = 0; i < 5; i++) {
        await testService.queueAlert(
          testUser._id.toString(),
          AlertType.ALPHA_STREAM,
          `txhash${i}`,
          `message${i}`,
          Priority.LOW
        )
      }
      
      // Process all messages
      await testService.shutdown()
      
      const stats = testService.getQueueStats()
      expect(stats.queueSize).toBe(0)
      expect(stats.messagesDropped).toBe(3) // First 3 failed
      expect(stats.messagesProcessed).toBe(2) // Last 2 succeeded
    })

    it('should retry retryable errors with exponential backoff', async () => {
      const testService = new TelegramService()
      const testUser = {
        _id: new mongoose.Types.ObjectId(),
        telegramChatId: '123456789',
      }
      
      ;(User.findById as jest.Mock) = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(testUser),
        }),
      })
      
      let callCount = 0
      const mockBot = {
        getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
        sendMessage: jest.fn().mockImplementation(() => {
          const currentCall = callCount++
          // Fail first 2 attempts with retryable error, succeed on 3rd
          if (currentCall < 2) {
            return Promise.reject(new Error('Network timeout'))
          }
          return Promise.resolve({})
        }),
        close: jest.fn().mockResolvedValue(undefined),
        stopPolling: jest.fn().mockResolvedValue(undefined),
      }
      ;(testService as any).bot = mockBot
      
      // Queue 1 message
      await testService.queueAlert(
        testUser._id.toString(),
        AlertType.ALPHA_STREAM,
        'txhash1',
        'message1',
        Priority.LOW
      )
      
      // Process the message
      await testService.shutdown()
      
      const stats = testService.getQueueStats()
      expect(stats.queueSize).toBe(0)
      expect(stats.messagesProcessed).toBe(1) // Should succeed after retries
      expect(stats.messagesDropped).toBe(0)
      
      // Should have been called 3 times (initial + 2 retries)
      expect(mockBot.sendMessage).toHaveBeenCalledTimes(3)
    })
  })

  /**
   * **Feature: telegram-alert-system, Property 18: Formatting failures trigger fallback**
   * 
   * For any message formatting operation that throws an error, the system must log the
   * error and send a plain text version of the message without MarkdownV2 formatting.
   * 
   * **Validates: Requirements 7.5**
   */
  describe('Property 18: Formatting failures trigger fallback', () => {
    it('should fallback to plain text when MarkdownV2 parsing fails', async () => {
      const testService = new TelegramService()
      const testUser = {
        _id: new mongoose.Types.ObjectId(),
        telegramChatId: '123456789',
      }
      
      ;(User.findById as jest.Mock) = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(testUser),
        }),
      })
      
      let sendMessageCallCount = 0
      const mockBot = {
        getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
        sendMessage: jest.fn().mockImplementation((chatId, text, options) => {
          sendMessageCallCount++
          // First call with MarkdownV2 fails
          if (options?.parse_mode === 'MarkdownV2' && sendMessageCallCount === 1) {
            return Promise.reject(new Error('Bad Request: can\'t parse entities'))
          }
          // Second call without parse_mode succeeds (plain text fallback)
          return Promise.resolve({})
        }),
        close: jest.fn().mockResolvedValue(undefined),
        stopPolling: jest.fn().mockResolvedValue(undefined),
      }
      ;(testService as any).bot = mockBot
      
      // Queue a message with potentially problematic formatting
      await testService.queueAlert(
        testUser._id.toString(),
        AlertType.ALPHA_STREAM,
        'txhash123',
        'Message with [invalid] markdown',
        Priority.LOW
      )
      
      // Process the message
      await testService.shutdown()
      
      // Should have called sendMessage twice: once with MarkdownV2 (failed), once without (succeeded)
      expect(mockBot.sendMessage).toHaveBeenCalledTimes(2)
      
      // First call should have MarkdownV2
      expect(mockBot.sendMessage.mock.calls[0][2]).toHaveProperty('parse_mode', 'MarkdownV2')
      
      // Second call should not have parse_mode (plain text fallback)
      expect(mockBot.sendMessage.mock.calls[1][2]).toHaveProperty('parse_mode', undefined)
      
      // Message should have been processed successfully
      const stats = testService.getQueueStats()
      expect(stats.messagesProcessed).toBe(1)
      expect(stats.messagesDropped).toBe(0)
    })

    it('should log formatting errors', async () => {
      const testService = new TelegramService()
      const testUser = {
        _id: new mongoose.Types.ObjectId(),
        telegramChatId: '123456789',
      }
      
      ;(User.findById as jest.Mock) = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(testUser),
        }),
      })
      
      let sendMessageCallCount = 0
      const mockBot = {
        getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
        sendMessage: jest.fn().mockImplementation((chatId, text, options) => {
          sendMessageCallCount++
          if (options?.parse_mode === 'MarkdownV2' && sendMessageCallCount === 1) {
            return Promise.reject(new Error('Bad Request: can\'t parse entities'))
          }
          return Promise.resolve({})
        }),
        close: jest.fn().mockResolvedValue(undefined),
        stopPolling: jest.fn().mockResolvedValue(undefined),
      }
      ;(testService as any).bot = mockBot
      
      mockLogger.warn.mockClear()
      
      await testService.queueAlert(
        testUser._id.toString(),
        AlertType.ALPHA_STREAM,
        'txhash456',
        'Message with formatting issues',
        Priority.LOW
      )
      
      await testService.shutdown()
      
      // Should have logged a warning about the formatting failure
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          component: 'TelegramService',
          operation: 'sendMessage',
          message: expect.stringContaining('MarkdownV2 formatting failed'),
        })
      )
    })
  })
})
