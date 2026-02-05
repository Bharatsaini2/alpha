/**
 * Comprehensive Error Handling Service
 * 
 * This service provides structured error handling, logging, and recovery mechanisms
 * for the Shyft Parser v2 integration with detailed error context and metrics.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import logger from '../utils/logger'
import { ParserError } from '../types/shyft-parser-v2.types'

interface ErrorMetrics {
  totalErrors: number
  errorsByType: Record<string, number>
  errorsByCode: Record<string, number>
  errorRate: number
  lastError?: ParserError
  lastUpdated: Date
}

interface ErrorRecoveryStrategy {
  type: 'retry' | 'fallback' | 'skip' | 'escalate'
  maxAttempts?: number
  fallbackAction?: () => any
  escalationThreshold?: number
}

export class ErrorHandlingService {
  private errorMetrics: ErrorMetrics = {
    totalErrors: 0,
    errorsByType: {},
    errorsByCode: {},
    errorRate: 0,
    lastUpdated: new Date(),
  }
  
  private errorHistory: ParserError[] = []
  private maxHistorySize: number = 1000
  private totalOperations: number = 0
  private recoveryStrategies: Map<string, ErrorRecoveryStrategy> = new Map()

  constructor() {
    this.initializeRecoveryStrategies()
    
    logger.info('ErrorHandlingService initialized')
  }

  /**
   * Handle and log an error with structured information
   * Requirements: 5.1, 5.2
   */
  handleError(
    type: ParserError['type'],
    code: string,
    message: string,
    context: Record<string, any> = {},
    transactionHash?: string
  ): ParserError {
    const error: ParserError = {
      type,
      code,
      message,
      context,
      timestamp: new Date(),
      transaction_hash: transactionHash,
      recovery_suggestion: this.getRecoverySuggestion(type, code),
    }

    // Update metrics
    this.updateErrorMetrics(error)

    // Add to history
    this.addToHistory(error)

    // Log with appropriate level based on error type
    this.logError(error)

    // Attempt recovery if strategy exists
    this.attemptRecovery(error)

    return error
  }

  /**
   * Handle parsing errors specifically
   * Requirements: 5.1, 5.4
   */
  handleParsingError(
    message: string,
    context: Record<string, any> = {},
    transactionHash?: string
  ): ParserError {
    return this.handleError(
      'parser',
      'PARSING_FAILED',
      message,
      context,
      transactionHash
    )
  }

  /**
   * Handle configuration errors
   * Requirements: 5.1, 5.4
   */
  handleConfigurationError(
    message: string,
    context: Record<string, any> = {}
  ): ParserError {
    return this.handleError(
      'configuration',
      'CONFIG_ERROR',
      message,
      context
    )
  }

  /**
   * Handle performance errors
   * Requirements: 5.1, 5.4
   */
  handlePerformanceError(
    message: string,
    context: Record<string, any> = {},
    transactionHash?: string
  ): ParserError {
    return this.handleError(
      'performance',
      'PERFORMANCE_DEGRADED',
      message,
      context,
      transactionHash
    )
  }

  /**
   * Handle validation errors
   * Requirements: 5.1, 5.4
   */
  handleValidationError(
    message: string,
    context: Record<string, any> = {},
    transactionHash?: string
  ): ParserError {
    return this.handleError(
      'validation',
      'VALIDATION_FAILED',
      message,
      context,
      transactionHash
    )
  }

  /**
   * Handle migration errors
   * Requirements: 5.1, 5.4
   */
  handleMigrationError(
    message: string,
    context: Record<string, any> = {},
    transactionHash?: string
  ): ParserError {
    return this.handleError(
      'migration',
      'MIGRATION_FAILED',
      message,
      context,
      transactionHash
    )
  }

  /**
   * Gracefully handle unexpected conditions
   * Requirements: 5.5
   */
  handleUnexpectedCondition(
    condition: string,
    context: Record<string, any> = {},
    transactionHash?: string
  ): { handled: boolean; error?: ParserError; fallbackValue?: any } {
    try {
      const error = this.handleError(
        'parser',
        'UNEXPECTED_CONDITION',
        `Unexpected condition encountered: ${condition}`,
        { condition, ...context },
        transactionHash
      )

      // Attempt graceful recovery
      const recovery = this.getRecoveryStrategy('UNEXPECTED_CONDITION')
      if (recovery) {
        switch (recovery.type) {
          case 'fallback':
            return {
              handled: true,
              error,
              fallbackValue: recovery.fallbackAction ? recovery.fallbackAction() : null,
            }
          case 'skip':
            return {
              handled: true,
              error,
              fallbackValue: null,
            }
          default:
            return { handled: false, error }
        }
      }

      return { handled: false, error }
    } catch (handlingError) {
      // If error handling itself fails, log and return minimal response
      logger.error({
        originalCondition: condition,
        handlingError: handlingError instanceof Error ? handlingError.message : String(handlingError),
      }, 'Error handling failed for unexpected condition')
      
      return { handled: false }
    }
  }

  /**
   * Get current error metrics
   * Requirements: 5.3
   */
  getErrorMetrics(): ErrorMetrics {
    return {
      ...this.errorMetrics,
      errorRate: this.calculateErrorRate(),
    }
  }

  /**
   * Get error history with optional filtering
   */
  getErrorHistory(
    type?: ParserError['type'],
    code?: string,
    limit: number = 100
  ): ParserError[] {
    let filtered = this.errorHistory

    if (type) {
      filtered = filtered.filter(error => error.type === type)
    }

    if (code) {
      filtered = filtered.filter(error => error.code === code)
    }

    return filtered.slice(-limit)
  }

  /**
   * Check if error rate exceeds threshold
   * Requirements: 5.3
   */
  isErrorRateExceeded(threshold: number = 0.05): boolean {
    return this.calculateErrorRate() > threshold
  }

  /**
   * Get error summary for monitoring
   */
  getErrorSummary(): {
    totalErrors: number
    errorRate: string
    topErrorTypes: Array<{ type: string; count: number }>
    topErrorCodes: Array<{ code: string; count: number }>
    recentErrors: number
    criticalErrors: number
  } {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    const recentErrors = this.errorHistory.filter(
      error => error.timestamp > oneHourAgo
    ).length

    const criticalErrors = this.errorHistory.filter(
      error => error.type === 'migration' || error.type === 'performance'
    ).length

    const topErrorTypes = Object.entries(this.errorMetrics.errorsByType)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }))

    const topErrorCodes = Object.entries(this.errorMetrics.errorsByCode)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([code, count]) => ({ code, count }))

    return {
      totalErrors: this.errorMetrics.totalErrors,
      errorRate: `${(this.calculateErrorRate() * 100).toFixed(2)}%`,
      topErrorTypes,
      topErrorCodes,
      recentErrors,
      criticalErrors,
    }
  }

  /**
   * Register a custom recovery strategy
   */
  registerRecoveryStrategy(code: string, strategy: ErrorRecoveryStrategy): void {
    this.recoveryStrategies.set(code, strategy)
    
    logger.info({
      code,
      strategyType: strategy.type,
      maxAttempts: strategy.maxAttempts,
    }, 'Recovery strategy registered')
  }

  /**
   * Clear error history and reset metrics
   */
  clearErrorHistory(): void {
    this.errorHistory = []
    this.errorMetrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsByCode: {},
      errorRate: 0,
      lastUpdated: new Date(),
    }
    this.totalOperations = 0

    logger.info('Error history and metrics cleared')
  }

  /**
   * Record a successful operation (for error rate calculation)
   */
  recordSuccessfulOperation(): void {
    this.totalOperations++
  }

  /**
   * Initialize default recovery strategies
   */
  private initializeRecoveryStrategies(): void {
    // Parser errors - retry with fallback to v1
    this.registerRecoveryStrategy('PARSING_FAILED', {
      type: 'fallback',
      maxAttempts: 2,
      fallbackAction: () => null, // Return null to indicate parsing failure
    })

    // Configuration errors - use defaults
    this.registerRecoveryStrategy('CONFIG_ERROR', {
      type: 'fallback',
      fallbackAction: () => 'default_config',
    })

    // Performance errors - escalate if frequent
    this.registerRecoveryStrategy('PERFORMANCE_DEGRADED', {
      type: 'escalate',
      escalationThreshold: 10,
    })

    // Validation errors - skip invalid data
    this.registerRecoveryStrategy('VALIDATION_FAILED', {
      type: 'skip',
    })

    // Migration errors - rollback
    this.registerRecoveryStrategy('MIGRATION_FAILED', {
      type: 'escalate',
      escalationThreshold: 1,
    })

    // Unexpected conditions - fallback gracefully
    this.registerRecoveryStrategy('UNEXPECTED_CONDITION', {
      type: 'fallback',
      fallbackAction: () => null,
    })
  }

  /**
   * Update error metrics
   */
  private updateErrorMetrics(error: ParserError): void {
    this.errorMetrics.totalErrors++
    this.errorMetrics.errorsByType[error.type] = (this.errorMetrics.errorsByType[error.type] || 0) + 1
    this.errorMetrics.errorsByCode[error.code] = (this.errorMetrics.errorsByCode[error.code] || 0) + 1
    this.errorMetrics.lastError = error
    this.errorMetrics.lastUpdated = new Date()
    this.errorMetrics.errorRate = this.calculateErrorRate()
  }

  /**
   * Add error to history with size management
   */
  private addToHistory(error: ParserError): void {
    this.errorHistory.push(error)
    
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize)
    }
  }

  /**
   * Log error with appropriate level and context
   */
  private logError(error: ParserError): void {
    const logContext = {
      type: error.type,
      code: error.code,
      transactionHash: error.transaction_hash,
      context: error.context,
      recoverySuggestion: error.recovery_suggestion,
    }

    switch (error.type) {
      case 'migration':
      case 'performance':
        logger.error(logContext, error.message)
        break
      case 'configuration':
        logger.warn(logContext, error.message)
        break
      case 'validation':
      case 'parser':
        logger.info(logContext, error.message)
        break
      default:
        logger.debug(logContext, error.message)
    }
  }

  /**
   * Attempt error recovery based on registered strategies
   */
  private attemptRecovery(error: ParserError): void {
    const strategy = this.getRecoveryStrategy(error.code)
    if (!strategy) return

    try {
      switch (strategy.type) {
        case 'escalate':
          if (strategy.escalationThreshold && 
              (this.errorMetrics.errorsByCode[error.code] || 0) >= strategy.escalationThreshold) {
            logger.error({
              code: error.code,
              count: this.errorMetrics.errorsByCode[error.code],
              threshold: strategy.escalationThreshold,
            }, 'Error escalation threshold reached')
          }
          break
        case 'fallback':
          if (strategy.fallbackAction) {
            logger.debug({ code: error.code }, 'Executing fallback recovery action')
            strategy.fallbackAction()
          }
          break
        case 'skip':
          logger.debug({ code: error.code }, 'Skipping error with recovery strategy')
          break
        case 'retry':
          logger.debug({ 
            code: error.code, 
            maxAttempts: strategy.maxAttempts 
          }, 'Retry recovery strategy available')
          break
      }
    } catch (recoveryError) {
      logger.error({
        originalError: error.code,
        recoveryError: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
      }, 'Error recovery attempt failed')
    }
  }

  /**
   * Get recovery suggestion based on error type and code
   */
  private getRecoverySuggestion(type: ParserError['type'], code: string): string {
    const suggestions: Record<string, Record<string, string>> = {
      parser: {
        PARSING_FAILED: 'Check transaction format and retry with v1 parser',
        UNEXPECTED_CONDITION: 'Review transaction data and update parser logic if needed',
      },
      configuration: {
        CONFIG_ERROR: 'Validate configuration format and restore from backup if needed',
      },
      performance: {
        PERFORMANCE_DEGRADED: 'Monitor system resources and consider rollback if degradation persists',
      },
      validation: {
        VALIDATION_FAILED: 'Review input data format and validation rules',
      },
      migration: {
        MIGRATION_FAILED: 'Initiate rollback to previous parser version immediately',
      },
    }

    return suggestions[type]?.[code] || 'Review error context and consult documentation'
  }

  /**
   * Get recovery strategy for error code
   */
  private getRecoveryStrategy(code: string): ErrorRecoveryStrategy | undefined {
    return this.recoveryStrategies.get(code)
  }

  /**
   * Calculate current error rate
   */
  private calculateErrorRate(): number {
    if (this.totalOperations === 0) return 0
    return this.errorMetrics.totalErrors / (this.totalOperations + this.errorMetrics.totalErrors)
  }
}

// Singleton instance for global access
let errorHandlingServiceInstance: ErrorHandlingService | null = null

/**
 * Get or create the global error handling service instance
 */
export function getErrorHandlingService(): ErrorHandlingService {
  if (!errorHandlingServiceInstance) {
    errorHandlingServiceInstance = new ErrorHandlingService()
  }
  return errorHandlingServiceInstance
}

/**
 * Reset the global error handling service instance (mainly for testing)
 */
export function resetErrorHandlingService(): void {
  errorHandlingServiceInstance = null
}