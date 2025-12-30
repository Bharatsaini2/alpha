/**
 * Basic validation tests for useSwapApi hook
 * These tests verify the hook's structure and basic functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSwapApi } from './useSwapApi'

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
    })),
  },
}))

// Mock React hooks
const mockUseState = vi.fn()
const mockUseCallback = vi.fn()
const mockUseRef = vi.fn()
const mockUseEffect = vi.fn()

vi.mock('react', () => ({
  useState: mockUseState,
  useCallback: mockUseCallback,
  useRef: mockUseRef,
  useEffect: mockUseEffect,
}))

describe('useSwapApi Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup default mock implementations
    mockUseState.mockReturnValue([
      {
        isLoadingQuote: false,
        isLoadingSwap: false,
        isLoadingTrack: false,
        quoteError: null,
        swapError: null,
        trackError: null,
      },
      vi.fn(),
    ])
    
    mockUseCallback.mockImplementation((fn: any) => fn)
    mockUseRef.mockReturnValue({ current: null })
    mockUseEffect.mockImplementation((fn: any) => fn())
  })

  it('should export the hook function', () => {
    expect(typeof useSwapApi).toBe('function')
  })

  it('should return the expected interface', () => {
    const result = useSwapApi()
    
    expect(result).toHaveProperty('getQuote')
    expect(result).toHaveProperty('getSwapTransaction')
    expect(result).toHaveProperty('trackTrade')
    expect(result).toHaveProperty('clearErrors')
    expect(result).toHaveProperty('isLoading')
    expect(result).toHaveProperty('error')
    expect(result).toHaveProperty('isLoadingQuote')
    expect(result).toHaveProperty('isLoadingSwap')
    expect(result).toHaveProperty('isLoadingTrack')
    expect(result).toHaveProperty('quoteError')
    expect(result).toHaveProperty('swapError')
    expect(result).toHaveProperty('trackError')
    
    expect(typeof result.getQuote).toBe('function')
    expect(typeof result.getSwapTransaction).toBe('function')
    expect(typeof result.trackTrade).toBe('function')
    expect(typeof result.clearErrors).toBe('function')
  })

  it('should have correct TypeScript types', () => {
    // This test ensures TypeScript compilation passes
    // and validates the interface structure
    const hook = useSwapApi()
    
    // Test that functions accept correct parameters
    const quoteParams = {
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: 1000000,
      slippageBps: 50,
    }
    
    const swapParams = {
      quoteResponse: {} as any,
      userPublicKey: 'So11111111111111111111111111111111111111112',
      wrapUnwrapSOL: true,
      priorityLevel: 'High' as const,
      dynamicSlippage: true,
    }
    
    const trackParams = {
      signature: 'test-signature',
      walletAddress: 'So11111111111111111111111111111111111111112',
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      inputAmount: 1000000,
      outputAmount: 950000,
      platformFee: 7500,
      priorityLevel: 'High',
    }
    
    // These should not throw TypeScript errors
    expect(() => hook.getQuote(quoteParams)).not.toThrow()
    expect(() => hook.getSwapTransaction(swapParams)).not.toThrow()
    expect(() => hook.trackTrade(trackParams)).not.toThrow()
    expect(() => hook.clearErrors()).not.toThrow()
  })

  it('should support Ultra priority levels', () => {
    const hook = useSwapApi()
    
    // Test all valid priority levels
    const validPriorityLevels = ['Low', 'Medium', 'High', 'VeryHigh'] as const
    
    validPriorityLevels.forEach(priorityLevel => {
      const swapParams = {
        quoteResponse: {} as any,
        userPublicKey: 'So11111111111111111111111111111111111111112',
        priorityLevel,
        dynamicSlippage: true,
      }
      
      expect(() => hook.getSwapTransaction(swapParams)).not.toThrow()
    })
  })

  it('should support dynamic slippage parameter', () => {
    const hook = useSwapApi()
    
    const swapParamsWithDynamicSlippage = {
      quoteResponse: {} as any,
      userPublicKey: 'So11111111111111111111111111111111111111112',
      priorityLevel: 'High' as const,
      dynamicSlippage: true,
    }
    
    const swapParamsWithoutDynamicSlippage = {
      quoteResponse: {} as any,
      userPublicKey: 'So11111111111111111111111111111111111111112',
      priorityLevel: 'High' as const,
      dynamicSlippage: false,
    }
    
    expect(() => hook.getSwapTransaction(swapParamsWithDynamicSlippage)).not.toThrow()
    expect(() => hook.getSwapTransaction(swapParamsWithoutDynamicSlippage)).not.toThrow()
  })
})