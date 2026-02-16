import * as fc from 'fast-check'
import {
  validateSOLBalance,
  PREMIUM_BALANCE_THRESHOLD,
  PremiumAccessResult,
} from '../premiumGate.middleware'
import { executeWithFallback } from '../../config/solana-config'
import { redisClient } from '../../config/redis'
import { PublicKey } from '@solana/web3.js'

// Mock dependencies
jest.mock('../../config/solana-config', () => ({
  solConnection: {
    getBalance: jest.fn(),
  },
  executeWithFallback: jest.fn(),
}))

jest.mock('../../config/redis', () => ({
  redisClient: {
    get: jest.fn(),
    setex: jest.fn(),
  },
}))

jest.mock('../../utils/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}))

describe('Premium Gate Middleware Property-Based Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  /**
   * **Feature: telegram-whale-alerts, Property 1: Premium access validation consistency**
   *
   * For any wallet address and ALPHA balance query, if the balance is >= threshold,
   * then premium access validation must return `hasAccess: true`, and if balance is
   * < threshold, then validation must return `hasAccess: false`.
   *
   * **Validates: Requirements 1.2, 1.3**
   */
  describe('Property 1: Premium access validation consistency', () => {
    it('should grant access when balance >= threshold and deny when balance < threshold', async () => {
      // Use a fixed valid Solana wallet address for all tests
      const testWallet = 'So11111111111111111111111111111111111111112'

      await fc.assert(
        fc.asyncProperty(
          // Generate random ALPHA balances (raw units, 6 decimals)
          fc.integer({ min: 0, max: 1_000_000_000_000 }),
          async (rawAmount) => {
            // Mock Redis cache miss (force blockchain query)
            jest.mocked(redisClient.get).mockResolvedValue(null)

            // Mock ALPHA token balance query
            jest.mocked(executeWithFallback).mockResolvedValue({
              value: {
                amount: rawAmount.toString(),
                decimals: 6,
              },
            })

            // Mock Redis setex
            jest.mocked(redisClient.setex).mockResolvedValue('OK')

            // Validate balance
            const result = await validateSOLBalance(testWallet)

            // Verify consistency: hasAccess matches threshold comparison
            const balanceInAlpha = rawAmount / 1_000_000
            const expectedAccess = balanceInAlpha >= PREMIUM_BALANCE_THRESHOLD

            expect(result.hasAccess).toBe(expectedAccess)
            expect(result.currentBalance).toBeCloseTo(balanceInAlpha, 6)
            expect(result.requiredBalance).toBe(PREMIUM_BALANCE_THRESHOLD)

            // If access denied, difference should be positive
            if (!result.hasAccess) {
              expect(result.difference).toBeDefined()
              expect(result.difference).toBeGreaterThan(0)
              expect(result.difference).toBeCloseTo(
                PREMIUM_BALANCE_THRESHOLD - balanceInAlpha,
                6,
              )
            } else {
              // If access granted, difference should be undefined
              expect(result.difference).toBeUndefined()
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should handle edge cases at exact threshold', async () => {
      const walletAddress = 'So11111111111111111111111111111111111111112'

      // Mock Redis cache miss
      jest.mocked(redisClient.get).mockResolvedValue(null)
      jest.mocked(redisClient.setex).mockResolvedValue('OK')

      // Test exactly at threshold
      const exactThresholdRaw = PREMIUM_BALANCE_THRESHOLD * 1_000_000
      jest.mocked(executeWithFallback).mockResolvedValue({
        value: {
          amount: exactThresholdRaw.toString(),
          decimals: 6,
        },
      })

      const resultAtThreshold = await validateSOLBalance(walletAddress)
      expect(resultAtThreshold.hasAccess).toBe(true)
      expect(resultAtThreshold.difference).toBeUndefined()

      // Test just below threshold
      const belowThresholdRaw = exactThresholdRaw - 1
      jest.mocked(executeWithFallback).mockResolvedValue({
        value: {
          amount: belowThresholdRaw.toString(),
          decimals: 6,
        },
      })
      jest.mocked(redisClient.get).mockResolvedValue(null) // Force fresh query

      const resultBelowThreshold = await validateSOLBalance(walletAddress)
      expect(resultBelowThreshold.hasAccess).toBe(false)
      expect(resultBelowThreshold.difference).toBeDefined()
      expect(resultBelowThreshold.difference).toBeGreaterThan(0)

      // Test just above threshold
      const aboveThresholdRaw = exactThresholdRaw + 1
      jest.mocked(executeWithFallback).mockResolvedValue({
        value: {
          amount: aboveThresholdRaw.toString(),
          decimals: 6,
        },
      })
      jest.mocked(redisClient.get).mockResolvedValue(null) // Force fresh query

      const resultAboveThreshold = await validateSOLBalance(walletAddress)
      expect(resultAboveThreshold.hasAccess).toBe(true)
      expect(resultAboveThreshold.difference).toBeUndefined()
    })
  })
})
