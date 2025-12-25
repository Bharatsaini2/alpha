import * as fc from 'fast-check'
import { AlertType, Priority } from '../../types/alert.types'
import { UserAlert } from '../../models/userAlert.model'
import { User } from '../../models/user.model'
import whaleAllTransactionModelV2 from '../../models/whaleAllTransactionsV2.model'
import mongoose from 'mongoose'

// Mock logger before importing service
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}

// Mock dependencies BEFORE importing AlertMatcherService
jest.mock('../../utils/logger', () => mockLogger)
jest.mock('../../models/userAlert.model')
jest.mock('../../models/user.model')
jest.mock('../../models/whaleAllTransactionsV2.model')
jest.mock('../telegram.service', () => ({
  telegramService: {
    queueAlert: jest.fn().mockResolvedValue(true),
  },
}))

import { AlertMatcherService } from '../alertMatcher.service'
import { telegramService } from '../telegram.service'

describe('AlertMatcherService Property-Based Tests', () => {
  let service: AlertMatcherService

  // Helper to generate valid MongoDB ObjectId hex strings (24 hex characters)
  const objectIdArb = fc
    .array(
      fc.constantFrom(
        '0',
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
        '7',
        '8',
        '9',
        'a',
        'b',
        'c',
        'd',
        'e',
        'f',
      ),
      { minLength: 24, maxLength: 24 },
    )
    .map((arr) => arr.join(''))

  // Helper to generate alert configurations
  const alertConfigArb = fc.record({
    minAmount: fc.option(fc.double({ min: 100, max: 100000 }), { nil: undefined }),
    tokens: fc.option(fc.array(fc.string({ minLength: 32, maxLength: 44 }), { maxLength: 5 }), { nil: undefined }),
    wallets: fc.option(fc.array(fc.string({ minLength: 32, maxLength: 44 }), { maxLength: 5 }), { nil: undefined }),
    minClusterSize: fc.option(fc.integer({ min: 2, max: 20 }), { nil: undefined }),
    kolIds: fc.option(fc.array(fc.string({ minLength: 3, maxLength: 20 }), { maxLength: 5 }), { nil: undefined }),
  })

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks()

    // Create service instance
    service = new AlertMatcherService()
  })

  afterEach(async () => {
    // Cleanup
    if ((service as any).isInitialized) {
      await service.shutdown()
    }
  })

  /**
   * **Feature: telegram-alert-system, Property 8: Subscription map initialization completeness**
   * 
   * For any set of enabled alerts in the database, after Subscription Map initialization,
   * the map must contain entries for all those alerts grouped by their type.
   * 
   * **Validates: Requirements 3.3**
   */
  describe('Property 8: Subscription map initialization completeness', () => {
    it('should load all enabled alerts into subscription map grouped by type', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              userId: objectIdArb,
              type: fc.constantFrom(...Object.values(AlertType)),
              priority: fc.constantFrom(...Object.values(Priority)),
              enabled: fc.constant(true),
              config: alertConfigArb,
              chatId: fc.string({ minLength: 5, maxLength: 20 }),
            }),
            { minLength: 1, maxLength: 50 },
          ),
          async (alerts) => {
            // Mock UserAlert.find to return our generated alerts
            const mockAlerts = alerts.map((alert) => ({
              ...alert,
              userId: {
                _id: new mongoose.Types.ObjectId(alert.userId),
                telegramChatId: alert.chatId,
              },
            }))

            ;(UserAlert.find as jest.Mock) = jest.fn().mockReturnValue({
              populate: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(mockAlerts),
              }),
            })

            // Initialize service
            await service.syncSubscriptions()

            // Get subscription map
            const subscriptionMap = (service as any).subscriptionMap

            // Count alerts by type
            const alertsByType = new Map<AlertType, number>()
            for (const alert of alerts) {
              const count = alertsByType.get(alert.type) || 0
              alertsByType.set(alert.type, count + 1)
            }

            // Verify each type has correct count in subscription map
            for (const [type, expectedCount] of alertsByType.entries()) {
              const subscriptions = subscriptionMap.get(type) || []
              expect(subscriptions.length).toBe(expectedCount)
            }

            // Verify total count matches
            let totalInMap = 0
            for (const subscriptions of subscriptionMap.values()) {
              totalInMap += subscriptions.length
            }
            expect(totalInMap).toBe(alerts.length)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  /**
   * **Feature: telegram-alert-system, Property 9: Multiple matches produce multiple alerts**
   * 
   * For any transaction and set of user subscriptions where N subscriptions match the
   * transaction, exactly N alert messages must be queued for delivery.
   * 
   * **Validates: Requirements 3.5**
   */
  describe('Property 9: Multiple matches produce multiple alerts', () => {
    it('should queue N alerts for N matching subscriptions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          fc.string({ minLength: 32, maxLength: 44 }),
          fc.double({ min: 1000, max: 100000 }),
          async (matchCount, tokenAddress, usdAmount) => {
            // Create N subscriptions that will all match
            const subscriptions = []
            for (let i = 0; i < matchCount; i++) {
              subscriptions.push({
                userId: new mongoose.Types.ObjectId().toString(),
                chatId: `chat${i}`,
                priority: Priority.LOW,
                config: {
                  tokens: [tokenAddress],
                },
              })
            }

            // Set up subscription map
            ;(service as any).subscriptionMap.set(AlertType.ALPHA_STREAM, subscriptions)
            ;(service as any).isInitialized = true

            // Create a transaction that matches all subscriptions
            const mockTx = {
              signature: 'test-signature-' + Date.now(),
              whale: {
                address: 'test-whale-address',
              },
              transaction: {
                tokenOut: {
                  address: tokenAddress,
                  symbol: 'TEST',
                  amount: '1000',
                  usdAmount: usdAmount.toString(),
                },
                tokenIn: {
                  address: 'other-token',
                  symbol: 'OTHER',
                  amount: '500',
                  usdAmount: '500',
                },
              },
              type: 'buy' as const,
            }

            // Clear mock
            ;(telegramService.queueAlert as jest.Mock).mockClear()

            // Process transaction
            await service.processTransaction(mockTx as any)

            // Wait a bit for async processing
            await new Promise((resolve) => setTimeout(resolve, 50))

            // Verify exactly N alerts were queued
            expect(telegramService.queueAlert).toHaveBeenCalledTimes(matchCount)
          },
        ),
        { numRuns: 50 },
      )
    })
  })

  /**
   * **Feature: telegram-alert-system, Property 20: Cluster cache reuse within TTL**
   * 
   * For any token with a cluster result cached less than 1 minute ago, multiple cluster
   * checks for that token must return the same cached count value without querying the
   * database.
   * 
   * **Validates: Requirements 8.5**
   */
  describe('Property 20: Cluster cache reuse within TTL', () => {
    it('should reuse cached cluster data within TTL without DB queries', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // Use UUID for unique token addresses
          fc.integer({ min: 1, max: 20 }),
          fc.double({ min: 1000, max: 1000000, noNaN: true }),
          async (tokenAddress: string, whaleCount: number, totalVolumeUSD: number) => {
            // Clear cluster cache before each test
            ;(service as any).clusterCache.clear()
            
            // Create unique whale addresses for this test
            const uniqueWhales = new Set<string>()
            const mockTransactions = []
            
            for (let i = 0; i < whaleCount; i++) {
              const whaleAddress = `whale-${tokenAddress.slice(0, 8)}-${i}`
              uniqueWhales.add(whaleAddress)
              mockTransactions.push({
                whale: {
                  address: whaleAddress,
                },
                transaction: {
                  tokenOut: {
                    address: tokenAddress,
                    usdAmount: (totalVolumeUSD / whaleCount).toString(),
                  },
                },
                tokenOutAddress: tokenAddress,
                timestamp: new Date(),
              })
            }

            ;(whaleAllTransactionModelV2.find as jest.Mock) = jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(mockTransactions),
            })

            // First call - should query database
            const result1 = await (service as any).getClusterData(tokenAddress)
            expect(result1.count).toBe(uniqueWhales.size)
            expect(whaleAllTransactionModelV2.find).toHaveBeenCalledTimes(1)

            // Clear mock call count
            ;(whaleAllTransactionModelV2.find as jest.Mock).mockClear()

            // Second call immediately after - should use cache
            const result2 = await (service as any).getClusterData(tokenAddress)
            expect(result2.count).toBe(uniqueWhales.size)
            expect(result2.count).toBe(result1.count)
            expect(result2.totalVolumeUSD).toBeCloseTo(result1.totalVolumeUSD, 2)
            expect(whaleAllTransactionModelV2.find).not.toHaveBeenCalled()

            // Third call - should still use cache
            const result3 = await (service as any).getClusterData(tokenAddress)
            expect(result3.count).toBe(uniqueWhales.size)
            expect(whaleAllTransactionModelV2.find).not.toHaveBeenCalled()
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should query database again after TTL expires', async () => {
      const tokenAddress = 'test-token-address-12345'
      const whaleCount = 5
      const totalVolumeUSD = 10000

      const mockTransactions = []
      for (let i = 0; i < whaleCount; i++) {
        mockTransactions.push({
          whale: {
            address: `whale-${i}`,
          },
          transaction: {
            tokenOut: {
              address: tokenAddress,
              usdAmount: (totalVolumeUSD / whaleCount).toString(),
            },
          },
          tokenOutAddress: tokenAddress,
          timestamp: new Date(),
        })
      }

      ;(whaleAllTransactionModelV2.find as jest.Mock) = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockTransactions),
      })

      // First call
      const result1 = await (service as any).getClusterData(tokenAddress)
      expect(result1.count).toBe(whaleCount)
      expect(whaleAllTransactionModelV2.find).toHaveBeenCalledTimes(1)

      // Manually expire the cache entry
      const clusterCache = (service as any).clusterCache
      const cachedEntry = clusterCache.get(tokenAddress)
      if (cachedEntry) {
        cachedEntry.timestamp = Date.now() - 61 * 1000 // 61 seconds ago (past TTL)
      }

      // Clear mock
      ;(whaleAllTransactionModelV2.find as jest.Mock).mockClear()

      // Second call after TTL - should query database again
      const result2 = await (service as any).getClusterData(tokenAddress)
      expect(result2.count).toBe(whaleCount)
      expect(whaleAllTransactionModelV2.find).toHaveBeenCalledTimes(1)
    })
  })
})
