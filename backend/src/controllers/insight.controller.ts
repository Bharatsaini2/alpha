import { PublicKey } from '@solana/web3.js'
import {
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns'
import { Request, Response } from 'express'
import { solConnection } from '../config/solana-config'
import { getTokenData, getTokenPrice } from '../config/solana-tokens-config'
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors'
import WhalesAddressModel from '../models/solana-tokens-whales'
import TopTokenMarketcapModel from '../models/top-token-marketcap.model'
import whaleBigTransactionModel from '../models/whale-big-transactions.model'
import {
  IWhaleWalletLabel,
  whaleWalletLabelModel,
} from '../models/whaleLabel.model'
import {
  addWhaleLabel,
  syncWhaleLabels,
} from '../utils/whale-wallet-label-utililies'

import { redisClient } from '../config/redis'
import { coordinatedWhaleWalletLabelModel } from '../models/coordinatedGroupModel'
import { DailyTokenMetrics } from '../models/dailyTokenMetricsSchema.model'
import {
  hotnessScoreModel,
  purchaseRecordModel,
} from '../models/hotness-score.model'
import { WeeklyPrediction } from '../models/weeklyPredictionSchema.model'
import whaleAllTransactionModelV2 from '../models/whaleAllTransactionsV2.model'
const jStat: any = require('jstat')

interface WhaleStats {
  winRate: number
  averageROI: number
}

function startOfUTCDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
}

function endOfUTCDay(date: Date): Date {
  // make midnight of next UTC day, then subtract 1 ms
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) -
      1,
  )
}

// Helper function to get time range
const getTimeRange = (period: '24H' | '7D' | '30D') => {
  const now = new Date()
  switch (period) {
    case '24H':
      return subDays(now, 1)
    case '7D':
      return subWeeks(now, 1)
    case '30D':
      return subMonths(now, 1)
  }
}

function parseTimeframe(
  timeframe: string,
  customStart?: string,
  customEnd?: string,
): { from: Date; to: Date } {
  const now = new Date()
  let from: Date
  let to: Date = now

  switch (timeframe) {
    case '1D':
      from = subDays(now, 1)
      break
    case '7D':
      from = subDays(now, 7)
      break
    case '30D':
      from = subDays(now, 30)
      break
    case '90D':
      from = subDays(now, 90)
      break
    case 'MTD':
      from = startOfMonth(now)
      break
    case 'custom':
      if (!customStart || !customEnd) {
        throw new Error('Custom timeframe requires start and end dates')
      }
      from = new Date(customStart)
      to = new Date(customEnd)
      break
    default:
      throw new Error('Invalid timeframe')
  }

  return { from, to }
}
interface AggregatedMetrics {
  tokenAddress: string
  avgHotness: number | null
  uniqueWhales: number
  smartWallets: number
  usdTotal: number
  avgEntryMc: number
  volumeSpikeRatio: number
}

// *******************    Function to get top traded coins    ******************************
export const getTopTradedCoins = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const period: '24H' | '7D' | '30D' = req.body.period as '24H' | '7D' | '30D'

    if (!['24H', '7D', '30D'].includes(period)) {
      return res
        .status(400)
        .json({ error: "Invalid period. Choose from '24H', '7D', or '30D'." })
    }

    const fromDate = getTimeRange(period)
    console.log(
      `Fetching top traded coins for period: ${period}, from date: ${fromDate}`,
    )

    const result = await whaleBigTransactionModel.aggregate([
      { $match: { timestamp: { $gte: fromDate } } },
      { $unwind: '$amount' },
      {
        $group: {
          _id: '$whaleTokenSymbol',
          totalVolume: { $sum: { $toDouble: '$amount' } },
        },
      },
      { $sort: { totalVolume: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'whalesaddresses',
          localField: '_id',
          foreignField: 'tokenSymbol',
          as: 'tokenDetails',
        },
      },
      {
        $project: {
          _id: 1,
          totalVolume: 1,
          tokenAddress: { $arrayElemAt: ['$tokenDetails.tokenAddress', 0] },
        },
      },
    ])

    // const enrichedData = await Promise.all(
    //     result.map(async (coin) => {
    //         if (!coin.tokenAddress) return { ...coin, marketCap: null, imageUrl: null };
    //         const tokenData = await getTokenData(coin.tokenAddress)
    //         const { price, ...filteredTokenData } = tokenData
    //         return { ...coin, ...filteredTokenData }
    //     })
    // );
    const enrichedData = await Promise.all(
      result.map(async (coin) => {
        if (!coin.tokenAddress)
          return {
            tokenSymbol: coin._id,
            totalVolume: coin.totalVolume,
            marketCap: null,
            imageUrl: null,
          }
        const tokenData = await getTokenData(coin.tokenAddress)
        const { price, ...filteredTokenData } = tokenData
        return {
          tokenAddress: coin.tokenAddress,
          tokenSymbol: coin._id,
          totalVolume: coin.totalVolume,
          ...filteredTokenData,
        }
      }),
    )

    res.status(200).json({ success: true, data: enrichedData })
  },
)

// *******************     Function to get top active whales    **********************
export const getTopActiveWhales = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const period: '24H' | '7D' | '30D' = req.body.period as '24H' | '7D' | '30D'
    if (!['24H', '7D', '30D'].includes(period)) {
      return res
        .status(400)
        .json({ error: "Invalid period. Choose from '24H', '7D', or '30D'." })
    }
    const fromDate = getTimeRange(period)
    // console.log(`Fetching top active whales for period: ${period}, from date: ${fromDate}`);

    // Get the top 5 active whales
    const result = await whaleBigTransactionModel
      .aggregate([
        { $match: { timestamp: { $gte: fromDate } } },
        { $group: { _id: '$whaleAddress', transactionCount: { $sum: 1 } } },
        { $sort: { transactionCount: -1 } },
        { $limit: 5 },
      ])
      .exec()

    // Fetch token details for each whale
    // const enrichedData = await Promise.all(
    //   result.map(async (whale) => {
    //     const tokenData = await WhalesAddressModel.findOne({
    //       whalesAddress: whale._id,
    //     })
    //       .select('tokenSymbol tokenAddress tokenDecimals -_id')
    //       .lean()

    //     let tokenBalance = 0
    //     if (tokenData?.tokenAddress) {
    //       try {
    //         const accounts = await solConnection.getTokenAccountsByOwner(
    //           new PublicKey(whale._id),
    //           { mint: new PublicKey(tokenData.tokenAddress) },
    //         )
    //         // tokenBalance = accounts.value.length > 0
    //         //     ? ((await solConnection.getTokenAccountBalance(accounts.value[0].pubkey)).value.amount as any/ (10 ** tokenData.tokenDecimals))
    //         //     : "0"
    //         tokenBalance =
    //           accounts.value.length > 0
    //             ? parseFloat(
    //                 (
    //                   await solConnection.getTokenAccountBalance(
    //                     accounts.value[0].pubkey,
    //                   )
    //                 ).value.amount,
    //               ) /
    //               10 ** tokenData.tokenDecimals
    //             : 0

    //         console.log('tokenBalance', tokenBalance)
    //       } catch (error: any) {
    //         console.error(`Error fetching balance for ${whale._id}:`, error)
    //       }
    //     }

    //     return {
    //       ...whale,
    //       tokenSymbol: tokenData?.tokenSymbol || null,
    //       tokenAddress: tokenData?.tokenAddress || null,
    //       tokenDecimals: tokenData?.tokenDecimals || null,
    //       tokenBalance,
    //     }
    //   }),
    // )

    const { default: pLimit } = await import('p-limit')
    const limit = pLimit(2)
    const enrichedData = await Promise.all(
      result.map((whale) =>
        limit(async () => {
          const tokenData = await WhalesAddressModel.findOne({
            whalesAddress: whale._id,
          })
            .select('tokenSymbol tokenAddress tokenDecimals -_id')
            .lean()

          let tokenBalance = 0
          if (tokenData?.tokenAddress) {
            try {
              const accounts = await solConnection.getTokenAccountsByOwner(
                new PublicKey(whale._id),
                { mint: new PublicKey(tokenData.tokenAddress) },
              )
              tokenBalance =
                accounts.value.length > 0
                  ? parseFloat(
                      (
                        await solConnection.getTokenAccountBalance(
                          accounts.value[0].pubkey,
                        )
                      ).value.amount,
                    ) /
                    10 ** tokenData.tokenDecimals
                  : 0
            } catch (error) {
              console.error(`Error fetching balance for ${whale._id}:`, error)
            }
          }

          return {
            ...whale,
            tokenSymbol: tokenData?.tokenSymbol || null,
            tokenAddress: tokenData?.tokenAddress || null,
            tokenDecimals: tokenData?.tokenDecimals || null,
            tokenBalance,
          }
        }),
      ),
    )

    return res.status(200).json({
      success: true,
      data: enrichedData.map((whale) => ({
        whaleAddress: whale._id, // Renaming _id to whaleAddress
        transactionCount: whale.transactionCount,
        tokenSymbol: whale.tokenSymbol,
        tokenAddress: whale.tokenAddress,
        tokenDecimals: whale.tokenDecimals,
        tokenHolding: whale.tokenBalance,
      })),
    })
  },
)

//  *******************   Tokens With Most Whale Activity (Segmented by Timeframe & Market Cap)   ***************
const marketCapTier = (cap: number): 'smallCaps' | 'midCaps' | 'largeCaps' => {
  if (cap < 10_000_000) return 'smallCaps'
  if (cap <= 100_000_000) return 'midCaps'
  return 'largeCaps'
}

// Function to generate whale summary
const generateWhaleSummary = async (hours: number, label: string) => {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000)

  const trades = await whaleAllTransactionModelV2
    .find({ timestamp: { $gte: since } })
    .lean()

  console.log('trade length:', trades.length)

  const tokenMap: Record<
    string,
    {
      whaleSet: Set<string>
      totalVolume: number
      totalBuys: number
      totalSells: number
      marketCap: number
      tokenURI: string
      latestTimestamp: number
      tokenAddress: string
    }
  > = {}

  for (const trade of trades) {
    const timestamp = new Date(trade.timestamp).getTime()
    // const marketCap = Number(trade.marketCap) || 0

    const handleTrade = (
      type: 'buy' | 'sell',
      symbol: string | undefined,
      uri: string | undefined,
      address: string | undefined,
      volume: string | undefined,
      marketCap: string | undefined,
    ) => {
      if (!symbol) return

      const vol = Number(volume) || 0
      const cap = Number(marketCap) || 0

      if (!tokenMap[symbol]) {
        tokenMap[symbol] = {
          whaleSet: new Set(),
          totalVolume: 0,
          totalBuys: 0,
          totalSells: 0,
          marketCap: cap,
          tokenURI: uri || '',
          tokenAddress: address || '',
          latestTimestamp: timestamp,
        }
      }

      tokenMap[symbol].whaleSet.add(trade.whaleAddress)

      // Only add buy volume to totalVolume, not sell volume
      if (type === 'buy') {
        tokenMap[symbol].totalVolume += vol
        tokenMap[symbol].totalBuys += vol
      } else if (type === 'sell') {
        tokenMap[symbol].totalSells += vol
        // Do not add sell volume to totalVolume
      }

      // Update latest info if needed
      if (timestamp > tokenMap[symbol].latestTimestamp) {
        tokenMap[symbol].marketCap = cap
        tokenMap[symbol].tokenURI = uri || ''
        tokenMap[symbol].tokenAddress = address || ''
        tokenMap[symbol].latestTimestamp = timestamp
      }
    }

    if (trade.type === 'buy') {
      handleTrade(
        'buy',
        trade.tokenOutSymbol,
        trade.outTokenURL,
        trade.tokenOutAddress,
        (trade.amount as any)?.buyAmount,
        (trade.marketCap as any)?.buyMarketCap,
      )
    } else if (trade.type === 'sell') {
      handleTrade(
        'sell',
        trade.tokenInSymbol,
        trade.inTokenURL,
        trade.tokenInAddress,
        (trade.amount as any)?.sellAmount,
        (trade.marketCap as any)?.sellMarketCap,
      )
    } else if (trade.type === 'both') {
      // Process as two logical entries
      if (trade.bothType?.[0]?.buyType) {
        handleTrade(
          'buy',
          trade.tokenOutSymbol,
          trade.outTokenURL,
          trade.tokenOutAddress,
          (trade.amount as any)?.buyAmount,
          (trade.marketCap as any)?.buyMarketCap,
        )
      }

      if (trade.bothType?.[0]?.sellType) {
        handleTrade(
          'sell',
          trade.tokenInSymbol,
          trade.inTokenURL,
          trade.tokenInAddress,
          (trade.amount as any)?.sellAmount,
          (trade.marketCap as any)?.sellMarketCap,
        )
      }
    }
  }

  const summary: any = {
    timeframe: label,
    smallCaps: [],
    midCaps: [],
    largeCaps: [],
  }

  for (const [symbol, data] of Object.entries(tokenMap)) {
    // Only include tokens with whale count > 2 (consistent with topCoins controller)
    // if (data.whaleSet.size <= 2) continue

    // Calculate proper net inflow and outflow
    const netInflow = data.totalBuys - data.totalSells
    const netOutflow = data.totalSells - data.totalBuys

    // Only include tokens with positive netInflow (netflow-wise posting)
    if (netInflow <= 0) continue

    const tokenData = {
      symbol,
      name: symbol, // Add required name field
      whaleCount: data.whaleSet.size,
      totalVolume: data.totalVolume, // Only buy volume
      marketCap: data.marketCap,
      price: 0, // Add required price field (default to 0)
      netInflow: netInflow, // Calculate based on buys - sells
      netOutflow: netOutflow, // Calculate based on sells - buys
      tokenURI: data.tokenURI,
      tokenAddress: data.tokenAddress,
    }

    const tier = marketCapTier(data.marketCap)
    summary[tier].push(tokenData)
  }

  for (const cap of ['smallCaps', 'midCaps', 'largeCaps']) {
    summary[cap] = summary[cap]
      .sort((a: any, b: any) => {
        // Primary sort: netInflow (netflow-wise posting)
        const aNetInflow = Number(a.netInflow) || 0
        const bNetInflow = Number(b.netInflow) || 0
        if (bNetInflow !== aNetInflow) {
          return bNetInflow - aNetInflow
        }
        // Secondary sort: whale count
        const bWhaleCount = b.whaleCount || 0
        const aWhaleCount = a.whaleCount || 0
        if (bWhaleCount !== aWhaleCount) {
          return bWhaleCount - aWhaleCount
        }
        // If still equal, maintain order
        return 0
      })
      .slice(0, 3) // Top 7 coins per category (consistent with topCoins controller)
  }

  await TopTokenMarketcapModel.create(summary)
  return summary
}

// function to add top token based on market cap
export const addTokensWithMostWhaleActivityByMarketCap = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const { timeframe } = req.body

    const timeframeToHoursMap: Record<string, number> = {
      '4h': 4,
      '12h': 12,
      '24h': 24,
      '1w': 24 * 7,
      '1m': 24 * 30,
    }

    if (!timeframe || !timeframeToHoursMap[timeframe]) {
      return res.status(400).json({
        message: 'Invalid or missing timeframe. Allowed: 4h, 12h, 24h, 1w, 1m.',
      })
    }

    const hours = timeframeToHoursMap[timeframe]
    const result = await generateWhaleSummary(Number(hours), timeframe)
    console.log('result', result)
    res.json(result)
  },
)

// Get Token With Most Whale Activity
export const getTokensWithMostWhaleActivityByMarketCap = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const { timeframe = '24H', marketCap = 'all' } = req.query
    try {
      // Fetch the latest document for given timeframe
      const data = await TopTokenMarketcapModel.findOne({
        // timeframe: timeframe.toLowerCase(),
        timeframe: (timeframe as string)?.toLowerCase(),
      }).sort({ generatedAt: -1 })

      if (!data) {
        return res.json({ success: true, data: [] })
      }

      let result: any[] = []

      if (marketCap === 'small') {
        result = data.smallCaps || []
      } else if (marketCap === 'medium') {
        result = data.midCaps || []
      } else if (marketCap === 'large') {
        result = data.largeCaps || []
      } else if (marketCap === 'all') {
        result = [
          ...(data.smallCaps || []),
          ...(data.midCaps || []),
          ...(data.largeCaps || []),
        ]
      }

      // Format result to match frontend expectations
      const formatted = result.map((item) => ({
        tokenSymbol: item.symbol,
        whaleWallets: item.whaleCount,
        netInflow: item.totalVolume,
        marketCap: item.marketCap,
        tokenURI: item.tokenURI,
        tokenAddress: item.tokenAddress,
      }))

      res.json({ success: true, data: formatted })
    } catch (error) {
      console.error('Error fetching whale token data:', error)
      res.status(500).json({ success: false, message: 'Internal Server Error' })
    }
  },
)

// ***************************    Calculate flipper and sniper label using 24 hour cron job    ************************
const MAX_MARKET_CAP = 5000000 //5M
const MAX_AVG_BUY = 10000 // 10K
const MIN_EXIT_PERCENT = 0.5 //50%
const MIN_SNIPE_COUNT = 3 // Atleast 3 unique token

// Calculate Sniper Label
const calculateSniperLabelForWallet = async (wallet: string) => {
  const now = new Date() // not get the current time stamp get the transaction timestemp
  const past7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // find the lats 7 days trade details for this wallet
  const trades = await whaleAllTransactionModelV2
    .find({
      whaleAddress: wallet,
      timestamp: { $gte: past7Days },
    })
    .sort({ timestamp: 1 })

  // Group by token (handle buy/sell correctly)
  const grouped: Record<string, any[]> = {}
  for (const trade of trades) {
    // let token: string

    // if (trade.type === 'buy' || (trade.type === 'both' && trade.bothType?.[0]?.buyType)) {
    //   token = trade.tokenOutSymbol
    // } else if (trade.type === 'sell' || (trade.type === 'both' && trade.bothType?.[0]?.sellType)) {
    //   token = trade.tokenInSymbol
    // } else {
    //   continue
    // }

    // if (!grouped[token]) grouped[token] = []
    // grouped[token].push(trade)

    const buyType =
      trade.type === 'buy' ||
      (trade.type === 'both' && trade.bothType?.[0]?.buyType)
    const sellType =
      trade.type === 'sell' ||
      (trade.type === 'both' && trade.bothType?.[0]?.sellType)

    if (buyType) {
      const token = trade.tokenOutSymbol
      if (token) {
        if (!grouped[token]) grouped[token] = []
        grouped[token].push({
          ...trade,
          _processedType: 'buy',
          // _processedAmount: Number(trade.amount?.[0]?.buyAmount || 0),
          _processedAmount: Number((trade.amount as any)?.buyAmount || 0),
        })
      }
    }

    if (sellType) {
      const token = trade.tokenInSymbol
      if (token) {
        if (!grouped[token]) grouped[token] = []
        grouped[token].push({
          ...trade,
          _processedType: 'sell',
          _processedAmount: Number((trade.amount as any)?.sellAmount || 0),
        })
      }
    }
  }
  const snipedTokens = []
  for (const token in grouped) {
    const tokenTrades = grouped[token]
    const buys = tokenTrades.filter((t) => t._processedType === 'buy')
    const sells = tokenTrades.filter((t) => t._processedType === 'sell')

    if (buys.length === 0) continue

    const firstBuy = buys[0]
    const firstBuyTime = new Date(firstBuy._doc.timestamp)
    const marketCap = firstBuy._doc.marketCap?.buyMarketCap
    const whaleTokenSymbol = firstBuy._doc.whaleTokenSymbol
    const whaleTokenURL = firstBuy._doc.whaleTokenURL

    // Average buy amount
    const totalBuy = buys.reduce((sum, t) => sum + (t._processedAmount || 0), 0)
    const avgBuy = totalBuy / buys.length

    // Sells within 48h of first buy
    const sellsWithin48h = sells.filter((sell) => {
      const sellTime = new Date(sell._doc.timestamp)
      const diff = sellTime.getTime() - firstBuyTime.getTime()
      return diff <= 48 * 60 * 60 * 1000 // 48 hours
    })

    const totalSell = sellsWithin48h.reduce(
      (sum, s) => sum + (s._processedAmount || 0),
      0,
    )
    const exitedWithin48h = totalSell >= MIN_EXIT_PERCENT * totalBuy

    if (marketCap < MAX_MARKET_CAP && avgBuy < MAX_AVG_BUY && exitedWithin48h) {
      snipedTokens.push({
        token,
        whaleAddress: wallet,
        whaleTokenSymbol,
        whaleTokenURL,
        entry_time: firstBuyTime,
        avg_buy: avgBuy,
        market_cap_at_entry: marketCap,
        exit_within_48h: true,
      })
    }
  }

  const isSniper = snipedTokens.length >= MIN_SNIPE_COUNT

  if (isSniper) {
    return {
      is_sniper: true,
      sniped_tokens: snipedTokens,
    }
  }

  return null
}

// Calculate Flipper Label
const calculateFlipperLabelForWallet = async (wallet: string) => {
  const past7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const trades = await whaleAllTransactionModelV2
    .find({
      whaleAddress: wallet,
      timestamp: { $gte: past7Days },
    })
    .sort({ timestamp: 1 })

  // Filter trades with minimum $1000 USD value (normalized at timestamp)
  const minTradeValueUSD = 1000
  const validTrades = trades.filter((trade) => {
    let tradeValueUSD = 0

    if (trade.type === 'buy') {
      tradeValueUSD = Number(trade.transaction?.tokenOut?.usdAmount || 0)
    } else if (trade.type === 'sell') {
      tradeValueUSD = Number(trade.transaction?.tokenIn?.usdAmount || 0)
    } else if (trade.type === 'both') {
      // For 'both' type, use the higher of the two amounts
      const buyAmount = Number(trade.transaction?.tokenOut?.usdAmount || 0)
      const sellAmount = Number(trade.transaction?.tokenIn?.usdAmount || 0)
      tradeValueUSD = Math.max(buyAmount, sellAmount)
    }

    return tradeValueUSD >= minTradeValueUSD
  })

  if (validTrades.length === 0) {
    return null
  }

  // Step 2: Group by token (handle buy/sell/both correctly)
  const grouped: Record<string, any[]> = {}

  for (const trade of validTrades) {
    const buyType =
      trade.type === 'buy' ||
      (trade.type === 'both' && trade.bothType?.[0]?.buyType)
    const sellType =
      trade.type === 'sell' ||
      (trade.type === 'both' && trade.bothType?.[0]?.sellType)

    if (buyType) {
      const token = trade.tokenOutSymbol
      if (!grouped[token]) grouped[token] = []
      grouped[token].push({
        ...trade,
        _processedType: 'buy',
        _processedAmount: Number((trade.amount as any)?.buyAmount || 0),
        _processedPrice: Number((trade.tokenPrice as any)?.buyTokenPrice || 0),
      })
    }

    if (sellType) {
      const token = trade.tokenInSymbol
      if (!grouped[token]) grouped[token] = []
      grouped[token].push({
        ...trade,
        _processedType: 'sell',
        _processedAmount: Number((trade.amount as any)?.sellAmount || 0),
        _processedPrice: Number((trade.tokenPrice as any)?.sellTokenPrice || 0),
      })
    }
  }

  const completedTrades = []
  const flippedTokens = []
  for (const token in grouped) {
    const tokenTrades = grouped[token]
    const buys = tokenTrades.filter((t) => t._processedType === 'buy')
    const sells = tokenTrades.filter((t) => t._processedType === 'sell')

    for (const buy of buys) {
      const buyTime = new Date(buy._doc.timestamp)
      const whaleTokenSymbol = buy._doc.whaleTokenSymbol
      const whaleTokenURL = buy._doc.whaleTokenURL
      const buyAmount = buy._processedAmount
      const buyPrice = buy._processedPrice

      let soldAmount = 0
      let firstSellTime: Date | null = null
      let sellPrice = 0

      for (const sell of sells) {
        const sellTime = new Date(sell._doc.timestamp)
        if (sellTime <= buyTime) continue

        const sellAmount = sell._processedAmount
        soldAmount += sellAmount

        // Count cycle only if ≥50% of position is exited
        if (!firstSellTime && soldAmount >= 0.5 * buyAmount) {
          firstSellTime = sellTime
          sellPrice = sell._processedPrice
          break
        }
      }

      if (firstSellTime) {
        const holdTimeHours =
          (firstSellTime.getTime() - buyTime.getTime()) / (1000 * 60 * 60)
        const profit = sellPrice > buyPrice

        completedTrades.push({
          holdTimeHours,
          profit,
          whaleTokenSymbol,
          whaleTokenURL,
          whaleAddress: wallet,
        })
      }
    }
  }

  // Step 4: Calculate metrics
  const tradeCount = completedTrades.length
  const averageHoldTime =
    tradeCount > 0
      ? completedTrades.reduce((sum, t) => sum + t.holdTimeHours, 0) /
        tradeCount
      : 0
  const profitableTrades = completedTrades.filter((t) => t.profit).length
  const profitIntentPercent =
    tradeCount > 0 ? (profitableTrades / tradeCount) * 100 : 0

  // Step 5: Check flipper criteria
  const isFlipper =
    tradeCount >= 10 && averageHoldTime < 12 && profitIntentPercent >= 60

  if (isFlipper) {
    for (const t of completedTrades) {
      flippedTokens.push({
        whaleAddress: wallet,
        whaleTokenSymbol: t.whaleTokenSymbol || 'N/A',
        whaleTokenURL: t.whaleTokenURL || 'N/A',
      })
    }
  }
  if (isFlipper) {
    return {
      is_flipper: true,
      flipper_trade_count: tradeCount,
      avg_hold_time_hours: averageHoldTime.toFixed(2),
      profit_trades_percent: profitIntentPercent.toFixed(2),
      flipped_tokens: flippedTokens,
    }
  }

  return null
}

export const snipperAndFlipperWhaleLabel = async (
  req: Request,
  res: Response,
) => {
  try {
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    //  Get whale addresses from last 24h trades
    const recentWhales = await whaleAllTransactionModelV2.distinct(
      'whaleAddress',
      {
        timestamp: { $gte: last24h },
      },
    )

    //  Get all whale addresses who already have Snipper label
    const sniperLabeledWhales = await whaleWalletLabelModel
      .find({
        whaleLabel: 'SNIPER',
      })
      .distinct('whaleAddress')

    //  Get all whale addresses who already have Flipper label
    const flipperLabeledWhales = await whaleWalletLabelModel
      .find({
        whaleLabel: 'FLIPPER',
      })
      .distinct('whaleAddress')

    // Deduplicate sets for each label
    const sniperWalletsToCheck = Array.from(
      new Set([...recentWhales, ...sniperLabeledWhales]),
    )

    const flipperWalletsToCheck = Array.from(
      new Set([...recentWhales, ...flipperLabeledWhales]),
    )

    const sniperResults = []
    const flipperResults = []

    const validSniperWallets = new Set<string>()
    const validFlipperWallets = new Set<string>()

    // Process Sniper-only wallets
    for (const wallet of sniperWalletsToCheck) {
      const result = await calculateSniperLabelForWallet(wallet)
      if (result?.is_sniper) validSniperWallets.add(wallet)
      sniperResults.push(result)
    }

    // Process Flipper-only wallets
    for (const wallet of flipperWalletsToCheck) {
      const result = await calculateFlipperLabelForWallet(wallet)
      if (result?.is_flipper) validFlipperWallets.add(wallet)
      flipperResults.push(result)
    }

    // 6. 🔄 Sync labels: remove if wallets no longer qualify
    await syncWhaleLabels('SNIPER', sniperLabeledWhales, validSniperWallets)
    await syncWhaleLabels('FLIPPER', flipperLabeledWhales, validFlipperWallets)

    // 👉 Store in DB if this wallet is a snniper
    for (const result of sniperResults) {
      if (result?.is_sniper && result.sniped_tokens.length > 0) {
        const firstToken = result.sniped_tokens[0]
        await addWhaleLabel({
          whaleAddress: firstToken.whaleAddress,
          label: 'SNIPER',
          whaleTokenSymbol: firstToken.whaleTokenSymbol,
          whaleTokenImageUrl: firstToken.whaleTokenURL,
        })
      }
    }

    // 👉 Store in DB if this wallet is a flipper
    for (const result of flipperResults) {
      if (result?.is_flipper && result.flipped_tokens.length > 0) {
        const firstToken = result.flipped_tokens[0]
        await addWhaleLabel({
          whaleAddress: firstToken.whaleAddress,
          label: 'FLIPPER',
          whaleTokenSymbol: firstToken.whaleTokenSymbol,
          whaleTokenImageUrl: firstToken.whaleTokenURL,
        })
      }
    }

    res.status(200).json({
      message: 'Sniper and Flipper labels calculated successfully.',
      data: {
        sniper: sniperResults,
        flipper: flipperResults,
      },
    })
  } catch (error) {
    console.error('Sniper Label error:', error)
    res.status(500).json({ error: 'Internal Server Error' })
  }
}

// *******************    Calculate Win Rate/Average ROI/complete and profitable Trade  for hotness Score and Smart Money Label   *******************
async function computeWinRateAndAvgROIForWhale(
  whaleAddress: string,
  cutoffFixed: Date,
  minTransactionSize: number = 500, // Default $500 minimum
) {
  const txns = await whaleAllTransactionModelV2
    .find({ whaleAddress, timestamp: { $gte: cutoffFixed } })
    .sort({ timestamp: 1 })
    .lean()

  const openBuys: Record<string, any[]> = {}
  const tokensWithCompleted: Set<string> = new Set()
  let completed = 0
  let profitable = 0
  const roiList: number[] = []

  for (const tx of txns) {
    const buyAmount = parseFloat(tx.amount?.buyAmount || '0')
    const sellAmount = parseFloat(tx.amount?.sellAmount || '0')
    const buyPrice = parseFloat(tx.tokenPrice?.buyTokenPrice || '0')
    const sellPrice = parseFloat(tx.tokenPrice?.sellTokenPrice || '0')

    const isBuy =
      tx.type === 'buy' || (tx.type === 'both' && tx.bothType?.[0]?.buyType)
    const isSell =
      tx.type === 'sell' || (tx.type === 'both' && tx.bothType?.[0]?.sellType)

    // Handle BUY part - only count if meets minimum transaction size
    if (isBuy && buyAmount >= minTransactionSize) {
      const buyToken = tx.tokenOutSymbol
      if (buyToken) {
        openBuys[buyToken] = openBuys[buyToken] || []
        openBuys[buyToken].push({
          original: buyAmount,
          remaining: buyAmount,
          buyPrice,
          counted: false,
        })
      }
    }

    // Handle SELL part
    if (isSell) {
      const sellToken = tx.tokenInSymbol
      if (sellToken && openBuys[sellToken]?.length) {
        let toSell = sellAmount

        while (toSell > 0 && openBuys[sellToken].length) {
          const lot = openBuys[sellToken][0]
          const match = Math.min(toSell, lot.remaining)
          lot.remaining -= match
          toSell -= match

          const soldSoFar = lot.original - lot.remaining
          if (soldSoFar >= 0.5 * lot.original && !lot.counted) {
            completed++
            tokensWithCompleted.add(sellToken)
            if (sellPrice > lot.buyPrice) profitable++

            // ➕ ROI calculation added here
            const roi = ((sellPrice - lot.buyPrice) / lot.buyPrice) * 100
            roiList.push(roi)

            lot.counted = true
          }

          if (lot.remaining <= 0) openBuys[sellToken].shift()
        }
      }
    }
  }

  const winRate = completed > 0 ? (profitable / completed) * 100 : 0
  const averageROI =
    roiList.length > 0
      ? parseFloat(
          (roiList.reduce((a, b) => a + b, 0) / roiList.length).toFixed(2),
        )
      : 0

  return {
    completedTrades: completed,
    profitable,
    tokenCount: tokensWithCompleted.size,
    averageROI: averageROI,
    winRate: Number(winRate.toFixed(2)),
  }
}

// ***************************    Calculate Smart Money label using 24 hour cron job    ************************
export const fetchSmartMoneyWhales = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const now = new Date()
    const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // 1) Find all addresses active in the last 24h
    const activeWhales = await whaleAllTransactionModelV2.distinct(
      'whaleAddress',
      { timestamp: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    )

    // 2) Also include everyone who already has "SMART MONEY" label
    const previouslyLabeled = await whaleWalletLabelModel
      .find({ whaleLabel: 'SMART MONEY' })
      .distinct('whaleAddress')

    const whalesToCheck = Array.from(
      new Set([...activeWhales, ...previouslyLabeled]),
    )

    const smartList: Array<{
      whaleAddress: string
      winRate: string
      averageROI: string
      tokenCount: number
      completedTrades: number
    }> = []

    for (const addr of whalesToCheck) {
      const [{ winRate, tokenCount, completedTrades, averageROI }] =
        await Promise.all([
          computeWinRateAndAvgROIForWhale(addr, cutoff30d, 500),
        ]) // $500 minimum transaction size

      const passesWinRate = winRate >= 60
      const passesROI = averageROI >= 100
      const passesSpread = tokenCount >= 5 // Reduced from 10 to 5
      const passesTrades = completedTrades >= 5 // Reduced from 10 to 5

      if (passesWinRate && passesROI && passesSpread && passesTrades) {
        smartList.push({
          whaleAddress: addr,
          winRate: winRate.toFixed(2),
          averageROI: averageROI.toFixed(2),
          tokenCount,
          completedTrades,
        })
      }
    }

    const validSmartWhales = new Set(smartList.map((w) => w.whaleAddress))

    // 🔁 Remove label from those who no longer qualify
    await syncWhaleLabels('SMART MONEY', previouslyLabeled, validSmartWhales)

    // 4) Upsert each currently qualified whale
    await Promise.all(
      smartList.map(async ({ whaleAddress }) => {
        await addWhaleLabel({
          whaleAddress,
          label: 'SMART MONEY',
          whaleTokenSymbol: 'N/A',
          whaleTokenImageUrl: 'N/A',
        })
      }),
    )

    return res.status(200).json({
      success: true,
      smartMoneyWhales: smartList,
    })
  },
)

// ***************************    Calculate Heavy Accumulator label using 24 hour cron job    ************************
interface Candidate {
  whaleAddress: string
  whaleTokenSymbol: string
  whaleTokenURL: string
  tokenSymbol: string
  tokenAddress: string
  totalTokenBuyAmountUSD: number
  totalTokenBuyAmount: number
  totalTokenSellAmount: number
  buyEvents: number
  firstBuy: Date
  lastBuy: Date
}

async function findHeavyAccumulators(): Promise<Candidate[]> {
  const now = new Date()
  const accumulationWindowStart = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1000,
  ) // Look 7 days back for accumulation (rolling 7 days)

  // Step 1: Find whales who bought multiple times and accumulated within past 7 days
  const pipeline = [
    // Step 1: Match only 'buy' or 'both' events
    {
      $match: {
        timestamp: { $gte: accumulationWindowStart },
        $or: [{ type: 'buy' }, { type: 'both', 'bothType.0.buyType': true }],
      },
    },
    // Step 2: Group buys by whale and tokenOut
    {
      $group: {
        _id: {
          whaleAddress: '$whaleAddress',
          whaleTokenSymbol: '$whaleTokenSymbol',
          whaleTokenURL: '$whaleTokenURL',
          tokenSymbol: '$tokenOutSymbol',
          tokenAddress: '$tokenOutAddress',
        },
        totalTokenBuyAmountUSD: {
          $sum: {
            // $toDouble: '$amount.buyAmount',
            $convert: {
              input: '$amount.buyAmount',
              to: 'double',
              onError: 0,
              onNull: 0,
            },
          },
        },
        totalTokenBuyAmount: {
          $sum: {
            // $toDouble: '$tokenAmount.buyTokenAmount',
            $convert: {
              input: '$tokenAmount.buyTokenAmount',
              to: 'double',
              onError: 0,
              onNull: 0,
            },
          },
        },
        buyEvents: { $sum: 1 },
        firstBuy: { $min: '$timestamp' },
        lastBuy: { $max: '$timestamp' },
      },
    },
    // Step 3: Only whales with multiple buys
    {
      $match: {
        buyEvents: { $gte: 2 },
      },
    },
    // Step 4: Only whales who bought > $500K
    {
      $match: {
        totalTokenBuyAmountUSD: { $gt: 500000 },
      },
    },
    {
      $project: {
        whaleAddress: '$_id.whaleAddress',
        whaleTokenSymbol: '$_id.whaleTokenSymbol',
        whaleTokenURL: '$_id.whaleTokenURL',
        tokenSymbol: '$_id.tokenSymbol',
        tokenAddress: '$_id.tokenAddress',
        totalTokenBuyAmountUSD: 1,
        totalTokenBuyAmount: 1,
        buyEvents: 1,
        firstBuy: 1,
        lastBuy: 1,
      },
    },
  ]

  const raw = await whaleAllTransactionModelV2.aggregate<Candidate>(pipeline)
  return raw
}

// Helper function to check current holdings for a whale
async function checkCurrentHoldings(whaleAddress: string): Promise<number> {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const result = await whaleAllTransactionModelV2.aggregate([
    {
      $match: {
        whaleAddress,
        timestamp: { $gte: sevenDaysAgo },
        $or: [
          { type: 'buy' },
          { type: 'both', 'bothType.0.buyType': true },
          { type: 'sell' },
          { type: 'both', 'bothType.0.sellType': true },
        ],
      },
    },
    {
      $group: {
        _id: '$tokenOutAddress',
        totalBought: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ['$type', 'buy'] },
                  {
                    $and: [
                      { $eq: ['$type', 'both'] },
                      { $eq: ['$bothType.0.buyType', true] },
                    ],
                  },
                ],
              },
              {
                $convert: {
                  input: '$amount.buyAmount',
                  to: 'double',
                  onError: 0,
                  onNull: 0,
                },
              },
              0,
            ],
          },
        },
        totalSold: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ['$type', 'sell'] },
                  {
                    $and: [
                      { $eq: ['$type', 'both'] },
                      { $eq: ['$bothType.0.sellType', true] },
                    ],
                  },
                ],
              },
              {
                $convert: {
                  input: '$amount.sellAmount',
                  to: 'double',
                  onError: 0,
                  onNull: 0,
                },
              },
              0,
            ],
          },
        },
      },
    },
    {
      $project: {
        netHoldings: { $subtract: ['$totalBought', '$totalSold'] },
      },
    },
    {
      $group: {
        _id: null,
        totalHoldings: { $sum: '$netHoldings' },
      },
    },
  ])

  return result.length > 0 ? result[0].totalHoldings : 0
}

export const fetchHeavyAccumulatorWhales = catchAsyncErrors(
  async (req: Request, res: Response) => {
    try {
      // Get addresses that currently have the label
      const previouslyLabeled = await whaleWalletLabelModel
        .find({ whaleLabel: 'HEAVY ACCUMULATOR' })
        .distinct('whaleAddress')

      const candidates = await findHeavyAccumulators()
      const now = new Date()
      const qualifiers: Candidate[] = []

      for (const c of candidates) {
        const {
          whaleAddress,
          tokenSymbol,
          tokenAddress,
          whaleTokenSymbol,
          totalTokenBuyAmountUSD,
          totalTokenBuyAmount,
          lastBuy,
          firstBuy,
        } = c

        const holdingDuration = now.getTime() - new Date(lastBuy).getTime()
        const heldAtLeast7Days = holdingDuration >= 7 * 24 * 60 * 60 * 1000 // 7 days

        if (!heldAtLeast7Days) continue

        // Step 2: Calculate net holding by checking sells in the 7-day period *after* last buy
        const holdingWindowStart = new Date(new Date(lastBuy).getTime())
        const holdingWindowEnd = new Date(
          holdingWindowStart.getTime() + 7 * 24 * 60 * 60 * 1000,
        )

        const sellEvents = await whaleAllTransactionModelV2.aggregate([
          {
            $match: {
              whaleAddress,
              timestamp: {
                $gte: holdingWindowStart,
                $lte: holdingWindowEnd,
              },
              $or: [
                {
                  // Direct sell
                  type: 'sell',
                  tokenInAddress: tokenAddress,
                },
                {
                  // Mixed buy/sell with sellType true
                  type: 'both',
                  'bothType.0.sellType': true,
                  tokenInAddress: tokenAddress,
                },
              ],
            },
          },
          {
            $group: {
              _id: null,
              totalTokenSellAmount: {
                $sum: {
                  $convert: {
                    input: '$tokenAmount.sellTokenAmount',
                    to: 'double',
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
            },
          },
        ])

        const totalSellAmount =
          sellEvents.length > 0 ? sellEvents[0].totalTokenSellAmount : 0
        const sellRatio = totalSellAmount / totalTokenBuyAmount

        const qualifies =
          totalTokenBuyAmountUSD > 500_000 &&
          heldAtLeast7Days &&
          sellRatio < 0.2

        if (qualifies) {
          qualifiers.push({ ...c })
        }
      }

      const currentlyQualified = new Set(qualifiers.map((q) => q.whaleAddress))

      // Step 2: Check if previously labeled whales still have > $500K holdings
      const stillQualified = new Set<string>()
      for (const addr of previouslyLabeled) {
        const currentHoldings = await checkCurrentHoldings(addr)
        if (currentHoldings > 500000) {
          stillQualified.add(addr)
        }
      }

      // Combine newly qualified and still qualified whales
      const allQualified = new Set([...currentlyQualified, ...stillQualified])

      // Remove label from whales who no longer qualify
      await syncWhaleLabels(
        'HEAVY ACCUMULATOR',
        previouslyLabeled,
        allQualified,
      )

      // Step 3: Add/update label for currently qualified whales (with 7-day lock)
      await Promise.all(
        qualifiers.map(
          async ({ whaleAddress, whaleTokenSymbol, whaleTokenURL }) => {
            await addWhaleLabel({
              whaleAddress,
              label: 'HEAVY ACCUMULATOR',
              whaleTokenSymbol: whaleTokenSymbol,
              whaleTokenImageUrl: whaleTokenURL,
            })
          },
        ),
      )

      // console.log('HEAVY ACCUMULATORS:')
      qualifiers.forEach((q) => {
        console.log(
          ` - Address: ${q.whaleAddress}, Token: ${q.tokenSymbol}, USD Value: $${q.totalTokenBuyAmountUSD.toLocaleString()}`,
        )
      })

      res.status(200).json({
        success: true,
        data: {
          heavyAccumulators: qualifiers,
          totalHeavyAccumulatorsWhales: qualifiers.length,
        },
      })
    } catch (err: any) {
      console.error(`Error while fetching heavy accumulator whales`, err)
      res.status(500).json({
        success: false,
        error: err,
      })
    }
  },
)

// ***************************    Calculate Coordinated Group Label using 24 hour cron job    ************************
function pearsonCorrelationAndPValue(
  x: number[],
  y: number[],
): { r: number; p: number } {
  const n = x.length
  if (n !== y.length) throw new Error('Arrays must be same length')
  if (n < 2) throw new Error('Need at least two points for Pearson')

  // 1) compute means
  const meanX = x.reduce((a, b) => a + b, 0) / n
  const meanY = y.reduce((a, b) => a + b, 0) / n

  // 2) numerator = Σ((xi - meanX)*(yi - meanY))
  let numerator = 0
  for (let i = 0; i < n; i++) {
    numerator += (x[i] - meanX) * (y[i] - meanY)
  }

  // 3) denom = sqrt[ Σ(xi - meanX)^2 * Σ(yi - meanY)^2 ]
  let sumSqX = 0
  let sumSqY = 0
  for (let i = 0; i < n; i++) {
    sumSqX += (x[i] - meanX) ** 2
    sumSqY += (y[i] - meanY) ** 2
  }
  const denom = Math.sqrt(sumSqX * sumSqY)
  if (denom === 0) {
    // This happens if all x's are the same or all y's are the same.
    // In that case, by definition, r = 0 (no linear variation).
    return { r: 0, p: 1 }
  }

  const r = numerator / denom

  // 4) convert to t‐statistic: t = r * sqrt((n − 2)/(1 − r^2))
  const df = n - 2
  const t = r * Math.sqrt(df / (1 - r * r))

  // 5) two‐tailed p‐value = 2 * [1 − CDF(|t|; df)]
  const p = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df))
  return { r, p }
}

export const assignCoordinatedGroupLabels = catchAsyncErrors(
  async (req: Request, res: Response) => {
    try {
      const now = new Date()
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

      const txs = await whaleAllTransactionModelV2
        .find({ timestamp: { $gte: sevenDaysAgo } })
        .lean()

      const enrichedTxs = txs.flatMap((tx) => {
        const results = []

        if (
          tx.type === 'buy' ||
          (tx.type === 'both' && tx.bothType?.[0]?.buyType)
        ) {
          const usdValue = parseFloat((tx.amount as any)?.buyAmount || '0')
          if (usdValue >= 1000) {
            // Each trade ≥ $1K
            results.push({
              whaleAddress: tx.whaleAddress,
              token: tx.tokenOutAddress,
              timestamp: tx.timestamp,
              type: 'buy',
              usdValue,
            })
          }
        }

        if (
          tx.type === 'sell' ||
          (tx.type === 'both' && tx.bothType?.[0]?.sellType)
        ) {
          const usdValue = parseFloat((tx.amount as any)?.sellAmount || '0')
          if (usdValue >= 1000) {
            // Each trade ≥ $1K
            results.push({
              whaleAddress: tx.whaleAddress,
              token: tx.tokenInAddress,
              timestamp: tx.timestamp,
              type: 'sell',
              usdValue,
            })
          }
        }

        return results
      })

      const tokenMap: Record<
        string,
        { whaleAddress: string; timestamp: Date }[]
      > = {}
      for (const tx of enrichedTxs) {
        if (!tokenMap[tx.token]) tokenMap[tx.token] = []
        tokenMap[tx.token].push({
          whaleAddress: tx.whaleAddress,
          timestamp: tx.timestamp,
        })
      }

      for (const token in tokenMap) {
        tokenMap[token].sort(
          (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
        )
      }

      interface Cluster {
        token: string
        wallets: string[]
        timestamps: Map<string, Date>
      }

      const clusters: Cluster[] = []

      for (const [token, txs] of Object.entries(tokenMap)) {
        let left = 0
        for (let right = 0; right < txs.length; right++) {
          while (
            txs[right].timestamp.getTime() - txs[left].timestamp.getTime() >
            3600000
          )
            left++
          const slice = txs.slice(left, right + 1)
          const unique = Array.from(new Set(slice.map((t) => t.whaleAddress)))

          if (unique.length >= 3) {
            const existing = clusters.some(
              (c) =>
                c.token === token &&
                c.wallets.length === unique.length &&
                c.wallets.every((w, i) => w === unique[i]),
            )
            if (!existing) {
              const timestamps = new Map<string, Date>()
              for (const w of unique) {
                const tx = slice.find((t) => t.whaleAddress === w)!
                timestamps.set(w, tx.timestamp)
              }
              clusters.push({ token, wallets: unique.sort(), timestamps })
            }
          }
        }
      }

      const groupMap: Record<string, Cluster[]> = {}
      for (const c of clusters) {
        const key = c.wallets.join(',')
        if (!groupMap[key]) groupMap[key] = []
        groupMap[key].push(c)
      }

      const validGroups = Object.values(groupMap).filter((cs) => cs.length >= 2)
      const confirmed: Set<string> = new Set()

      for (const group of validGroups) {
        const wallets = group[0].wallets
        const vectors: Record<string, number[]> = {}

        for (const w of wallets) vectors[w] = []
        for (const cluster of group) {
          for (const w of wallets) {
            vectors[w].push(
              Math.floor(cluster.timestamps.get(w)!.getTime() / 1000),
            )
          }
        }

        let coordinated = true
        for (let i = 0; i < wallets.length && coordinated; i++) {
          for (let j = i + 1; j < wallets.length && coordinated; j++) {
            const { p } = pearsonCorrelationAndPValue(
              vectors[wallets[i]],
              vectors[wallets[j]],
            )
            if (p >= 0.05) coordinated = false
          }
        }

        if (coordinated) for (const w of wallets) confirmed.add(w)
      }

      const LABEL = 'COORDINATED GROUP'

      if (confirmed.size > 0) {
        const whaleGroup = Array.from(confirmed)

        const existingGroup = await coordinatedWhaleWalletLabelModel
          .findOne({
            whaleAddresses: { $all: whaleGroup, $size: whaleGroup.length },
          })
          .lean()

        if (existingGroup) {
          await coordinatedWhaleWalletLabelModel.updateOne(
            { _id: existingGroup._id },
            { $set: { recalculateCoordinatedGroupLabelTimestamp: new Date() } },
          )
        } else {
          await coordinatedWhaleWalletLabelModel.create({
            whaleAddresses: whaleGroup,
            createTimestamp: new Date(),
          })
        }
      }

      for (const w of confirmed) {
        const tx = await whaleAllTransactionModelV2
          .findOne({ whaleAddress: w })
          .sort({ timestamp: -1 })
          .lean()

        if (tx) {
          await addWhaleLabel({
            whaleAddress: w,
            label: LABEL,
            whaleTokenSymbol: tx.whaleTokenSymbol || '',
            whaleTokenImageUrl: tx.whaleTokenURL || '',
          })
        }
      }

      const expiry = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7-day rolling window

      const [expiredGroups, activeGroups] = await Promise.all([
        coordinatedWhaleWalletLabelModel
          .find({ recalculateCoordinatedGroupLabelTimestamp: { $lt: expiry } })
          .lean(),
        coordinatedWhaleWalletLabelModel
          .find({ recalculateCoordinatedGroupLabelTimestamp: { $gte: expiry } })
          .lean(),
      ])

      const expiredWhales = new Set<string>()
      expiredGroups.forEach((group) => {
        group.whaleAddresses.forEach((addr) => expiredWhales.add(addr))
      })

      const validWhales = new Set<string>()
      activeGroups.forEach((group) => {
        group.whaleAddresses.forEach((addr) => validWhales.add(addr))
      })

      const toRemove = Array.from(expiredWhales).filter(
        (addr) => !validWhales.has(addr),
      )

      await coordinatedWhaleWalletLabelModel.deleteMany({
        recalculateCoordinatedGroupLabelTimestamp: { $lt: expiry },
      })

      if (toRemove.length > 0) {
        await syncWhaleLabels(LABEL, toRemove, new Set())
      }

      return res.status(200).json({
        success: true,
        message: 'Coordinated group labels assigned successfully.',
        data: {
          confirmedWallets: Array.from(confirmed),
          totalConfirmed: confirmed.size,
          totalClusters: clusters.length,
        },
      })
    } catch (error) {
      console.error('Error in assignCoordinatedGroupLabels:', error)
      return res.status(500).json({
        success: false,
        message: 'An error occurred while assigning coordinated group labels.',
      })
    }
  },
)

// ***************************   TO DO Calculate Early Buyer label  ************************

// *********************  Calculate HOTNESS SCORE   ******************************
const LABEL_POINTS: Record<string, number> = {
  'SMART MONEY': 3,
  'HEAVY ACCUMULATOR': 2,
  'EARLY BUYER': 2,
  'INFLUENCER / KOL': 1,
  SNIPER: 1,
  'DORMANT WHALE': 1,
  'COORDINATED GROUP': 1,
  FLIPPER: 0,
}

const getWhaleRoiWinRate = async (
  whaleAddress: string,
): Promise<WhaleStats> => {
  try {
    const now = Date.now()
    const cutoff = new Date(now - 30 * 24 * 60 * 60 * 1000)

    const [{ winRate, averageROI }] = await Promise.all([
      computeWinRateAndAvgROIForWhale(whaleAddress, cutoff),
    ])

    return { winRate, averageROI }
  } catch (err) {
    console.error(`error fetching the whale's ROI and win rate`, err)
    // return some sensible defaults instead of undefined
    return { winRate: 0, averageROI: 0 }
  }
}

export const getHotnessScore = async (
  txSignature: string,
  whaleAddress: string,
  txAmount: number,
  txMarketCap: number,
  tokenAddress: string,
) => {
  try {
    let hotnessScore = 0
    let volumeSpikeBonus = 0
    const now = new Date()

    // 2. Apply Whale Profiling Bonus
    const record: IWhaleWalletLabel | null = await whaleWalletLabelModel
      .findOne({ whaleAddress })
      .lean()
      .exec()

    if (!record) {
      console.warn(
        `No label data found for ${whaleAddress}, skipping label-based score`,
      )
    } else {
      const totalScore = record.whaleLabel.reduce((sum, label) => {
        const normalized = label
          .replace(/[^\w\s\/]/g, '')
          .trim()
          .toUpperCase()
        const pts = LABEL_POINTS[normalized] ?? 0
        return sum + pts
      }, 0)
      hotnessScore += totalScore
    }

    // 3. Apply Whale Historical Success Bonus (Win Rate + ROI%)
    const { winRate, averageROI } = await getWhaleRoiWinRate(whaleAddress)
    console.log(`winRate`, winRate, averageROI)

    let performanceBonus = 0
    if (winRate >= 60 && averageROI >= 200) {
      performanceBonus = 3
    } else if (
      (winRate >= 40 && winRate < 60) ||
      (averageROI >= 100 && averageROI < 200)
    ) {
      performanceBonus = 2
    } else if (
      (winRate >= 20 && winRate < 40) ||
      (averageROI >= 50 && averageROI < 100)
    ) {
      performanceBonus = 1
    } else if (winRate < 10 && averageROI < 0) {
      performanceBonus = -1
    }
    hotnessScore += performanceBonus

    // 4. Apply Transaction Size Bonus
    let sizeBonus = 0
    if (txAmount > 20000) {
      sizeBonus = 3
    } else if (txAmount >= 5000) {
      sizeBonus = 2
    } else if (txAmount >= 1000) {
      sizeBonus = 1
    } else if (txAmount < 500) {
      sizeBonus = -2
    }
    hotnessScore += sizeBonus

    // 5. Apply Market Cap at Buy Time Bonus
    let capBonus = 0
    if (txMarketCap < 1_000_000) {
      capBonus = 3
    } else if (txMarketCap < 5_000_000) {
      capBonus = 2
    } else if (txMarketCap < 20_000_000) {
      capBonus = 1
    }
    hotnessScore += capBonus

    // 6. Apply Volume Spike Bonus
    const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000)
    const txs = await whaleAllTransactionModelV2.aggregate([
      {
        $match: {
          tokenOutAddress: tokenAddress,
          timestamp: { $gte: fifteenMinsAgo },
          $or: [{ type: 'buy' }, { type: 'both', 'bothType.buyType': true }],
        },
      },
      { $unwind: '$amount' },
      { $unwind: '$marketCap' },
      { $unwind: '$bothType' },
      {
        $match: {
          $or: [{ type: 'buy' }, { type: 'both', 'bothType.buyType': true }],
        },
      },
      {
        $group: {
          _id: '$tokenOutAddress',
          inflow: {
            $sum: {
              $toDouble: '$amount.buyAmount',
            },
          },
          whales: { $addToSet: '$whaleAddress' },
          symbol: { $first: '$tokenOutSymbol' },
          marketCap: { $first: '$marketCap.buyMarketCap' },
        },
      },
    ])

    if (txs.length === 0) {
      // No recent buys in the last 15 minutes—just log and skip volume‐spike logic
      console.log(
        `No "buy" txs in the last 15 mins for ${tokenAddress}; skipping volume spike bonus.`,
      )
    } else {
      const token = txs[0]
      const inflow = token.inflow || 0

      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const inflow24h = await whaleAllTransactionModelV2.aggregate([
        {
          $match: {
            tokenOutAddress: tokenAddress,
            timestamp: { $gte: dayAgo },
            $or: [{ type: 'buy' }, { type: 'both', 'bothType.buyType': true }],
          },
        },
        { $unwind: '$amount' },
        { $unwind: '$bothType' },
        {
          $match: {
            $or: [{ type: 'buy' }, { type: 'both', 'bothType.buyType': true }],
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $toDouble: '$amount.buyAmount',
              },
            },
          },
        },
      ])

      const total24h = inflow24h?.[0]?.total || 0
      const avgPerHour = total24h / 24
      const spikeRatio = avgPerHour ? inflow / avgPerHour : 0
      console.log(`volume spike x times: ${spikeRatio.toFixed(2)}`)

      if (spikeRatio > 5) {
        volumeSpikeBonus = -1
      } else if (spikeRatio >= 3) {
        volumeSpikeBonus = 2
      } else if (spikeRatio >= 2) {
        volumeSpikeBonus = 1
      }
      hotnessScore += volumeSpikeBonus
      console.log(
        `hotnessScore after volume spike: ${hotnessScore} (bonus: ${volumeSpikeBonus})`,
      )
    }

    // 7. Apply Timing Bonus (Early Whale Entries)
    const hotnessRecord = await hotnessScoreModel
      .findOne({ tokenAddress }, { createTimestamp: 0 })
      .lean()

    let timeBonusScore = 0
    if (hotnessRecord) {
      const {
        firstBuyTxnSignature,
        isFirstBuyCompleted,
        uniqueWhaleAddresses,
      } = hotnessRecord
      let uniqueWhalesCount = uniqueWhaleAddresses.length

      if (firstBuyTxnSignature === txSignature) {
        timeBonusScore += 2
      }
      if (uniqueWhalesCount < 6) {
        timeBonusScore += 1
      }
      // Pending point as
      //   After Coin Already >5x (-1)
      hotnessScore += timeBonusScore
    } else {
      console.log(`data are not available for the token (hotness score)`)
    }

    //   8. Apply Repetition Penalty
    const start = startOfUTCDay(now),
      end = endOfUTCDay(now)
    const isMultipleBuySameCoin = await purchaseRecordModel.exists({
      tokenAddress,
      whaleAddress,
      isDailyLimitReached: true,
      timestamp: { $gte: start, $lte: end },
    })

    if (isMultipleBuySameCoin) {
      console.log(`This whale has already bought this coin 2 times today.`)
      hotnessScore -= 1
    }
    hotnessScore = Math.max(0, Math.min(hotnessScore, 10))
    return hotnessScore
  } catch (err: any) {
    console.error(`error getting the hotness score`, err)
  }
}

// *************************    LeaderBoard for PNL     ******************************
export const getLeaderBoardPNL = catchAsyncErrors(
  async (req: Request, res: Response) => {
    try {
      const {
        timeframe = '7D',
        start,
        end,
        sortBy = 'roi',
        sortDir = 'desc',
        minRoi, // e.g. ?minRoi=10
      } = req.query as Record<string, string>

      const { from, to } = parseTimeframe(timeframe, start, end)
      const [aggResult] = await whaleAllTransactionModelV2
        .aggregate([
          {
            $match: { timestamp: { $gte: new Date(from), $lte: new Date(to) } },
          },

          {
            $addFields: {
              tokenAddress: {
                $cond: [
                  {
                    $or: [
                      { $eq: ['$type', 'buy'] },
                      {
                        $and: [
                          { $eq: ['$type', 'both'] },
                          {
                            $eq: [
                              { $arrayElemAt: ['$bothType.buyType', 0] },
                              true,
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  '$tokenOutAddress',
                  '$tokenInAddress',
                ],
              },
              symbol: {
                $cond: [
                  {
                    $or: [
                      { $eq: ['$type', 'buy'] },
                      {
                        $and: [
                          { $eq: ['$type', 'both'] },
                          {
                            $eq: [
                              { $arrayElemAt: ['$bothType.buyType', 0] },
                              true,
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  '$tokenOutSymbol',
                  '$tokenInSymbol',
                ],
              },
              image: {
                $cond: [
                  {
                    $or: [
                      { $eq: ['$type', 'buy'] },
                      {
                        $and: [
                          { $eq: ['$type', 'both'] },
                          {
                            $eq: [
                              { $arrayElemAt: ['$bothType.buyType', 0] },
                              true,
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  '$outTokenURL',
                  { $ifNull: ['$inTokenURL', '$whaleTokenURL'] },
                ],
              },
              usdValue: {
                $convert: {
                  input: {
                    $cond: [
                      {
                        $or: [
                          { $eq: ['$type', 'buy'] },
                          {
                            $and: [
                              { $eq: ['$type', 'both'] },
                              {
                                $eq: [
                                  { $arrayElemAt: ['$bothType.buyType', 0] },
                                  true,
                                ],
                              },
                            ],
                          },
                        ],
                      },
                      '$amount.buyAmount',
                      '$amount.sellAmount',
                    ],
                  },
                  to: 'double',
                  onError: 0,
                  onNull: 0,
                },
              },
              qty: {
                $convert: {
                  input: {
                    $cond: [
                      {
                        $or: [
                          { $eq: ['$type', 'buy'] },
                          {
                            $and: [
                              { $eq: ['$type', 'both'] },
                              {
                                $eq: [
                                  { $arrayElemAt: ['$bothType.buyType', 0] },
                                  true,
                                ],
                              },
                            ],
                          },
                        ],
                      },
                      '$tokenAmount.buyTokenAmount',
                      '$tokenAmount.sellTokenAmount',
                    ],
                  },
                  to: 'double',
                  onError: 0,
                  onNull: 0,
                },
              },

              inWindow: { $gte: ['$timestamp', from] },
            },
          },

          {
            $facet: {
              tokenStats: [
                {
                  $group: {
                    _id: {
                      whaleAddress: '$whaleAddress',
                      tokenAddress: '$tokenAddress',
                    },
                    symbol: { $first: '$symbol' },
                    image: { $first: '$image' },

                    // all-time buys (≤ to)
                    buyQtyTotal: {
                      $sum: {
                        $cond: [
                          {
                            $or: [
                              { $eq: ['$type', 'buy'] },
                              {
                                $and: [
                                  { $eq: ['$type', 'both'] },
                                  {
                                    $eq: [
                                      {
                                        $arrayElemAt: ['$bothType.buyType', 0],
                                      },
                                      true,
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                          '$qty',
                          0,
                        ],
                      },
                    },

                    buyCostTotal: {
                      $sum: {
                        $cond: [
                          {
                            $or: [
                              { $eq: ['$type', 'buy'] },
                              {
                                $and: [
                                  { $eq: ['$type', 'both'] },
                                  {
                                    $eq: [
                                      {
                                        $arrayElemAt: ['$bothType.buyType', 0],
                                      },
                                      true,
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                          '$usdValue',
                          0,
                        ],
                      },
                    },

                    // window-only buys (timestamp ≥ from && ≤ to)
                    buyQtyWindow: {
                      $sum: {
                        $cond: [
                          {
                            $and: [
                              {
                                $or: [
                                  { $eq: ['$type', 'buy'] },
                                  {
                                    $and: [
                                      { $eq: ['$type', 'both'] },
                                      {
                                        $eq: [
                                          {
                                            $arrayElemAt: [
                                              '$bothType.buyType',
                                              0,
                                            ],
                                          },
                                          true,
                                        ],
                                      },
                                    ],
                                  },
                                ],
                              },
                              '$inWindow',
                            ],
                          },
                          '$qty',
                          0,
                        ],
                      },
                    },

                    buyUsdWindow: {
                      $sum: {
                        $cond: [
                          {
                            $and: [
                              {
                                $or: [
                                  { $eq: ['$type', 'buy'] },
                                  {
                                    $and: [
                                      { $eq: ['$type', 'both'] },
                                      {
                                        $eq: [
                                          {
                                            $arrayElemAt: [
                                              '$bothType.buyType',
                                              0,
                                            ],
                                          },
                                          true,
                                        ],
                                      },
                                    ],
                                  },
                                ],
                              },
                              '$inWindow',
                            ],
                          },
                          '$usdValue',
                          0,
                        ],
                      },
                    },

                    // window-only sells (timestamp ≥ from && ≤ to)
                    sellQtyWindow: {
                      $sum: {
                        $cond: [
                          {
                            $and: [
                              {
                                $or: [
                                  { $eq: ['$type', 'sell'] },
                                  {
                                    $and: [
                                      { $eq: ['$type', 'both'] },
                                      {
                                        $eq: [
                                          {
                                            $arrayElemAt: [
                                              '$bothType.sellType',
                                              0,
                                            ],
                                          },
                                          true,
                                        ],
                                      },
                                    ],
                                  },
                                ],
                              },
                              '$inWindow',
                            ],
                          },
                          '$qty',
                          0,
                        ],
                      },
                    },

                    sellUsdWindow: {
                      $sum: {
                        $cond: [
                          {
                            $and: [
                              {
                                $or: [
                                  { $eq: ['$type', 'sell'] },
                                  {
                                    $and: [
                                      { $eq: ['$type', 'both'] },
                                      {
                                        $eq: [
                                          {
                                            $arrayElemAt: [
                                              '$bothType.sellType',
                                              0,
                                            ],
                                          },
                                          true,
                                        ],
                                      },
                                    ],
                                  },
                                ],
                              },
                              '$inWindow',
                            ],
                          },
                          '$usdValue',
                          0,
                        ],
                      },
                    },
                  },
                },
              ],

              recent: [
                { $match: { inWindow: true } },
                {
                  $project: {
                    _id: 0,
                    whaleAddress: 1,
                    timestamp: 1,
                    type: 1,
                    usdValue: 1,
                    symbol: 1,
                    tokenAddress: 1,
                    image: 1,
                    qty: 1,
                  },
                },
                { $sort: { timestamp: -1 } },
                { $limit: 10 },
              ],
            },
          },
        ])
        .allowDiskUse(true)
        .exec()

      const tokenStats = aggResult.tokenStats as Array<{
        _id: { whaleAddress: string; tokenAddress: string }
        symbol: string
        image: string
        buyQtyTotal: number
        buyCostTotal: number
        buyQtyWindow: number
        buyUsdWindow: number
        sellQtyWindow: number
        sellUsdWindow: number
      }>

      // console.log("tokenStats==========",tokenStats);

      type RawTokenEntry = {
        whaleAddress: string
        tokenAddress: string
        symbol: string
        image: string
        buyQtyTotal: number
        buyCostTotal: number
        buyQtyWindow: number
        buyUsdWindow: number
        sellQtyWindow: number
        sellUsdWindow: number
      }

      // 1️⃣ Build flatTokenEntries and also compute per-token realized PnL
      const flatTokenEntries: RawTokenEntry[] = []
      const tokenRealizedMap: Record<
        string,
        { realized: number; symbol: string; image: string }
      > = {}

      for (const t of tokenStats) {
        const e: RawTokenEntry = {
          whaleAddress: t._id.whaleAddress,
          tokenAddress: t._id.tokenAddress,
          symbol: t.symbol,
          image: t.image,
          buyQtyTotal: t.buyQtyTotal,
          buyCostTotal: t.buyCostTotal,
          buyQtyWindow: t.buyQtyWindow,
          buyUsdWindow: t.buyUsdWindow,
          sellQtyWindow: t.sellQtyWindow,
          sellUsdWindow: t.sellUsdWindow,
        }
        flatTokenEntries.push(e)

        // Compute this token's realized PnL (for this whale) in the window:
        const avgEntryPrice =
          e.buyQtyTotal > 0 ? e.buyCostTotal / e.buyQtyTotal : 0
        const avgSellPriceWindow =
          e.sellQtyWindow > 0 ? e.sellUsdWindow / e.sellQtyWindow : 0

        const realizedOnThisToken =
          (avgSellPriceWindow - avgEntryPrice) * e.sellQtyWindow

        // Accumulate into tokenRealizedMap[tokenAddress]
        if (!tokenRealizedMap[e.tokenAddress]) {
          tokenRealizedMap[e.tokenAddress] = {
            realized: 0,
            symbol: e.symbol,
            image: e.image,
          }
        }
        tokenRealizedMap[e.tokenAddress].realized += realizedOnThisToken
      }

      // console.log("flatTokenEntries===========",flatTokenEntries)

      // 2️⃣ Build topTokens array, sorted by realized PnL descending
      const topTokens = Object.entries(tokenRealizedMap)
        .map(([tokenAddress, { realized, symbol, image }]) => ({
          tokenAddress,
          realizedPnl: realized,
          symbol,
          image,
        }))
        .sort((a, b) => b.realizedPnl - a.realizedPnl)

      // console.log("topTokens===========",topTokens)

      // 3️⃣ Group flatTokenEntries by whaleAddress (for per‐whale summary)
      const perWhale: Record<string, RawTokenEntry[]> = {}
      flatTokenEntries.forEach((e) => {
        if (!perWhale[e.whaleAddress]) {
          perWhale[e.whaleAddress] = []
        }
        perWhale[e.whaleAddress].push(e)
      })

      // console.log("perWhale=======",perWhale);

      // 4️⃣ Fetch labels for each whale
      const uniqueWhales = Object.keys(perWhale)
      const labelDocs = await whaleWalletLabelModel
        .find(
          { whaleAddress: { $in: uniqueWhales } },
          { whaleAddress: 1, whaleLabel: 1, _id: 0 },
        )
        .lean()

      const labelMap: Record<string, string[]> = {}
      labelDocs.forEach((d) => {
        labelMap[d.whaleAddress] = d.whaleLabel
      })
      // console.log("labelMap========",labelMap)

      // 5️⃣ For each whale, compute totalInvested / realizedPnl / unrealizedPnl / ROI
      async function buildWhaleSummary(
        whale: string,
        entries: RawTokenEntry[],
      ) {
        let totalInvested = 0
        let totalRealized = 0
        let totalUnrealized = 0

        for (const e of entries) {
          const avgEntryPrice =
            e.buyQtyTotal > 0 ? e.buyCostTotal / e.buyQtyTotal : 0

          // Realized PnL on window sells for this token
          const avgSellPriceWindow =
            e.sellQtyWindow > 0 ? e.sellUsdWindow / e.sellQtyWindow : 0
          const realizedOnThisToken =
            (avgSellPriceWindow - avgEntryPrice) * e.sellQtyWindow
          totalRealized += realizedOnThisToken

          // Remaining quantity after window sells
          const remainingQtyAll = e.buyQtyTotal - e.sellQtyWindow
          if (remainingQtyAll > 0) {
            // fetch current price
            const cacheKey = `price:${e.tokenAddress}`
            let priceStr = await redisClient.get(cacheKey)
            if (!priceStr || priceStr === 'nan' || priceStr === '0') {
              priceStr =
                (await getTokenPrice(e.tokenAddress))?.toString() || '0'
              if (priceStr !== 'nan') {
                await redisClient.set(cacheKey, priceStr!)
              }
            }
            const currentPrice = parseFloat(priceStr!)

            const unrealPnl = (currentPrice - avgEntryPrice) * remainingQtyAll
            totalUnrealized += unrealPnl
          }

          // Only window buys count toward "invested"
          totalInvested += e.buyUsdWindow
        }

        const totalPnl = totalRealized + totalUnrealized
        const roi = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0

        return {
          whaleAddress: whale,
          labels: labelMap[whale] || [],
          totalInvested,
          realizedPnl: totalRealized,
          unrealizedPnl: totalUnrealized,
          roi,
        }
      }

      // 6️⃣ Build all whale summaries
      const allSummaries: Array<Awaited<ReturnType<typeof buildWhaleSummary>>> =
        await Promise.all(
          Object.entries(perWhale).map(([whaleAddress, entries]) =>
            buildWhaleSummary(whaleAddress, entries),
          ),
        )

      // console.log("allSummaries=========",allSummaries)

      // 7️⃣ Filter by minRoi (if provided)
      let filteredSummaries = allSummaries
      if (minRoi !== undefined) {
        const minRoiNum = parseFloat(minRoi)
        if (!Number.isNaN(minRoiNum)) {
          filteredSummaries = allSummaries.filter((ws) => ws.roi >= minRoiNum)
        }
      }
      // console.log("filteredSummaries--------",filteredSummaries)

      // 8️⃣ Sort per-whale summaries
      interface WhaleSummary {
        whaleAddress: string
        labels: string[]
        totalInvested: number
        realizedPnl: number
        unrealizedPnl: number
        roi: number
      }

      const keyMap: Record<string, keyof WhaleSummary> = {
        roi: 'roi',
        realized: 'realizedPnl',
        unrealized: 'unrealizedPnl',
        invested: 'totalInvested',
      }
      const sortKey = keyMap[sortBy.toLowerCase()] || 'roi'
      const isAsc = sortDir.toLowerCase() === 'asc'

      filteredSummaries.sort((a, b) => {
        const aRaw = a[sortKey]
        const bRaw = b[sortKey]

        const aNum =
          typeof aRaw === 'number' ? aRaw : parseFloat(String(aRaw) || '')
        const bNum =
          typeof bRaw === 'number' ? bRaw : parseFloat(String(bRaw) || '')

        const aVal = Number.isFinite(aNum) ? aNum : isAsc ? Infinity : -Infinity
        const bVal = Number.isFinite(bNum) ? bNum : isAsc ? Infinity : -Infinity

        return isAsc ? aVal - bVal : bVal - aVal
      })

      // 9️⃣ Take top 100 whales
      const top100 = filteredSummaries.slice(0, 100)

      // 1️⃣0️⃣ Return response including topTokens
      return res.json({
        timeframe,
        from,
        to,
        sortBy,
        sortDir,
        minRoi: minRoi !== undefined ? parseFloat(minRoi) : undefined,
        topTokens, // ← list of tokens sorted by realizedPnl in window
        data: top100, // ← per‐whale summaries
      })
    } catch (error) {
      console.error('get leaderboard:', error)
      return res.status(500).json({ error: 'Internal Server Error' })
    }
  },
)

// *********************    Prediction bot    ************************
function attachRealisedPnL(trades: any[]) {
  interface Pos {
    qty: number
    cost: number
  }
  const book: Record<string, Pos> = {}

  // /* oldest ➜ newest so buys come before sells of same token */
  const chron = [...trades].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )

  chron.forEach((tx) => {
    const tk = tx.tokenAddress
    const pos = (book[tk] ??= { qty: 0, cost: 0 })

    const qty = tx.qty
    const usd = tx.usdValue
    const price = qty ? usd / qty : 0

    if (tx.type === 'buy') {
      /* add to running inventory */
      pos.qty += qty
      pos.cost += usd
    } else {
      /* sell: compute pnl against *current* avg cost */
      const avgEntry = pos.qty ? pos.cost / pos.qty : 0
      tx.realizedPnl = (price - avgEntry) * qty

      /* reduce the book */
      pos.qty -= qty
      pos.cost -= avgEntry * qty
    }
  })

  return chron.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )
}

export const getWalletStats = async (req: Request, res: Response) => {
  try {
    const wallet = req.params.address
    const { timeframe = '7D', start, end } = req.query as Record<string, string>
    const { from, to } = parseTimeframe(timeframe, start, end)

    const labelDoc = await whaleWalletLabelModel
      .findOne({ whaleAddress: wallet }, { whaleLabel: 1, _id: 0 })
      .lean()

    const labels: string[] = labelDoc?.whaleLabel ?? []

    const [agg] = await whaleAllTransactionModelV2.aggregate([
      {
        $match: {
          whaleAddress: wallet,
          timestamp: { $gte: new Date(from), $lte: new Date(to) },
        },
      },

      // normalise tokenAddress / symbol / image
      {
        $addFields: {
          tokenAddress: {
            $cond: [
              {
                $or: [
                  { $eq: ['$type', 'buy'] },
                  {
                    $and: [
                      { $eq: ['$type', 'both'] },
                      {
                        $eq: [{ $arrayElemAt: ['$bothType.buyType', 0] }, true],
                      },
                    ],
                  },
                ],
              },
              '$tokenOutAddress',
              '$tokenInAddress',
            ],
          },
          symbol: {
            $cond: [
              {
                $or: [
                  { $eq: ['$type', 'buy'] },
                  {
                    $and: [
                      { $eq: ['$type', 'both'] },
                      {
                        $eq: [{ $arrayElemAt: ['$bothType.buyType', 0] }, true],
                      },
                    ],
                  },
                ],
              },
              '$tokenOutSymbol',
              '$tokenInSymbol',
            ],
          },
          image: {
            $cond: [
              {
                $or: [
                  { $eq: ['$type', 'buy'] },
                  {
                    $and: [
                      { $eq: ['$type', 'both'] },
                      {
                        $eq: [{ $arrayElemAt: ['$bothType.buyType', 0] }, true],
                      },
                    ],
                  },
                ],
              },
              '$outTokenURL',
              { $ifNull: ['$inTokenURL', '$whaleTokenURL'] },
            ],
          },
          usdValue: {
            $convert: {
              input: {
                $cond: [
                  {
                    $or: [
                      { $eq: ['$type', 'buy'] },
                      {
                        $and: [
                          { $eq: ['$type', 'both'] },
                          {
                            $eq: [
                              { $arrayElemAt: ['$bothType.buyType', 0] },
                              true,
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  '$amount.buyAmount',
                  '$amount.sellAmount',
                ],
              },
              to: 'double',
              onError: 0,
              onNull: 0,
            },
          },
          qty: {
            $convert: {
              input: {
                $cond: [
                  {
                    $or: [
                      { $eq: ['$type', 'buy'] },
                      {
                        $and: [
                          { $eq: ['$type', 'both'] },
                          {
                            $eq: [
                              { $arrayElemAt: ['$bothType.buyType', 0] },
                              true,
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  '$tokenAmount.buyTokenAmount',
                  '$tokenAmount.sellTokenAmount',
                ],
              },
              to: 'double',
              onError: 0,
              onNull: 0,
            },
          },

          inWindow: { $gte: ['$timestamp', from] }, // flag for timeframe filter
        },
      },

      {
        $facet: {
          /* ---- 1) rolling stats, one doc per token ---- */
          tokenStats: [
            {
              $group: {
                _id: '$tokenAddress',
                symbol: { $first: '$symbol' },
                image: { $first: '$image' },
                type: { $first: '$type' },
                timestamp: { $first: '$timestamp' },
                buyQtyTotal: {
                  $sum: {
                    $cond: [
                      {
                        $or: [
                          { $eq: ['$type', 'buy'] },
                          {
                            $and: [
                              { $eq: ['$type', 'both'] },
                              {
                                $eq: [
                                  {
                                    $arrayElemAt: ['$bothType.buyType', 0],
                                  },
                                  true,
                                ],
                              },
                            ],
                          },
                        ],
                      },
                      '$qty',
                      0,
                    ],
                  },
                },
                buyCostTotal: {
                  $sum: {
                    $cond: [
                      {
                        $or: [
                          { $eq: ['$type', 'buy'] },
                          {
                            $and: [
                              { $eq: ['$type', 'both'] },
                              {
                                $eq: [
                                  {
                                    $arrayElemAt: ['$bothType.buyType', 0],
                                  },
                                  true,
                                ],
                              },
                            ],
                          },
                        ],
                      },
                      '$usdValue',
                      0,
                    ],
                  },
                },

                buyQtyWindow: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          {
                            $or: [
                              { $eq: ['$type', 'buy'] },
                              {
                                $and: [
                                  { $eq: ['$type', 'both'] },
                                  {
                                    $eq: [
                                      {
                                        $arrayElemAt: ['$bothType.buyType', 0],
                                      },
                                      true,
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                          '$inWindow',
                        ],
                      },
                      '$qty',
                      0,
                    ],
                  },
                },
                buyUsdWindow: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          {
                            $or: [
                              { $eq: ['$type', 'buy'] },
                              {
                                $and: [
                                  { $eq: ['$type', 'both'] },
                                  {
                                    $eq: [
                                      {
                                        $arrayElemAt: ['$bothType.buyType', 0],
                                      },
                                      true,
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                          '$inWindow',
                        ],
                      },
                      '$usdValue',
                      0,
                    ],
                  },
                },

                sellQtyWindow: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          {
                            $or: [
                              { $eq: ['$type', 'sell'] },
                              {
                                $and: [
                                  { $eq: ['$type', 'both'] },
                                  {
                                    $eq: [
                                      {
                                        $arrayElemAt: ['$bothType.sellType', 0],
                                      },
                                      true,
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                          '$inWindow',
                        ],
                      },
                      '$qty',
                      0,
                    ],
                  },
                },
                sellUsdWindow: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          {
                            $or: [
                              { $eq: ['$type', 'sell'] },
                              {
                                $and: [
                                  { $eq: ['$type', 'both'] },
                                  {
                                    $eq: [
                                      {
                                        $arrayElemAt: ['$bothType.sellType', 0],
                                      },
                                      true,
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                          '$inWindow',
                        ],
                      },
                      '$usdValue',
                      0,
                    ],
                  },
                },
              },
            },
          ],

          /* ---- 2) recent 10 trades in window ---- */
          // recent: [
          //   { $match: { inWindow: true } },
          //   {
          //     $project: {
          //       _id: 0,
          //       timestamp: 1,
          //       type: 1,
          //       side:1,
          //       usdValue: '$usdValue',
          //       symbol: 1,
          //       tokenAddress: 1,

          //       image: {
          //         $cond: [
          //           {
          //             $or: [
          //               { $eq: ['$type', 'buy'] },
          //               {
          //                 $and: [
          //                   { $eq: ['$type', 'both'] },
          //                   {
          //                     $eq: [
          //                       { $arrayElemAt: ['$bothType.buyType', 0] },
          //                       true,
          //                     ],
          //                   },
          //                 ],
          //               },
          //             ],
          //           },
          //           '$outTokenURL',
          //           { $ifNull: ['$inTokenURL', '$whaleTokenURL'] },
          //         ],
          //       },
          //       qty: '$qty',

          //       inTokenURL: 1,
          //       outTokenURL: 1,
          //     },
          //   },
          //   { $sort: { timestamp: -1 } },
          //   { $limit: 10 },
          // ],
          recent: [
            { $match: { inWindow: true } },
            {
              $project: {
                timestamp: 1,
                type: 1,
                bothType: 1,
                tokenInAddress: 1,
                tokenOutAddress: 1,
                tokenInSymbol: 1,
                tokenOutSymbol: 1,
                amount: 1,
                tokenAmount: 1,
                inTokenURL: 1,
                outTokenURL: 1,
                whaleTokenURL: 1,
              },
            },
            {
              $project: {
                entries: {
                  $cond: [
                    { $eq: ['$type', 'both'] },
                    [
                      {
                        type: 'buy',
                        timestamp: '$timestamp',
                        tokenAddress: '$tokenOutAddress',
                        symbol: '$tokenOutSymbol',
                        usdValue: {
                          $convert: {
                            input: '$amount.buyAmount',
                            to: 'double',
                            onError: 0,
                            onNull: 0,
                          },
                        },
                        qty: {
                          $convert: {
                            input: '$tokenAmount.buyTokenAmount',
                            to: 'double',
                            onError: 0,
                            onNull: 0,
                          },
                        },
                        image: '$outTokenURL',
                        inTokenURL: null,
                        outTokenURL: '$outTokenURL',
                      },
                      {
                        type: 'sell',
                        timestamp: '$timestamp',
                        tokenAddress: '$tokenInAddress',
                        symbol: '$tokenInSymbol',
                        usdValue: {
                          $convert: {
                            input: '$amount.sellAmount',
                            to: 'double',
                            onError: 0,
                            onNull: 0,
                          },
                        },
                        qty: {
                          $convert: {
                            input: '$tokenAmount.sellTokenAmount',
                            to: 'double',
                            onError: 0,
                            onNull: 0,
                          },
                        },
                        image: { $ifNull: ['$inTokenURL', '$whaleTokenURL'] },
                        inTokenURL: {
                          $ifNull: ['$inTokenURL', '$whaleTokenURL'],
                        },
                        outTokenURL: null,
                      },
                    ],
                    [
                      {
                        type: '$type',
                        timestamp: '$timestamp',
                        tokenAddress: {
                          $cond: [
                            { $eq: ['$type', 'buy'] },
                            '$tokenOutAddress',
                            '$tokenInAddress',
                          ],
                        },
                        symbol: {
                          $cond: [
                            { $eq: ['$type', 'buy'] },
                            '$tokenOutSymbol',
                            '$tokenInSymbol',
                          ],
                        },
                        usdValue: {
                          $convert: {
                            input: {
                              $cond: [
                                { $eq: ['$type', 'buy'] },
                                '$amount.buyAmount',
                                '$amount.sellAmount',
                              ],
                            },
                            to: 'double',
                            onError: 0,
                            onNull: 0,
                          },
                        },
                        qty: {
                          $convert: {
                            input: {
                              $cond: [
                                { $eq: ['$type', 'buy'] },
                                '$tokenAmount.buyTokenAmount',
                                '$tokenAmount.sellTokenAmount',
                              ],
                            },
                            to: 'double',
                            onError: 0,
                            onNull: 0,
                          },
                        },
                        image: {
                          $cond: [
                            { $eq: ['$type', 'buy'] },
                            '$outTokenURL',
                            { $ifNull: ['$inTokenURL', '$whaleTokenURL'] },
                          ],
                        },
                        inTokenURL: {
                          $cond: [
                            { $eq: ['$type', 'buy'] },
                            null,
                            { $ifNull: ['$inTokenURL', '$whaleTokenURL'] },
                          ],
                        },
                        outTokenURL: {
                          $cond: [
                            { $eq: ['$type', 'buy'] },
                            '$outTokenURL',
                            null,
                          ],
                        },
                      },
                    ],
                  ],
                },
              },
            },
            { $unwind: '$entries' },
            { $replaceRoot: { newRoot: '$entries' } },
            { $sort: { timestamp: -1 } },
            { $limit: 10 },
          ],
        },
      },
    ])

    const tokenStats = agg.tokenStats as any[]
    // console.log("tokenAddress----------",agg.tokenAddress)
    // console.log("tokenStats-----------",tokenStats)

    const avgEntryMap: Record<string, number> = {}
    tokenStats.forEach((t) => {
      avgEntryMap[t._id] =
        t.buyQtyTotal > 0 ? t.buyCostTotal / t.buyQtyTotal : 0
    })

    const recentTrades = attachRealisedPnL(agg.recent as any[])

    interface Holding {
      tokenAddress: string
      quantity: number
      usdValue: number
      unrealizedPnl: number
      symbol?: string
      image?: string
    }
    let realizedPnl = 0
    let totalInvested = 0
    const holdings: Holding[] = []

    for (const t of tokenStats) {
      const {
        _id: token,
        symbol,
        image,
        buyQtyTotal,
        buyCostTotal,
        buyQtyWindow,
        buyUsdWindow,
        sellQtyWindow,
        sellUsdWindow,
      } = t

      totalInvested += buyUsdWindow

      // realised PnL uses sells in window vs avg entry price
      const avgEntryPrice = buyQtyTotal ? buyCostTotal / buyQtyTotal : 0
      const avgSellPrice = sellQtyWindow ? sellUsdWindow / sellQtyWindow : 0
      realizedPnl += (avgSellPrice - avgEntryPrice) * sellQtyWindow

      const remainingQty = buyQtyTotal - sellQtyWindow

      if (remainingQty > 0) {
        const cacheKey = `price:${token}`
        let pStr = await redisClient.get(cacheKey)
        if (!pStr) {
          pStr = await getTokenPrice(token)
          if (pStr) await redisClient.set(cacheKey, pStr)
        }
        const curPrice = parseFloat(pStr ?? '0')
        const unrealised = (curPrice - avgEntryPrice) * remainingQty

        holdings.push({
          tokenAddress: token,
          quantity: remainingQty,
          usdValue: remainingQty * curPrice,
          unrealizedPnl: unrealised,
          symbol,
          image,
        })
      }
    }

    const unrealizedPnl = holdings.reduce((s, h) => s + h.unrealizedPnl, 0)
    const roi =
      totalInvested > 0
        ? ((realizedPnl + unrealizedPnl) / totalInvested) * 100
        : 0

    const topHoldings = holdings
      .sort((a, b) => b.usdValue - a.usdValue)
      .slice(0, 5)

    res.json({
      wallet,
      labels,
      timeframe,
      from,
      to,
      realizedPnl,
      unrealizedPnl,
      totalInvested,
      roi,
      topHoldings,
      recentTrades:
        recentTrades.length === 0
          ? 'No recent trades in the selected timeframe.'
          : recentTrades,
    })
  } catch (err) {
    console.error('wallet stats:', err)
    res.status(500).json({ error: 'Internal Server Error' })
  }
}

function clampVal(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val))
}

export function scoreToken(m: AggregatedMetrics): number {
  const H = ((m.avgHotness ?? 0) / 10) * 100
  const W = clampVal(((m.uniqueWhales - 2) / 8) * 100)
  const S = clampVal((m.smartWallets / m.uniqueWhales) * 100)
  const V = clampVal((m.usdTotal / 100_000) * 100)
  const MC = clampVal((1 - m.avgEntryMc / 15_000_000) * 100)
  const spike = clampVal((m.volumeSpikeRatio / 5) * 100)

  let score = H * 0.25 + W * 0.2 + S * 0.2 + V * 0.1 + MC * 0.1 + spike * 0.1
  score = clampVal(score)
  return Math.round(score * 100) / 100
}

export async function aggregateLast7Days(): Promise<AggregatedMetrics[]> {
  const today = startOfDay(new Date())
  const sevenDaysAgo = subDays(today, 7)
  console.log('today :', today)
  console.log('sevenDaysAgo :', sevenDaysAgo)

  try {
    const pipeline = [
      // 1) filter buys >= $1000 last 7 days
      {
        $match: {
          type: { $in: ['buy', 'both'] },
          timestamp: { $gte: sevenDaysAgo, $lt: today },
        },
      },
      { $unwind: '$amount' },
      {
        $match: {
          $expr: {
            $gte: [
              {
                $convert: {
                  input: '$amount.buyAmount',
                  to: 'double',
                  onError: 0,
                  onNull: 0,
                },
              },
              1000,
            ],
          },
        },
      },
      {
        $match: {
          $or: [{ type: 'buy' }, { type: 'both', 'bothType.buyType': true }],
        },
      },

      // 2) lookup whale labels
      {
        $lookup: {
          from: whaleWalletLabelModel.collection.name,
          localField: 'whaleAddress',
          foreignField: 'whaleAddress',
          as: 'walletLabels',
        },
      },

      // 3) tag smart-money
      {
        $addFields: {
          isSmart: {
            $anyElementTrue: {
              $map: {
                input: '$walletLabels',
                as: 'wl',
                in: { $in: ['SMART MONEY', '$$wl.whaleLabel'] },
              },
            },
          },
          usdValue: {
            $convert: {
              input: '$amount.buyAmount',
              to: 'double',
              onError: 0,
              onNull: 0,
            },
          },
          txDay: { $substr: ['$timestamp', 0, 10] },
          mcNumeric: {
            $convert: {
              input: '$marketCap.buyMarketCap',
              to: 'double',
              onError: 0,
              onNull: 0,
            },
          },
          symbol: '$tokenOutSymbol',
        },
      },

      // 4) per token-day-wallet bucket
      {
        $group: {
          _id: {
            token: '$tokenOutAddress',
            wallet: '$whaleAddress',
            day: '$txDay',
          },
          usdValue: { $sum: '$usdValue' },
          mcSum: { $sum: '$mcNumeric' },
          txCount: { $sum: 1 },
          hotnessSum: { $sum: '$hotnessScore' },
          smartCount: { $sum: { $cond: ['$isSmart', 1, 0] } },
          symbol: { $first: '$symbol' },
        },
      },

      // 5) per token across days
      {
        $group: {
          _id: '$_id.token',
          symbol: { $first: '$symbol' },
          uniqueWhalesArr: { $addToSet: '$_id.wallet' },
          smartWhalesArr: {
            $addToSet: {
              $cond: [{ $gt: ['$smartCount', 0] }, '$_id.wallet', '$$REMOVE'],
            },
          },
          usdTotal: { $sum: '$usdValue' },
          avgEntryMc: { $avg: { $divide: ['$mcSum', '$txCount'] } },
          avgHotness: { $avg: { $divide: ['$hotnessSum', '$txCount'] } },
        },
      },

      // 6) project final metrics
      {
        $project: {
          _id: 0,
          tokenAddress: '$_id',
          symbol: 1,
          avgHotness: 1,
          uniqueWhales: { $size: '$uniqueWhalesArr' },
          smartWallets: { $size: '$smartWhalesArr' },
          smartWalletPct: {
            $cond: [
              { $eq: [{ $size: '$uniqueWhalesArr' }, 0] },
              0,
              {
                $multiply: [
                  {
                    $divide: [
                      { $size: '$smartWhalesArr' },
                      { $size: '$uniqueWhalesArr' },
                    ],
                  },
                  100,
                ],
              },
            ],
          },
          usdTotal: 1,
          avgEntryMc: 1,
        },
      },

      // 7) Limit results to prevent memory issues
      { $limit: 1000 },
    ]

    const txMetrics = (await whaleAllTransactionModelV2.aggregate(pipeline, {
      allowDiskUse: true, // Allow disk usage for large aggregations
      maxTimeMS: 300000, // 5 minute timeout
    })) as AggregatedMetrics[]

    const keyToday = today.toISOString().slice(0, 10)
    const key7 = subDays(today, 7).toISOString().slice(0, 10)
    console.log('key7: ', key7)

    const out: AggregatedMetrics[] = []

    // Process in batches to avoid memory issues
    const batchSize = 50
    for (let i = 0; i < txMetrics.length; i += batchSize) {
      const batch = txMetrics.slice(i, i + batchSize)

      for (const m of batch) {
        try {
          const todayVol =
            (
              await DailyTokenMetrics.findOne(
                { tokenAddress: m.tokenAddress, date: keyToday },
                { volume24h: 1, _id: 0 },
              ).lean()
            )?.volume24h ?? 0

          const avgVol =
            (
              await DailyTokenMetrics.aggregate([
                {
                  $match: {
                    tokenAddress: m.tokenAddress,
                    date: { $gte: key7, $lte: keyToday },
                  },
                },
                { $group: { _id: null, v: { $avg: '$volume24h' } } },
              ])
            )[0]?.v ?? 1

          out.push({ ...m, volumeSpikeRatio: todayVol / avgVol })
        } catch (error) {
          console.error(`Error processing metric for ${m.tokenAddress}:`, error)
          continue
        }
      }

      // Force garbage collection between batches if available
      if (global.gc && i % (batchSize * 2) === 0) {
        global.gc()
      }
    }

    return out
  } catch (error) {
    console.error('Error in aggregateLast7Days:', error)
    throw error
  }
}

export const getTopPicks = catchAsyncErrors(
  async (_req: Request, res: Response) => {
    try {
      const doc = await WeeklyPrediction.findOne()
        .sort({ generatedAt: -1 })
        .select('topPicks tweetPosted -_id')
        .exec()

      if (!doc) {
        return res.status(404).json({ message: 'No weekly predictions found.' })
      }

      console.log('doc---------', doc)

      // res.json(doc.topPicks)
      res.json({
        topPicks: doc.topPicks,
        tweeted: doc.tweetPosted,
      })
    } catch (error) {
      console.error('getTopPicks Failed:', error)
      res.status(500).json({ error: 'Internal Server Error' })
    }
  },
)
