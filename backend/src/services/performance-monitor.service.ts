/**
 * Performance Monitoring Service
 * 
 * This service tracks parser performance metrics, comparison data, and provides
 * performance degradation detection for safe migration between parser versions.
 * 
 * Requirements: 4.1, 4.2, 4.5
 */

import logger from '../utils/logger'
import {
  PerformanceMonitor,
  PerformanceStats,
  ComparisonStats,
  ParserPerformanceMetrics,
  ParserResult,
  ParsedSwap,
} from '../types/shyft-parser-v2.types'

interface TimingRecord {
  timestamp: Date
  version: 'v1' | 'v2'
  timeMs: number
  success: boolean
}

interface ComparisonRecord {
  timestamp: Date
  v1Result: ParsedSwap | null
  v2Result: ParserResult
  match: boolean
  v1Only: boolean
  v2Only: boolean
  different: boolean
}

export class PerformanceMonitorService implements PerformanceMonitor {
  private timingRecords: TimingRecord[] = []
  private comparisonRecords: ComparisonRecord[] = []
  private maxRecords: number
  private enabled: boolean

  constructor(maxRecords: number = 10000, enabled: boolean = true) {
    this.maxRecords = maxRecords
    this.enabled = enabled

    logger.info({
      maxRecords,
      enabled,
    }, 'PerformanceMonitorService initialized')
  }

  /**
   * Record parsing time for a specific parser version
   * Requirements: 4.2
   */
  recordParsingTime(version: 'v1' | 'v2', timeMs: number, success: boolean = true): void {
    if (!this.enabled) return

    const record: TimingRecord = {
      timestamp: new Date(),
      version,
      timeMs,
      success,
    }

    this.timingRecords.push(record)

    // Maintain record limit
    if (this.timingRecords.length > this.maxRecords) {
      this.timingRecords = this.timingRecords.slice(-this.maxRecords)
    }

    // Log performance warnings if needed
    this.checkPerformanceThresholds(record)
  }

  /**
   * Record comparison between v1 and v2 parser results
   * Requirements: 4.5
   */
  recordComparison(v1Result: ParsedSwap | null, v2Result: ParserResult): void {
    if (!this.enabled) return

    const v1Success = v1Result !== null
    let v2Success = v2Result.success && v2Result.data !== undefined
    let v2Data: ParsedSwap | null = null

    // Handle different v2 result types
    if (v2Result.success && v2Result.data) {
      if ('splitReason' in v2Result.data) {
        // For SplitSwapPair, use the sellRecord for comparison
        const splitPair = v2Result.data as any
        v2Data = splitPair.sellRecord
      } else {
        // It's a regular ParsedSwap
        v2Data = v2Result.data as ParsedSwap
      }
    }

    const match = this.compareResults(v1Result, v2Data)
    const v1Only = v1Success && !v2Success
    const v2Only = !v1Success && v2Success
    const different = v1Success && v2Success && !match

    const record: ComparisonRecord = {
      timestamp: new Date(),
      v1Result,
      v2Result,
      match,
      v1Only,
      v2Only,
      different,
    }

    this.comparisonRecords.push(record)

    // Maintain record limit
    if (this.comparisonRecords.length > this.maxRecords) {
      this.comparisonRecords = this.comparisonRecords.slice(-this.maxRecords)
    }

    // Log significant discrepancies
    if (different || v1Only || v2Only) {
      logger.warn({
        v1Success,
        v2Success,
        match,
        v1Only,
        v2Only,
        different,
        v1Result: v1Result ? {
          side: v1Result.side,
          swapper: v1Result.swapper,
          confidence: v1Result.confidence,
        } : null,
        v2Result: v2Result.success && v2Data ? {
          side: v2Data.side,
          swapper: v2Data.swapper,
          confidence: v2Data.confidence,
        } : { error: v2Result.error || 'No data' },
      }, 'Parser result discrepancy detected')
    }
  }

  /**
   * Get comprehensive performance statistics
   * Requirements: 4.1, 4.2
   */
  getPerformanceStats(): PerformanceStats {
    const v1Records = this.timingRecords.filter(r => r.version === 'v1')
    const v2Records = this.timingRecords.filter(r => r.version === 'v2')

    const v1SuccessRecords = v1Records.filter(r => r.success)
    const v2SuccessRecords = v2Records.filter(r => r.success)

    return {
      v1AverageTimeMs: this.calculateAverageTime(v1SuccessRecords),
      v2AverageTimeMs: this.calculateAverageTime(v2SuccessRecords),
      v1SuccessRate: v1Records.length > 0 ? v1SuccessRecords.length / v1Records.length : 0,
      v2SuccessRate: v2Records.length > 0 ? v2SuccessRecords.length / v2Records.length : 0,
      totalTransactionsProcessed: this.timingRecords.length,
    }
  }

  /**
   * Get comparison statistics between parsers
   * Requirements: 4.5
   */
  getComparisonStats(): ComparisonStats {
    const totalComparisons = this.comparisonRecords.length
    const matchingResults = this.comparisonRecords.filter(r => r.match).length
    const v1OnlyResults = this.comparisonRecords.filter(r => r.v1Only).length
    const v2OnlyResults = this.comparisonRecords.filter(r => r.v2Only).length
    const differingResults = this.comparisonRecords.filter(r => r.different).length

    return {
      totalComparisons,
      matchingResults,
      v1OnlyResults,
      v2OnlyResults,
      differingResults,
      matchRate: totalComparisons > 0 ? matchingResults / totalComparisons : 0,
    }
  }

  /**
   * Get performance metrics for the current parser
   */
  getParserPerformanceMetrics(): ParserPerformanceMetrics {
    const recentRecords = this.getRecentRecords(1000) // Last 1000 records
    const successRecords = recentRecords.filter(r => r.success)

    return {
      averageParsingTimeMs: this.calculateAverageTime(successRecords),
      successRate: recentRecords.length > 0 ? successRecords.length / recentRecords.length : 0,
      errorRate: recentRecords.length > 0 ? (recentRecords.length - successRecords.length) / recentRecords.length : 0,
      totalTransactionsProcessed: recentRecords.length,
      lastUpdated: new Date(),
    }
  }

  /**
   * Check if performance has degraded beyond acceptable thresholds
   * Requirements: 4.1, 4.5
   */
  checkPerformanceDegradation(thresholdPercentage: number = 0.2): {
    degraded: boolean
    v1AvgMs: number
    v2AvgMs: number
    degradationPercentage: number
    recommendation: string
  } {
    const stats = this.getPerformanceStats()
    
    if (stats.v1AverageTimeMs === 0 || stats.v2AverageTimeMs === 0) {
      return {
        degraded: false,
        v1AvgMs: stats.v1AverageTimeMs,
        v2AvgMs: stats.v2AverageTimeMs,
        degradationPercentage: 0,
        recommendation: 'Insufficient data for performance comparison',
      }
    }

    const degradationPercentage = (stats.v2AverageTimeMs - stats.v1AverageTimeMs) / stats.v1AverageTimeMs
    const degraded = degradationPercentage > thresholdPercentage

    let recommendation: string
    if (degraded) {
      recommendation = `Performance degraded by ${(degradationPercentage * 100).toFixed(1)}%. Consider rollback or optimization.`
    } else if (degradationPercentage > 0) {
      recommendation = `Minor performance impact of ${(degradationPercentage * 100).toFixed(1)}%. Monitor closely.`
    } else {
      recommendation = `Performance improved by ${(Math.abs(degradationPercentage) * 100).toFixed(1)}%.`
    }

    return {
      degraded,
      v1AvgMs: stats.v1AverageTimeMs,
      v2AvgMs: stats.v2AverageTimeMs,
      degradationPercentage,
      recommendation,
    }
  }

  /**
   * Get detailed performance report
   */
  getPerformanceReport(): {
    summary: PerformanceStats
    comparison: ComparisonStats
    degradation: {
      degraded: boolean
      v1AvgMs: number
      v2AvgMs: number
      degradationPercentage: number
      recommendation: string
    }
    recentTrends: {
      v1RecentAvg: number
      v2RecentAvg: number
      trend: 'improving' | 'degrading' | 'stable'
    }
  } {
    const summary = this.getPerformanceStats()
    const comparison = this.getComparisonStats()
    const degradation = this.checkPerformanceDegradation()

    // Calculate recent trends (last 100 vs previous 100 records)
    const recentV1 = this.timingRecords.filter(r => r.version === 'v1' && r.success).slice(-100)
    const previousV1 = this.timingRecords.filter(r => r.version === 'v1' && r.success).slice(-200, -100)
    const recentV2 = this.timingRecords.filter(r => r.version === 'v2' && r.success).slice(-100)
    const previousV2 = this.timingRecords.filter(r => r.version === 'v2' && r.success).slice(-200, -100)

    const v1RecentAvg = this.calculateAverageTime(recentV1)
    const v1PreviousAvg = this.calculateAverageTime(previousV1)
    const v2RecentAvg = this.calculateAverageTime(recentV2)
    const v2PreviousAvg = this.calculateAverageTime(previousV2)

    let trend: 'improving' | 'degrading' | 'stable' = 'stable'
    if (v1RecentAvg > 0 && v1PreviousAvg > 0) {
      const v1Change = (v1RecentAvg - v1PreviousAvg) / v1PreviousAvg
      if (Math.abs(v1Change) > 0.1) { // 10% threshold
        trend = v1Change < 0 ? 'improving' : 'degrading'
      }
    }

    return {
      summary,
      comparison,
      degradation,
      recentTrends: {
        v1RecentAvg,
        v2RecentAvg,
        trend,
      },
    }
  }

  /**
   * Enable or disable performance monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    logger.info({ enabled }, 'Performance monitoring toggled')
  }

  /**
   * Clear all performance records
   */
  clearRecords(): void {
    this.timingRecords = []
    this.comparisonRecords = []
    logger.info('Performance records cleared')
  }

  /**
   * Get recent timing records
   */
  private getRecentRecords(count: number): TimingRecord[] {
    return this.timingRecords.slice(-count)
  }

  /**
   * Calculate average time from timing records
   */
  private calculateAverageTime(records: TimingRecord[]): number {
    if (records.length === 0) return 0
    const totalTime = records.reduce((sum, record) => sum + record.timeMs, 0)
    return totalTime / records.length
  }

  /**
   * Compare two parser results for equivalence
   */
  private compareResults(v1Result: ParsedSwap | null, v2Result: ParsedSwap | null): boolean {
    if (v1Result === null && v2Result === null) return true
    if (v1Result === null || v2Result === null) return false

    // Compare key fields for equivalence
    return (
      v1Result.swapper === v2Result.swapper &&
      v1Result.side === v2Result.side &&
      v1Result.input.mint === v2Result.input.mint &&
      v1Result.output.mint === v2Result.output.mint &&
      Math.abs(v1Result.input.amount - v2Result.input.amount) < 0.001 && // Allow small floating point differences
      Math.abs(v1Result.output.amount - v2Result.output.amount) < 0.001
    )
  }

  /**
   * Check performance thresholds and log warnings
   */
  private checkPerformanceThresholds(record: TimingRecord): void {
    const slowThresholdMs = 1000 // 1 second
    const verySlowThresholdMs = 5000 // 5 seconds

    if (record.timeMs > verySlowThresholdMs) {
      logger.warn({
        version: record.version,
        timeMs: record.timeMs,
        threshold: verySlowThresholdMs,
      }, 'Very slow parsing detected')
    } else if (record.timeMs > slowThresholdMs) {
      logger.info({
        version: record.version,
        timeMs: record.timeMs,
        threshold: slowThresholdMs,
      }, 'Slow parsing detected')
    }
  }
}

// Singleton instance for global access
let performanceMonitorInstance: PerformanceMonitorService | null = null

/**
 * Get or create the global performance monitor service instance
 */
export function getPerformanceMonitorService(maxRecords?: number, enabled?: boolean): PerformanceMonitorService {
  if (!performanceMonitorInstance) {
    performanceMonitorInstance = new PerformanceMonitorService(maxRecords, enabled)
  }
  return performanceMonitorInstance
}

/**
 * Reset the global performance monitor service instance (mainly for testing)
 */
export function resetPerformanceMonitorService(): void {
  performanceMonitorInstance = null
}