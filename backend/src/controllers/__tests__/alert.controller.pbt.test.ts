import * as fc from 'fast-check'
import { Request, Response } from 'express'
import { createWhaleAlert } from '../alert.controller'
import { User } from '../../models/user.model'
import { UserAlert } from '../../models/userAlert.model'
import { validateSOLBalance } from '../../middlewares/premiumGate.middleware'
import { alertMatcherService } from '../../services/alertMatcher.service'

// Mock dependencies
jest.mock('../../models/user.model')
jest.mock('../../models/userAlert.model')
jest.mock('../../middlewares/premiumGate.middleware')
jest.mock('../../services/alertMatcher.service', () => ({
  alertMatcherService: {
    invalidateUserSubscriptions: jest.fn(),
  },
}))
jest.mock('../../services/telegram.service', () => ({
  telegramService: {},
}))
jest.mock('../../utils/logger', () => ({
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}))

describe('Alert Controller Property-Based Tests', () => {
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>
  let mockNext: jest.Mock
  let jsonMock: jest.Mock
  let statusMock: jest.Mock

  beforeEach(() => {
    jsonMock = jest.fn().mockReturnThis()
    statusMock = jest.fn().mockReturnValue({ json: jsonMock })
    mockNext = jest.fn()

    mockRequest = {
      body: {},
    }

    mockResponse = {
      status: statusMock,
      json: jsonMock,
    }

    jest.clearAllMocks()
  })

  /**
   * **Feature: telegram-whale-alerts, Property 13: Input validation rejects invalid configurations**
   *
   * For any alert configuration with hotness score < 0 or > 10, or minimum buy amount <= 0,
   * the API must reject the configuration with a validation error.
   *
   * **Validates: Requirements 3.6, 3.7**
   */
  describe('Property 13: Input validation rejects invalid configurations', () => {
    it('should reject configurations with invalid hotness scores', async () => {
      const userId = 'test-user-id'
      ;(mockRequest as any).userId = userId

      await fc.assert(
        fc.asyncProperty(
          // Generate invalid hotness scores (outside 0-10 range)
          fc.oneof(
            fc.double({ min: -1000, max: -0.001, noNaN: true }), // Negative scores
            fc.double({ min: 10.001, max: 1000, noNaN: true }), // Scores above 10
          ),
          fc.double({ min: 0.01, max: 10000, noNaN: true }), // Valid buy amount
          fc.array(
            fc.constantFrom('Sniper', 'Smart Money', 'Insider', 'Heavy Accumulator'),
            { minLength: 1, maxLength: 4 },
          ), // Valid wallet labels
          async (invalidHotnessScore, validBuyAmount, validLabels) => {
            // Reset mocks for each iteration
            jsonMock.mockClear()
            statusMock.mockClear()

            mockRequest.body = {
              hotnessScoreThreshold: invalidHotnessScore,
              minBuyAmountUSD: validBuyAmount,
              walletLabels: validLabels,
            }

            await createWhaleAlert(mockRequest as Request, mockResponse as Response, mockNext)

            // Verify rejection with 400 Bad Request
            expect(statusMock).toHaveBeenCalledWith(400)
            expect(jsonMock).toHaveBeenCalledWith(
              expect.objectContaining({
                success: false,
                message: expect.stringContaining('Hotness score must be between 0 and 10'),
              }),
            )
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should reject configurations with invalid minimum buy amounts', async () => {
      const userId = 'test-user-id'
      ;(mockRequest as any).userId = userId

      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 0, max: 10, noNaN: true }), // Valid hotness score
          // Generate invalid buy amounts (zero or negative)
          fc.oneof(
            fc.constant(0), // Zero
            fc.double({ min: -10000, max: -0.001, noNaN: true }), // Negative amounts
          ),
          fc.array(
            fc.constantFrom('Sniper', 'Smart Money', 'Insider', 'Heavy Accumulator'),
            { minLength: 1, maxLength: 4 },
          ), // Valid wallet labels
          async (validHotnessScore, invalidBuyAmount, validLabels) => {
            // Reset mocks for each iteration
            jsonMock.mockClear()
            statusMock.mockClear()

            mockRequest.body = {
              hotnessScoreThreshold: validHotnessScore,
              minBuyAmountUSD: invalidBuyAmount,
              walletLabels: validLabels,
            }

            await createWhaleAlert(mockRequest as Request, mockResponse as Response, mockNext)

            // Verify rejection with 400 Bad Request
            expect(statusMock).toHaveBeenCalledWith(400)
            expect(jsonMock).toHaveBeenCalledWith(
              expect.objectContaining({
                success: false,
                message: expect.stringContaining('Minimum buy amount must be positive'),
              }),
            )
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should reject configurations with empty or invalid wallet labels', async () => {
      const userId = 'test-user-id'
      ;(mockRequest as any).userId = userId

      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 0, max: 10, noNaN: true }), // Valid hotness score
          fc.double({ min: 0.01, max: 10000, noNaN: true }), // Valid buy amount
          // Generate invalid wallet label configurations
          fc.oneof(
            fc.constant(null), // Null
            fc.constant(undefined), // Undefined
            fc.array(fc.string(), { minLength: 1, maxLength: 4 }), // Invalid label strings
          ),
          async (validHotnessScore, validBuyAmount, invalidLabels) => {
            // Reset mocks for each iteration
            jsonMock.mockClear()
            statusMock.mockClear()

            mockRequest.body = {
              hotnessScoreThreshold: validHotnessScore,
              minBuyAmountUSD: validBuyAmount,
              walletLabels: invalidLabels,
            }

            await createWhaleAlert(mockRequest as Request, mockResponse as Response, mockNext)

            // Verify rejection with 400 Bad Request
            expect(statusMock).toHaveBeenCalledWith(400)
            expect(jsonMock).toHaveBeenCalledWith(
              expect.objectContaining({
                success: false,
                message: expect.stringMatching(
                  /Wallet labels must be an array|Invalid wallet labels/,
                ),
              }),
            )
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should reject configurations with missing required fields', async () => {
      const userId = 'test-user-id'
      ;(mockRequest as any).userId = userId

      await fc.assert(
        fc.asyncProperty(
          // Generate configurations with missing fields
          fc.oneof(
            fc.constant({ minBuyAmountUSD: 100, walletLabels: ['Sniper'] }), // Missing hotness score
            fc.constant({ hotnessScoreThreshold: 5, walletLabels: ['Sniper'] }), // Missing buy amount
          ),
          async (incompleteConfig) => {
            // Reset mocks for each iteration
            jsonMock.mockClear()
            statusMock.mockClear()

            mockRequest.body = incompleteConfig

            await createWhaleAlert(mockRequest as Request, mockResponse as Response, mockNext)

            // Verify rejection with 400 Bad Request
            expect(statusMock).toHaveBeenCalledWith(400)
            expect(jsonMock).toHaveBeenCalledWith(
              expect.objectContaining({
                success: false,
                message: expect.stringMatching(
                  /Hotness score threshold is required|Minimum buy amount is required/,
                ),
              }),
            )
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
