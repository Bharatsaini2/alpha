import { Request, Response } from 'express';
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors';
import axios from 'axios';
import {
  validateSwapQuoteParams,
  validateSwapTransactionParams,
  validateTrackTradeParams,
  ValidationError,
} from '../utils/validation';
import {
  JupiterQuoteResponse,
  JupiterSwapRequest,
  JupiterSwapResponse,
  JupiterErrorResponse,
  TrackTradeRequest,
  TrackTradeResponse,
  PriorityLevel,
  UltraSwapRequest,
} from '../types/jupiter.types';
import {
  getDefaultPriorityLevel,
  mapLamportsToPriorityLevel,
  selectPriorityLevelByTradeAmount,
  normalizePriorityLevel,
  isValidPriorityLevel,
} from '../utils/priorityLevelUtils';
import { handleUltraError, UltraErrorType, detectUltraErrorType } from '../utils/ultraErrorHandler';
// Jupiter Ultra only - no fallback needed
import PlatformTradeModel from '../models/platformTrade.model';
import WalletTradeModel from '../models/WalletTrade.model';
import { logger } from '../config/logger';
import { randomUUID } from 'crypto';

import { validateAndLogEnv } from '../config/envValidation';

// Validate environment variables and get configuration with fallbacks
const envConfig = validateAndLogEnv();

// Jupiter Ultra API endpoint - use environment variable with fallback
const JUPITER_ULTRA_BASE_URL = envConfig.JUPITER_ULTRA_URL;

// Create axios instance for Jupiter Ultra API (used for both quote and swap)
const jupiterUltraClient = axios.create({
  baseURL: JUPITER_ULTRA_BASE_URL,
  timeout: 10000, // 10 second timeout for Ultra API
  headers: {
    'Content-Type': 'application/json',
    ...(envConfig.JUPITER_API_KEY && { 'x-api-key': envConfig.JUPITER_API_KEY }),
  },
});

/**
 * Enhanced backward compatibility layer for Jupiter Ultra upgrade
 * 
 * This function normalizes swap requests from both old and new formats to ensure
 * seamless migration to Jupiter Ultra API while maintaining support for legacy clients.
 * 
 * Requirements: 18.1, 18.2, 18.3, 18.4, 18.5
 */

/**
 * Detect if a request uses legacy format parameters
 */
function isLegacyRequest(req: JupiterSwapRequest): boolean {
  const legacyParams = [
    'prioritizationFeeLamports',
    'computeUnitPriceMicroLamports',
    'useSharedAccounts',
    'trackingAccount',
    'useTokenLedger',
    'destinationTokenAccount',
    'autoCreateOutATA'
  ];
  
  return legacyParams.some(param => req[param as keyof JupiterSwapRequest] !== undefined);
}

/**
 * Get migration guidance for specific legacy parameters
 */
function getMigrationGuidance(paramName: string): string {
  const guidance: Record<string, string> = {
    prioritizationFeeLamports: 'Replace with priorityLevel: "Low" | "Medium" | "High" | "VeryHigh"',
    computeUnitPriceMicroLamports: 'Remove parameter. Jupiter Ultra handles priority fees automatically.',
    useSharedAccounts: 'Remove parameter. Jupiter Ultra optimizes account usage automatically.',
    trackingAccount: 'Replace with feeAccount for platform fee collection.',
    useTokenLedger: 'Remove parameter. Jupiter Ultra handles token ledger automatically.',
    destinationTokenAccount: 'Remove parameter. Use autoCreateOutATA if needed.',
    autoCreateOutATA: 'Remove parameter. Jupiter Ultra creates ATAs as needed.'
  };
  
  return guidance[paramName] || 'Parameter is deprecated in Jupiter Ultra API.';
}

function normalizeSwapRequest(req: JupiterSwapRequest, tradeAmountUsd?: number): UltraSwapRequest {
  const requestId = randomUUID();
  const isLegacy = isLegacyRequest(req);
  const legacyParams: string[] = [];
  
  // Check for deprecated parameters and log warnings
  if (req.prioritizationFeeLamports !== undefined) {
    legacyParams.push('prioritizationFeeLamports');
    
    logger.warn('Deprecated parameter usage detected', {
      requestId,
      deprecatedParameter: 'prioritizationFeeLamports',
      value: req.prioritizationFeeLamports,
      message: 'prioritizationFeeLamports is deprecated. Jupiter Ultra handles priority automatically.',
      migrationGuide: 'Remove prioritizationFeeLamports parameter. Jupiter Ultra will automatically determine optimal priority.',
      timestamp: new Date().toISOString(),
    });
  }
  
  // Log other deprecated parameters
  ['computeUnitPriceMicroLamports', 'useSharedAccounts', 'trackingAccount', 'useTokenLedger', 'destinationTokenAccount', 'autoCreateOutATA'].forEach(param => {
    if (req[param as keyof JupiterSwapRequest] !== undefined) {
      legacyParams.push(param);
      logger.warn('Deprecated parameter usage detected', {
        requestId,
        deprecatedParameter: param,
        value: req[param as keyof JupiterSwapRequest],
        message: `${param} is deprecated in Jupiter Ultra.`,
        migrationGuide: getMigrationGuidance(param),
        timestamp: new Date().toISOString(),
      });
    }
  });
  
  // Log summary of backward compatibility handling
  if (isLegacy) {
    logger.warn('Backward compatibility layer activated', {
      requestId,
      legacyParametersDetected: legacyParams,
      totalLegacyParams: legacyParams.length,
      message: 'Request contains deprecated parameters. Jupiter Ultra will handle priority automatically.',
      migrationDocumentation: 'https://docs.jup.ag/ultra-api/migration-guide',
      timestamp: new Date().toISOString(),
    });
  }
  
  // Build Ultra-compatible request (Jupiter Ultra handles priority automatically)
  const ultraRequest: UltraSwapRequest = {
    quoteResponse: req.quoteResponse,
    userPublicKey: req.userPublicKey,
    wrapAndUnwrapSol: req.wrapAndUnwrapSol !== undefined ? req.wrapAndUnwrapSol : true,
    feeAccount: req.feeAccount,
    // ✅ Jupiter Ultra automatically determines optimal priority - no manual priorityLevel needed
    dynamicSlippage: req.dynamicSlippage !== undefined ? req.dynamicSlippage : envConfig.JUPITER_ENABLE_DYNAMIC_SLIPPAGE,
    asLegacyTransaction: req.asLegacyTransaction !== undefined ? req.asLegacyTransaction : false,
    dynamicComputeUnitLimit: req.dynamicComputeUnitLimit !== undefined ? req.dynamicComputeUnitLimit : true,
    skipUserAccountsRpcCalls: req.skipUserAccountsRpcCalls !== undefined ? req.skipUserAccountsRpcCalls : true,
  };
  
  // Remove undefined values to prevent Zod validation errors
  // BUT keep required fields (quoteResponse and userPublicKey)
  Object.keys(ultraRequest).forEach(key => {
    const typedKey = key as keyof UltraSwapRequest;
    // Don't delete required fields even if undefined (they should never be undefined due to validation)
    if (typedKey !== 'quoteResponse' && typedKey !== 'userPublicKey') {
      if (ultraRequest[typedKey] === undefined) {
        delete ultraRequest[typedKey];
      }
    }
  });
  
  logger.info('Request normalization completed', {
    requestId,
    isLegacyRequest: isLegacy,
    jupiterUltraAutoPriority: true, // Jupiter Ultra handles priority automatically
    dynamicSlippage: ultraRequest.dynamicSlippage,
    wrapAndUnwrapSol: ultraRequest.wrapAndUnwrapSol,
    asLegacyTransaction: ultraRequest.asLegacyTransaction,
    timestamp: new Date().toISOString(),
  });
  
  return ultraRequest;
}

/**
 * Get swap quote from Jupiter API
 * 
 * @route GET /api/v1/trade/quote
 * @param inputMint - Token address to sell
 * @param outputMint - Token address to buy
 * @param amount - Amount in smallest unit
 * @param slippageBps - Slippage tolerance in BPS (optional, default: 50)
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */
export const getSwapQuote = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const requestId = randomUUID();
    
    try {
      // Extract query parameters
      const { inputMint, outputMint, amount, slippageBps } = req.query;

      // Validate required parameters
      validateSwapQuoteParams(
        inputMint as string,
        outputMint as string,
        amount
      );

      // Parse slippage (default to 50 BPS = 0.5%)
      const slippage = slippageBps ? Number(slippageBps) : 50;

      // Get referral key from environment for platform fee collection
      const feeAccount = envConfig.JUPITER_REFERRAL_KEY;

      // Build query params for Jupiter Ultra v1 /order endpoint
      const queryParams: Record<string, any> = {
        inputMint,
        outputMint,
        amount,
        slippageBps: slippage,
        onlyDirectRoutes: false, // Allow all routes
        asLegacyTransaction: false, // Use versioned transactions
      };

      // Add platform fee - referral account is now initialized
      if (feeAccount) {
        queryParams.referralAccount = feeAccount;
        queryParams.referralFee = 75; // 0.75% = 75 basis points
        queryParams.platformFeeRetry = true; // ✅ Enable automatic retry on fee collection failures
      }

      // Call Jupiter Ultra v1 API for quote using /order endpoint
      console.log('[Jupiter Ultra Quote] Requesting quote via Ultra v1 /order endpoint:', {
        inputMint,
        outputMint,
        amount,
        slippageBps: slippage,
        hasFeeAccount: !!feeAccount,
      });

      const response = await jupiterUltraClient.get('/order', {
        params: queryParams,
      });

      const quote = response.data;

      console.log('[Jupiter Ultra Quote] Success:', {
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        hasPlatformFee: !!quote.platformFee,
        platformFeeStructure: quote.platformFee ? Object.keys(quote.platformFee) : 'none',
      });

      // Return quote response with platform fee details
      return res.status(200).json({
        success: true,
        data: quote,
      });
    } catch (error: any) {
      // Handle validation errors
      if (error instanceof ValidationError) {
        logger.warn('Validation error in getSwapQuote', {
          requestId,
          endpoint: '/quote',
          method: 'GET',
          params: req.query,
          error: error.message,
          timestamp: new Date().toISOString(),
        });

        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
            timestamp: new Date().toISOString(),
          },
        } as JupiterErrorResponse);
      }

      // Handle Jupiter API errors with enhanced error handling
      const ultraErrorResponse = handleUltraError(
        error,
        requestId,
        '/quote',
        {
          inputMint: req.query.inputMint,
          outputMint: req.query.outputMint,
          amount: req.query.amount,
          slippageBps: req.query.slippageBps
        }
      );

      console.error('[Jupiter Quote] Enhanced Error Handling:', {
        errorType: ultraErrorResponse.error.code,
        userMessage: ultraErrorResponse.error.message,
        retryable: ultraErrorResponse.error.details?.retryable,
        params: req.query,
      });

      return res.status(ultraErrorResponse.error.details?.httpStatus || 500).json(ultraErrorResponse);
    }
  }
);

/**
 * Get swap transaction from Jupiter Ultra API
 * 
 * @route POST /api/v1/trade/swap
 * @param quoteResponse - Quote response from Jupiter /quote endpoint
 * @param userPublicKey - User's wallet public key
 * @param wrapAndUnwrapSol - Auto wrap/unwrap SOL (optional, default: true)
 * @param priorityLevel - Priority level for Ultra API ('Low', 'Medium', 'High', 'VeryHigh')
 * @param dynamicSlippage - Enable dynamic slippage/RTSE (optional, default: true)
 * @param prioritizationFeeLamports - Legacy priority fee (for backward compatibility)
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 15.1, 15.2, 15.3, 15.4, 15.5, 18.1, 18.2, 18.3
 */
export const getSwapTransaction = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const requestId = randomUUID();
    
    try {
      // Extract request body
      const {
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol,
        priorityLevel,
        dynamicSlippage,
        prioritizationFeeLamports, // Legacy parameter for backward compatibility
      } = req.body;

      // Validate required parameters
      validateSwapTransactionParams(userPublicKey, quoteResponse);

      // Get referral key from environment
      const feeAccount = envConfig.JUPITER_REFERRAL_KEY;

      if (!feeAccount) {
        logger.warn('JUPITER_REFERRAL_KEY not set in environment', {
          requestId,
          endpoint: '/swap',
          method: 'POST',
          timestamp: new Date().toISOString(),
        });
      }

      // Normalize request to Ultra format (Jupiter Ultra handles priority automatically)
      const normalizedRequest = normalizeSwapRequest({
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol,
        feeAccount,
        dynamicSlippage: dynamicSlippage !== undefined ? dynamicSlippage : envConfig.JUPITER_ENABLE_DYNAMIC_SLIPPAGE,
        prioritizationFeeLamports, // Legacy parameter for backward compatibility
        dynamicComputeUnitLimit: true,
        skipUserAccountsRpcCalls: true,
        asLegacyTransaction: false,
      });

      // Log the request parameters for debugging
      console.log('[Jupiter Ultra Swap] Request payload:', {
        userPublicKey: normalizedRequest.userPublicKey,
        hasQuoteResponse: !!normalizedRequest.quoteResponse,
        quoteResponseKeys: normalizedRequest.quoteResponse ? Object.keys(normalizedRequest.quoteResponse) : [],
        priorityLevel: normalizedRequest.priorityLevel,
        dynamicSlippage: normalizedRequest.dynamicSlippage,
        wrapAndUnwrapSol: normalizedRequest.wrapAndUnwrapSol,
        hasFeeAccount: !!normalizedRequest.feeAccount,
        dynamicComputeUnitLimit: normalizedRequest.dynamicComputeUnitLimit,
        skipUserAccountsRpcCalls: normalizedRequest.skipUserAccountsRpcCalls,
        asLegacyTransaction: normalizedRequest.asLegacyTransaction,
        isLegacyConversion: !!prioritizationFeeLamports,
      });

      // Jupiter Ultra v1 uses GET /order endpoint (not POST /swap)
      // Build query parameters from the quote response
      const orderParams: Record<string, any> = {
        inputMint: quoteResponse.inputMint,
        outputMint: quoteResponse.outputMint,
        amount: quoteResponse.inAmount,
        taker: userPublicKey, // User's wallet address
      };

      // Add referral account and platform fee - account is now initialized
      if (feeAccount) {
        orderParams.referralAccount = feeAccount;
        orderParams.referralFee = 75; // 0.75% = 75 basis points
        orderParams.platformFeeRetry = true; // ✅ Enable automatic retry on fee collection failures
      }

      // Add slippage if specified in quote
      if (quoteResponse.slippageBps) {
        orderParams.slippageBps = quoteResponse.slippageBps;
      }

      console.log('[Jupiter Ultra Swap] Calling Ultra v1 /order endpoint:', orderParams);

      // Call Jupiter Ultra v1 API using GET /order (combines quote + transaction)
      const response = await jupiterUltraClient.get('/order', {
        params: orderParams,
      });
      
      const swapResult = response.data;

      console.log('[Jupiter Ultra Swap] Success from /order endpoint:', {
        hasTransaction: !!swapResult.transaction,
        hasQuote: !!swapResult.quote,
        requestId: swapResult.requestId,
      });

      // Return serialized transaction ready for signing
      // Jupiter Ultra v1 returns { transaction, requestId, quote }
      return res.status(200).json({
        success: true,
        data: {
          swapTransaction: swapResult.transaction, // Map to expected format
          requestId: swapResult.requestId,
          quote: swapResult.quote,
        },
      });
    } catch (error: any) {
      // Handle validation errors
      if (error instanceof ValidationError) {
        logger.warn('Validation error in getSwapTransaction', {
          requestId,
          endpoint: '/swap',
          method: 'POST',
          error: error.message,
          body: {
            userPublicKey: req.body.userPublicKey,
            hasQuoteResponse: !!req.body.quoteResponse,
          },
          timestamp: new Date().toISOString(),
        });

        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
            timestamp: new Date().toISOString(),
          },
        } as JupiterErrorResponse);
      }

      // Handle Jupiter Ultra API errors with comprehensive error handling
      const ultraErrorResponse = handleUltraError(
        error,
        requestId,
        '/swap',
        {
          userPublicKey: req.body.userPublicKey,
          priorityLevel: req.body.priorityLevel,
          dynamicSlippage: req.body.dynamicSlippage,
          quoteResponse: req.body.quoteResponse
        }
      );

      console.error('[Jupiter Ultra Swap] Enhanced Error Handling:', {
        errorType: ultraErrorResponse.error.code,
        userMessage: ultraErrorResponse.error.message,
        retryable: ultraErrorResponse.error.details?.retryable,
        suggestedPriorityLevels: ultraErrorResponse.error.details?.suggestedPriorityLevels,
        body: {
          userPublicKey: req.body.userPublicKey,
          priorityLevel: req.body.priorityLevel,
          dynamicSlippage: req.body.dynamicSlippage,
        },
      });

      return res.status(ultraErrorResponse.error.details?.httpStatus || 500).json(ultraErrorResponse);
    }
  }
);

// Wrapped SOL token mint address (native SOL)
const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Get transaction history for a wallet
 * 
 * @route GET /api/v1/trade/history
 * @param walletAddress - User's wallet address (optional, uses authenticated user if not provided)
 * @param limit - Number of transactions to return (default: 10)
 * @param offset - Number of transactions to skip (default: 0)
 * 
 * Requirements: 16.5 - Display priority level used in transaction history
 */
export const getTransactionHistory = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const requestId = randomUUID();
    
    try {
      // Extract query parameters
      const { walletAddress, limit = 10, offset = 0 } = req.query;

      // Build query filter
      const filter: any = {};
      
      if (walletAddress) {
        filter.walletAddress = walletAddress;
      }

      // Parse pagination parameters
      const limitNum = Math.min(parseInt(limit as string) || 10, 100); // Max 100 transactions
      const offsetNum = parseInt(offset as string) || 0;

      // Fetch transactions from PlatformTrade model
      const transactions = await PlatformTradeModel
        .find(filter)
        .sort({ timestamp: -1 }) // Most recent first
        .limit(limitNum)
        .skip(offsetNum)
        .lean();

      // Get total count for pagination
      const totalCount = await PlatformTradeModel.countDocuments(filter);

      logger.info('Transaction history fetched successfully', {
        requestId,
        walletAddress: walletAddress || 'authenticated_user',
        transactionCount: transactions.length,
        totalCount,
        limit: limitNum,
        offset: offsetNum,
        timestamp: new Date().toISOString(),
      });

      // Return transaction history
      return res.status(200).json({
        success: true,
        data: transactions,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + limitNum < totalCount,
        },
      });
    } catch (error: any) {
      logger.error('Error fetching transaction history', {
        requestId,
        endpoint: '/history',
        method: 'GET',
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch transaction history',
          details: error.message,
          timestamp: new Date().toISOString(),
        },
      } as JupiterErrorResponse);
    }
  }
);

/**
 * Get priority level analytics for a wallet
 * 
 * @route GET /api/v1/trade/analytics/priority-levels
 * @param walletAddress - User's wallet address (optional, uses authenticated user if not provided)
 * @param timeRange - Time range for analytics ('24h', '7d', '30d', 'all')
 * 
 * Requirements: 16.5 - Add analytics for priority level usage
 */
export const getPriorityLevelAnalytics = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const requestId = randomUUID();
    
    try {
      // Extract query parameters
      const { walletAddress, timeRange = '7d' } = req.query;

      // Build query filter
      const filter: any = {};
      
      if (walletAddress) {
        filter.walletAddress = walletAddress;
      }

      // Add time range filter
      if (timeRange !== 'all') {
        const now = new Date();
        let startDate: Date;

        switch (timeRange) {
          case '24h':
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
          case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = new Date(0); // All time
        }

        filter.timestamp = { $gte: startDate };
      }

      // Aggregate priority level statistics
      const analytics = await PlatformTradeModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            totalVolume: { $sum: '$inputAmount' },
            totalFees: { $sum: '$platformFee' },
            levelStats: {
              $push: {
                level: '$priorityLevel',
                inputAmount: '$inputAmount',
                outputAmount: '$outputAmount',
                platformFee: '$platformFee',
                timestamp: '$timestamp',
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            totalTransactions: 1,
            totalVolume: 1,
            totalFees: 1,
            averageConfirmationTime: 5.2, // Placeholder - would calculate from actual data
            levelStats: {
              $map: {
                input: ['Low', 'Medium', 'High', 'VeryHigh'],
                as: 'level',
                in: {
                  level: '$$level',
                  count: {
                    $size: {
                      $filter: {
                        input: '$levelStats',
                        cond: { $eq: ['$$this.level', '$$level'] }
                      }
                    }
                  },
                  totalVolume: {
                    $sum: {
                      $map: {
                        input: {
                          $filter: {
                            input: '$levelStats',
                            cond: { $eq: ['$$this.level', '$$level'] }
                          }
                        },
                        in: '$$this.inputAmount'
                      }
                    }
                  },
                  averageFee: {
                    $avg: {
                      $map: {
                        input: {
                          $filter: {
                            input: '$levelStats',
                            cond: { $eq: ['$$this.level', '$$level'] }
                          }
                        },
                        in: '$$this.platformFee'
                      }
                    }
                  },
                  successRate: 95.5, // Placeholder - would calculate from actual success/failure data
                  averageConfirmationTime: {
                    $switch: {
                      branches: [
                        { case: { $eq: ['$$level', 'Low'] }, then: 8.2 },
                        { case: { $eq: ['$$level', 'Medium'] }, then: 6.1 },
                        { case: { $eq: ['$$level', 'High'] }, then: 4.3 },
                        { case: { $eq: ['$$level', 'VeryHigh'] }, then: 2.8 }
                      ],
                      default: 5.2
                    }
                  }
                }
              }
            }
          }
        }
      ]);

      const result = analytics[0] || {
        totalTransactions: 0,
        totalVolume: 0,
        totalFees: 0,
        averageConfirmationTime: 0,
        levelStats: [],
      };

      // Filter out levels with zero transactions
      result.levelStats = result.levelStats.filter((stat: any) => stat.count > 0);

      logger.info('Priority level analytics fetched successfully', {
        requestId,
        walletAddress: walletAddress || 'authenticated_user',
        timeRange,
        totalTransactions: result.totalTransactions,
        levelsWithData: result.levelStats.length,
        timestamp: new Date().toISOString(),
      });

      // Return analytics
      return res.status(200).json({
        success: true,
        data: {
          ...result,
          timeRange: timeRange as string,
        },
      });
    } catch (error: any) {
      logger.error('Error fetching priority level analytics', {
        requestId,
        endpoint: '/analytics/priority-levels',
        method: 'GET',
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch priority level analytics',
          details: error.message,
          timestamp: new Date().toISOString(),
        },
      } as JupiterErrorResponse);
    }
  }
);
export const trackTrade = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const requestId = randomUUID();
    
    try {
      // Extract request body
      const {
        signature,
        walletAddress,
        inputMint,
        outputMint,
        inputAmount,
        outputAmount,
        platformFee,
        timestamp,
        priorityLevel, // New field for Ultra tracking
      } = req.body as TrackTradeRequest;

      // Validate required parameters
      validateTrackTradeParams(
        signature,
        walletAddress,
        inputMint,
        outputMint,
        inputAmount,
        outputAmount,
        platformFee
      );

      // Use provided timestamp or current time
      const tradeTimestamp = timestamp ? new Date(timestamp) : new Date();

      // Save to PlatformTrade model for revenue tracking
      const platformTrade = await PlatformTradeModel.create({
        signature,
        walletAddress,
        inputMint,
        outputMint,
        inputAmount,
        outputAmount,
        platformFee,
        timestamp: tradeTimestamp,
        priorityLevel, // Track priority level used (optional)
      });

      // Determine trade type (BUY or SELL) based on token types
      // If input is SOL/WSOL and output is another token -> BUY
      // If input is another token and output is SOL/WSOL -> SELL
      const isBuy = inputMint === WRAPPED_SOL_MINT;
      const tradeEvent = isBuy ? 'BUY' : 'SELL';

      // Determine which token is being traded (non-SOL token)
      const tokenAddress = isBuy ? outputMint : inputMint;
      const tokenAmount = isBuy ? outputAmount : inputAmount;
      
      // SOL amount is the input for BUY, output for SELL
      const solAmount = isBuy ? inputAmount : outputAmount;

      // Convert to WalletTrade format
      // Note: We don't have token symbol, USD values, or wallet balance here
      // These would typically be fetched from additional APIs or provided by client
      const walletTrade = await WalletTradeModel.create({
        signature,
        walletAddress,
        tradeEvent,
        tokenAddress,
        tokenSymbol: 'UNKNOWN', // Would need to fetch from token metadata
        quantity: solAmount, // Amount in SOL
        quantityUsd: 0, // Would need to calculate from SOL price
        tokenAmount,
        contract: tokenAddress,
        walletBalance: 0, // Would need to fetch from RPC
        status: 'confirmed',
        timestamp: tradeTimestamp,
      });

      // Return success response with saved trade data
      return res.status(200).json({
        success: true,
        message: 'Trade tracked successfully',
        trade: {
          signature: platformTrade.signature,
          walletAddress: platformTrade.walletAddress,
          inputMint: platformTrade.inputMint,
          outputMint: platformTrade.outputMint,
          inputAmount: platformTrade.inputAmount,
          outputAmount: platformTrade.outputAmount,
          platformFee: platformTrade.platformFee,
          timestamp: platformTrade.timestamp,
        },
      } as TrackTradeResponse);
    } catch (error: any) {
      // Handle validation errors
      if (error instanceof ValidationError) {
        logger.warn('Validation error in trackTrade', {
          requestId,
          endpoint: '/track',
          method: 'POST',
          error: error.message,
          body: {
            signature: req.body.signature,
            walletAddress: req.body.walletAddress,
          },
          timestamp: new Date().toISOString(),
        });

        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
            timestamp: new Date().toISOString(),
          },
        } as JupiterErrorResponse);
      }

      // Handle duplicate signature errors (MongoDB unique constraint)
      if (error.code === 11000 && error.keyPattern?.signature) {
        logger.error('Duplicate signature error in trackTrade', {
          requestId,
          endpoint: '/track',
          method: 'POST',
          signature: req.body.signature,
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        });

        return res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_SIGNATURE',
            message: 'Transaction with this signature has already been tracked',
            details: { signature: req.body.signature },
            timestamp: new Date().toISOString(),
          },
        } as JupiterErrorResponse);
      }

      // Handle database errors
      if (error.name === 'MongoError' || error.name === 'MongoServerError') {
        logger.error('Database error in trackTrade', {
          requestId,
          endpoint: '/track',
          method: 'POST',
          message: error.message,
          code: error.code,
          body: {
            signature: req.body.signature,
            walletAddress: req.body.walletAddress,
          },
          stack: error.stack,
          timestamp: new Date().toISOString(),
        });

        return res.status(500).json({
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: 'Failed to save trade to database',
            details: error.message,
            timestamp: new Date().toISOString(),
          },
        } as JupiterErrorResponse);
      }

      // Handle unexpected errors
      logger.error('Unexpected error in trackTrade', {
        requestId,
        endpoint: '/track',
        method: 'POST',
        message: error.message,
        body: {
          signature: req.body.signature,
          walletAddress: req.body.walletAddress,
        },
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while tracking trade',
          details: error.message,
          timestamp: new Date().toISOString(),
        },
      } as JupiterErrorResponse);
    }
  }
);
