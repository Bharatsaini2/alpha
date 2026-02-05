/**
 * Shyft Parser Adapter Service
 * 
 * This service provides a unified interface that wraps both v1 and v2 parsers,
 * maintaining backward compatibility while enabling enhanced v2 features.
 * 
 * Requirements: 1.1, 1.2, 1.3
 */

import logger from '../utils/logger'
import { parseShyftTransaction as parseV1 } from '../utils/shyftParser'
import { parseShyftTransactionV2 } from '../utils/shyftParserV2'
import {
  ParserAdapter,
  ShyftTransaction,
  ShyftTransactionV2,
  ParsedSwap,
  ParserPerformanceMetrics,
  V2FeatureFlags,
  ParserResult,
  TokenInfo,
  SplitSwapPair,
} from '../types/shyft-parser-v2.types'
import { getShyftParserConfigService } from './shyft-parser-config.service'
import { getCoreTokenSuppressionService } from './core-token-suppression.service'
import { getPerformanceMonitorService } from './performance-monitor.service'

export class ShyftParserAdapterService implements ParserAdapter {
  private configService = getShyftParserConfigService()
  private suppressionService = getCoreTokenSuppressionService()
  private performanceMonitor = getPerformanceMonitorService()
  private v2Features: V2FeatureFlags = {
    relayerProofIdentification: false,
    rentRefundFiltering: false,
    multiHopCollapse: false,
    enhancedAmountNormalization: false,
    tokenToTokenSplitProtocol: false,
    eraseValidation: false,
  }

  constructor() {
    // Subscribe to configuration changes
    this.configService.onConfigurationUpdate((config) => {
      this.updateFromConfiguration(config)
    })

    // Initialize from current configuration
    this.updateFromConfiguration(this.configService.getConfiguration())

    logger.info({
      version: this.configService.getParserVersion(),
      v2Features: this.v2Features,
      suppressionEnabled: this.suppressionService.isEnabled(),
    }, 'ShyftParserAdapterService initialized')
  }

  /**
   * Parse a Shyft transaction using the configured parser version
   * Requirements: 1.1, 1.2, 1.3
   */
  parseShyftTransaction(tx: ShyftTransaction): ParsedSwap | null {
    const startTime = Date.now()
    const version = this.configService.getParserVersion()
    const featureFlags = this.configService.getFeatureFlags()

    try {
      let result: ParsedSwap | null = null

      switch (version) {
        case 'v1':
          result = this.parseWithV1(tx)
          break
        case 'v2':
          result = this.parseWithV2(tx)
          break
        case 'hybrid':
          result = this.parseWithHybrid(tx)
          break
        default:
          logger.warn({ version }, 'Unknown parser version, falling back to v1')
          result = this.parseWithV1(tx)
      }

      // Apply core token suppression if enabled and result exists
      if (result && featureFlags.enableCoreTokenSuppression) {
        const inputToken: TokenInfo = {
          mint: result.input.mint,
          symbol: result.input.symbol,
          decimals: result.input.decimals,
          amount: result.input.amount,
        }
        const outputToken: TokenInfo = {
          mint: result.output.mint,
          symbol: result.output.symbol,
          decimals: result.output.decimals,
          amount: result.output.amount,
        }

        if (this.suppressionService.shouldSuppressSwap(inputToken, outputToken)) {
          logger.debug({
            transactionHash: result.transaction_hash,
            inputMint: result.input.mint,
            outputMint: result.output.mint,
          }, 'Swap suppressed due to core token suppression')
          result = null
        }
      }

      // Record performance metrics
      const processingTime = Date.now() - startTime
      if (featureFlags.enablePerformanceTracking) {
        this.performanceMonitor.recordParsingTime(
          version === 'v2' ? 'v2' : 'v1',
          processingTime,
          result !== null
        )
      }

      return result
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error({
        error,
        version,
        transactionHash: tx.signature,
        processingTime,
      }, 'Error parsing transaction')

      // Record failed parsing attempt
      if (featureFlags.enablePerformanceTracking) {
        this.performanceMonitor.recordParsingTime(
          version === 'v2' ? 'v2' : 'v1',
          processingTime,
          false
        )
      }

      return null
    }
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): ParserPerformanceMetrics {
    return this.performanceMonitor.getParserPerformanceMetrics()
  }

  /**
   * Enable specific v2 features
   */
  enableV2Features(features: V2FeatureFlags): void {
    this.v2Features = { ...this.v2Features, ...features }
    
    logger.info({
      enabledFeatures: Object.entries(features).filter(([_, enabled]) => enabled).map(([feature]) => feature),
      allFeatures: this.v2Features,
    }, 'V2 features updated')
  }

  /**
   * Parse with v1 parser only
   */
  private parseWithV1(tx: ShyftTransaction): ParsedSwap | null {
    return parseV1(tx)
  }

  /**
   * Parse with v2 parser only
   */
  private parseWithV2(tx: ShyftTransaction): ParsedSwap | null {
    // Convert v1 transaction format to v2 format
    const v2Tx: ShyftTransactionV2 = {
      signature: tx.signature || '',
      timestamp: tx.timestamp ? new Date(tx.timestamp).getTime() : Date.now(),
      status: tx.status || 'Success',
      fee: 5000, // Default fee if not provided
      fee_payer: tx.fee_payer || '',
      signers: tx.signers || [],
      protocol: undefined,
      token_balance_changes: tx.token_balance_changes || [],
      actions: tx.actions?.map(action => ({
        type: action.type,
        info: action.info as any, // Type assertion to handle compatibility
        source_protocol: undefined,
      })),
    }
    
    const v2Result = parseShyftTransactionV2(v2Tx)
    
    if (v2Result.success && v2Result.data) {
      // Handle both ParsedSwap and SplitSwapPair results
      if ('sellRecord' in v2Result.data) {
        // This is a SplitSwapPair - for backward compatibility, return the sell record
        const splitPair = v2Result.data as any // Type assertion for compatibility
        return this.convertV2ToV1Format(splitPair.sellRecord, { ...v2Result, data: splitPair.sellRecord })
      } else {
        // This is a regular ParsedSwap
        return this.convertV2ToV1Format(v2Result.data as any, v2Result as any)
      }
    }
    
    return null
  }

  /**
   * Parse with hybrid approach (v1 + v2 comparison)
   */
  private parseWithHybrid(tx: ShyftTransaction): ParsedSwap | null {
    const featureFlags = this.configService.getFeatureFlags()
    
    // Parse with both parsers
    const v1Result = this.parseWithV1(tx)
    
    // Convert to v2 format for v2 parser
    const v2Tx: ShyftTransactionV2 = {
      signature: tx.signature || '',
      timestamp: tx.timestamp ? new Date(tx.timestamp).getTime() : Date.now(),
      status: tx.status || 'Success',
      fee: 5000,
      fee_payer: tx.fee_payer || '',
      signers: tx.signers || [],
      protocol: undefined,
      token_balance_changes: tx.token_balance_changes || [],
      actions: tx.actions?.map(action => ({
        type: action.type,
        info: action.info as any, // Type assertion to handle compatibility
        source_protocol: undefined,
      })),
    }
    
    const v2Result = parseShyftTransactionV2(v2Tx)

    // Record comparison if enabled
    if (featureFlags.enableSideBySideComparison) {
      // Handle v2 result type conversion for comparison
      let v2Data: ParsedSwap | undefined = undefined
      if (v2Result.success && v2Result.data) {
        if ('sellRecord' in v2Result.data) {
          const splitPair = v2Result.data as any
          v2Data = splitPair.sellRecord as any
        } else {
          v2Data = v2Result.data as any
        }
      }
      this.performanceMonitor.recordComparison(v1Result, { ...v2Result, data: v2Data })
    }

    // Determine which result to use based on configuration
    const rolloutPercentage = this.configService.getConfiguration().migration_settings.rollout_percentage
    const useV2 = Math.random() * 100 < rolloutPercentage

    if (useV2 && v2Result.success && v2Result.data) {
      // Handle both ParsedSwap and SplitSwapPair results
      if ('sellRecord' in v2Result.data) {
        // This is a SplitSwapPair - for backward compatibility, return the sell record
        const splitPair = v2Result.data as any
        return this.convertV2ToV1Format(splitPair.sellRecord, { ...v2Result, data: splitPair.sellRecord })
      } else {
        // This is a regular ParsedSwap
        return this.convertV2ToV1Format(v2Result.data as any, v2Result as any)
      }
    }

    return v1Result
  }

  /**
   * Convert v2 parser result to v1 format for backward compatibility
   */
  private convertV2ToV1Format(v2Data: ParsedSwap, v2Result: ParserResult): ParsedSwap {
    // Check if v2Data has the v2 format (with direction, quoteAsset, baseAsset, amounts)
    if ('direction' in v2Data && 'quoteAsset' in v2Data && 'baseAsset' in v2Data && 'amounts' in v2Data) {
      // Convert v2 format to v1 format
      const v2Swap = v2Data as any // v2 format
      
      // CRITICAL FIX: Extract amounts correctly from V2 parser structure
      let inputAmount: number
      let outputAmount: number
      
      if (v2Swap.direction === 'BUY') {
        // BUY: spending quote asset (USDC/SOL) to get base asset (tokens)
        inputAmount = v2Swap.amounts.swapInputAmount || v2Swap.amounts.totalWalletCost || 0
        outputAmount = v2Swap.amounts.baseAmount || 0
      } else {
        // SELL: spending base asset (tokens) to get quote asset (USDC/SOL)
        inputAmount = v2Swap.amounts.baseAmount || 0
        outputAmount = v2Swap.amounts.swapOutputAmount || v2Swap.amounts.netWalletReceived || 0
      }
      
      const v1Result: ParsedSwap = {
        transaction_hash: v2Swap.signature,
        timestamp: v2Swap.timestamp?.toString(),
        swapper: v2Swap.swapper,
        side: v2Swap.direction,
        input: {
          mint: v2Swap.direction === 'BUY' ? v2Swap.quoteAsset.mint : v2Swap.baseAsset.mint,
          symbol: v2Swap.direction === 'BUY' ? v2Swap.quoteAsset.symbol : v2Swap.baseAsset.symbol,
          amount_raw: (inputAmount * Math.pow(10, v2Swap.direction === 'BUY' ? v2Swap.quoteAsset.decimals : v2Swap.baseAsset.decimals)).toString(),
          decimals: v2Swap.direction === 'BUY' ? v2Swap.quoteAsset.decimals : v2Swap.baseAsset.decimals,
          amount: inputAmount,
        },
        output: {
          mint: v2Swap.direction === 'BUY' ? v2Swap.baseAsset.mint : v2Swap.quoteAsset.mint,
          symbol: v2Swap.direction === 'BUY' ? v2Swap.baseAsset.symbol : v2Swap.quoteAsset.symbol,
          amount_raw: (outputAmount * Math.pow(10, v2Swap.direction === 'BUY' ? v2Swap.baseAsset.decimals : v2Swap.quoteAsset.decimals)).toString(),
          decimals: v2Swap.direction === 'BUY' ? v2Swap.baseAsset.decimals : v2Swap.quoteAsset.decimals,
          amount: outputAmount,
        },
        router_or_amm: v2Swap.protocol,
        ata_created: false, // Default value
        classification_source: 'token_balance_changes', // Default value
        confidence: v2Swap.confidence || 'MEDIUM',
      }

      // Add v2 metadata if the result supports it
      if ('v2_metadata' in v1Result) {
        (v1Result as any).v2_metadata = {
          relayer_proof_applied: this.v2Features.relayerProofIdentification,
          rent_refund_filtered: this.v2Features.rentRefundFiltering,
          multi_hop_collapsed: this.v2Features.multiHopCollapse,
          erase_validation_passed: this.v2Features.eraseValidation,
          processing_time_ms: v2Result.processingTimeMs || 0,
          parser_version: 'v2' as const,
        }
      }

      return v1Result
    } else {
      // Already in v1 format, just add metadata
      const result: ParsedSwap = {
        ...v2Data,
      }

      // Add v2 metadata if the result supports it
      if ('v2_metadata' in result) {
        (result as any).v2_metadata = {
          relayer_proof_applied: this.v2Features.relayerProofIdentification,
          rent_refund_filtered: this.v2Features.rentRefundFiltering,
          multi_hop_collapsed: this.v2Features.multiHopCollapse,
          erase_validation_passed: this.v2Features.eraseValidation,
          processing_time_ms: v2Result.processingTimeMs || 0,
          parser_version: 'v2' as const,
        }
      }

      return result
    }
  }

  /**
   * Update service configuration from config changes
   */
  private updateFromConfiguration(config: any): void {
    // Update suppression service
    this.suppressionService.updateCoreTokenList(config.core_tokens)
    this.suppressionService.setEnabled(config.feature_flags.enableCoreTokenSuppression)

    // Update performance monitoring
    this.performanceMonitor.setEnabled(config.feature_flags.enablePerformanceTracking)

    // Update v2 features based on feature flags
    this.v2Features = {
      relayerProofIdentification: config.feature_flags.useV2Parser,
      rentRefundFiltering: config.feature_flags.enableRentRefundFiltering,
      multiHopCollapse: config.feature_flags.enableMultiHopCollapse,
      enhancedAmountNormalization: config.feature_flags.useV2Parser,
      tokenToTokenSplitProtocol: config.feature_flags.useV2Parser,
      eraseValidation: config.feature_flags.useV2Parser,
    }
  }

  /**
   * Get current parser configuration summary
   */
  getConfigurationSummary(): {
    version: 'v1' | 'v2' | 'hybrid'
    coreTokensCount: number
    suppressionEnabled: boolean
    performanceTrackingEnabled: boolean
    v2Features: V2FeatureFlags
    rolloutPercentage: number
  } {
    const config = this.configService.getConfiguration()
    
    return {
      version: config.version,
      coreTokensCount: config.core_tokens.length,
      suppressionEnabled: config.feature_flags.enableCoreTokenSuppression,
      performanceTrackingEnabled: config.feature_flags.enablePerformanceTracking,
      v2Features: this.v2Features,
      rolloutPercentage: config.migration_settings.rollout_percentage,
    }
  }

  /**
   * Check if the adapter is ready for production use
   */
  isReadyForProduction(): {
    ready: boolean
    issues: string[]
    recommendations: string[]
  } {
    const issues: string[] = []
    const recommendations: string[] = []
    const config = this.configService.getConfiguration()
    const validation = this.configService.validateConfiguration()

    // Check configuration validity
    if (!validation.valid) {
      issues.push(...validation.errors)
    }

    // Check performance metrics
    const performanceReport = this.performanceMonitor.getPerformanceReport()
    if (performanceReport.degradation.degraded) {
      issues.push(`Performance degraded by ${(performanceReport.degradation.degradationPercentage * 100).toFixed(1)}%`)
      recommendations.push('Consider rollback or performance optimization')
    }

    // Check comparison stats if in hybrid mode
    if (config.version === 'hybrid' && performanceReport.comparison.totalComparisons > 100) {
      if (performanceReport.comparison.matchRate < 0.95) {
        issues.push(`Low match rate between parsers: ${(performanceReport.comparison.matchRate * 100).toFixed(1)}%`)
        recommendations.push('Investigate parser discrepancies before full rollout')
      }
    }

    // Check rollout percentage
    if (config.version === 'hybrid' && config.migration_settings.rollout_percentage > 50) {
      recommendations.push('Consider gradual rollout increase for safer migration')
    }

    return {
      ready: issues.length === 0,
      issues,
      recommendations,
    }
  }
}

// Singleton instance for global access
let parserAdapterInstance: ShyftParserAdapterService | null = null

/**
 * Get or create the global parser adapter service instance
 */
export function getShyftParserAdapterService(): ShyftParserAdapterService {
  if (!parserAdapterInstance) {
    parserAdapterInstance = new ShyftParserAdapterService()
  }
  return parserAdapterInstance
}

/**
 * Reset the global parser adapter service instance (mainly for testing)
 */
export function resetShyftParserAdapterService(): void {
  parserAdapterInstance = null
}