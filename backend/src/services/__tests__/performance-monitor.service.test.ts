/**
 * Tests for Performance Monitor Service
 */

import { PerformanceMonitorService, resetPerformanceMonitorService } from '../performance-monitor.service'
import { ParsedSwap, ParserResult } from '../../types/shyft-parser-v2.types'

describe('PerformanceMonitorService', () => {
  let performanceMonitor: PerformanceMonitorService

  beforeEach(() => {
    resetPerformanceMonitorService()
    performanceMonitor = new PerformanceMonitorService(1000, true)
  })

  afterEach(() => {
    resetPerformanceMonitorService()
  })

  describe('Timing Records', () => {
    it('should record parsing times correctly', () => {
      performanceMonitor.recordParsingTime('v1', 100, true)
      performanceMonitor.recordParsingTime('v2', 150, true)
      performanceMonitor.recordParsingTime('v1', 120, true)

      const stats = performanceMonitor.getPerformanceStats()
      expect(stats.v1AverageTimeMs).toBe(110) // (100 + 120) / 2
      expect(stats.v2AverageTimeMs).toBe(150)
      expect(stats.totalTransactionsProcessed).toBe(3)
    })

    it('should calculate success rates correctly', () => {
      performanceMonitor.recordParsingTime('v1', 100, true)
      performanceMonitor.recordParsingTime('v1', 120, false) // Failed
      performanceMonitor.recordParsingTime('v2', 150, true)
      performanceMonitor.recordParsingTime('v2', 180, true)

      const stats = performanceMonitor.getPerformanceStats()
      expect(stats.v1SuccessRate).toBe(0.5) // 1 success out of 2
      expect(stats.v2SuccessRate).toBe(1.0) // 2 successes out of 2
    })

    it('should handle empty records gracefully', () => {
      const stats = performanceMonitor.getPerformanceStats()
      expect(stats.v1AverageTimeMs).toBe(0)
      expect(stats.v2AverageTimeMs).toBe(0)
      expect(stats.v1SuccessRate).toBe(0)
      expect(stats.v2SuccessRate).toBe(0)
      expect(stats.totalTransactionsProcessed).toBe(0)
    })
  })

  describe('Comparison Records', () => {
    const mockParsedSwap: ParsedSwap = {
      swapper: 'test-swapper',
      side: 'BUY',
      input: {
        mint: 'input-mint',
        amount_raw: '1000000',
        decimals: 6,
        amount: 1.0,
      },
      output: {
        mint: 'output-mint',
        amount_raw: '2000000',
        decimals: 6,
        amount: 2.0,
      },
      ata_created: false,
      classification_source: 'tokens_swapped',
      confidence: 'HIGH',
    }

    const mockV2Result: ParserResult = {
      success: true,
      data: mockParsedSwap,
      metadata: {
        processingTimeMs: 150,
        version: 'v2',
        featuresApplied: ['relayer-proof'],
      },
    }

    it('should record matching results correctly', () => {
      performanceMonitor.recordComparison(mockParsedSwap, mockV2Result)

      const stats = performanceMonitor.getComparisonStats()
      expect(stats.totalComparisons).toBe(1)
      expect(stats.matchingResults).toBe(1)
      expect(stats.v1OnlyResults).toBe(0)
      expect(stats.v2OnlyResults).toBe(0)
      expect(stats.differingResults).toBe(0)
      expect(stats.matchRate).toBe(1.0)
    })

    it('should record v1-only results', () => {
      const failedV2Result: ParserResult = {
        success: false,
        error: 'Parsing failed',
      }

      performanceMonitor.recordComparison(mockParsedSwap, failedV2Result)

      const stats = performanceMonitor.getComparisonStats()
      expect(stats.totalComparisons).toBe(1)
      expect(stats.matchingResults).toBe(0)
      expect(stats.v1OnlyResults).toBe(1)
      expect(stats.v2OnlyResults).toBe(0)
      expect(stats.differingResults).toBe(0)
      expect(stats.matchRate).toBe(0)
    })

    it('should record v2-only results', () => {
      performanceMonitor.recordComparison(null, mockV2Result)

      const stats = performanceMonitor.getComparisonStats()
      expect(stats.totalComparisons).toBe(1)
      expect(stats.matchingResults).toBe(0)
      expect(stats.v1OnlyResults).toBe(0)
      expect(stats.v2OnlyResults).toBe(1)
      expect(stats.differingResults).toBe(0)
      expect(stats.matchRate).toBe(0)
    })

    it('should record differing results', () => {
      const differentSwap: ParsedSwap = {
        ...mockParsedSwap,
        swapper: 'different-swapper', // Different swapper
      }

      const differentV2Result: ParserResult = {
        success: true,
        data: differentSwap,
      }

      performanceMonitor.recordComparison(mockParsedSwap, differentV2Result)

      const stats = performanceMonitor.getComparisonStats()
      expect(stats.totalComparisons).toBe(1)
      expect(stats.matchingResults).toBe(0)
      expect(stats.v1OnlyResults).toBe(0)
      expect(stats.v2OnlyResults).toBe(0)
      expect(stats.differingResults).toBe(1)
      expect(stats.matchRate).toBe(0)
    })
  })

  describe('Performance Degradation Detection', () => {
    it('should detect performance degradation', () => {
      // Record v1 times (faster)
      performanceMonitor.recordParsingTime('v1', 100, true)
      performanceMonitor.recordParsingTime('v1', 120, true)

      // Record v2 times (slower)
      performanceMonitor.recordParsingTime('v2', 200, true)
      performanceMonitor.recordParsingTime('v2', 240, true)

      const degradation = performanceMonitor.checkPerformanceDegradation(0.2) // 20% threshold
      expect(degradation.degraded).toBe(true)
      expect(degradation.v1AvgMs).toBe(110)
      expect(degradation.v2AvgMs).toBe(220)
      expect(degradation.degradationPercentage).toBeCloseTo(1.0) // 100% degradation
    })

    it('should not detect degradation within threshold', () => {
      // Record similar times
      performanceMonitor.recordParsingTime('v1', 100, true)
      performanceMonitor.recordParsingTime('v2', 110, true)

      const degradation = performanceMonitor.checkPerformanceDegradation(0.2) // 20% threshold
      expect(degradation.degraded).toBe(false)
      expect(degradation.degradationPercentage).toBe(0.1) // 10% degradation
    })

    it('should handle insufficient data', () => {
      const degradation = performanceMonitor.checkPerformanceDegradation()
      expect(degradation.degraded).toBe(false)
      expect(degradation.recommendation).toContain('Insufficient data')
    })
  })

  describe('Performance Report', () => {
    it('should generate comprehensive performance report', () => {
      // Add some test data
      performanceMonitor.recordParsingTime('v1', 100, true)
      performanceMonitor.recordParsingTime('v2', 150, true)
      performanceMonitor.recordComparison(mockParsedSwap, mockV2Result)

      const report = performanceMonitor.getPerformanceReport()
      
      expect(report.summary).toBeDefined()
      expect(report.comparison).toBeDefined()
      expect(report.degradation).toBeDefined()
      expect(report.recentTrends).toBeDefined()
      
      expect(report.summary.totalTransactionsProcessed).toBe(2)
      expect(report.comparison.totalComparisons).toBe(1)
    })
  })

  describe('Service Management', () => {
    it('should enable and disable monitoring', () => {
      performanceMonitor.setEnabled(false)
      performanceMonitor.recordParsingTime('v1', 100, true)

      const stats = performanceMonitor.getPerformanceStats()
      expect(stats.totalTransactionsProcessed).toBe(0) // Should not record when disabled
    })

    it('should clear all records', () => {
      performanceMonitor.recordParsingTime('v1', 100, true)
      performanceMonitor.recordComparison(mockParsedSwap, mockV2Result)

      performanceMonitor.clearRecords()

      const stats = performanceMonitor.getPerformanceStats()
      const compStats = performanceMonitor.getComparisonStats()
      
      expect(stats.totalTransactionsProcessed).toBe(0)
      expect(compStats.totalComparisons).toBe(0)
    })
  })

  const mockParsedSwap: ParsedSwap = {
    swapper: 'test-swapper',
    side: 'BUY',
    input: {
      mint: 'input-mint',
      amount_raw: '1000000',
      decimals: 6,
      amount: 1.0,
    },
    output: {
      mint: 'output-mint',
      amount_raw: '2000000',
      decimals: 6,
      amount: 2.0,
    },
    ata_created: false,
    classification_source: 'tokens_swapped',
    confidence: 'HIGH',
  }

  const mockV2Result: ParserResult = {
    success: true,
    data: mockParsedSwap,
    metadata: {
      processingTimeMs: 150,
      version: 'v2',
      featuresApplied: ['relayer-proof'],
    },
  }
})