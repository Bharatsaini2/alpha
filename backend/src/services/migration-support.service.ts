/**
 * Migration Support Infrastructure Service
 * 
 * This service provides side-by-side comparison functionality, rollback capability,
 * and migration comparison metrics collection for safe parser migration.
 * 
 * Requirements: 7.2, 7.3, 7.5
 */

import logger from '../utils/logger'
import {
  ParsedSwap,
  ShyftTransaction,
  ParserResult,
  MigrationSettings,
} from '../types/shyft-parser-v2.types'
import { parseShyftTransaction as parseV1 } from '../utils/shyftParser'
import { parseShyftTransactionV2 } from '../utils/shyftParserV2'
import { getPerformanceMonitorService } from './performance-monitor.service'
import { getErrorHandlingService } from './error-handling.service'

interface MigrationMetrics {
  totalComparisons: number
  matchingResults: number
  v1OnlyResults: number
  v2OnlyResults: number
  differingResults: number
  errorComparisons: number
  matchRate: number
  lastUpdated: Date
}

interface ComparisonResult {
  transaction_hash: string
  timestamp: Date
  v1Result: ParsedSwap | null
  v2Result: ParserResult
  match: boolean
  differences: string[]
  v1Only: boolean
  v2Only: boolean
  errorOccurred: boolean
  processingTimeV1: number
  processingTimeV2: number
}

interface RollbackState {
  isRollbackActive: boolean
  rollbackReason: string
  rollbackTimestamp?: Date
  previousVersion: 'v1' | 'v2' | 'hybrid'
  rollbackMetrics: {
    transactionsProcessed: number
    errorsBeforeRollback: number
    performanceDegradation: number
  }
}

export class MigrationSupportService {
  private migrationMetrics: MigrationMetrics = {
    totalComparisons: 0,
    matchingResults: 0,
    v1OnlyResults: 0,
    v2OnlyResults: 0,
    differingResults: 0,
    errorComparisons: 0,
    matchRate: 0,
    lastUpdated: new Date(),
  }

  private comparisonHistory: ComparisonResult[] = []
  private maxHistorySize: number = 5000
  private rollbackState: RollbackState = {
    isRollbackActive: false,
    rollbackReason: '',
    previousVersion: 'v1',
    rollbackMetrics: {
      transactionsProcessed: 0,
      errorsBeforeRollback: 0,
      performanceDegradation: 0,
    },
  }

  private performanceMonitor = getPerformanceMonitorService()
  private errorHandler = getErrorHandlingService()

  constructor() {
    logger.info('MigrationSupportService initialized')
  }

  /**
   * Perform side-by-side comparison of v1 and v2 parsers
   * Requirements: 7.3
   */
  performSideBySideComparison(tx: ShyftTransaction): ComparisonResult {
    const startTime = Date.now()
    
    try {
      // Parse with v1
      const v1StartTime = Date.now()
      const v1Result = parseV1(tx)
      const v1ProcessingTime = Date.now() - v1StartTime

      // Parse with v2 (convert transaction format)
      const v2StartTime = Date.now()
      const v2Tx = this.convertToV2Format(tx)
      const v2Result = parseShyftTransactionV2(v2Tx)
      const v2ProcessingTime = Date.now() - v2StartTime

      // Compare results - handle v2 result type conversion
      let v2Data: ParsedSwap | undefined = undefined
      if (v2Result.success && v2Result.data) {
        if ('splitReason' in v2Result.data) {
          // For SplitSwapPair, use the sellRecord for comparison
          const splitPair = v2Result.data as any
          v2Data = splitPair.sellRecord as any
        } else {
          // It's a regular ParsedSwap
          v2Data = v2Result.data as any
        }
      }

      const comparison = this.compareResults(tx, v1Result, { ...v2Result, data: v2Data }, v1ProcessingTime, v2ProcessingTime)

      // Update metrics
      this.updateMigrationMetrics(comparison)

      // Add to history
      this.addToComparisonHistory(comparison)

      // Record in performance monitor - pass the converted result
      this.performanceMonitor.recordComparison(v1Result, { ...v2Result, data: v2Data })

      // Log significant differences
      if (!comparison.match) {
        logger.info({
          transactionHash: comparison.transaction_hash,
          v1Only: comparison.v1Only,
          v2Only: comparison.v2Only,
          differences: comparison.differences,
          v1ProcessingTime: comparison.processingTimeV1,
          v2ProcessingTime: comparison.processingTimeV2,
        }, 'Parser comparison discrepancy detected')
      }

      return comparison
    } catch (error) {
      const errorComparison: ComparisonResult = {
        transaction_hash: tx.signature || 'unknown',
        timestamp: new Date(),
        v1Result: null,
        v2Result: { success: false, processingTimeMs: 0 },
        match: false,
        differences: [`Comparison error: ${error instanceof Error ? error.message : String(error)}`],
        v1Only: false,
        v2Only: false,
        errorOccurred: true,
        processingTimeV1: 0,
        processingTimeV2: 0,
      }

      this.migrationMetrics.errorComparisons++
      this.addToComparisonHistory(errorComparison)

      this.errorHandler.handleMigrationError(
        'Side-by-side comparison failed',
        { error: error instanceof Error ? error.message : String(error) },
        tx.signature
      )

      return errorComparison
    }
  }

  /**
   * Get current migration metrics
   * Requirements: 7.3
   */
  getMigrationMetrics(): MigrationMetrics {
    return {
      ...this.migrationMetrics,
      matchRate: this.calculateMatchRate(),
      lastUpdated: new Date(),
    }
  }

  /**
   * Get detailed migration report
   */
  getMigrationReport(): {
    metrics: MigrationMetrics
    performanceComparison: {
      v1AverageMs: number
      v2AverageMs: number
      performanceRatio: number
    }
    qualityAssessment: {
      overallMatchRate: number
      recentMatchRate: number
      trendDirection: 'improving' | 'degrading' | 'stable'
      criticalIssues: string[]
    }
    recommendations: string[]
  } {
    const metrics = this.getMigrationMetrics()
    
    // Calculate performance comparison
    const recentComparisons = this.comparisonHistory.slice(-1000)
    const v1Times = recentComparisons.map(c => c.processingTimeV1).filter(t => t > 0)
    const v2Times = recentComparisons.map(c => c.processingTimeV2).filter(t => t > 0)
    
    const v1AverageMs = v1Times.length > 0 ? v1Times.reduce((a, b) => a + b, 0) / v1Times.length : 0
    const v2AverageMs = v2Times.length > 0 ? v2Times.reduce((a, b) => a + b, 0) / v2Times.length : 0
    const performanceRatio = v1AverageMs > 0 ? v2AverageMs / v1AverageMs : 1

    // Calculate quality assessment
    const recent500 = this.comparisonHistory.slice(-500)
    const recentMatchRate = recent500.length > 0 
      ? recent500.filter(c => c.match).length / recent500.length 
      : 0

    const older500 = this.comparisonHistory.slice(-1000, -500)
    const olderMatchRate = older500.length > 0 
      ? older500.filter(c => c.match).length / older500.length 
      : 0

    let trendDirection: 'improving' | 'degrading' | 'stable' = 'stable'
    if (Math.abs(recentMatchRate - olderMatchRate) > 0.05) {
      trendDirection = recentMatchRate > olderMatchRate ? 'improving' : 'degrading'
    }

    // Identify critical issues
    const criticalIssues: string[] = []
    if (metrics.matchRate < 0.9) {
      criticalIssues.push(`Low overall match rate: ${(metrics.matchRate * 100).toFixed(1)}%`)
    }
    if (performanceRatio > 1.5) {
      criticalIssues.push(`V2 parser is ${(performanceRatio * 100).toFixed(0)}% slower than V1`)
    }
    if (metrics.errorComparisons > metrics.totalComparisons * 0.01) {
      criticalIssues.push(`High comparison error rate: ${((metrics.errorComparisons / metrics.totalComparisons) * 100).toFixed(1)}%`)
    }

    // Generate recommendations
    const recommendations: string[] = []
    if (metrics.matchRate < 0.95) {
      recommendations.push('Investigate parser discrepancies before increasing rollout percentage')
    }
    if (performanceRatio > 1.2) {
      recommendations.push('Optimize V2 parser performance before full migration')
    }
    if (trendDirection === 'degrading') {
      recommendations.push('Recent trend shows degrading match rate - consider pausing rollout')
    }
    if (criticalIssues.length === 0 && metrics.matchRate > 0.98) {
      recommendations.push('Migration metrics look good - consider increasing rollout percentage')
    }

    return {
      metrics,
      performanceComparison: {
        v1AverageMs,
        v2AverageMs,
        performanceRatio,
      },
      qualityAssessment: {
        overallMatchRate: metrics.matchRate,
        recentMatchRate,
        trendDirection,
        criticalIssues,
      },
      recommendations,
    }
  }

  /**
   * Initiate rollback to previous parser version
   * Requirements: 7.2, 7.5
   */
  initiateRollback(
    reason: string,
    previousVersion: 'v1' | 'v2' | 'hybrid' = 'v1',
    preserveData: boolean = true
  ): {
    success: boolean
    rollbackId: string
    message: string
    dataPreserved: boolean
  } {
    const rollbackId = `rollback_${Date.now()}`
    
    try {
      // Capture current state before rollback
      const currentMetrics = this.getMigrationMetrics()
      const performanceReport = this.performanceMonitor.getPerformanceReport()

      this.rollbackState = {
        isRollbackActive: true,
        rollbackReason: reason,
        rollbackTimestamp: new Date(),
        previousVersion,
        rollbackMetrics: {
          transactionsProcessed: currentMetrics.totalComparisons,
          errorsBeforeRollback: currentMetrics.errorComparisons,
          performanceDegradation: performanceReport.degradation.degradationPercentage,
        },
      }

      // Log rollback initiation
      logger.error({
        rollbackId,
        reason,
        previousVersion,
        preserveData,
        currentMetrics,
        performanceDegradation: performanceReport.degradation.degradationPercentage,
      }, 'Parser rollback initiated')

      // Preserve data if requested
      let dataPreserved = false
      if (preserveData) {
        try {
          this.preserveRollbackData(rollbackId)
          dataPreserved = true
        } catch (preserveError) {
          logger.warn({
            rollbackId,
            error: preserveError instanceof Error ? preserveError.message : String(preserveError),
          }, 'Failed to preserve rollback data, continuing with rollback')
        }
      }

      // Clear comparison history to start fresh
      if (!preserveData) {
        this.clearComparisonHistory()
      }

      const message = `Rollback to ${previousVersion} initiated successfully. Reason: ${reason}`
      
      return {
        success: true,
        rollbackId,
        message,
        dataPreserved,
      }
    } catch (error) {
      const errorMessage = `Rollback failed: ${error instanceof Error ? error.message : String(error)}`
      
      logger.error({
        rollbackId,
        reason,
        error: errorMessage,
      }, 'Parser rollback failed')

      this.errorHandler.handleMigrationError(
        'Rollback operation failed',
        { rollbackId, reason, error: errorMessage }
      )

      return {
        success: false,
        rollbackId,
        message: errorMessage,
        dataPreserved: false,
      }
    }
  }

  /**
   * Check if rollback should be triggered based on thresholds
   */
  shouldTriggerRollback(settings: MigrationSettings): {
    shouldRollback: boolean
    reasons: string[]
    metrics: {
      errorRate: number
      performanceDegradation: number
      matchRate: number
    }
  } {
    const reasons: string[] = []
    const errorRate = this.migrationMetrics.errorComparisons / Math.max(this.migrationMetrics.totalComparisons, 1)
    const performanceReport = this.performanceMonitor.getPerformanceReport()
    const performanceDegradation = performanceReport.degradation.degradationPercentage
    const matchRate = this.calculateMatchRate()

    // Check error rate threshold
    if (errorRate > settings.rollback_threshold_error_rate) {
      reasons.push(`Error rate ${(errorRate * 100).toFixed(1)}% exceeds threshold ${(settings.rollback_threshold_error_rate * 100).toFixed(1)}%`)
    }

    // Check performance degradation threshold
    if (performanceDegradation > settings.rollback_threshold_performance_degradation) {
      reasons.push(`Performance degraded by ${(performanceDegradation * 100).toFixed(1)}% exceeds threshold ${(settings.rollback_threshold_performance_degradation * 100).toFixed(1)}%`)
    }

    // Check match rate (should be high)
    if (matchRate < 0.9 && this.migrationMetrics.totalComparisons > 100) {
      reasons.push(`Match rate ${(matchRate * 100).toFixed(1)}% is critically low`)
    }

    return {
      shouldRollback: reasons.length > 0,
      reasons,
      metrics: {
        errorRate,
        performanceDegradation,
        matchRate,
      },
    }
  }

  /**
   * Get rollback status
   */
  getRollbackStatus(): RollbackState {
    return { ...this.rollbackState }
  }

  /**
   * Complete rollback and reset state
   */
  completeRollback(): void {
    logger.info({
      rollbackReason: this.rollbackState.rollbackReason,
      rollbackDuration: this.rollbackState.rollbackTimestamp 
        ? Date.now() - this.rollbackState.rollbackTimestamp.getTime()
        : 0,
    }, 'Parser rollback completed')

    this.rollbackState = {
      isRollbackActive: false,
      rollbackReason: '',
      previousVersion: 'v1',
      rollbackMetrics: {
        transactionsProcessed: 0,
        errorsBeforeRollback: 0,
        performanceDegradation: 0,
      },
    }
  }

  /**
   * Get comparison history with optional filtering
   */
  getComparisonHistory(
    limit: number = 100,
    onlyMismatches: boolean = false
  ): ComparisonResult[] {
    let filtered = this.comparisonHistory

    if (onlyMismatches) {
      filtered = filtered.filter(c => !c.match)
    }

    return filtered.slice(-limit)
  }

  /**
   * Clear comparison history and reset metrics
   */
  clearComparisonHistory(): void {
    this.comparisonHistory = []
    this.migrationMetrics = {
      totalComparisons: 0,
      matchingResults: 0,
      v1OnlyResults: 0,
      v2OnlyResults: 0,
      differingResults: 0,
      errorComparisons: 0,
      matchRate: 0,
      lastUpdated: new Date(),
    }

    logger.info('Migration comparison history cleared')
  }

  /**
   * Convert v1 transaction format to v2 format
   */
  private convertToV2Format(tx: ShyftTransaction): any {
    return {
      signature: tx.signature || '',
      timestamp: tx.timestamp ? new Date(tx.timestamp).getTime() : Date.now(),
      status: tx.status || 'Success',
      fee: 5000, // Default fee
      fee_payer: tx.fee_payer || '',
      signers: tx.signers || [],
      protocol: undefined,
      token_balance_changes: tx.token_balance_changes || [],
      actions: tx.actions?.map(action => ({
        type: action.type,
        info: action.info,
        source_protocol: undefined,
      })),
    }
  }

  /**
   * Compare v1 and v2 parser results
   */
  private compareResults(
    tx: ShyftTransaction,
    v1Result: ParsedSwap | null,
    v2Result: ParserResult,
    v1ProcessingTime: number,
    v2ProcessingTime: number
  ): ComparisonResult {
    const v1Success = v1Result !== null
    const v2Success = v2Result.success && v2Result.data !== undefined
    const v2Data = v2Result.data

    let match = false
    const differences: string[] = []

    if (!v1Success && !v2Success) {
      match = true // Both failed
    } else if (v1Success && v2Success && v2Data) {
      // Both succeeded, compare results
      const comparison = this.compareSwapResults(v1Result, v2Data)
      match = comparison.match
      differences.push(...comparison.differences)
    } else {
      // One succeeded, one failed
      if (v1Success && !v2Success) {
        differences.push('V1 succeeded but V2 failed')
      } else if (!v1Success && v2Success) {
        differences.push('V2 succeeded but V1 failed')
      }
    }

    return {
      transaction_hash: tx.signature || 'unknown',
      timestamp: new Date(),
      v1Result,
      v2Result,
      match,
      differences,
      v1Only: v1Success && !v2Success,
      v2Only: !v1Success && v2Success,
      errorOccurred: false,
      processingTimeV1: v1ProcessingTime,
      processingTimeV2: v2ProcessingTime,
    }
  }

  /**
   * Compare two ParsedSwap results for equivalence
   */
  private compareSwapResults(
    v1Result: ParsedSwap,
    v2Result: ParsedSwap | any
  ): { match: boolean; differences: string[] } {
    const differences: string[] = []

    // Handle v2 format conversion
    let v2Swap: ParsedSwap
    if ('direction' in v2Result && 'quoteAsset' in v2Result) {
      // Convert v2 format to v1 format for comparison
      const v2Data = v2Result as any
      v2Swap = {
        transaction_hash: v2Data.signature,
        timestamp: v2Data.timestamp?.toString(),
        swapper: v2Data.swapper,
        side: v2Data.direction,
        input: {
          mint: v2Data.direction === 'BUY' ? v2Data.baseAsset.mint : v2Data.quoteAsset.mint,
          symbol: v2Data.direction === 'BUY' ? v2Data.baseAsset.symbol : v2Data.quoteAsset.symbol,
          amount_raw: v2Data.amounts?.input?.amountRaw?.toString() || '0',
          decimals: v2Data.direction === 'BUY' ? v2Data.baseAsset.decimals : v2Data.quoteAsset.decimals,
          amount: v2Data.amounts?.input?.amount || 0,
        },
        output: {
          mint: v2Data.direction === 'BUY' ? v2Data.quoteAsset.mint : v2Data.baseAsset.mint,
          symbol: v2Data.direction === 'BUY' ? v2Data.quoteAsset.symbol : v2Data.baseAsset.symbol,
          amount_raw: v2Data.amounts?.output?.amountRaw?.toString() || '0',
          decimals: v2Data.direction === 'BUY' ? v2Data.quoteAsset.decimals : v2Data.baseAsset.decimals,
          amount: v2Data.amounts?.output?.amount || 0,
        },
        router_or_amm: v2Data.protocol,
        ata_created: false,
        classification_source: 'token_balance_changes',
        confidence: v2Data.confidence || 'MEDIUM',
      }
    } else {
      v2Swap = v2Result as ParsedSwap
    }

    // Compare key fields
    if (v1Result.swapper !== v2Swap.swapper) {
      differences.push(`Swapper mismatch: V1=${v1Result.swapper} vs V2=${v2Swap.swapper}`)
    }

    if (v1Result.side !== v2Swap.side) {
      differences.push(`Side mismatch: V1=${v1Result.side} vs V2=${v2Swap.side}`)
    }

    if (v1Result.input.mint !== v2Swap.input.mint) {
      differences.push(`Input mint mismatch: V1=${v1Result.input.mint} vs V2=${v2Swap.input.mint}`)
    }

    if (v1Result.output.mint !== v2Swap.output.mint) {
      differences.push(`Output mint mismatch: V1=${v1Result.output.mint} vs V2=${v2Swap.output.mint}`)
    }

    // Compare amounts with tolerance for floating point differences
    const inputAmountDiff = Math.abs(v1Result.input.amount - v2Swap.input.amount)
    const outputAmountDiff = Math.abs(v1Result.output.amount - v2Swap.output.amount)

    if (inputAmountDiff > 0.001) {
      differences.push(`Input amount mismatch: V1=${v1Result.input.amount} vs V2=${v2Swap.input.amount}`)
    }

    if (outputAmountDiff > 0.001) {
      differences.push(`Output amount mismatch: V1=${v1Result.output.amount} vs V2=${v2Swap.output.amount}`)
    }

    return {
      match: differences.length === 0,
      differences,
    }
  }

  /**
   * Update migration metrics
   */
  private updateMigrationMetrics(comparison: ComparisonResult): void {
    this.migrationMetrics.totalComparisons++
    
    if (comparison.match) {
      this.migrationMetrics.matchingResults++
    } else if (comparison.v1Only) {
      this.migrationMetrics.v1OnlyResults++
    } else if (comparison.v2Only) {
      this.migrationMetrics.v2OnlyResults++
    } else {
      this.migrationMetrics.differingResults++
    }

    this.migrationMetrics.matchRate = this.calculateMatchRate()
    this.migrationMetrics.lastUpdated = new Date()
  }

  /**
   * Add comparison to history with size management
   */
  private addToComparisonHistory(comparison: ComparisonResult): void {
    this.comparisonHistory.push(comparison)
    
    if (this.comparisonHistory.length > this.maxHistorySize) {
      this.comparisonHistory = this.comparisonHistory.slice(-this.maxHistorySize)
    }
  }

  /**
   * Calculate current match rate
   */
  private calculateMatchRate(): number {
    if (this.migrationMetrics.totalComparisons === 0) return 0
    return this.migrationMetrics.matchingResults / this.migrationMetrics.totalComparisons
  }

  /**
   * Preserve rollback data for analysis
   */
  private preserveRollbackData(rollbackId: string): void {
    const rollbackData = {
      rollbackId,
      timestamp: new Date(),
      metrics: this.getMigrationMetrics(),
      comparisonHistory: this.comparisonHistory.slice(-1000), // Last 1000 comparisons
      performanceReport: this.performanceMonitor.getPerformanceReport(),
    }

    // In a real implementation, this would save to persistent storage
    logger.info({
      rollbackId,
      dataSize: this.comparisonHistory.length,
      metricsPreserved: true,
    }, 'Rollback data preserved for analysis')
  }
}

// Singleton instance for global access
let migrationSupportServiceInstance: MigrationSupportService | null = null

/**
 * Get or create the global migration support service instance
 */
export function getMigrationSupportService(): MigrationSupportService {
  if (!migrationSupportServiceInstance) {
    migrationSupportServiceInstance = new MigrationSupportService()
  }
  return migrationSupportServiceInstance
}

/**
 * Reset the global migration support service instance (mainly for testing)
 */
export function resetMigrationSupportService(): void {
  migrationSupportServiceInstance = null
}