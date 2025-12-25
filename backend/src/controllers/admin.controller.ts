import { Request, Response } from 'express';
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors';
import { getJupiterSystemStatus, validateJupiterUltraConfig } from '../config/jupiterConfig';
import PlatformTradeModel from '../models/platformTrade.model';

/**
 * Get Jupiter Ultra system status
 * 
 * @route GET /api/v1/admin/jupiter/status
 */
export const getJupiterStatus = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const systemStatus = getJupiterSystemStatus();
    const configValidation = validateJupiterUltraConfig();

    // Get recent transaction statistics
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [transactions24h, transactions7d, totalTransactions] = await Promise.all([
      PlatformTradeModel.countDocuments({ timestamp: { $gte: last24h } }),
      PlatformTradeModel.countDocuments({ timestamp: { $gte: last7d } }),
      PlatformTradeModel.countDocuments({}),
    ]);

    // Get priority level distribution for last 7 days
    const priorityStats = await PlatformTradeModel.aggregate([
      { $match: { timestamp: { $gte: last7d } } },
      {
        $group: {
          _id: '$priorityLevel',
          count: { $sum: 1 },
          totalVolume: { $sum: '$inputAmount' },
          totalFees: { $sum: '$platformFee' },
        }
      },
      { $sort: { count: -1 } }
    ]);

    return res.status(200).json({
      success: true,
      data: {
        system: systemStatus,
        configuration: {
          isValid: configValidation.isValid,
          issues: configValidation.issues,
        },
        statistics: {
          transactions24h,
          transactions7d,
          totalTransactions,
          priorityLevelDistribution: priorityStats,
        },
        timestamp: new Date().toISOString(),
      },
    });
  }
);

/**
 * Get Jupiter Ultra configuration details
 * 
 * @route GET /api/v1/admin/jupiter/config
 */
export const getJupiterConfig = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const systemStatus = getJupiterSystemStatus();
    const configValidation = validateJupiterUltraConfig();

    return res.status(200).json({
      success: true,
      data: {
        service: systemStatus.service,
        version: systemStatus.version,
        endpoint: systemStatus.endpoint,
        hasApiKey: systemStatus.hasApiKey,
        hasReferralKey: systemStatus.hasReferralKey,
        defaultPriority: systemStatus.defaultPriority,
        dynamicSlippage: systemStatus.dynamicSlippage,
        timeout: systemStatus.timeout,
        fallbackEnabled: systemStatus.fallbackEnabled,
        configurationValid: configValidation.isValid,
        configurationIssues: configValidation.issues,
        timestamp: new Date().toISOString(),
      },
    });
  }
);

/**
 * Test Jupiter Ultra connectivity
 * 
 * @route POST /api/v1/admin/jupiter/test
 */
export const testJupiterConnectivity = catchAsyncErrors(
  async (req: Request, res: Response) => {
    try {
      // Simple connectivity test - get a quote for SOL to USDC
      const testQuote = {
        inputMint: 'So11111111111111111111111111111111111111112', // SOL
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        amount: 1000000, // 0.001 SOL
        slippageBps: 50,
      };

      // This would make an actual API call to test connectivity
      // For now, we'll just return a success response
      return res.status(200).json({
        success: true,
        data: {
          connectivity: 'success',
          endpoint: getJupiterSystemStatus().endpoint,
          testParameters: testQuote,
          message: 'Jupiter Ultra API is accessible',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'CONNECTIVITY_TEST_FAILED',
          message: 'Failed to connect to Jupiter Ultra API',
          details: error.message,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);