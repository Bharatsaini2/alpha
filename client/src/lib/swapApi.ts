/**
 * API client functions for Jupiter Swap integration
 * Provides centralized API calls with proper error handling
 */

import axios, { AxiosInstance, AxiosError } from "axios"
import type {
  QuoteParams,
  QuoteResponse,
  SwapParams,
  SwapTransactionResponse,
  TrackTradeParams,
  TrackTradeResponse,
  SwapApiError,
} from "../types/swap.types"

// ============================================================================
// API Client Configuration
// ============================================================================

/**
 * Creates a configured axios instance for swap API calls
 */
const createSwapApiClient = (): AxiosInstance => {
  const baseURL =
    import.meta.env.VITE_SERVER_URL || "http://localhost:9090/api/v1"

  const client = axios.create({
    baseURL: `${baseURL}/trade`,
    headers: {
      "Content-Type": "application/json",
    },
    withCredentials: true,
    timeout: 10000, // 10 second timeout
  })

  // Request interceptor
  client.interceptors.request.use(
    (config) => {
      // Add any auth tokens if needed
      const token = localStorage.getItem("authToken")
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    },
    (error) => {
      return Promise.reject(error)
    }
  )

  // Response interceptor
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      // Handle common errors
      if (error.response?.status === 401) {
        console.error("Unauthorized swap API access")
      }
      return Promise.reject(error)
    }
  )

  return client
}

// Create singleton instance
const swapApiClient = createSwapApiClient()

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Converts API errors to SwapApiError format
 * @param error - Error from API call
 * @param operation - Operation name for context
 * @returns Formatted SwapApiError
 */
export const handleSwapApiError = (
  error: any,
  operation: string
): SwapApiError => {
  console.error(`Swap API ${operation} error:`, error)

  let errorMessage = `${operation} failed`
  let errorCode = `${operation.toUpperCase()}_FAILED`

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError

    if (axiosError.response) {
      // Server responded with error status
      const status = axiosError.response.status
      const data = axiosError.response.data as any

      if (status === 400) {
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
    } else if (axiosError.request) {
      // Network error
      errorMessage = "Network error. Please check your connection."
      errorCode = "NETWORK_ERROR"
    } else if (axiosError.code === "ECONNABORTED") {
      // Timeout error
      errorMessage = "Request timeout. Please try again."
      errorCode = "TIMEOUT"
    }
  } else if (error instanceof Error) {
    errorMessage = error.message
    errorCode = "UNKNOWN_ERROR"
  }

  return {
    code: errorCode,
    message: errorMessage,
    details: error,
  }
}

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Retry configuration for API calls
 */
interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
}

/**
 * Determines if an error is retryable
 * @param error - Error to check
 * @returns true if error should be retried
 */
const isRetryableError = (error: any): boolean => {
  if (!axios.isAxiosError(error)) return false

  const status = error.response?.status

  // Retry on rate limits, server errors, and network errors
  if (status === 429 || (status && status >= 500)) return true
  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") return true
  if (!error.response) return true // Network error

  return false
}

/**
 * Calculates delay for retry with exponential backoff
 * @param attempt - Current attempt number (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
const calculateRetryDelay = (
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number => {
  const exponentialDelay = config.baseDelay * Math.pow(2, attempt)
  const jitter = Math.random() * 500 // Add random jitter
  const delay = Math.min(exponentialDelay + jitter, config.maxDelay)
  return delay
}

/**
 * Retries an API call with exponential backoff
 * @param apiCall - Function that makes the API call
 * @param config - Retry configuration
 * @returns Promise with API response
 */
export const retryApiCall = async <T>(
  apiCall: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> => {
  let lastError: any

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await apiCall()
    } catch (error) {
      lastError = error

      // Don't retry if not retryable or on last attempt
      if (!isRetryableError(error) || attempt === config.maxRetries) {
        throw error
      }

      // Calculate and wait for retry delay
      const delay = calculateRetryDelay(attempt, config)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetches a swap quote from the backend
 * @param params - Quote parameters
 * @returns Promise with quote response
 */
export const fetchQuote = async (
  params: QuoteParams
): Promise<QuoteResponse> => {
  try {
    const response = await retryApiCall(async () => {
      return await swapApiClient.get<QuoteResponse>("/quote", {
        params: {
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          amount: params.amount,
          slippageBps: params.slippageBps || 50,
        },
      })
    })

    return response.data
  } catch (error) {
    throw handleSwapApiError(error, "quote")
  }
}

/**
 * Generates a swap transaction from the backend
 * @param params - Swap parameters
 * @returns Promise with swap transaction response
 */
export const generateSwapTransaction = async (
  params: SwapParams
): Promise<SwapTransactionResponse> => {
  try {
    const response = await retryApiCall(async () => {
      return await swapApiClient.post<SwapTransactionResponse>("/swap", {
        quoteResponse: params.quoteResponse,
        userPublicKey: params.userPublicKey,
        wrapUnwrapSOL: params.wrapUnwrapSOL ?? true,
        prioritizationFeeLamports: params.prioritizationFeeLamports,
      })
    })

    return response.data
  } catch (error) {
    throw handleSwapApiError(error, "swap")
  }
}

/**
 * Tracks a completed trade on the backend
 * @param params - Trade tracking parameters
 * @returns Promise with track trade response
 */
export const trackCompletedTrade = async (
  params: TrackTradeParams
): Promise<TrackTradeResponse> => {
  try {
    const response = await retryApiCall(async () => {
      return await swapApiClient.post<TrackTradeResponse>("/track", {
        signature: params.signature,
        walletAddress: params.walletAddress,
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        inputAmount: params.inputAmount,
        outputAmount: params.outputAmount,
        platformFee: params.platformFee,
      })
    })

    return response.data
  } catch (error) {
    throw handleSwapApiError(error, "track")
  }
}

// ============================================================================
// Number Formatting Utilities
// ============================================================================

/**
 * Formats a number with appropriate decimal places
 * @param value - Number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted number string
 */
export const formatNumber = (value: number, decimals: number = 2): string => {
  if (isNaN(value) || !isFinite(value)) return "0"

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })
}

/**
 * Formats a number in compact notation (K, M, B)
 * @param value - Number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted compact number string
 */
export const formatCompactNumber = (
  value: number,
  decimals: number = 2
): string => {
  if (isNaN(value) || !isFinite(value)) return "0"

  const absValue = Math.abs(value)
  const sign = value < 0 ? "-" : ""

  if (absValue >= 1_000_000_000) {
    return `${sign}${(absValue / 1_000_000_000).toFixed(decimals)}B`
  } else if (absValue >= 1_000_000) {
    return `${sign}${(absValue / 1_000_000).toFixed(decimals)}M`
  } else if (absValue >= 1_000) {
    return `${sign}${(absValue / 1_000).toFixed(decimals)}K`
  } else {
    return `${sign}${absValue.toFixed(decimals)}`
  }
}

/**
 * Formats a token amount with symbol
 * @param amount - Token amount
 * @param symbol - Token symbol
 * @param decimals - Number of decimal places
 * @param compact - Use compact notation
 * @returns Formatted token amount string
 */
export const formatTokenAmount = (
  amount: number,
  symbol?: string,
  decimals: number = 6,
  compact: boolean = false
): string => {
  const formatted = compact
    ? formatCompactNumber(amount, decimals)
    : formatNumber(amount, decimals)

  return symbol ? `${formatted} ${symbol}` : formatted
}

/**
 * Formats a price with appropriate precision
 * @param price - Price value
 * @param currency - Currency symbol (default: $)
 * @returns Formatted price string
 */
export const formatPrice = (price: number, currency: string = "$"): string => {
  if (isNaN(price) || !isFinite(price)) return `${currency}0`

  // Use more decimals for small prices
  let decimals = 2
  if (price < 0.01) decimals = 6
  else if (price < 1) decimals = 4

  return `${currency}${formatNumber(price, decimals)}`
}

/**
 * Formats a percentage value
 * @param value - Percentage value (e.g., 0.05 for 5%)
 * @param decimals - Number of decimal places (default: 2)
 * @param includeSign - Include + sign for positive values
 * @returns Formatted percentage string
 */
export const formatPercentage = (
  value: number,
  decimals: number = 2,
  includeSign: boolean = false
): string => {
  if (isNaN(value) || !isFinite(value)) return "0%"

  const percentage = value * 100
  const sign = includeSign && percentage > 0 ? "+" : ""

  return `${sign}${percentage.toFixed(decimals)}%`
}

/**
 * Parses a user input string to a number
 * @param input - User input string
 * @returns Parsed number or null if invalid
 */
export const parseNumberInput = (input: string): number | null => {
  if (!input || input.trim() === "") return null

  // Remove commas and whitespace
  const cleaned = input.replace(/,/g, "").trim()

  const parsed = parseFloat(cleaned)
  if (isNaN(parsed) || !isFinite(parsed)) return null

  return parsed
}

/**
 * Validates if a number input is valid
 * @param input - Input string
 * @param min - Minimum value (optional)
 * @param max - Maximum value (optional)
 * @returns Validation result
 */
export const validateNumberInput = (
  input: string,
  min?: number,
  max?: number
): { isValid: boolean; error?: string } => {
  const value = parseNumberInput(input)

  if (value === null) {
    return { isValid: false, error: "Invalid number" }
  }

  if (value <= 0) {
    return { isValid: false, error: "Amount must be greater than 0" }
  }

  if (min !== undefined && value < min) {
    return { isValid: false, error: `Amount must be at least ${min}` }
  }

  if (max !== undefined && value > max) {
    return { isValid: false, error: `Amount must be at most ${max}` }
  }

  return { isValid: true }
}

// ============================================================================
// Exchange Rate Utilities
// ============================================================================

/**
 * Calculates exchange rate from quote
 * @param quote - Quote response
 * @returns Exchange rate (output per input)
 */
export const calculateExchangeRate = (quote: QuoteResponse): number => {
  const inAmount = parseFloat(quote.inAmount)
  const outAmount = parseFloat(quote.outAmount)

  if (inAmount === 0) return 0

  return outAmount / inAmount
}

/**
 * Calculates price impact from quote
 * @param quote - Quote response
 * @returns Price impact as percentage (e.g., 0.05 for 5%)
 */
export const calculatePriceImpact = (quote: QuoteResponse): number => {
  return parseFloat(quote.priceImpactPct)
}

/**
 * Calculates platform fee amount from quote
 * @param quote - Quote response
 * @returns Platform fee amount
 */
export const calculatePlatformFee = (quote: QuoteResponse): number => {
  if (!quote.platformFee) return 0
  return parseFloat(quote.platformFee.amount)
}

/**
 * Calculates minimum received amount considering slippage
 * @param quote - Quote response
 * @returns Minimum amount that will be received
 */
export const calculateMinimumReceived = (quote: QuoteResponse): number => {
  return parseFloat(quote.otherAmountThreshold)
}

// Export the API client for advanced usage
export { swapApiClient }
