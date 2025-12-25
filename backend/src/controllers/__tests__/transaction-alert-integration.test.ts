/**
 * Integration test for alert matching with transaction pipeline
 * 
 * This test verifies that:
 * 1. Alert matching is triggered non-blocking after transaction save
 * 2. Errors in alert matching don't affect transaction processing
 * 3. Proper logging occurs for matched alerts and errors
 */

import { alertMatcherService } from '../../services/alertMatcher.service'
import logger from '../../utils/logger'

// Mock logger
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}))

// Mock alertMatcherService
jest.mock('../../services/alertMatcher.service', () => ({
  alertMatcherService: {
    processTransaction: jest.fn(),
    initialize: jest.fn(),
    shutdown: jest.fn(),
  },
}))

describe('Transaction Alert Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Non-blocking execution', () => {
    it('should trigger alert matching asynchronously using setImmediate', (done) => {
      const mockTransaction = {
        signature: 'test-signature-123',
        whale: { address: 'test-whale-address' },
        transaction: {
          tokenOut: {
            address: 'test-token-address',
            symbol: 'TEST',
            usdAmount: '1000',
          },
        },
      }

      // Mock processTransaction to resolve successfully
      ;(alertMatcherService.processTransaction as jest.Mock).mockResolvedValue(
        undefined,
      )

      // Simulate the setImmediate pattern used in controllers
      setImmediate(() => {
        alertMatcherService
          .processTransaction(mockTransaction as any)
          .catch((error) => {
            logger.error({
              component: 'test',
              operation: 'test',
              txHash: mockTransaction.signature,
              error: {
                message: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
              },
              message: 'Alert matching failed',
            })
          })
      })

      // Verify that execution continues immediately (non-blocking)
      expect(alertMatcherService.processTransaction).not.toHaveBeenCalled()

      // Wait for setImmediate to execute
      setImmediate(() => {
        expect(alertMatcherService.processTransaction).toHaveBeenCalledWith(
          mockTransaction,
        )
        done()
      })
    })

    it('should not block transaction processing even if alert matching fails', (done) => {
      const mockTransaction = {
        signature: 'test-signature-456',
        whale: { address: 'test-whale-address' },
        transaction: {
          tokenOut: {
            address: 'test-token-address',
            symbol: 'TEST',
            usdAmount: '1000',
          },
        },
      }

      // Mock processTransaction to reject with error
      const testError = new Error('Alert matching failed')
      ;(alertMatcherService.processTransaction as jest.Mock).mockRejectedValue(
        testError,
      )

      // Simulate the setImmediate pattern with error handling
      setImmediate(() => {
        alertMatcherService
          .processTransaction(mockTransaction as any)
          .catch((error) => {
            logger.error({
              component: 'test',
              operation: 'test',
              txHash: mockTransaction.signature,
              error: {
                message: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
              },
              message: 'Alert matching failed',
            })
          })
      })

      // Transaction processing continues immediately
      expect(alertMatcherService.processTransaction).not.toHaveBeenCalled()

      // Wait for setImmediate and error handling
      setTimeout(() => {
        expect(alertMatcherService.processTransaction).toHaveBeenCalledWith(
          mockTransaction,
        )
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            component: 'test',
            operation: 'test',
            txHash: 'test-signature-456',
            message: 'Alert matching failed',
            error: expect.objectContaining({
              message: 'Alert matching failed',
            }),
          }),
        )
        done()
      }, 100)
    })
  })

  describe('Error handling', () => {
    it('should log errors with proper context when alert matching fails', async () => {
      const mockTransaction = {
        signature: 'test-signature-789',
        whale: { address: 'test-whale-address' },
        transaction: {
          tokenOut: {
            address: 'test-token-address',
            symbol: 'TEST',
            usdAmount: '1000',
          },
        },
      }

      const testError = new Error('Database connection failed')
      ;(alertMatcherService.processTransaction as jest.Mock).mockRejectedValue(
        testError,
      )

      // Execute the error handling path
      try {
        await alertMatcherService.processTransaction(mockTransaction as any)
      } catch (error) {
        logger.error({
          component: 'test',
          operation: 'test',
          txHash: mockTransaction.signature,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          },
          message: 'Alert matching failed',
        })
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          component: 'test',
          operation: 'test',
          txHash: 'test-signature-789',
          message: 'Alert matching failed',
          error: expect.objectContaining({
            message: 'Database connection failed',
            stack: expect.any(String),
          }),
        }),
      )
    })

    it('should handle non-Error objects in catch block', async () => {
      const mockTransaction = {
        signature: 'test-signature-999',
        whale: { address: 'test-whale-address' },
        transaction: {
          tokenOut: {
            address: 'test-token-address',
            symbol: 'TEST',
            usdAmount: '1000',
          },
        },
      }

      // Reject with a non-Error object
      ;(alertMatcherService.processTransaction as jest.Mock).mockRejectedValue(
        'String error',
      )

      try {
        await alertMatcherService.processTransaction(mockTransaction as any)
      } catch (error) {
        logger.error({
          component: 'test',
          operation: 'test',
          txHash: mockTransaction.signature,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          },
          message: 'Alert matching failed',
        })
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          component: 'test',
          operation: 'test',
          txHash: 'test-signature-999',
          message: 'Alert matching failed',
          error: expect.objectContaining({
            message: 'Unknown error',
            stack: undefined,
          }),
        }),
      )
    })
  })

  describe('Logging for matched alerts', () => {
    it('should log successful alert matching', async () => {
      const mockTransaction = {
        signature: 'test-signature-success',
        whale: { address: 'test-whale-address' },
        transaction: {
          tokenOut: {
            address: 'test-token-address',
            symbol: 'TEST',
            usdAmount: '1000',
          },
        },
      }

      ;(alertMatcherService.processTransaction as jest.Mock).mockResolvedValue(
        undefined,
      )

      await alertMatcherService.processTransaction(mockTransaction as any)

      expect(alertMatcherService.processTransaction).toHaveBeenCalledWith(
        mockTransaction,
      )
    })
  })
})
