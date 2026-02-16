import { Request, Response, NextFunction } from 'express'
import {
  checkPremiumAccess,
  validateSOLBalance,
  PREMIUM_BALANCE_THRESHOLD,
} from '../premiumGate.middleware'
import { executeWithFallback } from '../../config/solana-config'
import { redisClient } from '../../config/redis'

// Mock dependencies
jest.mock('../../config/solana-config', () => ({
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

const toTokenAccountInfo = (amount: number, decimals: number = 6) => ({
  value: {
    amount: Math.round(amount * Math.pow(10, decimals)).toString(),
    decimals,
  },
})

describe('Premium Gate Middleware Unit Tests', () => {
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>
  let mockNext: NextFunction

  beforeEach(() => {
    jest.clearAllMocks()

    mockRequest = {
      body: {},
      query: {},
    }

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    }

    mockNext = jest.fn()
  })

  describe('validateSOLBalance', () => {
    const testWallet = 'So11111111111111111111111111111111111111112'

    /**
     * Test balance >= 0.0006 SOL grants access
     * Requirements: 1.2
     */
    it('should grant access when balance >= 500000 ALPHA', async () => {
      // Mock cache miss
      jest.mocked(redisClient.get).mockResolvedValue(null)

      // Mock balance of 600000 ALPHA (above threshold)
      jest.mocked(executeWithFallback).mockResolvedValue(
        toTokenAccountInfo(600000),
      )

      // Mock cache set
      jest.mocked(redisClient.setex).mockResolvedValue('OK')

      const result = await validateSOLBalance(testWallet)

      expect(result.hasAccess).toBe(true)
      expect(result.currentBalance).toBe(600000)
      expect(result.requiredBalance).toBe(PREMIUM_BALANCE_THRESHOLD)
      expect(result.difference).toBeUndefined()

      // Verify blockchain was queried
      expect(executeWithFallback).toHaveBeenCalledTimes(1)

      // Verify result was cached
      expect(redisClient.setex).toHaveBeenCalledWith(
        `premium:balance:${testWallet.toLowerCase()}`,
        3600,
        '600000',
      )
    })

    /**
     * Test balance < 0.0006 SOL denies access
     * Requirements: 1.3
     */
    it('should deny access when balance < 500000 ALPHA', async () => {
      // Mock cache miss
      jest.mocked(redisClient.get).mockResolvedValue(null)

      // Mock balance of 300000 ALPHA (below threshold)
      jest.mocked(executeWithFallback).mockResolvedValue(
        toTokenAccountInfo(300000),
      )

      // Mock cache set
      jest.mocked(redisClient.setex).mockResolvedValue('OK')

      const result = await validateSOLBalance(testWallet)

      expect(result.hasAccess).toBe(false)
      expect(result.currentBalance).toBe(300000)
      expect(result.requiredBalance).toBe(PREMIUM_BALANCE_THRESHOLD)
      expect(result.difference).toBe(200000)

      // Verify blockchain was queried
      expect(executeWithFallback).toHaveBeenCalledTimes(1)
    })

    /**
     * Test blockchain query failure handling
     * Requirements: 1.1
     */
    it('should handle blockchain query failure gracefully', async () => {
      // Mock cache miss
      jest.mocked(redisClient.get).mockResolvedValue(null)

      // Mock blockchain error
      jest.mocked(executeWithFallback).mockRejectedValue(
        new Error('RPC connection failed'),
      )
      const setTimeoutSpy = jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((handler: (...args: any[]) => void) => {
          if (typeof handler === 'function') {
            handler()
          }
          return 0 as unknown as NodeJS.Timeout
        })

      await expect(validateSOLBalance(testWallet)).rejects.toThrow(
        'Unable to verify ALPHA token balance. Please try again.',
      )

      // Verify blockchain was queried
      expect(executeWithFallback).toHaveBeenCalledTimes(3)

      // Verify cache was not set
      expect(redisClient.setex).not.toHaveBeenCalled()
      setTimeoutSpy.mockRestore()
    })

    /**
     * Test cache behavior (5-minute TTL)
     * Requirements: 1.1
     */
    it('should use cached balance when available', async () => {
      // Mock cache hit with balance above threshold
      jest.mocked(redisClient.get).mockResolvedValue('600000')

      const result = await validateSOLBalance(testWallet)

      expect(result.hasAccess).toBe(true)
      expect(result.currentBalance).toBe(600000)

      // Verify blockchain was NOT queried
      expect(executeWithFallback).not.toHaveBeenCalled()

      // Verify cache was NOT updated
      expect(redisClient.setex).not.toHaveBeenCalled()
    })

    it('should cache balance with 1-hour TTL', async () => {
      // Mock cache miss
      jest.mocked(redisClient.get).mockResolvedValue(null)

      // Mock balance
      jest.mocked(executeWithFallback).mockResolvedValue(
        toTokenAccountInfo(600000),
      )

      // Mock cache set
      jest.mocked(redisClient.setex).mockResolvedValue('OK')

      await validateSOLBalance(testWallet)

      // Verify cache was set with 3600 second TTL (1 hour)
      expect(redisClient.setex).toHaveBeenCalledWith(
        `premium:balance:${testWallet.toLowerCase()}`,
        3600,
        '600000',
      )
    })
  })

  describe('checkPremiumAccess middleware', () => {
    const testWallet = 'So11111111111111111111111111111111111111112'

    it('should return 400 if wallet address is missing', async () => {
      await checkPremiumAccess(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      )

      expect(mockResponse.status).toHaveBeenCalledWith(400)
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Wallet address required',
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should call next() when user has premium access', async () => {
      mockRequest.body = { walletAddress: testWallet }

      // Mock cache miss
      jest.mocked(redisClient.get).mockResolvedValue(null)

      // Mock balance above threshold
      jest.mocked(executeWithFallback).mockResolvedValue(
        toTokenAccountInfo(600000),
      )

      // Mock cache set
      jest.mocked(redisClient.setex).mockResolvedValue('OK')

      await checkPremiumAccess(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      )

      expect(mockNext).toHaveBeenCalled()
      expect(mockResponse.status).not.toHaveBeenCalled()

      // Verify premium access result was attached to request
      expect((mockRequest as any).premiumAccess).toBeDefined()
      expect((mockRequest as any).premiumAccess.hasAccess).toBe(true)
    })

    it('should return 403 when user lacks premium access', async () => {
      mockRequest.body = { walletAddress: testWallet }

      // Mock cache miss
      jest.mocked(redisClient.get).mockResolvedValue(null)

      // Mock balance below threshold
      jest.mocked(executeWithFallback).mockResolvedValue(
        toTokenAccountInfo(300000),
      )

      // Mock cache set
      jest.mocked(redisClient.setex).mockResolvedValue('OK')

      await checkPremiumAccess(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      )

      expect(mockResponse.status).toHaveBeenCalledWith(403)
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: `Premium access required. Minimum balance: ${PREMIUM_BALANCE_THRESHOLD} ALPHA tokens`,
        data: {
          currentBalance: 300000,
          requiredBalance: PREMIUM_BALANCE_THRESHOLD,
          difference: expect.any(Number),
        },
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should accept wallet address from query parameter', async () => {
      mockRequest.query = { walletAddress: testWallet }

      // Mock cache hit
      jest.mocked(redisClient.get).mockResolvedValue('600000')

      await checkPremiumAccess(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      )

      expect(mockNext).toHaveBeenCalled()
      expect(mockResponse.status).not.toHaveBeenCalled()
    })

    it('should return 503 on blockchain query failure', async () => {
      mockRequest.body = { walletAddress: testWallet }

      // Mock cache miss
      jest.mocked(redisClient.get).mockResolvedValue(null)

      // Mock blockchain error
      jest.mocked(executeWithFallback).mockRejectedValue(
        new Error('RPC connection failed'),
      )
      const setTimeoutSpy = jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((handler: (...args: any[]) => void) => {
          if (typeof handler === 'function') {
            handler()
          }
          return 0 as unknown as NodeJS.Timeout
        })

      await checkPremiumAccess(
        mockRequest as Request,
        mockResponse as Response,
        mockNext,
      )

      expect(mockResponse.status).toHaveBeenCalledWith(503)
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Unable to verify ALPHA token balance. Please try again.',
      })
      expect(mockNext).not.toHaveBeenCalled()
      setTimeoutSpy.mockRestore()
    })
  })
})
