import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { validateAndLogEnv } from '../config/envValidation';

/**
 * Jupiter API Client Configuration
 * 
 * This utility provides a configured Axios instance for interacting with Jupiter's
 * DEX aggregator API with built-in retry logic and error handling.
 * 
 * Features:
 * - Automatic retry on rate limits (HTTP 429)
 * - Exponential backoff for failed requests
 * - 5 second timeout enforcement
 * - API key authentication
 * - Environment variable validation with fallbacks
 */

// Validate environment variables and get configuration with fallbacks
const envConfig = validateAndLogEnv();

// Create configured Axios instance
const jupiterClient: AxiosInstance = axios.create({
  baseURL: envConfig.JUPITER_BASE_URL,
  timeout: 15000, // 15 second timeout (Jupiter can be slow)
  headers: {
    'Content-Type': 'application/json',
    ...(envConfig.JUPITER_API_KEY && {
      'x-api-key': envConfig.JUPITER_API_KEY,
    }),
  },
});

/**
 * Configure axios-retry for resilient API calls
 * 
 * Retry Strategy:
 * - 3 retry attempts
 * - Exponential backoff: baseDelay * (2 ^ retryCount)
 * - Retries on: HTTP 429, 5xx errors, network errors, timeouts
 */
axiosRetry(jupiterClient, {
  retries: 3,
  
  // Exponential backoff: 1s, 2s, 4s
  retryDelay: (retryCount: number) => {
    const baseDelay = 1000; // 1 second
    const delay = baseDelay * Math.pow(2, retryCount - 1);
    return delay;
  },
  
  // Retry conditions
  retryCondition: (error: AxiosError) => {
    // Retry on network errors
    if (axiosRetry.isNetworkError(error)) {
      return true;
    }
    
    // Retry on timeout errors
    if (error.code === 'ECONNABORTED') {
      return true;
    }
    
    // Retry on rate limit (429) and server errors (5xx)
    if (error.response) {
      const status = error.response.status;
      return status === 429 || (status >= 500 && status < 600);
    }
    
    return false;
  },
  
  // Log retry attempts (optional, can be removed in production)
  onRetry: (retryCount: number, error: AxiosError, requestConfig: any) => {
    console.warn(
      `[Jupiter Client] Retry attempt ${retryCount} for ${requestConfig.url}`,
      {
        status: error.response?.status,
        message: error.message,
      }
    );
  },
});

export default jupiterClient;
export { jupiterClient, envConfig };
