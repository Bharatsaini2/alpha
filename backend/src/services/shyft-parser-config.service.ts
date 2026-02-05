/**
 * Shyft Parser Configuration Management Service
 * 
 * This service manages parser configuration, feature flags, and core token lists
 * with support for runtime updates and environment-specific configurations.
 * 
 * Requirements: 3.2, 8.1, 8.2, 8.5
 */

import logger from '../utils/logger'
import {
  ConfigurationManager,
  ParserConfiguration,
  ParserFeatureFlags,
  DEFAULT_PARSER_CONFIGURATION,
  DEFAULT_CORE_TOKENS,
} from '../types/shyft-parser-v2.types'

export class ShyftParserConfigService implements ConfigurationManager {
  private config: ParserConfiguration
  private configUpdateCallbacks: Array<(config: ParserConfiguration) => void> = []

  constructor(initialConfig?: Partial<ParserConfiguration>) {
    // Load environment-specific configuration
    this.config = this.loadEnvironmentConfig(initialConfig)
    
    logger.info({
      version: this.config.version,
      coreTokensCount: this.config.core_tokens.length,
      featureFlags: this.config.feature_flags,
    }, 'ShyftParserConfigService initialized')
  }

  /**
   * Load environment-specific configuration
   * Requirements: 8.5
   */
  private loadEnvironmentConfig(override?: Partial<ParserConfiguration>): ParserConfiguration {
    const envConfig: Partial<ParserConfiguration> = {
      version: (process.env.SHYFT_PARSER_VERSION as 'v1' | 'v2' | 'hybrid') || 'v1',
      performance_tracking: process.env.SHYFT_PARSER_PERFORMANCE_TRACKING === 'true',
      logging_level: (process.env.SHYFT_PARSER_LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug') || 'info',
      feature_flags: {
        useV2Parser: process.env.SHYFT_PARSER_USE_V2 === 'true',
        enableCoreTokenSuppression: process.env.SHYFT_PARSER_CORE_TOKEN_SUPPRESSION === 'true',
        enablePerformanceTracking: process.env.SHYFT_PARSER_PERFORMANCE_TRACKING !== 'false',
        enableSideBySideComparison: process.env.SHYFT_PARSER_SIDE_BY_SIDE === 'true',
        enableRentRefundFiltering: process.env.SHYFT_PARSER_RENT_REFUND_FILTERING === 'true',
        enableMultiHopCollapse: process.env.SHYFT_PARSER_MULTI_HOP_COLLAPSE === 'true',
      },
      migration_settings: {
        rollout_percentage: parseInt(process.env.SHYFT_PARSER_ROLLOUT_PERCENTAGE || '0', 10),
        comparison_mode: process.env.SHYFT_PARSER_COMPARISON_MODE === 'true',
        rollback_threshold_error_rate: parseFloat(process.env.SHYFT_PARSER_ROLLBACK_ERROR_THRESHOLD || '0.05'),
        rollback_threshold_performance_degradation: parseFloat(process.env.SHYFT_PARSER_ROLLBACK_PERF_THRESHOLD || '0.2'),
      },
    }

    // Load core tokens from environment if provided
    if (process.env.SHYFT_PARSER_CORE_TOKENS) {
      try {
        envConfig.core_tokens = JSON.parse(process.env.SHYFT_PARSER_CORE_TOKENS)
      } catch (error) {
        logger.warn({ error }, 'Failed to parse SHYFT_PARSER_CORE_TOKENS from environment, using defaults')
      }
    }

    // Merge configurations: defaults < environment < override
    return {
      ...DEFAULT_PARSER_CONFIGURATION,
      ...envConfig,
      ...override,
      feature_flags: {
        ...DEFAULT_PARSER_CONFIGURATION.feature_flags,
        ...envConfig.feature_flags,
        ...override?.feature_flags,
      },
      migration_settings: {
        ...DEFAULT_PARSER_CONFIGURATION.migration_settings,
        ...envConfig.migration_settings,
        ...override?.migration_settings,
      },
    }
  }

  /**
   * Get current core token list
   * Requirements: 3.2
   */
  getCoreTokenList(): string[] {
    return [...this.config.core_tokens] // Return copy to prevent mutation
  }

  /**
   * Update core token list with runtime validation
   * Requirements: 3.2, 8.1
   */
  updateCoreTokenList(tokens: string[]): void {
    // Validate token mints (basic format check)
    const validTokens = tokens.filter(token => {
      if (typeof token !== 'string' || token.length < 32 || token.length > 44) {
        logger.warn({ token }, 'Invalid token mint format, skipping')
        return false
      }
      return true
    })

    if (validTokens.length !== tokens.length) {
      logger.warn({
        original: tokens.length,
        valid: validTokens.length,
      }, 'Some tokens were filtered out due to invalid format')
    }

    const oldTokens = this.config.core_tokens
    this.config.core_tokens = validTokens

    logger.info({
      oldCount: oldTokens.length,
      newCount: validTokens.length,
      added: validTokens.filter(t => !oldTokens.includes(t)),
      removed: oldTokens.filter(t => !validTokens.includes(t)),
    }, 'Core token list updated')

    this.notifyConfigUpdate()
  }

  /**
   * Get current feature flags
   * Requirements: 8.2
   */
  getFeatureFlags(): ParserFeatureFlags {
    return { ...this.config.feature_flags } // Return copy to prevent mutation
  }

  /**
   * Set individual feature flag
   * Requirements: 8.2, 8.3
   */
  setFeatureFlag(flag: keyof ParserFeatureFlags, enabled: boolean): void {
    if (!(flag in this.config.feature_flags)) {
      throw new Error(`Unknown feature flag: ${flag}`)
    }

    const oldValue = this.config.feature_flags[flag]
    this.config.feature_flags[flag] = enabled

    logger.info({
      flag,
      oldValue,
      newValue: enabled,
    }, 'Feature flag updated')

    this.notifyConfigUpdate()
  }

  /**
   * Get current parser version
   * Requirements: 8.2
   */
  getParserVersion(): 'v1' | 'v2' | 'hybrid' {
    return this.config.version
  }

  /**
   * Set parser version with validation
   * Requirements: 8.2, 8.3
   */
  setParserVersion(version: 'v1' | 'v2' | 'hybrid'): void {
    const validVersions = ['v1', 'v2', 'hybrid'] as const
    if (!validVersions.includes(version)) {
      throw new Error(`Invalid parser version: ${version}. Must be one of: ${validVersions.join(', ')}`)
    }

    const oldVersion = this.config.version
    this.config.version = version

    logger.info({
      oldVersion,
      newVersion: version,
    }, 'Parser version updated')

    this.notifyConfigUpdate()
  }

  /**
   * Get complete configuration
   */
  getConfiguration(): ParserConfiguration {
    return JSON.parse(JSON.stringify(this.config)) // Deep copy
  }

  /**
   * Update multiple configuration settings atomically
   * Requirements: 8.2, 8.3
   */
  updateConfiguration(updates: Partial<ParserConfiguration>): void {
    const oldConfig = { ...this.config }

    // Apply updates
    if (updates.version) {
      this.setParserVersion(updates.version)
    }
    if (updates.core_tokens) {
      this.updateCoreTokenList(updates.core_tokens)
    }
    if (updates.feature_flags) {
      Object.entries(updates.feature_flags).forEach(([flag, enabled]) => {
        if (enabled !== undefined) {
          this.setFeatureFlag(flag as keyof ParserFeatureFlags, enabled)
        }
      })
    }
    if (updates.performance_tracking !== undefined) {
      this.config.performance_tracking = updates.performance_tracking
    }
    if (updates.logging_level) {
      this.config.logging_level = updates.logging_level
    }
    if (updates.migration_settings) {
      this.config.migration_settings = {
        ...this.config.migration_settings,
        ...updates.migration_settings,
      }
    }

    logger.info({
      changes: this.getConfigurationDiff(oldConfig, this.config),
    }, 'Configuration updated')

    this.notifyConfigUpdate()
  }

  /**
   * Register callback for configuration updates
   */
  onConfigurationUpdate(callback: (config: ParserConfiguration) => void): void {
    this.configUpdateCallbacks.push(callback)
  }

  /**
   * Remove configuration update callback
   */
  removeConfigurationUpdateCallback(callback: (config: ParserConfiguration) => void): void {
    const index = this.configUpdateCallbacks.indexOf(callback)
    if (index > -1) {
      this.configUpdateCallbacks.splice(index, 1)
    }
  }

  /**
   * Validate current configuration
   */
  validateConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // Validate version
    if (!['v1', 'v2', 'hybrid'].includes(this.config.version)) {
      errors.push(`Invalid parser version: ${this.config.version}`)
    }

    // Validate core tokens
    if (!Array.isArray(this.config.core_tokens)) {
      errors.push('Core tokens must be an array')
    } else if (this.config.core_tokens.length === 0) {
      errors.push('Core tokens list cannot be empty')
    }

    // Validate migration settings
    const { rollout_percentage, rollback_threshold_error_rate, rollback_threshold_performance_degradation } = this.config.migration_settings
    
    if (rollout_percentage < 0 || rollout_percentage > 100) {
      errors.push('Rollout percentage must be between 0 and 100')
    }
    
    if (rollback_threshold_error_rate < 0 || rollback_threshold_error_rate > 1) {
      errors.push('Rollback error threshold must be between 0 and 1')
    }
    
    if (rollback_threshold_performance_degradation < 0) {
      errors.push('Rollback performance threshold must be non-negative')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Reset configuration to defaults
   */
  resetToDefaults(): void {
    const oldConfig = { ...this.config }
    this.config = this.loadEnvironmentConfig()

    logger.info({
      changes: this.getConfigurationDiff(oldConfig, this.config),
    }, 'Configuration reset to defaults')

    this.notifyConfigUpdate()
  }

  /**
   * Notify all registered callbacks of configuration changes
   */
  private notifyConfigUpdate(): void {
    const configCopy = this.getConfiguration()
    this.configUpdateCallbacks.forEach(callback => {
      try {
        callback(configCopy)
      } catch (error) {
        logger.error({ error }, 'Error in configuration update callback')
      }
    })
  }

  /**
   * Get differences between two configurations
   */
  private getConfigurationDiff(oldConfig: ParserConfiguration, newConfig: ParserConfiguration): Record<string, any> {
    const diff: Record<string, any> = {}

    if (oldConfig.version !== newConfig.version) {
      diff.version = { old: oldConfig.version, new: newConfig.version }
    }

    if (JSON.stringify(oldConfig.core_tokens) !== JSON.stringify(newConfig.core_tokens)) {
      diff.core_tokens = {
        old: oldConfig.core_tokens.length,
        new: newConfig.core_tokens.length,
      }
    }

    if (JSON.stringify(oldConfig.feature_flags) !== JSON.stringify(newConfig.feature_flags)) {
      diff.feature_flags = {}
      Object.keys(oldConfig.feature_flags).forEach(key => {
        const k = key as keyof ParserFeatureFlags
        if (oldConfig.feature_flags[k] !== newConfig.feature_flags[k]) {
          diff.feature_flags[k] = {
            old: oldConfig.feature_flags[k],
            new: newConfig.feature_flags[k],
          }
        }
      })
    }

    return diff
  }
}

// Singleton instance for global access
let configServiceInstance: ShyftParserConfigService | null = null

/**
 * Get or create the global configuration service instance
 */
export function getShyftParserConfigService(initialConfig?: Partial<ParserConfiguration>): ShyftParserConfigService {
  if (!configServiceInstance) {
    configServiceInstance = new ShyftParserConfigService(initialConfig)
  }
  return configServiceInstance
}

/**
 * Reset the global configuration service instance (mainly for testing)
 */
export function resetShyftParserConfigService(): void {
  configServiceInstance = null
}