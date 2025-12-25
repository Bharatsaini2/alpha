/**
 * Priority Level Utilities for Jupiter Ultra API
 * 
 * This module provides utilities for mapping legacy priority fees to Ultra priority levels,
 * implementing default priority logic, and selecting optimal priority levels based on trade characteristics.
 * 
 * Requirements: 15.3, 16.2, 18.1
 */

import { PriorityLevel } from '../types/jupiter.types';
import { logger } from '../config/logger';
import { validateAndLogEnv } from '../config/envValidation';

// Get validated environment configuration
const envConfig = validateAndLogEnv();

/**
 * Default priority level configuration
 */
const DEFAULT_PRIORITY_LEVEL: PriorityLevel = 'High';

/**
 * Environment variable for configurable default priority
 * Allows operators to adjust default priority without code changes
 */
export function getDefaultPriorityLevel(): PriorityLevel {
  // Use validated environment config instead of direct process.env access
  const envPriority = envConfig.JUPITER_DEFAULT_PRIORITY as PriorityLevel;
  
  // The environment validation already ensures this is a valid priority level
  logger.info('Using default priority level from validated config', {
    defaultPriority: envPriority,
    timestamp: new Date().toISOString(),
  });
  
  return envPriority;
}

/**
 * Map legacy prioritizationFeeLamports to Ultra priority level
 * 
 * This function provides backward compatibility for clients still using
 * the old prioritizationFeeLamports parameter.
 * 
 * Mapping based on typical fee ranges:
 * - < 1,000 lamports (~$0.0002): Low priority
 * - 1,000-4,999 lamports (~$0.0002-$0.001): Medium priority  
 * - 5,000-9,999 lamports (~$0.001-$0.002): High priority
 * - >= 10,000 lamports (~$0.002+): VeryHigh priority
 * 
 * @param lamports - Legacy priority fee in lamports
 * @returns Corresponding Ultra priority level
 */
export function mapLamportsToPriorityLevel(lamports: number): PriorityLevel {
  if (lamports < 0) {
    logger.warn('Negative prioritizationFeeLamports provided, using default', {
      lamports,
      defaultPriority: getDefaultPriorityLevel(),
      timestamp: new Date().toISOString(),
    });
    return getDefaultPriorityLevel();
  }
  
  if (lamports < 1000) {
    return 'Low';
  } else if (lamports < 5000) {
    return 'Medium';
  } else if (lamports < 10000) {
    return 'High';
  } else {
    return 'VeryHigh';
  }
}

/**
 * Priority level selection logic based on trade amount
 * 
 * This function implements intelligent priority level selection based on
 * trade characteristics to optimize for both cost and execution speed.
 * 
 * Logic:
 * - Large trades (>$10k equivalent): VeryHigh priority for fast execution
 * - Medium trades ($1k-$10k): High priority (balanced speed/cost)
 * - Small trades (<$1k): Medium priority (cost-conscious)
 * - Micro trades (<$100): Low priority (maximum cost savings)
 * 
 * @param tradeAmountUsd - Trade amount in USD equivalent
 * @param tokenVolatility - Token volatility level ('low', 'medium', 'high')
 * @returns Recommended priority level
 */
export function selectPriorityLevelByTradeAmount(
  tradeAmountUsd: number,
  tokenVolatility: 'low' | 'medium' | 'high' = 'medium'
): PriorityLevel {
  // Validate input
  if (tradeAmountUsd < 0) {
    logger.warn('Negative trade amount provided for priority selection', {
      tradeAmountUsd,
      defaultPriority: getDefaultPriorityLevel(),
      timestamp: new Date().toISOString(),
    });
    return getDefaultPriorityLevel();
  }
  
  // Large trades always get VeryHigh priority regardless of volatility
  if (tradeAmountUsd > 10000) {
    logger.info('Large trade detected, using VeryHigh priority', {
      tradeAmountUsd,
      selectedPriority: 'VeryHigh',
      reason: 'large_trade',
      timestamp: new Date().toISOString(),
    });
    return 'VeryHigh';
  }
  
  // High volatility tokens get elevated priority for faster execution
  if (tokenVolatility === 'high') {
    if (tradeAmountUsd > 1000) {
      return 'VeryHigh';
    } else if (tradeAmountUsd > 100) {
      return 'High';
    } else {
      return 'Medium';
    }
  }
  
  // Standard priority selection based on trade size
  if (tradeAmountUsd > 1000) {
    return 'High';
  } else if (tradeAmountUsd > 100) {
    return 'Medium';
  } else {
    return 'Low';
  }
}

/**
 * Estimate priority fee cost in USD for different priority levels
 * 
 * These are rough estimates based on typical network conditions.
 * Actual costs may vary based on network congestion.
 * 
 * @param priorityLevel - Priority level to estimate cost for
 * @param solPriceUsd - Current SOL price in USD (default: $200)
 * @returns Estimated cost in USD
 */
export function estimatePriorityFeeCost(
  priorityLevel: PriorityLevel,
  solPriceUsd: number = 200
): number {
  const lamportsPerSol = 1_000_000_000;
  
  // Estimated lamports for each priority level
  const estimatedLamports: Record<PriorityLevel, number> = {
    Low: 1000,      // ~$0.0002
    Medium: 5000,   // ~$0.001
    High: 10000,    // ~$0.002
    VeryHigh: 50000 // ~$0.01
  };
  
  const lamports = estimatedLamports[priorityLevel];
  const solAmount = lamports / lamportsPerSol;
  const usdCost = solAmount * solPriceUsd;
  
  return Math.round(usdCost * 10000) / 10000; // Round to 4 decimal places
}

/**
 * Get priority level display information for UI
 * 
 * @param priorityLevel - Priority level to get info for
 * @returns Display information including name, description, and estimated cost
 */
export function getPriorityLevelInfo(priorityLevel: PriorityLevel, solPriceUsd: number = 200) {
  const cost = estimatePriorityFeeCost(priorityLevel, solPriceUsd);
  
  const info = {
    Low: {
      name: 'Low',
      description: 'Cost-optimized, slower execution',
      estimatedCostUsd: cost,
      recommendedFor: 'Small trades, non-urgent swaps',
    },
    Medium: {
      name: 'Medium',
      description: 'Balanced speed and cost',
      estimatedCostUsd: cost,
      recommendedFor: 'Regular trades, moderate urgency',
    },
    High: {
      name: 'High',
      description: 'Fast execution, recommended default',
      estimatedCostUsd: cost,
      recommendedFor: 'Most trades, good balance',
    },
    VeryHigh: {
      name: 'Very High',
      description: 'Fastest execution, premium cost',
      estimatedCostUsd: cost,
      recommendedFor: 'Large trades, time-critical swaps',
    },
  };
  
  return info[priorityLevel];
}

/**
 * Validate priority level value
 * 
 * @param priorityLevel - Priority level to validate
 * @returns True if valid, false otherwise
 */
export function isValidPriorityLevel(priorityLevel: any): priorityLevel is PriorityLevel {
  return typeof priorityLevel === 'string' && 
         ['Low', 'Medium', 'High', 'VeryHigh'].includes(priorityLevel);
}

/**
 * Normalize priority level input with fallback to default
 * 
 * @param priorityLevel - Priority level input (may be invalid)
 * @returns Valid priority level
 */
export function normalizePriorityLevel(priorityLevel: any): PriorityLevel {
  if (isValidPriorityLevel(priorityLevel)) {
    return priorityLevel;
  }
  
  logger.warn('Invalid priority level provided, using default', {
    providedValue: priorityLevel,
    defaultValue: getDefaultPriorityLevel(),
    timestamp: new Date().toISOString(),
  });
  
  return getDefaultPriorityLevel();
}