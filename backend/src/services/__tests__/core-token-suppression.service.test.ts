/**
 * Tests for Core Token Suppression Service
 */

import { CoreTokenSuppressionServiceImpl, resetCoreTokenSuppressionService } from '../core-token-suppression.service'
import { TokenInfo, DEFAULT_CORE_TOKENS } from '../../types/shyft-parser-v2.types'

describe('CoreTokenSuppressionServiceImpl', () => {
  let suppressionService: CoreTokenSuppressionServiceImpl

  beforeEach(() => {
    resetCoreTokenSuppressionService()
    suppressionService = new CoreTokenSuppressionServiceImpl(DEFAULT_CORE_TOKENS, true)
  })

  afterEach(() => {
    resetCoreTokenSuppressionService()
  })

  describe('Core Token Detection', () => {
    it('should identify core tokens correctly', () => {
      const solMint = 'So11111111111111111111111111111111111111112'
      const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      const randomMint = 'RandomTokenMint123456789012345678901234'

      expect(suppressionService.isCoreToken(solMint)).toBe(true)
      expect(suppressionService.isCoreToken(usdcMint)).toBe(true)
      expect(suppressionService.isCoreToken(randomMint)).toBe(false)
    })
  })

  describe('Swap Suppression Logic', () => {
    const solToken: TokenInfo = {
      mint: 'So11111111111111111111111111111111111111112',
      symbol: 'SOL',
      decimals: 9,
      amount: 1.5,
    }

    const usdcToken: TokenInfo = {
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      symbol: 'USDC',
      decimals: 6,
      amount: 100,
    }

    const randomToken: TokenInfo = {
      mint: 'RandomTokenMint123456789012345678901234',
      symbol: 'RANDOM',
      decimals: 6,
      amount: 1000,
    }

    it('should suppress core-to-core swaps when enabled', () => {
      const shouldSuppress = suppressionService.shouldSuppressSwap(solToken, usdcToken)
      expect(shouldSuppress).toBe(true)
    })

    it('should not suppress core-to-non-core swaps', () => {
      const shouldSuppress = suppressionService.shouldSuppressSwap(solToken, randomToken)
      expect(shouldSuppress).toBe(false)
    })

    it('should not suppress non-core-to-core swaps', () => {
      const shouldSuppress = suppressionService.shouldSuppressSwap(randomToken, usdcToken)
      expect(shouldSuppress).toBe(false)
    })

    it('should not suppress non-core-to-non-core swaps', () => {
      const shouldSuppress = suppressionService.shouldSuppressSwap(randomToken, randomToken)
      expect(shouldSuppress).toBe(false)
    })

    it('should not suppress any swaps when disabled', () => {
      suppressionService.setEnabled(false)
      
      const shouldSuppress = suppressionService.shouldSuppressSwap(solToken, usdcToken)
      expect(shouldSuppress).toBe(false)
    })
  })

  describe('Metrics Tracking', () => {
    const solToken: TokenInfo = {
      mint: 'So11111111111111111111111111111111111111112',
      symbol: 'SOL',
      decimals: 9,
      amount: 1.5,
    }

    const usdcToken: TokenInfo = {
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      symbol: 'USDC',
      decimals: 6,
      amount: 100,
    }

    const randomToken: TokenInfo = {
      mint: 'RandomTokenMint123456789012345678901234',
      symbol: 'RANDOM',
      decimals: 6,
      amount: 1000,
    }

    it('should track suppression metrics correctly', () => {
      // Process some swaps
      suppressionService.shouldSuppressSwap(solToken, usdcToken) // Should suppress
      suppressionService.shouldSuppressSwap(solToken, randomToken) // Should not suppress
      suppressionService.shouldSuppressSwap(randomToken, usdcToken) // Should not suppress
      suppressionService.shouldSuppressSwap(solToken, usdcToken) // Should suppress

      const stats = suppressionService.getSuppressionStats()
      expect(stats.totalSwapsProcessed).toBe(4)
      expect(stats.swapsSuppressed).toBe(2)
      expect(stats.suppressionRate).toBe(0.5)
    })

    it('should reset metrics when core token list changes', () => {
      // Process some swaps
      suppressionService.shouldSuppressSwap(solToken, usdcToken)
      suppressionService.shouldSuppressSwap(solToken, randomToken)

      let stats = suppressionService.getSuppressionStats()
      expect(stats.totalSwapsProcessed).toBe(2)

      // Update core token list
      suppressionService.updateCoreTokenList(['newtoken1', 'newtoken2'])

      stats = suppressionService.getSuppressionStats()
      expect(stats.totalSwapsProcessed).toBe(0)
      expect(stats.swapsSuppressed).toBe(0)
    })
  })

  describe('Swap Analysis', () => {
    const solToken: TokenInfo = {
      mint: 'So11111111111111111111111111111111111111112',
      symbol: 'SOL',
      decimals: 9,
      amount: 1.5,
    }

    const randomToken: TokenInfo = {
      mint: 'RandomTokenMint123456789012345678901234',
      symbol: 'RANDOM',
      decimals: 6,
      amount: 1000,
    }

    it('should provide detailed swap analysis', () => {
      const analysis = suppressionService.analyzeSwap(solToken, randomToken)
      
      expect(analysis.inputIsCore).toBe(true)
      expect(analysis.outputIsCore).toBe(false)
      expect(analysis.wouldSuppress).toBe(false)
      expect(analysis.suppressionEnabled).toBe(true)
      expect(analysis.reason).toBe('Only input token is core')
    })
  })

  describe('Core Token List Management', () => {
    it('should add and remove core tokens', () => {
      const newToken = 'NewTokenMint123456789012345678901234'
      
      expect(suppressionService.isCoreToken(newToken)).toBe(false)
      
      suppressionService.addCoreToken(newToken)
      expect(suppressionService.isCoreToken(newToken)).toBe(true)
      
      suppressionService.removeCoreToken(newToken)
      expect(suppressionService.isCoreToken(newToken)).toBe(false)
    })

    it('should update entire core token list', () => {
      const newTokens = ['token1', 'token2', 'token3']
      suppressionService.updateCoreTokenList(newTokens)
      
      const currentTokens = suppressionService.getCoreTokenList()
      expect(currentTokens).toEqual(newTokens)
    })
  })
})