/**
 * Test suite for Jupiter Ultra API error handling
 * 
 * Tests comprehensive error handling, fallback mechanisms, and user-friendly error messages
 * for various Ultra-specific error scenarios.
 */

import { handleUltraError, UltraErrorType, detectUltraErrorType } from '../../utils/ultraErrorHandler';
import { shouldUseFallback, UltraErrorType as FallbackErrorType } from '../../utils/jupiterFallback';

// Mock dependencies
jest.mock('../../config/logger');

describe('Jupiter Ultra Error Handling', () => {
  describe('Error Type Detection', () => {
    test('should detect Priority Fee Too Low error', () => {
      const errorMessage = 'Transaction failed: priority fee too low for current network conditions';
      const errorType = detectUltraErrorType(errorMessage);
      expect(errorType).toBe(UltraErrorType.PRIORITY_FEE_TOO_LOW);
    });

    test('should detect Dynamic Slippage Exceeded error', () => {
      const errorMessage = 'Swap failed: dynamic slippage exceeded due to price movement';
      const errorType = detectUltraErrorType(errorMessage);
      expect(errorType).toBe(UltraErrorType.DYNAMIC_SLIPPAGE_EXCEEDED);
    });

    test('should detect ShadowLane Unavailable error', () => {
      const errorMessage = 'shadowlane service temporarily unavailable';
      const errorType = detectUltraErrorType(errorMessage);
      expect(errorType).toBe(UltraErrorType.SHADOWLANE_UNAVAILABLE);
    });

    test('should detect Account Initialization Failed error', () => {
      const errorMessage = 'Account initialization failed: insufficient SOL for account creation';
      const errorType = detectUltraErrorType(errorMessage);
      expect(errorType).toBe(UltraErrorType.ACCOUNT_INITIALIZATION_FAILED);
    });

    test('should detect Insufficient Liquidity error', () => {
      const errorMessage = 'Swap failed: insufficient liquidity for requested amount';
      const errorType = detectUltraErrorType(errorMessage);
      expect(errorType).toBe(UltraErrorType.INSUFFICIENT_LIQUIDITY);
    });

    test('should detect Network Congestion error', () => {
      const errorMessage = 'Network congestion detected, transaction may be delayed';
      const errorType = detectUltraErrorType(errorMessage);
      expect(errorType).toBe(UltraErrorType.NETWORK_CONGESTION);
    });

    test('should default to UNKNOWN_ERROR for unrecognized messages', () => {
      const errorMessage = 'Some completely unknown error occurred';
      const errorType = detectUltraErrorType(errorMessage);
      expect(errorType).toBe(UltraErrorType.UNKNOWN_ERROR);
    });
  });

  describe('Error Response Generation', () => {
    test('should generate comprehensive error response for Priority Fee Too Low', () => {
      const error = new Error('priority fee too low');
      const errorResponse = handleUltraError(error, 'test-request-id', '/order');

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.code).toBe(UltraErrorType.PRIORITY_FEE_TOO_LOW);
      expect(errorResponse.error.message).toContain('priority fee is too low');
      expect(errorResponse.error.details.retryable).toBe(true);
      expect(errorResponse.error.details.suggestedPriorityLevels).toContain('High');
      expect(errorResponse.error.details.suggestedPriorityLevels).toContain('VeryHigh');
      expect(errorResponse.error.details.fallbackSuggestions).toBeDefined();
      expect(errorResponse.error.details.troubleshootingSteps).toBeDefined();
    });

    test('should generate comprehensive error response for Dynamic Slippage Exceeded', () => {
      const error = new Error('dynamic slippage exceeded');
      const errorResponse = handleUltraError(error, 'test-request-id', '/order');

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.code).toBe(UltraErrorType.DYNAMIC_SLIPPAGE_EXCEEDED);
      expect(errorResponse.error.message).toContain('slippage tolerance');
      expect(errorResponse.error.details.retryable).toBe(true);
      expect(errorResponse.error.details.suggestedPriorityLevels).toContain('VeryHigh');
      expect(errorResponse.error.details.retryDelays).toEqual([500, 1000, 2000]);
    });

    test('should generate comprehensive error response for ShadowLane Unavailable', () => {
      const error = new Error('shadowlane unavailable');
      const errorResponse = handleUltraError(error, 'test-request-id', '/order');

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.code).toBe(UltraErrorType.SHADOWLANE_UNAVAILABLE);
      expect(errorResponse.error.message).toContain('ShadowLane');
      expect(errorResponse.error.details.retryable).toBe(true);
      expect(errorResponse.error.details.fallbackSuggestions).toContain('Retry in 30-60 seconds');
      expect(errorResponse.error.details.troubleshootingSteps[0]).toContain('Wait 30-60 seconds');
    });

    test('should generate comprehensive error response for Account Initialization Failed', () => {
      const error = new Error('account initialization failed');
      const errorResponse = handleUltraError(error, 'test-request-id', '/order');

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.code).toBe(UltraErrorType.ACCOUNT_INITIALIZATION_FAILED);
      expect(errorResponse.error.message).toContain('sufficient SOL balance');
      expect(errorResponse.error.details.retryable).toBe(true);
      expect(errorResponse.error.details.fallbackSuggestions).toContain('Ensure SOL balance > 0.05 SOL');
    });

    test('should mark Transaction Too Large as non-retryable', () => {
      const error = new Error('transaction too large');
      const errorResponse = handleUltraError(error, 'test-request-id', '/order');

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.code).toBe(UltraErrorType.TRANSACTION_TOO_LARGE);
      expect(errorResponse.error.details.retryable).toBe(false);
      expect(errorResponse.error.details.fallbackSuggestions).toContain('Reduce trade amount by 50%');
    });
  });

  describe('Fallback Logic', () => {
    test('should trigger fallback for Service Unavailable', () => {
      expect(shouldUseFallback(FallbackErrorType.SERVICE_UNAVAILABLE)).toBe(true);
    });

    test('should trigger fallback for Network Error', () => {
      expect(shouldUseFallback(FallbackErrorType.NETWORK_ERROR)).toBe(true);
    });

    test('should trigger fallback for Timeout', () => {
      expect(shouldUseFallback(FallbackErrorType.TIMEOUT)).toBe(true);
    });

    test('should NOT trigger fallback for Rate Limit', () => {
      expect(shouldUseFallback(FallbackErrorType.RATE_LIMIT)).toBe(false);
    });

    test('should NOT trigger fallback for Invalid Request', () => {
      expect(shouldUseFallback(FallbackErrorType.INVALID_REQUEST)).toBe(false);
    });

    test('should NOT trigger fallback for Unknown Error', () => {
      expect(shouldUseFallback(FallbackErrorType.UNKNOWN)).toBe(false);
    });
  });

  describe('HTTP Status Code Mapping', () => {
    test('should return 400 for Priority Fee Too Low', () => {
      const error = new Error('priority fee too low');
      const errorResponse = handleUltraError(error, 'test-id', '/order');
      expect(errorResponse.error.details.httpStatus).toBe(400);
    });

    test('should return 400 for Dynamic Slippage Exceeded', () => {
      const error = new Error('dynamic slippage exceeded');
      const errorResponse = handleUltraError(error, 'test-id', '/order');
      expect(errorResponse.error.details.httpStatus).toBe(400);
    });

    test('should return 400 for Account Initialization Failed', () => {
      const error = new Error('account initialization failed');
      const errorResponse = handleUltraError(error, 'test-id', '/order');
      expect(errorResponse.error.details.httpStatus).toBe(400);
    });

    test('should return 429 for rate limit errors', () => {
      const error = new Error('rate limit exceeded');
      const errorResponse = handleUltraError(error, 'test-id', '/order');
      expect(errorResponse.error.details.httpStatus).toBe(429);
    });

    test('should return 503 for ShadowLane Unavailable', () => {
      const error = new Error('shadowlane unavailable');
      const errorResponse = handleUltraError(error, 'test-id', '/order');
      expect(errorResponse.error.details.httpStatus).toBe(503);
    });

    test('should return 503 for Network Congestion', () => {
      const error = new Error('network congestion');
      const errorResponse = handleUltraError(error, 'test-id', '/order');
      expect(errorResponse.error.details.httpStatus).toBe(503);
    });

    test('should return 504 for timeout errors', () => {
      const error = new Error('request timed out');
      const errorResponse = handleUltraError(error, 'test-id', '/order');
      expect(errorResponse.error.details.httpStatus).toBe(504);
    });
  });

  describe('Error Message Quality', () => {
    test('should provide user-friendly messages without technical jargon', () => {
      const error = new Error('priority fee too low');
      const errorResponse = handleUltraError(error, 'test-id', '/order');
      
      expect(errorResponse.error.message).not.toContain('lamports');
      expect(errorResponse.error.message).not.toContain('RPC');
      expect(errorResponse.error.message).not.toContain('API');
      expect(errorResponse.error.message).toContain('priority level');
    });

    test('should include actionable troubleshooting steps', () => {
      const error = new Error('account initialization failed');
      const errorResponse = handleUltraError(error, 'test-id', '/order');
      
      const steps = errorResponse.error.details.troubleshootingSteps;
      expect(steps).toHaveLength(4);
      expect(steps[0]).toMatch(/^1\./);
      expect(steps[1]).toMatch(/^2\./);
      expect(steps[2]).toMatch(/^3\./);
      expect(steps[3]).toMatch(/^4\./);
    });

    test('should provide specific SOL amount recommendations', () => {
      const error = new Error('account initialization failed');
      const errorResponse = handleUltraError(error, 'test-id', '/order');
      
      expect(errorResponse.error.message).toContain('0.05 SOL');
      expect(errorResponse.error.details.fallbackSuggestions.join(' ')).toContain('0.05 SOL');
    });

    test('should include documentation URLs where available', () => {
      const errorWithDocs = new Error('priority fee too low');
      const errorResponse = handleUltraError(errorWithDocs, 'test-id', '/order');
      
      expect(errorResponse.error.details.documentationUrl).toBeDefined();
      expect(errorResponse.error.details.documentationUrl).toContain('docs.jup.ag');
    });
  });

  describe('Retry Delay Recommendations', () => {
    test('should provide appropriate retry delays for Priority Fee Too Low', () => {
      const error = new Error('priority fee too low');
      const errorResponse = handleUltraError(error, 'test-id', '/order');
      expect(errorResponse.error.details.retryDelays).toEqual([1000, 2000, 5000]);
    });

    test('should provide appropriate retry delays for Dynamic Slippage Exceeded', () => {
      const error = new Error('dynamic slippage exceeded');
      const errorResponse = handleUltraError(error, 'test-id', '/order');
      expect(errorResponse.error.details.retryDelays).toEqual([500, 1000, 2000]);
    });

    test('should provide appropriate retry delays for ShadowLane Unavailable', () => {
      const error = new Error('shadowlane unavailable');
      const errorResponse = handleUltraError(error, 'test-id', '/order');
      expect(errorResponse.error.details.retryDelays).toEqual([2000, 5000, 10000]);
    });

    test('should provide appropriate retry delays for Rate Limit Exceeded', () => {
      const error = new Error('rate limit exceeded');
      const errorResponse = handleUltraError(error, 'test-id', '/order');
      expect(errorResponse.error.details.retryDelays).toEqual([5000, 15000, 30000]);
    });
  });

  describe('Priority Level Suggestions', () => {
    test('should suggest High and VeryHigh for Priority Fee Too Low', () => {
      const error = new Error('priority fee too low');
      const errorResponse = handleUltraError(error, 'test-id', '/order');
      expect(errorResponse.error.details.suggestedPriorityLevels).toEqual(['High', 'VeryHigh']);
    });

    test('should suggest VeryHigh for Dynamic Slippage Exceeded', () => {
      const error = new Error('dynamic slippage exceeded');
      const errorResponse = handleUltraError(error, 'test-id', '/order');
      expect(errorResponse.error.details.suggestedPriorityLevels).toEqual(['VeryHigh']);
    });

    test('should suggest High and VeryHigh for Network Congestion', () => {
      const error = new Error('network congestion');
      const errorResponse = handleUltraError(error, 'test-id', '/order');
      expect(errorResponse.error.details.suggestedPriorityLevels).toEqual(['High', 'VeryHigh']);
    });

    test('should suggest Medium and High for Insufficient Liquidity', () => {
      const error = new Error('insufficient liquidity');
      const errorResponse = handleUltraError(error, 'test-id', '/order');
      expect(errorResponse.error.details.suggestedPriorityLevels).toEqual(['Medium', 'High']);
    });
  });
});

describe('Error Response Structure Validation', () => {
  test('should always include required error response fields', () => {
    const error = new Error('test error');
    const errorResponse = handleUltraError(error, 'test-id', '/order');

    // Validate top-level structure
    expect(errorResponse).toHaveProperty('success', false);
    expect(errorResponse).toHaveProperty('error');
    expect(errorResponse.error).toHaveProperty('code');
    expect(errorResponse.error).toHaveProperty('message');
    expect(errorResponse.error).toHaveProperty('details');
    expect(errorResponse.error).toHaveProperty('timestamp');

    // Validate details structure
    const details = errorResponse.error.details;
    expect(details).toHaveProperty('originalError');
    expect(details).toHaveProperty('retryable');
    expect(details).toHaveProperty('suggestedPriorityLevels');
    expect(details).toHaveProperty('retryDelays');
    expect(details).toHaveProperty('fallbackSuggestions');
    expect(details).toHaveProperty('troubleshootingSteps');
    expect(details).toHaveProperty('requestId');
    expect(details).toHaveProperty('httpStatus');

    // Validate data types
    expect(typeof details.retryable).toBe('boolean');
    expect(Array.isArray(details.suggestedPriorityLevels)).toBe(true);
    expect(Array.isArray(details.retryDelays)).toBe(true);
    expect(Array.isArray(details.fallbackSuggestions)).toBe(true);
    expect(Array.isArray(details.troubleshootingSteps)).toBe(true);
    expect(typeof details.httpStatus).toBe('number');
  });

  test('should include timestamp in ISO format', () => {
    const error = new Error('test error');
    const errorResponse = handleUltraError(error, 'test-id', '/order');

    const timestamp = errorResponse.error.timestamp;
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });
});