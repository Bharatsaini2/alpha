/**
 * Jupiter Fallback Utility
 * 
 * Provides fallback mechanisms when Jupiter Ultra API is unavailable or fails.
 * Implements circuit breaker pattern and fallback to standard Jupiter API.
 */

import axios from 'axios';
import { logger } from '../config/logger';
import { UltraSwapRequest, JupiterSwapResponse } from '../types/jupiter.types';

export enum UltraErrorType {
  RATE_LIMIT = 'RATE_LIMIT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INVALID_REQUEST = 'INVALID_REQUEST',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Detect the type of Ultra API error
 */
export function detectUltraErrorType(errorMessage: string): UltraErrorType {
  const message = errorMessage.toLowerCase();
  
  if (message.includes('rate limit') || message.includes('429')) {
    return UltraErrorType.RATE_LIMIT;
  }
  
  if (message.includes('service unavailable') || message.includes('503')) {
    return UltraErrorType.SERVICE_UNAVAILABLE;
  }
  
  if (message.includes('timeout') || message.includes('econnaborted')) {
    return UltraErrorType.TIMEOUT;
  }
  
  if (message.includes('network') || message.includes('enotfound')) {
    return UltraErrorType.NETWORK_ERROR;
  }
  
  if (message.includes('invalid') || message.includes('400')) {
    return UltraErrorType.INVALID_REQUEST;
  }
  
  return UltraErrorType.UNKNOWN;
}

/**
 * Determine if we should use fallback for this error type
 */
export function shouldUseFallback(errorType: UltraErrorType): boolean {
  // Use fallback for service issues, but not for client errors
  return [
    UltraErrorType.SERVICE_UNAVAILABLE,
    UltraErrorType.NETWORK_ERROR,
    UltraErrorType.TIMEOUT,
  ].includes(errorType);
}

/**
 * Fallback to standard Jupiter API when Ultra is unavailable
 */
export async function fallbackSwapTransaction(
  request: UltraSwapRequest,
  requestId: string,
  originalError: string
): Promise<JupiterSwapResponse> {
  logger.warn('Executing fallback to standard Jupiter API', {
    requestId,
    originalError,
    timestamp: new Date().toISOString(),
  });

  // Convert Ultra request to standard Jupiter format
  const standardRequest = {
    quoteResponse: request.quoteResponse,
    userPublicKey: request.userPublicKey,
    wrapAndUnwrapSol: request.wrapAndUnwrapSol,
    feeAccount: request.feeAccount,
    // Remove Ultra-specific parameters
  };

  try {
    // Call standard Jupiter API
    const response = await axios.post(
      'https://quote-api.jup.ag/v6/swap',
      standardRequest,
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info('Fallback to standard Jupiter API successful', {
      requestId,
      timestamp: new Date().toISOString(),
    });

    return response.data;
  } catch (fallbackError: any) {
    logger.error('Fallback to standard Jupiter API failed', {
      requestId,
      originalError,
      fallbackError: fallbackError.message,
      timestamp: new Date().toISOString(),
    });

    // Re-throw the original Ultra error since fallback also failed
    throw new Error(`Jupiter Ultra failed: ${originalError}. Fallback also failed: ${fallbackError.message}`);
  }
}

/**
 * Simple circuit breaker implementation
 */
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private readonly threshold = 5; // Open circuit after 5 failures
  private readonly timeout = 60000; // 1 minute timeout

  async execute<T>(operation: () => Promise<T>, requestId: string): Promise<T> {
    if (this.isOpen()) {
      throw new Error('Circuit breaker is open - Jupiter Ultra temporarily unavailable');
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private isOpen(): boolean {
    return this.failures >= this.threshold && 
           (Date.now() - this.lastFailureTime) < this.timeout;
  }

  private onSuccess(): void {
    this.failures = 0;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
  }
}

export const jupiterUltraCircuitBreaker = new CircuitBreaker();

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      if (attempt === maxRetries) {
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Get retry strategy based on error type
 */
export function getRetryStrategy(errorType: UltraErrorType): { shouldRetry: boolean; delay: number } {
  switch (errorType) {
    case UltraErrorType.RATE_LIMIT:
      return { shouldRetry: true, delay: 5000 }; // 5 second delay for rate limits
    
    case UltraErrorType.SERVICE_UNAVAILABLE:
    case UltraErrorType.NETWORK_ERROR:
      return { shouldRetry: true, delay: 2000 }; // 2 second delay for service issues
    
    case UltraErrorType.TIMEOUT:
      return { shouldRetry: true, delay: 1000 }; // 1 second delay for timeouts
    
    case UltraErrorType.INVALID_REQUEST:
      return { shouldRetry: false, delay: 0 }; // Don't retry client errors
    
    default:
      return { shouldRetry: false, delay: 0 };
  }
}