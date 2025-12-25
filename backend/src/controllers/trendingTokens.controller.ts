import { Request, Response } from 'express'
import TrendingToken from '../models/trendingTokens.model'
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors'

export const getTrendingTokens = catchAsyncErrors(
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20
      const offset = parseInt(req.query.offset as string) || 0

      const tokens = await TrendingToken.find()
        .sort({ rank: 1 })
        .skip(offset)
        .limit(limit)
        .select(
          'address rank name symbol logoURI volume24hChangePercent price price24hChangePercent volume24hUSD marketcap updateTime marketcapChange5m lastMarketcapUpdate',
        )
        .lean()

      const total = await TrendingToken.countDocuments()

      // Add live data indicators
      const tokensWithLiveData = tokens.map((token) => ({
        ...token,
        isLiveData:
          token.lastMarketcapUpdate &&
          Date.now() - new Date(token.lastMarketcapUpdate).getTime() <
            6 * 60 * 1000, // Updated within last 6 minutes
        dataFreshness: token.lastMarketcapUpdate
          ? Math.round(
              (Date.now() - new Date(token.lastMarketcapUpdate).getTime()) /
                1000 /
                60,
            )
          : null, // Minutes since last update
      }))

      res.status(200).json({
        success: true,
        data: {
          tokens: tokensWithLiveData,
          total,
          limit,
          offset,
          updateTime: new Date(),
          liveMarketcapEnabled: true,
        },
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching trending tokens',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  },
)
