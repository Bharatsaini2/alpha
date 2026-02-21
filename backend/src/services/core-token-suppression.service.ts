/**
 * Core Token Suppression Service
 * 
 * This service implements the logic for filtering core-to-core token swaps
 * with configurable core token lists and comprehensive metrics tracking.
 * 
 * Requirements: 3.1, 3.3, 3.4, 3.5
 */

import logger from '../utils/logger'
import {
  CoreTokenSuppressionService,
  TokenInfo,
  SuppressionMetrics,
  DEFAULT_CORE_TOKENS,
} from '../types/shyft-parser-v2.types'

export class CoreTokenSuppressionServiceImpl implements CoreTokenSuppressionService {
  private coreTokens: Set<string>
  private metrics: SuppressionMetrics
  private enabled: boolean

  constructor(initialCoreTokens?: string[], enabled: boolean = false) {
    this.coreTokens = new Set(initialCoreTokens || DEFAULT_CORE_TOKENS)
    this.enabled = enabled
    this.metrics = {
      totalSwapsProcessed: 0,
      swapsSuppressed: 0,
      suppressionRate: 0,
      lastUpdated: new Date(),
    }

    logger.info({
      coreTokensCount: this.coreTokens.size,
      enabled: this.enabled,
      coreTokens: Array.from(this.coreTokens),
    }, 'CoreTokenSuppressionService initialized')
  }

  /**
   * Determine if a swap should be suppressed based on core token rules
   * Requirements: 3.1, 3.4, 3.5
   */
  shouldSuppressSwap(input: TokenInfo, output: TokenInfo): boolean {
    this.metrics.totalSwapsProcessed++
    this.metrics.lastUpdated = new Date()

    // If suppression is disabled, never suppress
    if (!this.enabled) {
      this.updateSuppressionRate()
      return false
    }

    const inputIsCore = this.isCoreToken(input.mint)
    const outputIsCore = this.isCoreToken(output.mint)

    // Suppress if both tokens are core tokens
    const shouldSuppress = inputIsCore && outputIsCore

    if (shouldSuppress) {
      this.metrics.swapsSuppressed++
      
      // Log suppression for monitoring (Requirement 3.3)
      logger.info({
        inputToken: {
          mint: input.mint,
          symbol: input.symbol,
          amount: input.amount,
        },
        outputToken: {
          mint: output.mint,
          symbol: output.symbol,
          amount: output.amount,
        },
        suppressionMetrics: {
          totalProcessed: this.metrics.totalSwapsProcessed,
          totalSuppressed: this.metrics.swapsSuppressed,
          suppressionRate: this.calculateSuppressionRate(),
        },
      }, 'Core-to-core swap suppressed')
    }

    this.updateSuppressionRate()
    return shouldSuppress
  }

  /**
   * Check if a token mint is considered a core token
   * Requirements: 3.1
   */
  isCoreToken(mint: string): boolean {
    return this.coreTokens.has(mint)
  }

  /**
   * Update the core token list
   * Requirements: 3.2
   */
  updateCoreTokenList(tokens: string[]): void {
    const oldTokens = Array.from(this.coreTokens)
    this.coreTokens = new Set(tokens)

    const added = tokens.filter(token => !oldTokens.includes(token))
    const removed = oldTokens.filter(token => !tokens.includes(token))

    logger.info({
      oldCount: oldTokens.length,
      newCount: tokens.length,
      added,
      removed,
      newTokens: tokens,
    }, 'Core token list updated')

    // Reset metrics when core token list changes significantly
    if (added.length > 0 || removed.length > 0) {
      this.resetMetrics()
    }
  }

  /**
   * Get current suppression statistics
   * Requirements: 3.3
   */
  getSuppressionStats(): SuppressionMetrics {
    return {
      ...this.metrics,
      suppressionRate: this.calculateSuppressionRate(),
    }
  }

  /**
   * Enable or disable core token suppression
   */
  setEnabled(enabled: boolean): void {
    const wasEnabled = this.enabled
    this.enabled = enabled

    logger.info({
      wasEnabled,
      nowEnabled: enabled,
      coreTokensCount: this.coreTokens.size,
    }, 'Core token suppression toggled')

    if (wasEnabled !== enabled) {
      this.resetMetrics()
    }
  }

  /**
   * Check if suppression is currently enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Get current core token list as array
   */
  getCoreTokenList(): string[] {
    return Array.from(this.coreTokens)
  }

  /**
   * Add a token to the core token list
   */
  addCoreToken(mint: string): void {
    if (!this.coreTokens.has(mint)) {
      this.coreTokens.add(mint)
      
      logger.info({
        mint,
        totalCoreTokens: this.coreTokens.size,
      }, 'Core token added')
    }
  }

  /**
   * Remove a token from the core token list
   */
  removeCoreToken(mint: string): void {
    if (this.coreTokens.has(mint)) {
      this.coreTokens.delete(mint)
      
      logger.info({
        mint,
        totalCoreTokens: this.coreTokens.size,
      }, 'Core token removed')
    }
  }

  /**
   * Check if a swap involves any core tokens
   */
  involvesAnyCore(input: TokenInfo, output: TokenInfo): boolean {
    return this.isCoreToken(input.mint) || this.isCoreToken(output.mint)
  }

  /**
   * Get detailed suppression analysis for a swap
   */
  analyzeSwap(input: TokenInfo, output: TokenInfo): {
    inputIsCore: boolean
    outputIsCore: boolean
    wouldSuppress: boolean
    suppressionEnabled: boolean
    reason: string
  } {
    const inputIsCore = this.isCoreToken(input.mint)
    const outputIsCore = this.isCoreToken(output.mint)
    const wouldSuppress = this.enabled && inputIsCore && outputIsCore

    let reason: string
    if (!this.enabled) {
      reason = 'Suppression disabled'
    } else if (!inputIsCore && !outputIsCore) {
      reason = 'Neither token is core'
    } else if (inputIsCore && !outputIsCore) {
      reason = 'Only input token is core'
    } else if (!inputIsCore && outputIsCore) {
      reason = 'Only output token is core'
    } else {
      reason = 'Both tokens are core - would suppress'
    }

    return {
      inputIsCore,
      outputIsCore,
      wouldSuppress,
      suppressionEnabled: this.enabled,
      reason,
    }
  }

  /**
   * Reset suppression metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalSwapsProcessed: 0,
      swapsSuppressed: 0,
      suppressionRate: 0,
      lastUpdated: new Date(),
    }

    logger.info('Suppression metrics reset')
  }

  /**
   * Calculate current suppression rate
   */
  private calculateSuppressionRate(): number {
    if (this.metrics.totalSwapsProcessed === 0) {
      return 0
    }
    return this.metrics.swapsSuppressed / this.metrics.totalSwapsProcessed
  }

  /**
   * Update the suppression rate in metrics
   */
  private updateSuppressionRate(): void {
    this.metrics.suppressionRate = this.calculateSuppressionRate()
  }

  /**
   * Get metrics summary for logging
   */
  getMetricsSummary(): {
    totalProcessed: number
    totalSuppressed: number
    suppressionRate: string
    enabled: boolean
    coreTokensCount: number
  } {
    return {
      totalProcessed: this.metrics.totalSwapsProcessed,
      totalSuppressed: this.metrics.swapsSuppressed,
      suppressionRate: `${(this.metrics.suppressionRate * 100).toFixed(2)}%`,
      enabled: this.enabled,
      coreTokensCount: this.coreTokens.size,
    }
  }
}

// Singleton instance for global access
let suppressionServiceInstance: CoreTokenSuppressionServiceImpl | null = null

/**
 * Get or create the global core token suppression service instance.
 * If the instance already exists and this call passes enabled: true, suppression is turned on
 * (avoids SOL/USDC etc. showing when another caller created the singleton with no args).
 */
export function getCoreTokenSuppressionService(
  initialCoreTokens?: string[],
  enabled?: boolean
): CoreTokenSuppressionServiceImpl {
  if (!suppressionServiceInstance) {
    suppressionServiceInstance = new CoreTokenSuppressionServiceImpl(
      initialCoreTokens,
      enabled === true
    )
  } else if (enabled === true) {
    suppressionServiceInstance.setEnabled(true)
  }
  return suppressionServiceInstance
}

/**
 * Reset the global suppression service instance (mainly for testing)
 */
export function resetCoreTokenSuppressionService(): void {
  suppressionServiceInstance = null
}