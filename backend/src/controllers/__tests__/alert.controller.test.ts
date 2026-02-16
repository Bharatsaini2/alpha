import { Request, Response } from 'express'
import {
  checkPremiumAccessStatus,
  createWhaleAlert,
  getWhaleAlerts,
  deleteWhaleAlert,
} from '../alert.controller'
import { User } from '../../models/user.model'
import { UserAlert } from '../../models/userAlert.model'
import { validateSOLBalance } from '../../middlewares/premiumGate.middleware'
import { alertMatcherService } from '../../services/alertMatcher.service'
import { AlertType, Priority } from '../../types/alert.types'

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
  telegramService: {
    sendAlertConfirmation: jest.fn().mockResolvedValue(undefined),
    sendAlertDeletionConfirmation: jest.fn().mockResolvedValue(undefined),
  },
}))
jest.mock('../../utils/logger', () => ({
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}))

// Extend Request type to include userId
interface AuthenticatedRequest extends Request {
  userId?: string
}

describe('Alert Controller Unit Tests', () => {
  let mockRequest: Partial<AuthenticatedRequest>
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
      params: {},
      query: {}, // Add query property
    }

    mockResponse = {
      status: statusMock,
      json: jsonMock,
    }

    jest.clearAllMocks()
  })

  describe('Authentication Enforcement', () => {
    /**
     * Test authentication enforcement for checkPremiumAccessStatus
     * Requirements: 10.2, 11.2, 12.2
     */
    it('should return 401 when user is not authenticated - checkPremiumAccessStatus', async () => {
      // No userId in request
      delete (mockRequest as { userId?: string }).userId

      await checkPremiumAccessStatus(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(401)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'User authentication required',
      })
    })

    /**
     * Test authentication enforcement for createWhaleAlert
     * Requirements: 10.2
     */
    it('should return 401 when user is not authenticated - createWhaleAlert', async () => {
      // No userId in request
      delete (mockRequest as { userId?: string }).userId

      await createWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(401)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'User authentication required',
      })
    })

    /**
     * Test authentication enforcement for getWhaleAlerts
     * Requirements: 11.2
     */
    it('should return 401 when user is not authenticated - getWhaleAlerts', async () => {
      // No userId in request
      delete (mockRequest as { userId?: string }).userId

      await getWhaleAlerts(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(401)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'User authentication required',
      })
    })

    /**
     * Test authentication enforcement for deleteWhaleAlert
     * Requirements: 12.2
     */
    it('should return 401 when user is not authenticated - deleteWhaleAlert', async () => {
      // No userId in request
      delete (mockRequest as { userId?: string }).userId
      mockRequest.params = { alertId: 'test-alert-id' }

      await deleteWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(401)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'User authentication required',
      })
    })
  })

  describe('Premium Access Validation', () => {
    /**
     * Test premium access check endpoint
     * Requirements: 10.3
     */
    it('should return premium access status when user has sufficient balance', async () => {
      const userId = 'test-user-id'
      const walletAddress = 'test-wallet-address'
      mockRequest.userId = userId

      const mockUser = {
        _id: userId,
        walletAddress,
      }

      const mockPremiumResult = {
        hasAccess: true,
        currentBalance: 0.001,
        requiredBalance: 0.0006,
      }

      ;(User.findById as jest.Mock).mockResolvedValue(mockUser)
      ;(validateSOLBalance as jest.Mock).mockResolvedValue(mockPremiumResult)

      await checkPremiumAccessStatus(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      // Debug: Check what was called
      console.log('User.findById called:', (User.findById as jest.Mock).mock.calls.length)
      console.log('validateSOLBalance called:', (validateSOLBalance as jest.Mock).mock.calls.length)
      console.log('statusMock called:', statusMock.mock.calls.length)
      console.log('mockNext called:', mockNext.mock.calls.length)
      if (mockNext.mock.calls.length > 0) {
        console.log('mockNext called with:', mockNext.mock.calls[0])
      }

      expect(User.findById).toHaveBeenCalledWith(userId)
      expect(validateSOLBalance).toHaveBeenCalledWith(walletAddress, false)
      expect(statusMock).toHaveBeenCalledWith(200)
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          hasAccess: true,
          currentBalance: 0.001,
          requiredBalance: 0.0006,
          difference: undefined,
        },
      })
    })

    it('should return premium access status when user has insufficient balance', async () => {
      const userId = 'test-user-id'
      const walletAddress = 'test-wallet-address'
      mockRequest.userId = userId

      const mockUser = {
        _id: userId,
        walletAddress,
      }

      const mockPremiumResult = {
        hasAccess: false,
        currentBalance: 0.0003,
        requiredBalance: 0.0006,
        difference: 0.0003,
      }

      ;(User.findById as jest.Mock).mockResolvedValue(mockUser)
      ;(validateSOLBalance as jest.Mock).mockResolvedValue(mockPremiumResult)

      await checkPremiumAccessStatus(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(200)
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          hasAccess: false,
          currentBalance: 0.0003,
          requiredBalance: 0.0006,
          difference: 0.0003,
        },
      })
    })

    it('should return 400 when wallet address is not found', async () => {
      const userId = 'test-user-id'
      mockRequest.userId = userId

      const mockUser = {
        _id: userId,
        walletAddress: null,
      }

      ;(User.findById as jest.Mock).mockResolvedValue(mockUser)

      await checkPremiumAccessStatus(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(400)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Wallet address not found. Please connect your wallet.',
      })
    })

    it('should return 503 when blockchain query fails', async () => {
      const userId = 'test-user-id'
      const walletAddress = 'test-wallet-address'
      mockRequest.userId = userId

      const mockUser = {
        _id: userId,
        walletAddress,
      }

      ;(User.findById as jest.Mock).mockResolvedValue(mockUser)
      ;(validateSOLBalance as jest.Mock).mockRejectedValue(new Error('RPC connection failed'))

      await checkPremiumAccessStatus(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(503)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'RPC connection failed',
      })
    })

    /**
     * Test premium access validation in createWhaleAlert
     * Requirements: 10.3
     */
    it('should return 403 when user does not have premium access', async () => {
      const userId = 'test-user-id'
      const walletAddress = 'test-wallet-address'
      mockRequest.userId = userId

      mockRequest.body = {
        hotnessScoreThreshold: 5,
        minBuyAmountUSD: 1000,
        walletLabels: ['Sniper'],
      }

      const mockUser = {
        _id: userId,
        walletAddress,
        telegramChatId: 'test-chat-id',
      }

      const mockPremiumResult = {
        hasAccess: false,
        currentBalance: 0.0003,
        requiredBalance: 0.0006,
        difference: 0.0003,
      }

      ;(User.findById as jest.Mock).mockResolvedValue(mockUser)
      ;(validateSOLBalance as jest.Mock).mockResolvedValue(mockPremiumResult)

      await createWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(403)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Premium access required. Minimum balance: 0.0006 SOL',
        data: {
          currentBalance: 0.0003,
          requiredBalance: 0.0006,
          difference: 0.0003,
        },
      })
    })
  })

  describe('Input Validation Errors', () => {
    /**
     * Test input validation for createWhaleAlert
     * Requirements: 10.3
     */
    it('should return 400 when hotness score is missing', async () => {
      const userId = 'test-user-id'
      mockRequest.userId = userId

      mockRequest.body = {
        minBuyAmountUSD: 1000,
        walletLabels: ['Sniper'],
      }

      await createWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(400)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Hotness score threshold is required',
      })
    })

    it('should return 400 when hotness score is below 0', async () => {
      const userId = 'test-user-id'
      mockRequest.userId = userId

      mockRequest.body = {
        hotnessScoreThreshold: -1,
        minBuyAmountUSD: 1000,
        walletLabels: ['Sniper'],
      }

      await createWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(400)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Hotness score must be between 0 and 10',
      })
    })

    it('should return 400 when hotness score is above 10', async () => {
      const userId = 'test-user-id'
      mockRequest.userId = userId

      mockRequest.body = {
        hotnessScoreThreshold: 11,
        minBuyAmountUSD: 1000,
        walletLabels: ['Sniper'],
      }

      await createWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(400)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Hotness score must be between 0 and 10',
      })
    })

    it('should return 400 when minimum buy amount is missing', async () => {
      const userId = 'test-user-id'
      mockRequest.userId = userId

      mockRequest.body = {
        hotnessScoreThreshold: 5,
        walletLabels: ['Sniper'],
      }

      await createWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(400)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Minimum buy amount is required',
      })
    })

    it('should return 400 when minimum buy amount is zero', async () => {
      const userId = 'test-user-id'
      mockRequest.userId = userId

      mockRequest.body = {
        hotnessScoreThreshold: 5,
        minBuyAmountUSD: 0,
        walletLabels: ['Sniper'],
      }

      await createWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(400)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Minimum buy amount must be positive',
      })
    })

    it('should return 400 when minimum buy amount is negative', async () => {
      const userId = 'test-user-id'
      mockRequest.userId = userId

      mockRequest.body = {
        hotnessScoreThreshold: 5,
        minBuyAmountUSD: -100,
        walletLabels: ['Sniper'],
      }

      await createWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(400)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Minimum buy amount must be positive',
      })
    })

    it('should return 400 when wallet labels are missing', async () => {
      const userId = 'test-user-id'
      mockRequest.userId = userId

      mockRequest.body = {
        hotnessScoreThreshold: 5,
        minBuyAmountUSD: 1000,
      }

      await createWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(400)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Wallet labels must be an array',
      })
    })

    it('should accept empty wallet labels array (represents "all labels")', async () => {
      const userId = 'test-user-id'
      const walletAddress = 'test-wallet-address'
      const alertId = 'test-alert-id'
      mockRequest.userId = userId

      mockRequest.body = {
        hotnessScoreThreshold: 5,
        minBuyAmountUSD: 1000,
        walletLabels: [],
      }

      const mockUser = {
        _id: userId,
        walletAddress,
        telegramChatId: 'test-chat-id',
      }

      const mockPremiumResult = {
        hasAccess: true,
        currentBalance: 0.001,
        requiredBalance: 0.0006,
      }

      const mockAlert = {
        _id: alertId,
        userId,
        type: AlertType.ALPHA_STREAM,
        priority: Priority.LOW,
        enabled: true,
        config: {
          hotnessScoreThreshold: 5,
          minBuyAmountUSD: 1000,
          walletLabels: [],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      ;(User.findById as jest.Mock).mockResolvedValue(mockUser)
      ;(validateSOLBalance as jest.Mock).mockResolvedValue(mockPremiumResult)
      ;(UserAlert.find as jest.Mock).mockResolvedValue([])
      ;(UserAlert.create as jest.Mock).mockResolvedValue(mockAlert)

      await createWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(200)
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          alertId: mockAlert._id,
          type: mockAlert.type,
          config: mockAlert.config,
          createdAt: mockAlert.createdAt,
          updatedAt: mockAlert.updatedAt,
        },
      })
    })

    it('should return 400 when wallet labels contain invalid values', async () => {
      const userId = 'test-user-id'
      mockRequest.userId = userId

      mockRequest.body = {
        hotnessScoreThreshold: 5,
        minBuyAmountUSD: 1000,
        walletLabels: ['InvalidLabel', 'AnotherInvalid'],
      }

      await createWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(400)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Invalid wallet labels'),
      })
    })

    it('should return 400 when alertId is missing in delete request', async () => {
      const userId = 'test-user-id'
      mockRequest.userId = userId
      mockRequest.params = {}

      await deleteWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(400)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Alert ID is required',
      })
    })
  })

  describe('Successful CRUD Operations', () => {
    /**
     * Test successful whale alert creation
     * Requirements: 10.2, 10.3
     */
    it('should successfully create a whale alert subscription', async () => {
      const userId = 'test-user-id'
      const walletAddress = 'test-wallet-address'
      const alertId = 'test-alert-id'
      mockRequest.userId = userId

      mockRequest.body = {
        hotnessScoreThreshold: 7,
        minBuyAmountUSD: 5000,
        walletLabels: ['Sniper', 'Smart Money'],
      }

      const mockUser = {
        _id: userId,
        walletAddress,
        telegramChatId: 'test-chat-id',
      }

      const mockPremiumResult = {
        hasAccess: true,
        currentBalance: 0.001,
        requiredBalance: 0.0006,
      }

      const mockAlert = {
        _id: alertId,
        userId,
        type: AlertType.ALPHA_STREAM,
        priority: Priority.LOW,
        enabled: true,
        config: {
          hotnessScoreThreshold: 7,
          minBuyAmountUSD: 5000,
          walletLabels: ['SMART MONEY', 'SNIPER'], // Normalized and sorted
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      ;(User.findById as jest.Mock).mockResolvedValue(mockUser)
      ;(validateSOLBalance as jest.Mock).mockResolvedValue(mockPremiumResult)
      ;(UserAlert.find as jest.Mock).mockResolvedValue([])
      ;(UserAlert.create as jest.Mock).mockResolvedValue(mockAlert)

      await createWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(UserAlert.create).toHaveBeenCalledWith({
        userId,
        type: AlertType.ALPHA_STREAM,
        priority: Priority.LOW,
        enabled: true,
        config: {
          hotnessScoreThreshold: 7,
          minBuyAmountUSD: 5000,
          walletLabels: ['SMART MONEY', 'SNIPER'], // Normalized and sorted
        },
      })
      expect(alertMatcherService.invalidateUserSubscriptions).toHaveBeenCalledWith(userId)
      expect(statusMock).toHaveBeenCalledWith(200)
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          alertId: mockAlert._id,
          type: mockAlert.type,
          config: mockAlert.config,
          createdAt: mockAlert.createdAt,
          updatedAt: mockAlert.updatedAt,
        },
      })
    })

    /**
     * Test successful whale alert retrieval
     * Requirements: 11.2
     */
    it('should successfully retrieve whale alert subscriptions', async () => {
      const userId = 'test-user-id'
      mockRequest.userId = userId

      const mockAlerts = [
        {
          _id: 'alert-1',
          userId,
          type: AlertType.ALPHA_STREAM,
          priority: Priority.LOW,
          enabled: true,
          config: {
            hotnessScoreThreshold: 7,
            minBuyAmountUSD: 5000,
            walletLabels: ['SNIPER'],
          },
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
        },
        {
          _id: 'alert-2',
          userId,
          type: AlertType.ALPHA_STREAM,
          priority: Priority.LOW,
          enabled: true,
          config: {
            hotnessScoreThreshold: 5,
            minBuyAmountUSD: 1000,
            walletLabels: ['INSIDER', 'SMART MONEY'],
          },
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ]

      const mockFind = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockAlerts),
      }

      ;(UserAlert.find as jest.Mock).mockReturnValue(mockFind)

      await getWhaleAlerts(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(UserAlert.find).toHaveBeenCalledWith({
        userId,
        type: AlertType.ALPHA_STREAM,
      })
      expect(mockFind.sort).toHaveBeenCalledWith({ createdAt: -1 })
      expect(statusMock).toHaveBeenCalledWith(200)
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          alerts: mockAlerts.map((alert) => ({
            _id: alert._id,
            type: alert.type,
            priority: alert.priority,
            enabled: alert.enabled,
            config: alert.config,
            createdAt: alert.createdAt,
            updatedAt: alert.updatedAt,
          })),
        },
      })
    })

    it('should return empty array when user has no whale alerts', async () => {
      const userId = 'test-user-id'
      mockRequest.userId = userId

      const mockFind = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      }

      ;(UserAlert.find as jest.Mock).mockReturnValue(mockFind)

      await getWhaleAlerts(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(200)
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          alerts: [],
        },
      })
    })

    /**
     * Test successful whale alert deletion
     * Requirements: 12.2
     */
    it('should successfully delete a whale alert subscription', async () => {
      const userId = 'test-user-id'
      const alertId = 'test-alert-id'
      mockRequest.userId = userId
      mockRequest.params = { alertId }

      const mockAlert = {
        _id: alertId,
        userId,
        type: AlertType.ALPHA_STREAM,
        enabled: true,
      }

      ;(UserAlert.findOneAndDelete as jest.Mock).mockResolvedValue(mockAlert)

      await deleteWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(UserAlert.findOneAndDelete).toHaveBeenCalledWith({
        _id: alertId,
        userId,
        type: AlertType.ALPHA_STREAM,
      })
      expect(alertMatcherService.invalidateUserSubscriptions).toHaveBeenCalledWith(userId)
      expect(statusMock).toHaveBeenCalledWith(200)
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        message: 'Whale alert subscription deleted successfully',
      })
    })

    it('should return 404 when deleting non-existent alert', async () => {
      const userId = 'test-user-id'
      const alertId = 'non-existent-alert-id'
      mockRequest.userId = userId
      mockRequest.params = { alertId }

      ;(UserAlert.findOneAndDelete as jest.Mock).mockResolvedValue(null)

      await deleteWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(404)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Whale alert subscription not found',
      })
    })

    it('should return 404 when deleting alert belonging to another user', async () => {
      const userId = 'test-user-id'
      const alertId = 'other-user-alert-id'
      mockRequest.userId = userId
      mockRequest.params = { alertId }

      // findOneAndDelete returns null when userId doesn't match
      ;(UserAlert.findOneAndDelete as jest.Mock).mockResolvedValue(null)

      await deleteWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(404)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Whale alert subscription not found',
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors in createWhaleAlert', async () => {
      const userId = 'test-user-id'
      const walletAddress = 'test-wallet-address'
      mockRequest.userId = userId

      mockRequest.body = {
        hotnessScoreThreshold: 7,
        minBuyAmountUSD: 5000,
        walletLabels: ['Sniper'],
      }

      const mockUser = {
        _id: userId,
        walletAddress,
        telegramChatId: 'test-chat-id',
      }

      const mockPremiumResult = {
        hasAccess: true,
        currentBalance: 0.001,
        requiredBalance: 0.0006,
      }

      ;(User.findById as jest.Mock).mockResolvedValue(mockUser)
      ;(validateSOLBalance as jest.Mock).mockResolvedValue(mockPremiumResult)
      ;(UserAlert.find as jest.Mock).mockResolvedValue([])
      ;(UserAlert.create as jest.Mock).mockRejectedValue(new Error('Database error'))

      await createWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(500)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to create whale alert subscription',
      })
    })

    it('should handle database errors in getWhaleAlerts', async () => {
      const userId = 'test-user-id'
      mockRequest.userId = userId

      const mockFind = {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValue(new Error('Database error')),
      }

      ;(UserAlert.find as jest.Mock).mockReturnValue(mockFind)

      await getWhaleAlerts(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(500)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to retrieve whale alert subscriptions',
      })
    })

    it('should handle database errors in deleteWhaleAlert', async () => {
      const userId = 'test-user-id'
      const alertId = 'test-alert-id'
      mockRequest.userId = userId
      mockRequest.params = { alertId }

      ;(UserAlert.findOneAndDelete as jest.Mock).mockRejectedValue(new Error('Database error'))

      await deleteWhaleAlert(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(500)
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to delete whale alert subscription',
      })
    })
  })
})
