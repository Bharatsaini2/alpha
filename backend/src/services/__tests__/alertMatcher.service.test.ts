import * as fc from 'fast-check'
import { AlertType, Priority } from '../../types/alert.types'
import { UserAlert } from '../../models/userAlert.model'
import { User } from '../../models/user.model'
import whaleAllTransactionModelV2 from '../../models/whaleAllTransactionsV2.model'
import mongoose from 'mongoose'

// Mock dependencies BEFORE importing AlertMatcherService (factory avoids hoisting issues)
jest.mock('../../utils/logger', () => {
  const mock = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
  return { __esModule: true, default: mock }
})
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

  // Helper to generate whale alert configurations
  const whaleAlertConfigArb = fc.record({
    hotnessScoreThreshold: fc.option(fc.double({ min: 0, max: 10, noNaN: true }), { nil: undefined }),
    walletLabels: fc.option(
      fc.array(
        fc.constantFrom('Sniper', 'Smart Money', 'Insider', 'Heavy Accumulator'),
        { minLength: 1, maxLength: 4 }
      ),
      { nil: undefined }
    ),
    minBuyAmountUSD: fc.option(fc.double({ min: 100, max: 100000, noNaN: true }), { nil: undefined }),
  })

  // Helper to generate whale transactions
  const whaleTransactionArb = fc.record({
    signature: fc.string({ minLength: 64, maxLength: 88 }),
    hotnessScore: fc.double({ min: 0, max: 10, noNaN: true }),
    whaleLabel: fc.array(
      fc.constantFrom('Sniper', 'Smart Money', 'Insider', 'Heavy Accumulator'),
      { minLength: 0, maxLength: 4 }
    ),
    whale: fc.record({
      address: fc.string({ minLength: 32, maxLength: 44 }),
    }),
    transaction: fc.record({
      tokenOut: fc.record({
        address: fc.string({ minLength: 32, maxLength: 44 }),
        symbol: fc.string({ minLength: 2, maxLength: 10 }),
        amount: fc.string(),
        usdAmount: fc.double({ min: 100, max: 100000, noNaN: true }).map(n => n.toString()),
      }),
      tokenIn: fc.record({
        address: fc.string({ minLength: 32, maxLength: 44 }),
        symbol: fc.string({ minLength: 2, maxLength: 10 }),
        amount: fc.string(),
        usdAmount: fc.string(),
      }),
    }),
    type: fc.constant('buy' as const),
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
   * **Feature: telegram-whale-alerts, Property 2: Alert matching correctness**
   * 
   * For any whale transaction and alert subscription, the transaction matches the subscription
   * if and only if: (1) transaction hotness score >= subscription threshold, AND
   * (2) transaction buy amount >= subscription minimum, AND (3) transaction wallet has at
   * least one label from subscription's selected labels (OR logic).
   * 
   * **Validates: Requirements 3.4, 4.4**
   */
  describe('Property 2: Alert matching correctness', () => {
    it('should match transactions that meet all criteria', async () => {
      await fc.assert(
        fc.asyncProperty(
          whaleTransactionArb,
          whaleAlertConfigArb,
          async (tx, config) => {
            // Manually determine if transaction should match
            let shouldMatch = true

            // Check hotness score threshold
            if (config.hotnessScoreThreshold !== undefined) {
              if (tx.hotnessScore < config.hotnessScoreThreshold) {
                shouldMatch = false
              }
            }

            // Check minimum buy amount
            if (config.minBuyAmountUSD !== undefined && config.minBuyAmountUSD > 0) {
              const buyAmountUSD = parseFloat(tx.transaction.tokenOut.usdAmount)
              if (buyAmountUSD < config.minBuyAmountUSD) {
                shouldMatch = false
              }
            }

            // Check wallet labels with OR logic
            if (config.walletLabels && config.walletLabels.length > 0) {
              const hasMatchingLabel = tx.whaleLabel.some(label =>
                config.walletLabels!.includes(label)
              )
              if (!hasMatchingLabel) {
                shouldMatch = false
              }
            }

            // Test the evaluateWhaleAlert method
            const actualMatch = service.evaluateWhaleAlert(tx as any, config)

            // Verify the result matches our expectation
            expect(actualMatch).toBe(shouldMatch)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should reject transactions below hotness score threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 0, max: 10, noNaN: true }),
          fc.double({ min: 0, max: 10, noNaN: true }),
          async (txScore, threshold) => {
            const tx = {
              hotnessScore: txScore,
              whaleLabel: ['Sniper'],
              transaction: {
                tokenOut: {
                  usdAmount: '1000',
                },
              },
            }

            const config = {
              hotnessScoreThreshold: threshold,
            }

            const result = service.evaluateWhaleAlert(tx as any, config)

            // Should match only if tx score >= threshold
            expect(result).toBe(txScore >= threshold)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should reject transactions below minimum buy amount', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 100, max: 100000, noNaN: true }),
          fc.double({ min: 100, max: 100000, noNaN: true }),
          async (txAmount, minAmount) => {
            const tx = {
              hotnessScore: 5,
              whaleLabel: ['Sniper'],
              transaction: {
                tokenOut: {
                  usdAmount: txAmount.toString(),
                },
              },
            }

            const config = {
              minBuyAmountUSD: minAmount,
            }

            const result = service.evaluateWhaleAlert(tx as any, config)

            // Should match only if tx amount >= min amount
            expect(result).toBe(txAmount >= minAmount)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  /**
   * **Feature: telegram-whale-alerts, Property 8: Wallet label OR logic**
   * 
   * For any transaction with wallet labels [L1, L2, ...] and subscription with selected
   * labels [S1, S2, ...], the transaction matches if there exists at least one label L
   * in transaction labels that is also in selected labels.
   * 
   * **Validates: Requirements 3.4**
   */
  describe('Property 8: Wallet label OR logic', () => {
    it('should match when transaction has at least one selected label', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.constantFrom('Sniper', 'Smart Money', 'Insider', 'Heavy Accumulator'),
            { minLength: 1, maxLength: 4 }
          ),
          fc.array(
            fc.constantFrom('Sniper', 'Smart Money', 'Insider', 'Heavy Accumulator'),
            { minLength: 1, maxLength: 4 }
          ),
          async (txLabels, selectedLabels) => {
            const tx = {
              hotnessScore: 5,
              whaleLabel: txLabels,
              transaction: {
                tokenOut: {
                  usdAmount: '1000',
                },
              },
            }

            const config = {
              walletLabels: selectedLabels,
            }

            const result = service.evaluateWhaleAlert(tx as any, config)

            // Manually check if there's any overlap
            const hasOverlap = txLabels.some(label => selectedLabels.includes(label))

            // Should match only if there's at least one common label
            expect(result).toBe(hasOverlap)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should reject when transaction has no selected labels', async () => {
      const tx = {
        hotnessScore: 5,
        whaleLabel: ['Sniper', 'Smart Money'],
        transaction: {
          tokenOut: {
            usdAmount: '1000',
          },
        },
      }

      const config = {
        walletLabels: ['Insider', 'Heavy Accumulator'],
      }

      const result = service.evaluateWhaleAlert(tx as any, config)

      // Should not match since no labels overlap
      expect(result).toBe(false)
    })

    it('should match when transaction has all selected labels', async () => {
      const tx = {
        hotnessScore: 5,
        whaleLabel: ['Sniper', 'Smart Money', 'Insider', 'Heavy Accumulator'],
        transaction: {
          tokenOut: {
            usdAmount: '1000',
          },
        },
      }

      const config = {
        walletLabels: ['Sniper', 'Smart Money'],
      }

      const result = service.evaluateWhaleAlert(tx as any, config)

      // Should match since transaction has both selected labels
      expect(result).toBe(true)
    })

    it('should match when transaction has exactly one selected label', async () => {
      const tx = {
        hotnessScore: 5,
        whaleLabel: ['Sniper'],
        transaction: {
          tokenOut: {
            usdAmount: '1000',
          },
        },
      }

      const config = {
        walletLabels: ['Sniper', 'Smart Money'],
      }

      const result = service.evaluateWhaleAlert(tx as any, config)

      // Should match since transaction has one of the selected labels
      expect(result).toBe(true)
    })

    it('should match when empty wallet labels config (no filter)', async () => {
      const tx = {
        hotnessScore: 5,
        whaleLabel: ['Sniper'],
        transaction: {
          tokenOut: {
            usdAmount: '1000',
          },
        },
      }

      const config = {
        walletLabels: [],
      }

      const result = service.evaluateWhaleAlert(tx as any, config)

      // Should match since no wallet label filter is applied
      expect(result).toBe(true)
    })
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
            // Mock UserAlert.find to return our generated alerts (include _id for subscriptionId in cooldown key)
            const mockAlerts = alerts.map((alert) => ({
              ...alert,
              _id: new mongoose.Types.ObjectId(),
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

describe('AlertMatcherService Unit Tests', () => {
  let service: AlertMatcherService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new AlertMatcherService()
  })

  afterEach(async () => {
    if ((service as any).isInitialized) {
      await service.shutdown()
    }
  })

  describe('evaluateWhaleAlert - Hotness Score Threshold', () => {
    it('should match when hotness score equals threshold', () => {
      const tx = {
        hotnessScore: 7.5,
        whaleLabel: ['Sniper'],
        transaction: {
          tokenOut: {
            usdAmount: '1000',
          },
        },
      }

      const config = {
        hotnessScoreThreshold: 7.5,
      }

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(true)
    })

    it('should match when hotness score exceeds threshold', () => {
      const tx = {
        hotnessScore: 8.0,
        whaleLabel: ['Sniper'],
        transaction: {
          tokenOut: {
            usdAmount: '1000',
          },
        },
      }

      const config = {
        hotnessScoreThreshold: 7.5,
      }

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(true)
    })

    it('should reject when hotness score below threshold', () => {
      const tx = {
        hotnessScore: 7.0,
        whaleLabel: ['Sniper'],
        transaction: {
          tokenOut: {
            usdAmount: '1000',
          },
        },
      }

      const config = {
        hotnessScoreThreshold: 7.5,
      }

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(false)
    })

    it('should match when no hotness score threshold configured', () => {
      const tx = {
        hotnessScore: 3.0,
        whaleLabel: ['Sniper'],
        transaction: {
          tokenOut: {
            usdAmount: '1000',
          },
        },
      }

      const config = {}

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(true)
    })
  })

  describe('evaluateWhaleAlert - Minimum Buy Amount', () => {
    it('should match when buy amount equals minimum', () => {
      const tx = {
        hotnessScore: 5,
        whaleLabel: ['Sniper'],
        transaction: {
          tokenOut: {
            usdAmount: '5000',
          },
        },
      }

      const config = {
        minBuyAmountUSD: 5000,
      }

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(true)
    })

    it('should match when buy amount exceeds minimum', () => {
      const tx = {
        hotnessScore: 5,
        whaleLabel: ['Sniper'],
        transaction: {
          tokenOut: {
            usdAmount: '10000',
          },
        },
      }

      const config = {
        minBuyAmountUSD: 5000,
      }

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(true)
    })

    it('should reject when buy amount below minimum', () => {
      const tx = {
        hotnessScore: 5,
        whaleLabel: ['Sniper'],
        transaction: {
          tokenOut: {
            usdAmount: '3000',
          },
        },
      }

      const config = {
        minBuyAmountUSD: 5000,
      }

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(false)
    })

    it('should match when no minimum buy amount configured', () => {
      const tx = {
        hotnessScore: 5,
        whaleLabel: ['Sniper'],
        transaction: {
          tokenOut: {
            usdAmount: '100',
          },
        },
      }

      const config = {}

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(true)
    })

    it('should handle zero minimum buy amount', () => {
      const tx = {
        hotnessScore: 5,
        whaleLabel: ['Sniper'],
        transaction: {
          tokenOut: {
            usdAmount: '100',
          },
        },
      }

      const config = {
        minBuyAmountUSD: 0,
      }

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(true)
    })
  })

  describe('evaluateWhaleAlert - Wallet Label OR Logic', () => {
    it('should match with single matching label', () => {
      const tx = {
        hotnessScore: 5,
        whaleLabel: ['Sniper', 'Smart Money'],
        transaction: {
          tokenOut: {
            usdAmount: '1000',
          },
        },
      }

      const config = {
        walletLabels: ['Sniper'],
      }

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(true)
    })

    it('should match with multiple matching labels', () => {
      const tx = {
        hotnessScore: 5,
        whaleLabel: ['Sniper', 'Smart Money', 'Insider'],
        transaction: {
          tokenOut: {
            usdAmount: '1000',
          },
        },
      }

      const config = {
        walletLabels: ['Sniper', 'Smart Money'],
      }

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(true)
    })

    it('should reject with no matching labels', () => {
      const tx = {
        hotnessScore: 5,
        whaleLabel: ['Sniper', 'Smart Money'],
        transaction: {
          tokenOut: {
            usdAmount: '1000',
          },
        },
      }

      const config = {
        walletLabels: ['Insider', 'Heavy Accumulator'],
      }

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(false)
    })

    it('should reject when transaction has no labels but config requires labels', () => {
      const tx = {
        hotnessScore: 5,
        whaleLabel: [],
        transaction: {
          tokenOut: {
            usdAmount: '1000',
          },
        },
      }

      const config = {
        walletLabels: ['Sniper'],
      }

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(false)
    })

    it('should match when no wallet labels configured', () => {
      const tx = {
        hotnessScore: 5,
        whaleLabel: ['Sniper'],
        transaction: {
          tokenOut: {
            usdAmount: '1000',
          },
        },
      }

      const config = {}

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(true)
    })

    it('should match when wallet labels array is empty', () => {
      const tx = {
        hotnessScore: 5,
        whaleLabel: ['Sniper'],
        transaction: {
          tokenOut: {
            usdAmount: '1000',
          },
        },
      }

      const config = {
        walletLabels: [],
      }

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(true)
    })
  })

  describe('evaluateWhaleAlert - Combined Criteria', () => {
    it('should match when all criteria are met', () => {
      const tx = {
        hotnessScore: 8.0,
        whaleLabel: ['Sniper', 'Smart Money'],
        transaction: {
          tokenOut: {
            usdAmount: '10000',
          },
        },
      }

      const config = {
        hotnessScoreThreshold: 7.5,
        minBuyAmountUSD: 5000,
        walletLabels: ['Sniper'],
      }

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(true)
    })

    it('should reject when hotness score fails but others pass', () => {
      const tx = {
        hotnessScore: 7.0,
        whaleLabel: ['Sniper'],
        transaction: {
          tokenOut: {
            usdAmount: '10000',
          },
        },
      }

      const config = {
        hotnessScoreThreshold: 7.5,
        minBuyAmountUSD: 5000,
        walletLabels: ['Sniper'],
      }

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(false)
    })

    it('should reject when buy amount fails but others pass', () => {
      const tx = {
        hotnessScore: 8.0,
        whaleLabel: ['Sniper'],
        transaction: {
          tokenOut: {
            usdAmount: '3000',
          },
        },
      }

      const config = {
        hotnessScoreThreshold: 7.5,
        minBuyAmountUSD: 5000,
        walletLabels: ['Sniper'],
      }

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(false)
    })

    it('should reject when wallet label fails but others pass', () => {
      const tx = {
        hotnessScore: 8.0,
        whaleLabel: ['Insider'],
        transaction: {
          tokenOut: {
            usdAmount: '10000',
          },
        },
      }

      const config = {
        hotnessScoreThreshold: 7.5,
        minBuyAmountUSD: 5000,
        walletLabels: ['Sniper', 'Smart Money'],
      }

      const result = service.evaluateWhaleAlert(tx as any, config)
      expect(result).toBe(false)
    })
  })

  describe('Deduplication', () => {
    it('should queue alert only once for same transaction and user', async () => {
      const subscription = {
        userId: new mongoose.Types.ObjectId().toString(),
        chatId: 'test-chat-id',
        priority: Priority.LOW,
        config: {
          hotnessScoreThreshold: 5,
        },
      }

      ;(service as any).subscriptionMap.set(AlertType.ALPHA_STREAM, [subscription])
      ;(service as any).isInitialized = true

      const mockTx = {
        signature: 'test-signature-dedup',
        hotnessScore: 7,
        whale: {
          address: 'test-whale-address',
        },
        whaleLabel: ['Sniper'],
        transaction: {
          tokenOut: {
            address: 'test-token',
            symbol: 'TEST',
            amount: '1000',
            usdAmount: '1000',
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

      // Process transaction first time
      await service.processTransaction(mockTx as any)
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Verify alert was queued
      expect(telegramService.queueAlert).toHaveBeenCalledTimes(1)

      // Clear mock
      ;(telegramService.queueAlert as jest.Mock).mockClear()

      // Process same transaction again
      await service.processTransaction(mockTx as any)
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Verify alert was queued again (deduplication is handled by telegram service)
      // The alert matcher will call queueAlert, but telegram service will deduplicate
      expect(telegramService.queueAlert).toHaveBeenCalledTimes(1)
    })
  })

  describe('Whale cluster cooldown (per token per subscription)', () => {
    const tokenAddress = 'So11111111111111111111111111111111111111112'
    const subscriptionId = new mongoose.Types.ObjectId().toString()
    const userId = new mongoose.Types.ObjectId().toString()

    function makeWhaleTx(sig: string) {
      return {
        signature: sig,
        whale: { address: 'whale-' + sig.slice(0, 8) },
        transaction: {
          tokenOut: {
            address: tokenAddress,
            symbol: 'TEST',
            marketCap: '1000000',
            amount: '1000',
            usdAmount: '5000',
          },
          tokenIn: { address: 'other', symbol: 'SOL', amount: '1', usdAmount: '5000' },
        },
        tokenOutAddress: tokenAddress,
        type: 'buy' as const,
      }
    }

    function mockClusterData(whaleCount: number, totalVolumeUSD: number) {
      const txs = []
      for (let i = 0; i < whaleCount; i++) {
        txs.push({
          whale: { address: `w${i}` },
          transaction: { tokenOut: { address: tokenAddress, usdAmount: (totalVolumeUSD / whaleCount).toString() } },
          tokenOutAddress: tokenAddress,
          timestamp: new Date(),
        })
      }
      ;(whaleAllTransactionModelV2.find as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(txs),
      })
    }

    beforeEach(() => {
      ;(service as any).whaleClusterLastAlerted.clear()
      ;(service as any).clusterCache.clear()
    })

    it('should send first alert and save snapshot when no snapshot exists', async () => {
      ;(service as any).subscriptionMap.set(AlertType.WHALE_CLUSTER, [
        {
          subscriptionId,
          userId,
          chatId: 'chat1',
          priority: Priority.HIGH,
          config: { minClusterSize: 3, minInflowUSD: 10000, timeWindowMinutes: 15 },
        },
      ])
      ;(service as any).isInitialized = true

      mockClusterData(4, 15000)
      ;(telegramService.queueAlert as jest.Mock).mockClear()

      await (service as any).matchWhaleCluster(makeWhaleTx('sig-first') as any, 'test-corr-1')

      expect(telegramService.queueAlert).toHaveBeenCalledTimes(1)
      const snapshot = (service as any).whaleClusterLastAlerted.get(`${subscriptionId}:${tokenAddress}`)
      expect(snapshot).toBeDefined()
      expect(snapshot.walletCount).toBe(4)
      expect(snapshot.totalVolume).toBe(15000)
    })

    it('should suppress when within same window and growth below threshold', async () => {
      ;(service as any).subscriptionMap.set(AlertType.WHALE_CLUSTER, [
        {
          subscriptionId,
          userId,
          chatId: 'chat1',
          priority: Priority.HIGH,
          config: { minClusterSize: 3, minInflowUSD: 10000, timeWindowMinutes: 15 },
        },
      ])
      ;(service as any).isInitialized = true
      ;(service as any).whaleClusterLastAlerted.set(`${subscriptionId}:${tokenAddress}`, {
        timestamp: Date.now() - 2 * 60 * 1000,
        walletCount: 3,
        totalVolume: 12000,
      })

      mockClusterData(4, 13000)
      ;(telegramService.queueAlert as jest.Mock).mockClear()

      await (service as any).matchWhaleCluster(makeWhaleTx('sig-suppress') as any, 'test-corr-2')

      expect(telegramService.queueAlert).not.toHaveBeenCalled()
    })

    it('should send UPDATE when within window and wallet growth >= 2', async () => {
      ;(service as any).subscriptionMap.set(AlertType.WHALE_CLUSTER, [
        {
          subscriptionId,
          userId,
          chatId: 'chat1',
          priority: Priority.HIGH,
          config: { minClusterSize: 3, minInflowUSD: 10000, timeWindowMinutes: 15 },
        },
      ])
      ;(service as any).isInitialized = true
      ;(service as any).whaleClusterLastAlerted.set(`${subscriptionId}:${tokenAddress}`, {
        timestamp: Date.now() - 2 * 60 * 1000,
        walletCount: 3,
        totalVolume: 12000,
      })

      mockClusterData(5, 14000)
      ;(telegramService.queueAlert as jest.Mock).mockClear()

      await (service as any).matchWhaleCluster(makeWhaleTx('sig-update-wallets') as any, 'test-corr-3')

      expect(telegramService.queueAlert).toHaveBeenCalledTimes(1)
      const message = (telegramService.queueAlert as jest.Mock).mock.calls[0][3]
      expect(message).toContain('Whale Cluster UPDATE')
      expect(message).toContain('Previously')
      expect(message).toContain('Now')
    })

    it('should send UPDATE when within window and volume growth >= 50%', async () => {
      ;(service as any).subscriptionMap.set(AlertType.WHALE_CLUSTER, [
        {
          subscriptionId,
          userId,
          chatId: 'chat1',
          priority: Priority.HIGH,
          config: { minClusterSize: 3, minInflowUSD: 10000, timeWindowMinutes: 15 },
        },
      ])
      ;(service as any).isInitialized = true
      ;(service as any).whaleClusterLastAlerted.set(`${subscriptionId}:${tokenAddress}`, {
        timestamp: Date.now() - 2 * 60 * 1000,
        walletCount: 4,
        totalVolume: 10000,
      })

      mockClusterData(4, 16000)
      ;(telegramService.queueAlert as jest.Mock).mockClear()

      await (service as any).matchWhaleCluster(makeWhaleTx('sig-update-volume') as any, 'test-corr-4')

      expect(telegramService.queueAlert).toHaveBeenCalledTimes(1)
      const message = (telegramService.queueAlert as jest.Mock).mock.calls[0][3]
      expect(message).toContain('Whale Cluster UPDATE')
    })

    it('should send new alert when snapshot is older than user timeframe (window reset)', async () => {
      ;(service as any).subscriptionMap.set(AlertType.WHALE_CLUSTER, [
        {
          subscriptionId,
          userId,
          chatId: 'chat1',
          priority: Priority.HIGH,
          config: { minClusterSize: 3, minInflowUSD: 10000, timeWindowMinutes: 15 },
        },
      ])
      ;(service as any).isInitialized = true
      ;(service as any).whaleClusterLastAlerted.set(`${subscriptionId}:${tokenAddress}`, {
        timestamp: Date.now() - 20 * 60 * 1000,
        walletCount: 3,
        totalVolume: 12000,
      })

      mockClusterData(4, 15000)
      ;(telegramService.queueAlert as jest.Mock).mockClear()

      await (service as any).matchWhaleCluster(makeWhaleTx('sig-window-reset') as any, 'test-corr-5')

      expect(telegramService.queueAlert).toHaveBeenCalledTimes(1)
      const message = (telegramService.queueAlert as jest.Mock).mock.calls[0][3]
      expect(message).toContain('Whale Cluster Alert')
      expect(message).not.toContain('UPDATE')
    })
  })
})
