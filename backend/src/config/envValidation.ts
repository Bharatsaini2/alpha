/**
 * Environment Variable Validation Utility
 * 
 * This module validates required environment variables at startup and provides
 * fallback values where appropriate. It logs warnings for missing variables
 * to help with debugging and configuration issues.
 */

interface EnvConfig {
  JUPITER_BASE_URL: string;
  JUPITER_ULTRA_URL: string;
  JUPITER_API_KEY: string | undefined;
  JUPITER_REFERRAL_KEY: string | undefined;
  JUPITER_DEFAULT_PRIORITY: string;
  JUPITER_ENABLE_DYNAMIC_SLIPPAGE: boolean;
  MAILGUN_API_KEY: string | undefined;
  MAILGUN_DOMAIN: string | undefined;
  TELEGRAM_BOT_TOKEN: string | undefined;
}

interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  config: EnvConfig;
}

/**
 * Default fallback values for Jupiter Ultra configuration
 */
const DEFAULTS = {
  JUPITER_BASE_URL: 'https://quote-api.jup.ag/v6',
  JUPITER_ULTRA_URL: 'https://api.jup.ag/ultra/v1',
  JUPITER_DEFAULT_PRIORITY: 'High',
  JUPITER_ENABLE_DYNAMIC_SLIPPAGE: true,
};

/**
 * Validates Jupiter Ultra environment variables
 * 
 * @returns ValidationResult with config and any warnings
 */
export function validateJupiterEnv(): ValidationResult {
  const warnings: string[] = [];

  // Validate JUPITER_BASE_URL (for quotes)
  let jupiterBaseUrl = process.env.JUPITER_BASE_URL;
  if (!jupiterBaseUrl) {
    warnings.push(
      `[Jupiter Config] JUPITER_BASE_URL not set. Using default: ${DEFAULTS.JUPITER_BASE_URL}`
    );
    jupiterBaseUrl = DEFAULTS.JUPITER_BASE_URL;
  }

  // Validate JUPITER_ULTRA_URL (for swaps)
  let jupiterUltraUrl = process.env.JUPITER_ULTRA_URL;
  if (!jupiterUltraUrl) {
    warnings.push(
      `[Jupiter Ultra Config] JUPITER_ULTRA_URL not set. Using default: ${DEFAULTS.JUPITER_ULTRA_URL}`
    );
    jupiterUltraUrl = DEFAULTS.JUPITER_ULTRA_URL;
  }

  // Validate JUPITER_DEFAULT_PRIORITY
  let jupiterDefaultPriority = process.env.JUPITER_DEFAULT_PRIORITY;
  if (!jupiterDefaultPriority) {
    warnings.push(
      `[Jupiter Ultra Config] JUPITER_DEFAULT_PRIORITY not set. Using default: ${DEFAULTS.JUPITER_DEFAULT_PRIORITY}`
    );
    jupiterDefaultPriority = DEFAULTS.JUPITER_DEFAULT_PRIORITY;
  } else {
    // Validate priority level value
    const validPriorities = ['Low', 'Medium', 'High', 'VeryHigh'];
    if (!validPriorities.includes(jupiterDefaultPriority)) {
      warnings.push(
        `[Jupiter Ultra Config] Invalid JUPITER_DEFAULT_PRIORITY: ${jupiterDefaultPriority}. Using default: ${DEFAULTS.JUPITER_DEFAULT_PRIORITY}`
      );
      jupiterDefaultPriority = DEFAULTS.JUPITER_DEFAULT_PRIORITY;
    }
  }

  // Validate JUPITER_ENABLE_DYNAMIC_SLIPPAGE
  let jupiterEnableDynamicSlippage = DEFAULTS.JUPITER_ENABLE_DYNAMIC_SLIPPAGE;
  const enableDynamicSlippageEnv = process.env.JUPITER_ENABLE_DYNAMIC_SLIPPAGE;
  if (enableDynamicSlippageEnv !== undefined) {
    jupiterEnableDynamicSlippage = enableDynamicSlippageEnv.toLowerCase() === 'true';
  } else {
    warnings.push(
      `[Jupiter Ultra Config] JUPITER_ENABLE_DYNAMIC_SLIPPAGE not set. Using default: ${DEFAULTS.JUPITER_ENABLE_DYNAMIC_SLIPPAGE}`
    );
  }

  // Validate JUPITER_API_KEY
  const jupiterApiKey = process.env.JUPITER_API_KEY;
  if (!jupiterApiKey) {
    warnings.push(
      '[Jupiter Ultra Config] JUPITER_API_KEY not set. API calls may be rate limited or fail.'
    );
  }

  // Validate JUPITER_REFERRAL_KEY
  const jupiterReferralKey = process.env.JUPITER_REFERRAL_KEY;
  if (!jupiterReferralKey) {
    warnings.push(
      '[Jupiter Ultra Config] JUPITER_REFERRAL_KEY not set. Platform fees will not be collected.'
    );
  }

  // Validate Mailgun Config
  const mailgunKey = process.env.MAILGUN_API_KEY;
  const mailgunDomain = process.env.MAILGUN_DOMAIN;
  if (!mailgunKey || !mailgunDomain) {
    warnings.push(
      '[Mailgun Config] MAILGUN_API_KEY or MAILGUN_DOMAIN not set. OTP emails will fail.'
    );
  }

  // Validate Telegram Config
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!telegramToken) {
    warnings.push(
      '[Telegram Config] TELEGRAM_BOT_TOKEN not set. Telegram alerts will not function.'
    );
  }

  const config: EnvConfig = {
    JUPITER_BASE_URL: jupiterBaseUrl,
    JUPITER_ULTRA_URL: jupiterUltraUrl,
    JUPITER_API_KEY: jupiterApiKey,
    JUPITER_REFERRAL_KEY: jupiterReferralKey,
    JUPITER_DEFAULT_PRIORITY: jupiterDefaultPriority,
    JUPITER_ENABLE_DYNAMIC_SLIPPAGE: jupiterEnableDynamicSlippage,
    MAILGUN_API_KEY: mailgunKey,
    MAILGUN_DOMAIN: mailgunDomain,
    TELEGRAM_BOT_TOKEN: telegramToken,
  };

  // System is valid even with warnings (uses fallbacks)
  return {
    isValid: true,
    warnings,
    config,
  };
}

/**
 * Logs validation warnings to console
 * 
 * @param warnings Array of warning messages
 */
export function logValidationWarnings(warnings: string[]): void {
  if (warnings.length > 0) {
    console.warn('\n⚠️  Environment Variable Warnings:');
    warnings.forEach((warning) => {
      console.warn(`   ${warning}`);
    });
    console.warn('');
  }
}

/**
 * Validates environment variables and logs warnings
 * Should be called at application startup
 * 
 * @returns Validated configuration with fallback values
 */
export function validateAndLogEnv(): EnvConfig {
  const result = validateJupiterEnv();
  logValidationWarnings(result.warnings);
  return result.config;
}

// Export a singleton instance of the validated config
export const envConfig = validateAndLogEnv();
