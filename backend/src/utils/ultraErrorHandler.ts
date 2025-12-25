/**
 * Jupiter Ultra API Error Handler
 * 
 * Provides comprehensive error handling for Jupiter Ultra API with specific
 * error detection, user-friendly messages, retry suggestions, and fallback logic.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { AxiosError } from 'axios';
import { logger } from '../config/logger';
import { JupiterErrorResponse, PriorityLevel } from '../types/jupiter.types';

/**
 * Ultra-specific error types
 */
export enum UltraErrorType {
  PRIORITY_FEE_TOO_LOW = 'PRIORITY_FEE_TOO_LOW',
  DYNAMIC_SLIPPAGE_EXCEEDED = 'DYNAMIC_SLIPPAGE_EXCEEDED',
  SHADOWLANE_UNAVAILABLE = 'SHADOWLANE_UNAVAILABLE',
  ACCOUNT_INITIALIZATION_FAILED = 'ACCOUNT_INITIALIZATION_FAILED',
  INSUFFICIENT_LIQUIDITY = 'INSUFFICIENT_LIQUIDITY',
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',
  COMPUTE_BUDGET_EXCEEDED = 'COMPUTE_BUDGET_EXCEEDED',
  BLOCKHASH_EXPIRED = 'BLOCKHASH_EXPIRED',
  TRANSACTION_TOO_LARGE = 'TRANSACTION_TOO_LARGE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_TOKEN_ACCOUNT = 'INVALID_TOKEN_ACCOUNT',
  NETWORK_CONGESTION = 'NETWORK_CONGESTION',
  JUPITER_ULTRA_API_ERROR = 'JUPITER_ULTRA_API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Error detection patterns for Ultra API responses
 */
const ERROR_PATTERNS = {
  [UltraErrorType.PRIORITY_FEE_TOO_LOW]: [
    'priority fee too low',
    'insufficient priority fee',
    'transaction priority too low',
    'priority fee below minimum',
    'low priority fee'
  ],
  [UltraErrorType.DYNAMIC_SLIPPAGE_EXCEEDED]: [
    'dynamic slippage exceeded',
    'slippage tolerance exceeded',
    'price impact too high',
    'slippage limit reached',
    'rtse slippage exceeded'
  ],
  [UltraErrorType.SHADOWLANE_UNAVAILABLE]: [
    'shadowlane unavailable',
    'shadowlane service down',
    'beam network unavailable',
    'direct submission failed',
    'shadowlane timeout',
    'shadowlane service temporarily unavailable'
  ],
  [UltraErrorType.ACCOUNT_INITIALIZATION_FAILED]: [
    'account initialization failed',
    'ata creation failed',
    'token account creation failed',
    'insufficient sol for account creation',
    'account setup failed'
  ],
  [UltraErrorType.INSUFFICIENT_LIQUIDITY]: [
    'insufficient liquidity',
    'not enough liquidity',
    'liquidity too low',
    'no liquidity available',
    'liquidity shortage'
  ],
  [UltraErrorType.ROUTE_NOT_FOUND]: [
    'no route found',
    'route not available',
    'no swap route',
    'routing failed',
    'no valid route'
  ],
  [UltraErrorType.COMPUTE_BUDGET_EXCEEDED]: [
    'compute budget exceeded',
    'compute limit reached',
    'transaction too complex',
    'compute units exceeded',
    'cu limit exceeded'
  ],
  [UltraErrorType.BLOCKHASH_EXPIRED]: [
    'blockhash expired',
    'recent blockhash expired',
    'blockhash too old',
    'invalid blockhash',
    'stale blockhash'
  ],
  [UltraErrorType.TRANSACTION_TOO_LARGE]: [
    'transaction too large',
    'transaction size exceeded',
    'packet size too large',
    'transaction exceeds limit',
    'tx too big'
  ],
  [UltraErrorType.RATE_LIMIT_EXCEEDED]: [
    'rate limit exceeded',
    'too many requests',
    'api limit reached',
    'request throttled',
    'quota exceeded'
  ],
  [UltraErrorType.INVALID_TOKEN_ACCOUNT]: [
    'invalid token account',
    'token account not found',
    'account does not exist',
    'invalid account data',
    'account validation failed'
  ],
  [UltraErrorType.NETWORK_CONGESTION]: [
    'network congestion',
    'rpc overloaded',
    'network busy',
    'high network load',
    'congestion detected'
  ],
  [UltraErrorType.TIMEOUT_ERROR]: [
    'request timed out',
    'timeout',
    'request timeout',
    'connection timeout',
    'operation timed out'
  ]
};

/**
 * Priority level suggestions for different error types
 */
const PRIORITY_SUGGESTIONS: Record<UltraErrorType, PriorityLevel[]> = {
  [UltraErrorType.PRIORITY_FEE_TOO_LOW]: ['High', 'VeryHigh'],
  [UltraErrorType.DYNAMIC_SLIPPAGE_EXCEEDED]: ['VeryHigh'],
  [UltraErrorType.SHADOWLANE_UNAVAILABLE]: ['High', 'VeryHigh'],
  [UltraErrorType.ACCOUNT_INITIALIZATION_FAILED]: ['High', 'VeryHigh'],
  [UltraErrorType.INSUFFICIENT_LIQUIDITY]: ['Medium', 'High'],
  [UltraErrorType.ROUTE_NOT_FOUND]: ['Medium'],
  [UltraErrorType.COMPUTE_BUDGET_EXCEEDED]: ['High', 'VeryHigh'],
  [UltraErrorType.BLOCKHASH_EXPIRED]: ['High', 'VeryHigh'],
  [UltraErrorType.TRANSACTION_TOO_LARGE]: ['High'],
  [UltraErrorType.RATE_LIMIT_EXCEEDED]: ['Low', 'Medium'],
  [UltraErrorType.INVALID_TOKEN_ACCOUNT]: ['High'],
  [UltraErrorType.NETWORK_CONGESTION]: ['High', 'VeryHigh'],
  [UltraErrorType.JUPITER_ULTRA_API_ERROR]: ['Medium', 'High'],
  [UltraErrorType.NETWORK_ERROR]: ['Medium'],
  [UltraErrorType.TIMEOUT_ERROR]: ['Medium', 'High'],
  [UltraErrorType.UNKNOWN_ERROR]: ['Medium']
};

/**
 * Retry delay suggestions in milliseconds
 */
const RETRY_DELAYS: Record<UltraErrorType, number[]> = {
  [UltraErrorType.PRIORITY_FEE_TOO_LOW]: [1000, 2000, 5000], // Quick retries with higher priority
  [UltraErrorType.DYNAMIC_SLIPPAGE_EXCEEDED]: [500, 1000, 2000], // Fast retries for price changes
  [UltraErrorType.SHADOWLANE_UNAVAILABLE]: [2000, 5000, 10000], // Longer delays for service recovery
  [UltraErrorType.ACCOUNT_INITIALIZATION_FAILED]: [1000, 3000, 5000],
  [UltraErrorType.INSUFFICIENT_LIQUIDITY]: [5000, 10000, 30000], // Wait for liquidity to improve
  [UltraErrorType.ROUTE_NOT_FOUND]: [2000, 5000, 10000],
  [UltraErrorType.COMPUTE_BUDGET_EXCEEDED]: [1000, 2000, 5000],
  [UltraErrorType.BLOCKHASH_EXPIRED]: [500, 1000, 2000], // Quick retries for new blockhash
  [UltraErrorType.TRANSACTION_TOO_LARGE]: [0], // No retry - needs different approach
  [UltraErrorType.RATE_LIMIT_EXCEEDED]: [5000, 15000, 30000], // Respect rate limits
  [UltraErrorType.INVALID_TOKEN_ACCOUNT]: [1000, 3000, 5000],
  [UltraErrorType.NETWORK_CONGESTION]: [3000, 8000, 15000],
  [UltraErrorType.JUPITER_ULTRA_API_ERROR]: [1000, 3000, 8000],
  [UltraErrorType.NETWORK_ERROR]: [2000, 5000, 10000],
  [UltraErrorType.TIMEOUT_ERROR]: [3000, 8000, 15000],
  [UltraErrorType.UNKNOWN_ERROR]: [2000, 5000, 10000]
};

/**
 * Enhanced error information for Ultra-specific errors
 */
export interface UltraErrorInfo {
  type: UltraErrorType;
  message: string;
  userMessage: string;
  httpStatus: number;
  retryable: boolean;
  suggestedPriorityLevels: PriorityLevel[];
  retryDelays: number[];
  fallbackSuggestions: string[];
  troubleshootingSteps: string[];
  documentationUrl?: string;
}

/**
 * Detect Ultra-specific error type from error message
 */
function detectErrorType(errorMessage: string): UltraErrorType {
  const lowerMessage = errorMessage.toLowerCase();
  
  for (const [errorType, patterns] of Object.entries(ERROR_PATTERNS)) {
    if (patterns.some(pattern => lowerMessage.includes(pattern))) {
      return errorType as UltraErrorType;
    }
  }
  
  return UltraErrorType.UNKNOWN_ERROR;
}

/**
 * Get comprehensive error information for Ultra-specific errors
 */
function getUltraErrorInfo(errorType: UltraErrorType, originalMessage: string): UltraErrorInfo {
  const baseInfo = {
    type: errorType,
    message: originalMessage,
    suggestedPriorityLevels: PRIORITY_SUGGESTIONS[errorType] || ['Medium'],
    retryDelays: RETRY_DELAYS[errorType] || [2000, 5000, 10000]
  };

  switch (errorType) {
    case UltraErrorType.PRIORITY_FEE_TOO_LOW:
      return {
        ...baseInfo,
        userMessage: 'Transaction priority fee is too low for current network conditions. Try increasing the priority level to High or VeryHigh.',
        httpStatus: 400,
        retryable: true,
        fallbackSuggestions: [
          'Increase priority level to High or VeryHigh',
          'Wait for network congestion to decrease',
          'Try again in a few minutes'
        ],
        troubleshootingSteps: [
          '1. Select "High" or "VeryHigh" priority level',
          '2. Ensure you have sufficient SOL for priority fees (~0.001-0.01 SOL)',
          '3. Check network status at status.solana.com',
          '4. Consider waiting for off-peak hours'
        ],
        documentationUrl: 'https://docs.jup.ag/ultra-api/priority-fees'
      };

    case UltraErrorType.DYNAMIC_SLIPPAGE_EXCEEDED:
      return {
        ...baseInfo,
        userMessage: 'Price moved beyond acceptable slippage tolerance during transaction preparation. The market is volatile - please retry.',
        httpStatus: 400,
        retryable: true,
        fallbackSuggestions: [
          'Retry immediately - prices change quickly',
          'Increase manual slippage tolerance if available',
          'Use VeryHigh priority for faster execution',
          'Consider smaller trade amounts'
        ],
        troubleshootingSteps: [
          '1. Click retry immediately (prices change rapidly)',
          '2. If available, increase slippage tolerance to 1-2%',
          '3. Use VeryHigh priority for fastest execution',
          '4. Consider breaking large trades into smaller amounts'
        ],
        documentationUrl: 'https://docs.jup.ag/ultra-api/dynamic-slippage'
      };

    case UltraErrorType.SHADOWLANE_UNAVAILABLE:
      return {
        ...baseInfo,
        userMessage: 'ShadowLane fast-track service is temporarily unavailable. Your transaction will use standard processing.',
        httpStatus: 503,
        retryable: true,
        fallbackSuggestions: [
          'Retry in 30-60 seconds',
          'Transaction will still work via standard RPC',
          'Use High priority for better success rate',
          'Check Jupiter status page'
        ],
        troubleshootingSteps: [
          '1. Wait 30-60 seconds and retry',
          '2. Your transaction will still process via standard RPC',
          '3. Use High or VeryHigh priority for better success',
          '4. Check status at status.jup.ag'
        ],
        documentationUrl: 'https://docs.jup.ag/ultra-api/shadowlane'
      };

    case UltraErrorType.ACCOUNT_INITIALIZATION_FAILED:
      return {
        ...baseInfo,
        userMessage: 'Failed to create required token accounts. Ensure you have sufficient SOL balance (at least 0.05 SOL recommended).',
        httpStatus: 400,
        retryable: true,
        fallbackSuggestions: [
          'Ensure SOL balance > 0.05 SOL',
          'Use High priority for account creation',
          'Wait and retry if network is congested',
          'Check if token accounts already exist'
        ],
        troubleshootingSteps: [
          '1. Check your SOL balance (need >0.05 SOL)',
          '2. If balance is sufficient, use High priority',
          '3. Wait 30 seconds and retry if network is busy',
          '4. Contact support if problem persists'
        ],
        documentationUrl: 'https://docs.jup.ag/ultra-api/account-handling'
      };

    case UltraErrorType.INSUFFICIENT_LIQUIDITY:
      return {
        ...baseInfo,
        userMessage: 'Insufficient liquidity available for this trade size. Try a smaller amount or wait for liquidity to improve.',
        httpStatus: 400,
        retryable: true,
        fallbackSuggestions: [
          'Reduce trade amount by 25-50%',
          'Wait 5-10 minutes for liquidity to improve',
          'Check if token is actively traded',
          'Try different time of day'
        ],
        troubleshootingSteps: [
          '1. Reduce your trade amount by 25-50%',
          '2. Wait 5-10 minutes and try again',
          '3. Check token trading volume on DexScreener',
          '4. Consider trading during peak hours (US/EU)'
        ],
        documentationUrl: 'https://docs.jup.ag/concepts/liquidity'
      };

    case UltraErrorType.ROUTE_NOT_FOUND:
      return {
        ...baseInfo,
        userMessage: 'No trading route found for this token pair. The tokens may not be tradeable or have very low liquidity.',
        httpStatus: 400,
        retryable: true,
        fallbackSuggestions: [
          'Check if both tokens are valid and tradeable',
          'Try a different token pair',
          'Verify token addresses are correct',
          'Wait and retry - routes may become available'
        ],
        troubleshootingSteps: [
          '1. Verify both token addresses are correct',
          '2. Check if tokens are actively traded',
          '3. Try swapping to/from SOL or USDC first',
          '4. Wait 5 minutes and retry'
        ]
      };

    case UltraErrorType.COMPUTE_BUDGET_EXCEEDED:
      return {
        ...baseInfo,
        userMessage: 'Transaction is too complex and exceeds compute limits. Try using High priority or reducing trade complexity.',
        httpStatus: 400,
        retryable: true,
        fallbackSuggestions: [
          'Use High or VeryHigh priority',
          'Try smaller trade amounts',
          'Retry with different routing',
          'Wait for network to be less busy'
        ],
        troubleshootingSteps: [
          '1. Select High or VeryHigh priority level',
          '2. Try reducing trade amount by 25%',
          '3. Wait 2-3 minutes and retry',
          '4. Contact support if issue persists'
        ]
      };

    case UltraErrorType.BLOCKHASH_EXPIRED:
      return {
        ...baseInfo,
        userMessage: 'Transaction blockhash expired. This happens during network delays - please retry immediately.',
        httpStatus: 400,
        retryable: true,
        fallbackSuggestions: [
          'Retry immediately',
          'Use VeryHigh priority for faster processing',
          'Ensure stable internet connection'
        ],
        troubleshootingSteps: [
          '1. Click retry immediately',
          '2. Use VeryHigh priority if available',
          '3. Check your internet connection',
          '4. If repeated failures, wait 1 minute'
        ]
      };

    case UltraErrorType.TRANSACTION_TOO_LARGE:
      return {
        ...baseInfo,
        userMessage: 'Transaction size exceeds network limits. Try reducing the trade amount or using simpler routing.',
        httpStatus: 400,
        retryable: false,
        fallbackSuggestions: [
          'Reduce trade amount by 50%',
          'Split into multiple smaller trades',
          'Try direct token pairs (avoid complex routes)'
        ],
        troubleshootingSteps: [
          '1. Reduce trade amount by 50%',
          '2. Or split into 2-3 smaller trades',
          '3. Try swapping to SOL/USDC first, then to target token',
          '4. Contact support for large trades'
        ]
      };

    case UltraErrorType.RATE_LIMIT_EXCEEDED:
      return {
        ...baseInfo,
        userMessage: 'API rate limit exceeded. Please wait a moment before trying again.',
        httpStatus: 429,
        retryable: true,
        fallbackSuggestions: [
          'Wait 30-60 seconds before retrying',
          'Avoid rapid successive requests',
          'Use lower priority to reduce API load'
        ],
        troubleshootingSteps: [
          '1. Wait 30-60 seconds',
          '2. Avoid clicking multiple times rapidly',
          '3. Try again with normal timing',
          '4. Contact support if limits seem too restrictive'
        ]
      };

    case UltraErrorType.INVALID_TOKEN_ACCOUNT:
      return {
        ...baseInfo,
        userMessage: 'Invalid or missing token account. The system will attempt to create required accounts automatically.',
        httpStatus: 400,
        retryable: true,
        fallbackSuggestions: [
          'Retry - accounts will be created automatically',
          'Ensure sufficient SOL for account creation',
          'Use High priority for account operations'
        ],
        troubleshootingSteps: [
          '1. Retry - Ultra will create accounts automatically',
          '2. Ensure you have >0.05 SOL for account creation',
          '3. Use High priority level',
          '4. Wait 30 seconds if network is busy'
        ]
      };

    case UltraErrorType.NETWORK_CONGESTION:
      return {
        ...baseInfo,
        userMessage: 'Solana network is experiencing high congestion. Use High priority and expect longer confirmation times.',
        httpStatus: 503,
        retryable: true,
        fallbackSuggestions: [
          'Use VeryHigh priority for better success rate',
          'Wait for off-peak hours',
          'Expect longer confirmation times',
          'Check network status'
        ],
        troubleshootingSteps: [
          '1. Select VeryHigh priority level',
          '2. Be patient - confirmations may take 1-2 minutes',
          '3. Check network status at status.solana.com',
          '4. Consider waiting for off-peak hours'
        ],
        documentationUrl: 'https://status.solana.com'
      };

    case UltraErrorType.NETWORK_ERROR:
      return {
        ...baseInfo,
        userMessage: 'Network connection error. Please check your internet connection and retry.',
        httpStatus: 500,
        retryable: true,
        fallbackSuggestions: [
          'Check internet connection',
          'Retry in 30 seconds',
          'Try refreshing the page',
          'Check if Jupiter services are operational'
        ],
        troubleshootingSteps: [
          '1. Check your internet connection',
          '2. Wait 30 seconds and retry',
          '3. Refresh the page if needed',
          '4. Check status.jup.ag for service status'
        ]
      };

    case UltraErrorType.TIMEOUT_ERROR:
      return {
        ...baseInfo,
        userMessage: 'Request timed out. The network may be slow - please retry with High priority.',
        httpStatus: 504,
        retryable: true,
        fallbackSuggestions: [
          'Use High or VeryHigh priority',
          'Wait 1-2 minutes before retrying',
          'Check network conditions',
          'Ensure stable internet connection'
        ],
        troubleshootingSteps: [
          '1. Select High or VeryHigh priority',
          '2. Wait 1-2 minutes before retrying',
          '3. Check your internet connection stability',
          '4. Try again during off-peak hours'
        ]
      };

    default:
      return {
        ...baseInfo,
        userMessage: 'An unexpected error occurred. Please try again or contact support if the problem persists.',
        httpStatus: 500,
        retryable: true,
        fallbackSuggestions: [
          'Retry with Medium or High priority',
          'Wait 1-2 minutes and try again',
          'Check all input parameters',
          'Contact support if issue persists'
        ],
        troubleshootingSteps: [
          '1. Wait 1-2 minutes and retry',
          '2. Try with High priority level',
          '3. Verify all swap parameters are correct',
          '4. Contact support with error details'
        ]
      };
  }
}

/**
 * Enhanced error handler for Jupiter Ultra API errors
 */
export function handleUltraError(
  error: AxiosError | Error,
  requestId: string,
  endpoint: string,
  requestData?: any
): JupiterErrorResponse {
  let errorMessage = 'Unknown error occurred';
  let httpStatus = 500;
  let responseData: any = null;

  // Extract error information
  if (error instanceof AxiosError && error.response) {
    httpStatus = error.response.status;
    responseData = error.response.data;
    
    // Extract error message from various response formats
    if (responseData?.error) {
      if (typeof responseData.error === 'string') {
        errorMessage = responseData.error;
      } else if (responseData.error.message) {
        errorMessage = responseData.error.message;
      } else if (responseData.error.issues && Array.isArray(responseData.error.issues)) {
        // Handle Zod validation errors
        errorMessage = responseData.error.issues.map((issue: any) => issue.message).join(', ');
      } else if (responseData.error.name === 'ZodError') {
        errorMessage = 'Invalid request parameters';
      } else {
        errorMessage = JSON.stringify(responseData.error);
      }
    } else if (responseData?.message) {
      errorMessage = responseData.message;
    } else {
      errorMessage = error.message;
    }
  } else {
    errorMessage = error.message || 'Unknown error occurred';
  }

  // Ensure errorMessage is a string
  if (typeof errorMessage !== 'string') {
    errorMessage = String(errorMessage || 'Unknown error occurred');
  }

  // Detect Ultra-specific error type
  const errorType = detectErrorType(errorMessage);
  const errorInfo = getUltraErrorInfo(errorType, errorMessage);

  // Log comprehensive error information
  logger.error('Jupiter Ultra API error detected', {
    requestId,
    endpoint,
    errorType,
    originalMessage: errorMessage,
    httpStatus,
    retryable: errorInfo.retryable,
    suggestedPriorityLevels: errorInfo.suggestedPriorityLevels,
    retryDelays: errorInfo.retryDelays,
    requestData: requestData ? {
      userPublicKey: requestData.userPublicKey,
      priorityLevel: requestData.priorityLevel,
      dynamicSlippage: requestData.dynamicSlippage,
      hasQuoteResponse: !!requestData.quoteResponse
    } : undefined,
    responseData,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  });

  // Return enhanced error response
  return {
    success: false,
    error: {
      code: errorInfo.type,
      message: errorInfo.userMessage,
      details: {
        originalError: errorMessage,
        retryable: errorInfo.retryable,
        suggestedPriorityLevels: errorInfo.suggestedPriorityLevels,
        retryDelays: errorInfo.retryDelays,
        fallbackSuggestions: errorInfo.fallbackSuggestions,
        troubleshootingSteps: errorInfo.troubleshootingSteps,
        documentationUrl: errorInfo.documentationUrl,
        requestId,
        httpStatus: errorInfo.httpStatus
      },
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Check if an error is retryable based on its type
 */
export function isRetryableError(errorType: UltraErrorType): boolean {
  const nonRetryableErrors = [
    UltraErrorType.TRANSACTION_TOO_LARGE,
    UltraErrorType.ROUTE_NOT_FOUND
  ];
  
  return !nonRetryableErrors.includes(errorType);
}

/**
 * Get suggested retry delay for an error type
 */
export function getRetryDelay(errorType: UltraErrorType, attemptNumber: number): number {
  const delays = RETRY_DELAYS[errorType] || [2000, 5000, 10000];
  const index = Math.min(attemptNumber - 1, delays.length - 1);
  return delays[index];
}

/**
 * Get priority level suggestions for an error type
 */
export function getPriorityLevelSuggestions(errorType: UltraErrorType): PriorityLevel[] {
  return PRIORITY_SUGGESTIONS[errorType] || ['Medium'];
}

/**
 * Detect Ultra-specific error type from error message (exported for external use)
 */
export function detectUltraErrorType(errorMessage: string): UltraErrorType {
  return detectErrorType(errorMessage);
}