/**
 * Jupiter Ultra Configuration
 * 
 * This module provides configuration for Jupiter Ultra API.
 * The system uses only Jupiter Ultra - no fallback to standard API.
 */

import { validateAndLogEnv } from './envValidation';

// Get validated environment configuration
const envConfig = validateAndLogEnv();

export interface JupiterUltraConfig {
  baseUrl: string;
  apiKey: string | undefined;
  referralKey: string | undefined;
  defaultPriority: string;
  enableDynamicSlippage: boolean;
  timeout: number;
}

/**
 * Get Jupiter Ultra configuration
 */
export function getJupiterUltraConfig(): JupiterUltraConfig {
  return {
    baseUrl: envConfig.JUPITER_ULTRA_URL,
    apiKey: envConfig.JUPITER_API_KEY,
    referralKey: envConfig.JUPITER_REFERRAL_KEY,
    defaultPriority: envConfig.JUPITER_DEFAULT_PRIORITY,
    enableDynamicSlippage: envConfig.JUPITER_ENABLE_DYNAMIC_SLIPPAGE,
    timeout: 10000, // 10 seconds
  };
}

/**
 * Get system status for Jupiter Ultra
 */
export function getJupiterSystemStatus() {
  const config = getJupiterUltraConfig();
  
  return {
    service: 'Jupiter Ultra',
    version: 'v1',
    endpoint: config.baseUrl,
    hasApiKey: !!config.apiKey,
    hasReferralKey: !!config.referralKey,
    defaultPriority: config.defaultPriority,
    dynamicSlippage: config.enableDynamicSlippage,
    timeout: config.timeout,
    status: 'active',
    fallbackEnabled: false, // No fallback - Ultra only
  };
}

/**
 * Validate Jupiter Ultra configuration
 */
export function validateJupiterUltraConfig(): { isValid: boolean; issues: string[] } {
  const config = getJupiterUltraConfig();
  const issues: string[] = [];

  if (!config.baseUrl) {
    issues.push('JUPITER_ULTRA_URL is not configured');
  }

  if (!config.apiKey) {
    issues.push('JUPITER_API_KEY is not configured - API calls may be rate limited');
  }

  if (!config.referralKey) {
    issues.push('JUPITER_REFERRAL_KEY is not configured - platform fees will not be collected');
  }

  const validPriorities = ['Low', 'Medium', 'High', 'VeryHigh'];
  if (!validPriorities.includes(config.defaultPriority)) {
    issues.push(`Invalid default priority: ${config.defaultPriority}`);
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

export default {
  getJupiterUltraConfig,
  getJupiterSystemStatus,
  validateJupiterUltraConfig,
};