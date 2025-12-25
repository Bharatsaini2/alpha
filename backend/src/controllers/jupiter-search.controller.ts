import { Request, Response } from 'express';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors';
import { logger } from '../config/logger';
import { envConfig } from '../config/envValidation';

/**
 * Jupiter Ultra Token Search Response
 */
interface JupiterTokenSearchResult {
  id: string; // Mint address
  name: string;
  symbol: string;
  icon: string | null;
  decimals: number;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  dev: string | null; // Developer address
  circSupply: number | null;
  totalSupply: number | null;
  tokenProgram: string;
  launchpad: string | null;
  partnerConfig: string | null;
  graduatedPool: string | null;
  graduatedAt: string | null;
  holderCount: number | null;
  fdv: number | null; // Fully diluted valuation
  mcap: number | null; // Market cap
  usdPrice: number | null;
  priceBlockId: number | null;
  liquidity: number | null;
  stats5m: any | null;
  stats1h: any | null;
  stats6h: any | null;
  stats24h: any | null;
  firstPool: any | null;
  audit: any | null;
  organicScore: number | null;
  organicScoreLabel: 'high' | 'medium' | 'low' | null;
  isVerified: boolean | null;
  cexes: string[] | null;
  tags: string[] | null;
  updatedAt: string;
}

/**
 * Search for tokens using Jupiter Ultra /search endpoint
 * GET /api/v1/jupiter/search?query=SOL
 */
export const searchTokens = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const requestId = randomUUID();
    const { query } = req.query;

    try {
      // Validate query parameter
      if (!query || typeof query !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_QUERY',
            message: 'Query parameter is required and must be a string',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Validate query length
      if (query.length < 1) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'QUERY_TOO_SHORT',
            message: 'Query must be at least 1 character',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Check if Jupiter API key is configured
      const apiKey = envConfig.JUPITER_API_KEY;
      if (!apiKey) {
        logger.warn('Jupiter API key not configured', {
          requestId,
          endpoint: '/search',
        });

        return res.status(503).json({
          success: false,
          error: {
            code: 'API_KEY_NOT_CONFIGURED',
            message: 'Jupiter API key is not configured',
            timestamp: new Date().toISOString(),
          },
        });
      }

      logger.info('Searching tokens via Jupiter Ultra', {
        requestId,
        query,
        timestamp: new Date().toISOString(),
      });

      // Call Jupiter Ultra /search endpoint
      const response = await axios.get<JupiterTokenSearchResult[]>(
        `https://api.jup.ag/ultra/v1/search`,
        {
          params: {
            query,
          },
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 second timeout
        }
      );

      const tokens = response.data;

      logger.info('Token search successful', {
        requestId,
        query,
        resultCount: tokens.length,
        timestamp: new Date().toISOString(),
      });

      // Return search results
      return res.status(200).json({
        success: true,
        data: {
          query,
          tokens,
          count: tokens.length,
        },
      });
    } catch (error: any) {
      logger.error('Token search failed', {
        requestId,
        query,
        error: error.message,
        stack: error.stack,
        response: error.response?.data,
        timestamp: new Date().toISOString(),
      });

      // Handle specific error cases
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;

        if (status === 401) {
          return res.status(401).json({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Invalid Jupiter API key',
              timestamp: new Date().toISOString(),
            },
          });
        }

        if (status === 429) {
          return res.status(429).json({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Rate limit exceeded. Please try again later.',
              timestamp: new Date().toISOString(),
            },
          });
        }

        return res.status(status).json({
          success: false,
          error: {
            code: 'JUPITER_API_ERROR',
            message: data?.message || 'Jupiter API error',
            details: data,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Network or timeout error
      return res.status(500).json({
        success: false,
        error: {
          code: 'SEARCH_FAILED',
          message: 'Failed to search tokens',
          details: error.message,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);
