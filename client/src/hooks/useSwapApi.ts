import { useState, useCallback, useRef, useEffect } from "react"
import axios from "axios"

// Types for Jupiter swap API integration
export interface QuoteParams {
  inputMint: string
  outputMint: string
  amount: number
  slippageBps?: number
}

export interface QuoteResponse {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  otherAmountThreshold: string
  swapMode: string
  slippageBps: number
  platformFee?: {
    amount: string
    mint: string
    pct: number
  }
  priceImpactPct: string
  routePlan: Array<any>
}

export interface SwapParams {
  quoteResponse: QuoteResponse
  userPublicKey: string
  wrapUnwrapSOL?: boolean
  prioritizationFeeLamports?: number // Legacy parameter for backward compatibility
  dynamicSlippage?: boolean // ✅ Enable dynamic slippage (Jupiter Ultra handles priority automatically)
}

export interface SwapTransactionResponse {
  swapTransaction: string
  lastValidBlockHeight: number
}

export interface TrackTradeParams {
  signature: string
  walletAddress: string
  inputMint: string
  outputMint: string
  inputAmount: number
  outputAmount: number
  platformFee: number
  // ✅ Priority level is automatically determined by Jupiter Ultra - no manual tracking needed
}

export interface TrackTradeResponse {
  success: boolean
  message: string
  trade?: any
}

export interface SwapApiError {
  code: string
  message: string
  details?: any
}

export interface UseSwapApiState {
  isLoadingQuote: boolean
  isLoadingSwap: boolean
  isLoadingTrack: boolean
  quoteError: SwapApiError | null
  swapError: SwapApiError | null
  trackError: SwapApiError | null
}

export interface UseSwapApi extends UseSwapApiState {
  getQuote: (params: QuoteParams) => Promise<QuoteResponse>
  getSwapTransaction: (params: SwapParams) => Promise<SwapTransactionResponse>
  trackTrade: (params: TrackTradeParams) => Promise<TrackTradeResponse>
  clearErrors: () => void
  isLoading: boolean
  error: SwapApiError | null
}

// Create axios instance for swap API calls
const createSwapApiClient = () => {
  const baseURL = import.meta.env.VITE_SERVER_URL || "http://localhost:9090/api/v1"
  
  return axios.create({
    baseURL: `${baseURL}/trade`,
    headers: {
      "Content-Type": "application/json",
    },
    withCredentials: true,
    timeout: 10000, // 10 second timeout for swap operations
  })
}

/**
 * Custom hook for Jupiter swap API integration
 * Provides functions to call backend /quote, /swap, and /track endpoints
 * with proper error handling, loading states, debouncing, and retry logic
 */
export const useSwapApi = (): UseSwapApi => {
  const [state, setState] = useState<UseSwapApiState>({
    isLoadingQuote: false,
    isLoadingSwap: false,
    isLoadingTrack: false,
    quoteError: null,
    swapError: null,
    trackError: null,
  })

  // Debounce timer for quote requests
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const apiClientRef = useRef(createSwapApiClient())

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  /**
   * Clear all errors
   */
  const clearErrors = useCallback(() => {
    setState(prev => ({
      ...prev,
      quoteError: null,
      swapError: null,
      trackError: null,
    }))
  }, [])

  /**
   * Handle API errors and convert to SwapApiError
   * Includes Ultra-specific error handling for improved user experience
   */
  const handleApiError = useCallback((error: any, operation: string): SwapApiError => {
    console.error(`Swap API ${operation} error:`, error)

    let errorMessage = `${operation} failed`
    let errorCode = `${operation.toUpperCase()}_FAILED`

    if (error.response) {
      // Server responded with error status
      const status = error.response.status
      const data = error.response.data

      // Check for Ultra-specific error codes first
      if (data?.error?.code) {
        const ultraErrorCode = data.error.code
        
        switch (ultraErrorCode) {
          case 'PRIORITY_FEE_TOO_LOW':
            errorMessage = "Transaction priority fee is too low. Try increasing the priority level to 'High' or 'VeryHigh'."
            errorCode = "PRIORITY_FEE_TOO_LOW"
            break
          case 'DYNAMIC_SLIPPAGE_EXCEEDED':
            errorMessage = "Price moved beyond acceptable slippage. Try again or increase slippage tolerance."
            errorCode = "DYNAMIC_SLIPPAGE_EXCEEDED"
            break
          case 'SHADOWLANE_UNAVAILABLE':
            errorMessage = "Fast transaction service temporarily unavailable. Transaction will use standard processing."
            errorCode = "SHADOWLANE_UNAVAILABLE"
            break
          case 'ACCOUNT_INITIALIZATION_FAILED':
            errorMessage = "Token account creation failed. Ensure you have sufficient SOL balance (>0.05 SOL) for account creation."
            errorCode = "ACCOUNT_INITIALIZATION_FAILED"
            break
          case 'INSUFFICIENT_BALANCE':
            errorMessage = "Insufficient token balance for this swap."
            errorCode = "INSUFFICIENT_BALANCE"
            break
          case 'INVALID_PRIORITY_LEVEL':
            errorMessage = "Invalid priority level. Please select Low, Medium, High, or VeryHigh."
            errorCode = "INVALID_PRIORITY_LEVEL"
            break
          default:
            // Use the server-provided error message for other codes
            errorMessage = data.error.message || errorMessage
            errorCode = ultraErrorCode
        }
      } else if (status === 400) {
        errorMessage = data?.error?.message || "Invalid request parameters"
        errorCode = "INVALID_PARAMETERS"
      } else if (status === 401) {
        errorMessage = "Authentication failed"
        errorCode = "AUTHENTICATION_FAILED"
      } else if (status === 429) {
        errorMessage = "Rate limit exceeded. Please try again later."
        errorCode = "RATE_LIMIT_EXCEEDED"
      } else if (status >= 500) {
        errorMessage = "Server error. Please try again."
        errorCode = "SERVER_ERROR"
      } else {
        errorMessage = data?.error?.message || `HTTP ${status} error`
        errorCode = `HTTP_${status}`
      }
    } else if (error.request) {
      // Network error
      errorMessage = "Network error. Please check your connection."
      errorCode = "NETWORK_ERROR"
    } else if (error.code === "ECONNABORTED") {
      // Timeout error
      errorMessage = "Request timeout. Please try again."
      errorCode = "TIMEOUT"
    } else {
      // Other error
      errorMessage = error.message || "Unknown error occurred"
      errorCode = "UNKNOWN_ERROR"
    }

    return {
      code: errorCode,
      message: errorMessage,
      details: error,
    }
  }, [])

  /**
   * Retry logic for failed API calls
   * Enhanced for Ultra-specific error handling
   */
  const retryApiCall = useCallback(async <T>(
    apiCall: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> => {
    let lastError: any

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await apiCall()
      } catch (error: any) {
        lastError = error

        // Check for Ultra-specific errors that should not be retried
        const errorCode = error.response?.data?.error?.code
        const nonRetryableUltraErrors = [
          'PRIORITY_FEE_TOO_LOW',
          'INVALID_PRIORITY_LEVEL', 
          'INSUFFICIENT_BALANCE',
          'ACCOUNT_INITIALIZATION_FAILED'
        ]
        
        if (nonRetryableUltraErrors.includes(errorCode)) {
          throw error
        }

        // Don't retry on client errors (4xx) except 429 and some Ultra errors
        if (error.response?.status >= 400 && 
            error.response?.status < 500 && 
            error.response?.status !== 429 &&
            errorCode !== 'DYNAMIC_SLIPPAGE_EXCEEDED' &&
            errorCode !== 'SHADOWLANE_UNAVAILABLE') {
          throw error
        }

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          throw error
        }

        // Calculate delay with exponential backoff and jitter
        // Shorter delay for Ultra-specific retryable errors
        const isUltraRetryableError = ['DYNAMIC_SLIPPAGE_EXCEEDED', 'SHADOWLANE_UNAVAILABLE'].includes(errorCode)
        const effectiveBaseDelay = isUltraRetryableError ? 500 : baseDelay
        const delay = effectiveBaseDelay * Math.pow(2, attempt) + Math.random() * 500
        
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw lastError
  }, [])

  /**
   * Get swap quote with debouncing (500ms)
   */
  const getQuote = useCallback((params: QuoteParams): Promise<QuoteResponse> => {
    return new Promise((resolve, reject) => {
      // Clear existing debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      // Set new debounce timer
      debounceTimerRef.current = setTimeout(async () => {
        try {
          setState(prev => ({ 
            ...prev, 
            isLoadingQuote: true, 
            quoteError: null 
          }))

          const response = await retryApiCall(async () => {
            return await apiClientRef.current.get<{ success: boolean; data: QuoteResponse }>("/quote", {
              params: {
                inputMint: params.inputMint,
                outputMint: params.outputMint,
                amount: params.amount,
                slippageBps: params.slippageBps || 50,
              },
            })
          })

          setState(prev => ({ ...prev, isLoadingQuote: false }))
          // Backend wraps response in { success: true, data: {...} }
          resolve(response.data.data)
        } catch (error: any) {
          const swapError = handleApiError(error, "quote")
          setState(prev => ({ 
            ...prev, 
            isLoadingQuote: false, 
            quoteError: swapError 
          }))
          reject(swapError)
        }
      }, 500) // 500ms debounce delay
    })
  }, [retryApiCall, handleApiError])

  const getSwapTransaction = useCallback(async (params: SwapParams): Promise<SwapTransactionResponse> => {
    try {
      setState(prev => ({ 
        ...prev, 
        isLoadingSwap: true, 
        swapError: null 
      }))

      const response = await retryApiCall(async () => {
        return await apiClientRef.current.post<{ success: boolean; data: SwapTransactionResponse }>("/swap", {
          quoteResponse: params.quoteResponse,
          userPublicKey: params.userPublicKey,
          wrapUnwrapSOL: params.wrapUnwrapSOL ?? true,
          // Only include dynamicSlippage if it's explicitly true
          ...(params.dynamicSlippage === true && { dynamicSlippage: true }),
        })
      })

      setState(prev => ({ ...prev, isLoadingSwap: false }))
      // Backend wraps response in { success: true, data: {...} }
      return response.data.data
    } catch (error: any) {
      const swapError = handleApiError(error, "swap")
      setState(prev => ({ 
        ...prev, 
        isLoadingSwap: false, 
        swapError 
      }))
      throw swapError
    }
  }, [retryApiCall, handleApiError])

  /**
   * Track completed trade
   */
  const trackTrade = useCallback(async (params: TrackTradeParams): Promise<TrackTradeResponse> => {
    try {
      setState(prev => ({ 
        ...prev, 
        isLoadingTrack: true, 
        trackError: null 
      }))

      const response = await retryApiCall(async () => {
        return await apiClientRef.current.post<TrackTradeResponse>("/track", {
          signature: params.signature,
          walletAddress: params.walletAddress,
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          inputAmount: params.inputAmount,
          outputAmount: params.outputAmount,
          platformFee: params.platformFee,
          // ✅ Priority level is automatically determined by Jupiter Ultra
        })
      })

      setState(prev => ({ ...prev, isLoadingTrack: false }))
      return response.data
    } catch (error: any) {
      const swapError = handleApiError(error, "track")
      setState(prev => ({ 
        ...prev, 
        isLoadingTrack: false, 
        trackError: swapError 
      }))
      throw swapError
    }
  }, [retryApiCall, handleApiError])

  // Computed properties
  const isLoading = state.isLoadingQuote || state.isLoadingSwap || state.isLoadingTrack
  const error = state.quoteError || state.swapError || state.trackError

  return {
    ...state,
    getQuote,
    getSwapTransaction,
    trackTrade,
    clearErrors,
    isLoading,
    error,
  }
}