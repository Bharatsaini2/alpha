/**
 * Tests for Shyft Parser Configuration Service
 */

import { ShyftParserConfigService, resetShyftParserConfigService } from '../shyft-parser-config.service'
import { DEFAULT_CORE_TOKENS } from '../../types/shyft-parser-v2.types'

describe('ShyftParserConfigService', () => {
  let configService: ShyftParserConfigService

  beforeEach(() => {
    resetShyftParserConfigService()
    configService = new ShyftParserConfigService()
  })

  afterEach(() => {
    resetShyftParserConfigService()
  })

  describe('Core Token Management', () => {
    it('should initialize with default core tokens', () => {
      const tokens = configService.getCoreTokenList()
      expect(tokens).toEqual(DEFAULT_CORE_TOKENS)
    })

    it('should update core token list', () => {
      const newTokens = [
        'So11111111111111111111111111111111111111112', // Valid SOL
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Valid USDC
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // Valid USDT
      ]
      configService.updateCoreTokenList(newTokens)
      
      const tokens = configService.getCoreTokenList()
      expect(tokens).toEqual(newTokens)
    })

    it('should filter invalid token formats', () => {
      const mixedTokens = [
        'So11111111111111111111111111111111111111112', // Valid SOL
        'invalid', // Too short
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Valid USDC
        '', // Empty
        'toolongtobevalidtokenmintaddressthisshouldbefilteredout', // Too long
      ]
      
      configService.updateCoreTokenList(mixedTokens)
      const tokens = configService.getCoreTokenList()
      
      expect(tokens).toHaveLength(2)
      expect(tokens).toContain('So11111111111111111111111111111111111111112')
      expect(tokens).toContain('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
    })
  })

  describe('Feature Flags', () => {
    it('should get default feature flags', () => {
      const flags = configService.getFeatureFlags()
      expect(flags.useV2Parser).toBe(false)
      expect(flags.enableCoreTokenSuppression).toBe(false)
      expect(flags.enablePerformanceTracking).toBe(true)
    })

    it('should set individual feature flags', () => {
      configService.setFeatureFlag('useV2Parser', true)
      configService.setFeatureFlag('enableCoreTokenSuppression', true)
      
      const flags = configService.getFeatureFlags()
      expect(flags.useV2Parser).toBe(true)
      expect(flags.enableCoreTokenSuppression).toBe(true)
    })

    it('should throw error for invalid feature flag', () => {
      expect(() => {
        configService.setFeatureFlag('invalidFlag' as any, true)
      }).toThrow('Unknown feature flag: invalidFlag')
    })
  })

  describe('Parser Version', () => {
    it('should get default parser version', () => {
      expect(configService.getParserVersion()).toBe('v1')
    })

    it('should set valid parser versions', () => {
      configService.setParserVersion('v2')
      expect(configService.getParserVersion()).toBe('v2')
      
      configService.setParserVersion('hybrid')
      expect(configService.getParserVersion()).toBe('hybrid')
    })

    it('should throw error for invalid parser version', () => {
      expect(() => {
        configService.setParserVersion('invalid' as any)
      }).toThrow('Invalid parser version: invalid')
    })
  })

  describe('Configuration Validation', () => {
    it('should validate valid configuration', () => {
      const validation = configService.validateConfiguration()
      expect(validation.valid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })

    it('should detect invalid rollout percentage', () => {
      configService.updateConfiguration({
        migration_settings: {
          rollout_percentage: 150, // Invalid
          comparison_mode: false,
          rollback_threshold_error_rate: 0.05,
          rollback_threshold_performance_degradation: 0.2,
        }
      })
      
      const validation = configService.validateConfiguration()
      expect(validation.valid).toBe(false)
      expect(validation.errors).toContain('Rollout percentage must be between 0 and 100')
    })
  })

  describe('Configuration Updates', () => {
    it('should notify callbacks on configuration updates', () => {
      const callback = jest.fn()
      configService.onConfigurationUpdate(callback)
      
      configService.setParserVersion('v2')
      
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 'v2'
        })
      )
    })

    it('should remove configuration update callbacks', () => {
      const callback = jest.fn()
      configService.onConfigurationUpdate(callback)
      configService.removeConfigurationUpdateCallback(callback)
      
      configService.setParserVersion('v2')
      
      expect(callback).not.toHaveBeenCalled()
    })
  })
})