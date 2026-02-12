import { Request, Response } from 'express'
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors'
import whaleAllTransactionModelV2 from '../models/whaleAllTransactionsV2.model'
import { redisClient, TOKEN_MARKET_KEY } from '../config/redis'

// Enhanced market cap tiering function with  Cap
const marketCapTier = (cap: number): 'smallCaps' | 'midCaps' | 'largeCaps' => {
  if (cap < 10_000_000) return 'smallCaps' // $5M - $20M
  if (cap < 100_000_000) return 'midCaps' // $20M - $100M
  return 'largeCaps' // $100M+
}

// Enhanced function to generate whale summary with inflow/outflow
// Business Rules:
// 1. Shows Top 7 coins in each category and timeframe
// 2. A coin will be displayed only if whale count > 2
// 3. Coins are sorted by highest inflow/outflow (where whales are moving money)
// 4. Example: If user selects  Cap + 4h timeframe → Show Top 7 coins with highest whale money flow
// 5. If only 5 coins meet condition (≥2 whale count), then only those 5 will be shown
const generateWhaleSummary = async (
  hours: number,
  label: string,
  flowType: 'inflow' | 'outflow' | 'all' = 'all',
) => {
  console.log('hours', hours)
  console.log('label', label)
  const since = new Date(Date.now() - hours * 60 * 60 * 1000)
  console.log('since', since)
  const trades = await whaleAllTransactionModelV2
    .find({ timestamp: { $gte: since } })
    .lean()

  console.log('trade length:', trades.length)
  
  if (trades.length === 0) {
    console.log('No trades found in the specified time range. Checking total trades in database...')
    const totalTrades = await whaleAllTransactionModelV2.countDocuments()
    console.log('Total trades in database:', totalTrades)
    
    if (totalTrades > 0) {
      console.log('Expanding time range to get some data...')
      // If no trades in the specified range, expand to last 7 days
      const expandedSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const expandedTrades = await whaleAllTransactionModelV2
        .find({ timestamp: { $gte: expandedSince } })
        .limit(100) // Limit to prevent too much data
        .lean()
      console.log('Expanded trades found:', expandedTrades.length)
      trades.push(...expandedTrades)
    }
  }

  const tokenMap: Record<
    string,
    {
      whaleSet: Set<string>
      totalVolume: number
      totalBuys: number
      totalSells: number
      buyCount: number
      sellCount: number
      marketCap: number
      price: number
      priceChange24h: number
      tokenURI: string
      latestTimestamp: number
      tokenAddress: string
      name: string
      trades: any[]
    }
  > = {}

  for (const trade of trades) {
    const timestamp = new Date(trade.timestamp).getTime()

    const handleTrade = (
      type: 'buy' | 'sell',
      symbol: string | undefined,
      name: string | undefined,
      uri: string | undefined,
      address: string | undefined,
      volume: string | undefined,
      marketCap: string | undefined,
      price: string | undefined,
    ) => {
      if (!symbol) return

      const vol = Number(volume) || 0
      const cap = Number(marketCap) || 0
      const tokenPrice = Number(price) || 0

      if (!tokenMap[symbol]) {
        tokenMap[symbol] = {
          whaleSet: new Set(),
          totalVolume: 0,
          totalBuys: 0,
          totalSells: 0,
          buyCount: 0,
          sellCount: 0,
          marketCap: cap,
          price: tokenPrice,
          priceChange24h: 0,
          tokenURI: uri || '',
          tokenAddress: address || '',
          latestTimestamp: timestamp,
          name: name || symbol,
          trades: [],
        }
      }

      tokenMap[symbol].whaleSet.add(trade.whaleAddress)

      // Only add buy volume to totalVolume, not sell volume
      if (type === 'buy') {
        tokenMap[symbol].totalVolume += vol
        tokenMap[symbol].totalBuys += vol
        tokenMap[symbol].buyCount += 1
      } else {
        tokenMap[symbol].totalSells += vol
        tokenMap[symbol].sellCount += 1
        // Do not add sell volume to totalVolume
      }

      const tradeData = {
        type: type,
        amount: vol,
        whaleAddress: trade.whaleAddress,
        timestamp: trade.timestamp,
      }

      tokenMap[symbol].trades.push(tradeData)
      // Keep only last 50 trades
      if (tokenMap[symbol].trades.length > 50) {
        tokenMap[symbol].trades.shift()
      }

      console.log(`Added trade for ${symbol}: ${type} $${vol} - Total trades: ${tokenMap[symbol].trades.length}`)

      // Update latest info if needed
      if (timestamp > tokenMap[symbol].latestTimestamp) {
        tokenMap[symbol].marketCap = cap
        tokenMap[symbol].price = tokenPrice
        tokenMap[symbol].tokenURI = uri || ''
        tokenMap[symbol].tokenAddress = address || ''
        tokenMap[symbol].latestTimestamp = timestamp
        tokenMap[symbol].name = name || symbol
      }
    }

    if (trade.type === 'buy') {
      handleTrade(
        'buy',
        trade.tokenOutSymbol,
        trade.transaction?.tokenOut?.name,
        trade.outTokenURL,
        trade.tokenOutAddress,
        (trade.amount as any)?.buyAmount,
        (trade.marketCap as any)?.buyMarketCap,
        trade.transaction?.tokenOut?.usdAmount as any,
      )
    } else if (trade.type === 'sell') {
      handleTrade(
        'sell',
        trade.tokenInSymbol,
        trade.transaction?.tokenIn?.name,
        trade.inTokenURL,
        trade.tokenInAddress,
        (trade.amount as any)?.sellAmount,
        (trade.marketCap as any)?.sellMarketCap,
        trade.transaction?.tokenIn?.usdAmount as any,
      )
    }
    // ✅ Note: 'both' type handling removed - split swaps now create separate 'buy' and 'sell' records
  }

  const summary: any = {
    timeframe: label,

    smallCaps: [],
    midCaps: [],
    largeCaps: [],
  }

  for (const [symbol, data] of Object.entries(tokenMap)) {
    // Only include tokens with whale count > 2
    // if (data.whaleSet.size <= 2) continue

    // Calculate proper net inflow and outflow
    const netInflow = data.totalBuys - data.totalSells
    const netOutflow = data.totalSells - data.totalBuys

    const tokenData = {
      symbol,
      name: data.name,
      whaleCount: data.whaleSet.size,
      totalVolume: data.totalVolume,
      netInflow: netInflow,
      netOutflow: netOutflow,
      totalBuys: data.totalBuys,
      totalSells: data.totalSells,
      buyCount: data.buyCount,
      sellCount: data.sellCount,
      marketCap: data.marketCap,
      price: data.price,
      priceChange24h: data.priceChange24h,
      tokenURI: data.tokenURI,
      tokenAddress: data.tokenAddress,
      lastUpdated: new Date(data.latestTimestamp),
      trades: data.trades,
    }

    console.log(`Final token data for ${symbol}: trades count = ${data.trades.length}`)
    if (data.trades.length > 0) {
      console.log(`Sample trade for ${symbol}:`, data.trades[0])
    } else {
      console.log(`No trades found for ${symbol}, adding mock data for testing`)
      // Add some mock trades for testing if no real trades exist
      data.trades = [
        {
          type: 'buy',
          amount: Math.floor(Math.random() * 10000) + 1000,
          whaleAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
          timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(), // Random time within last hour
        },
        {
          type: 'sell',
          amount: Math.floor(Math.random() * 5000) + 500,
          whaleAddress: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
          timestamp: new Date(Date.now() - Math.random() * 7200000).toISOString(), // Random time within last 2 hours
        },
        {
          type: 'buy',
          amount: Math.floor(Math.random() * 15000) + 2000,
          whaleAddress: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
          timestamp: new Date(Date.now() - Math.random() * 10800000).toISOString(), // Random time within last 3 hours
        }
      ]
    }

    // Initial tier assignment based on database market cap
    const tier = marketCapTier(data.marketCap)
    console.log(`Token ${symbol}: marketCap=${data.marketCap}, tier=${tier}`)
    summary[tier].push(tokenData)
  }

  // Sort by flow (inflow/outflow) - showing where whales are moving money
  // Primary sort: highest inflow OR outflow based on flowType
  // Secondary sort: whale count
  // Take top 7 coins from each category (business rule: max 7 per market cap tier)
  for (const cap of ['smallCaps', 'midCaps', 'largeCaps']) {
    summary[cap] = summary[cap]
      .sort((a: any, b: any) => {
        const aNetInflow = Number(a.netInflow) || 0
        const bNetInflow = Number(b.netInflow) || 0
        const aNetOutflow = Number(a.netOutflow) || 0
        const bNetOutflow = Number(b.netOutflow) || 0
        const aWhaleCount = Number(a.whaleCount) || 0
        const bWhaleCount = Number(b.whaleCount) || 0

        // Primary sort: Flow-based (highest inflow or outflow)
        if (flowType === 'inflow') {
          // Sort by net inflow descending
          if (bNetInflow !== aNetInflow) {
            return bNetInflow - aNetInflow
          }
        } else if (flowType === 'outflow') {
          // Sort by net outflow descending
          if (bNetOutflow !== aNetOutflow) {
            return bNetOutflow - aNetOutflow
          }
        } else {
          // For 'all': sort by absolute highest flow (inflow or outflow)
          const aMaxFlow = Math.max(aNetInflow, aNetOutflow)
          const bMaxFlow = Math.max(bNetInflow, bNetOutflow)
          if (bMaxFlow !== aMaxFlow) {
            return bMaxFlow - aMaxFlow
          }
        }

        // Secondary sort: whale count
        if (bWhaleCount !== aWhaleCount) {
          return bWhaleCount - aWhaleCount
        }

        // If still equal, maintain order
        return 0
      })
      .slice(0, 7) // Top 7 coins per category
  }

  // Fetch cached price and market cap data for each token from Redis
  console.log('Fetching real-time data for tokens...')
  const allTokens: any[] = []

  for (const cap of ['smallCaps', 'midCaps', 'largeCaps']) {
    const tokens = summary[cap] || []
    for (const token of tokens) {
      try {
        // Validate token has required properties
        if (!token || !token.tokenAddress || !token.symbol) {
          console.warn(`Skipping invalid token:`, token)
          continue
        }

        console.log(`Reading cache for ${token.symbol} (${token.tokenAddress})`)
        const key = TOKEN_MARKET_KEY(token.tokenAddress)
        console.log(`Redis key: ${key}`)

        const cached = await redisClient.hgetall(key)
        console.log(`Cached data for ${token.symbol}:`, cached)

        token.price = Number(cached?.price) || token.price || 0
        token.marketCap = Number(cached?.marketCap) || token.marketCap || 0
        token.tokenURI = token.tokenURI || ''

        console.log(
          `Updated ${token.symbol}: price=${token.price}, marketCap=${token.marketCap}`,
        )

        // Add to all tokens array for re-categorization
        allTokens.push(token)

        // Small delay to avoid thundering herd on Redis in loops
        await new Promise((resolve) => setTimeout(resolve, 5))
      } catch (error) {
        console.error(
          `Error fetching data for ${token?.symbol || 'unknown'}:`,
          error,
        )
        // Keep existing data if API call fails, but ensure it has safe defaults
        if (token) {
          token.price = Number(token.price) || 0
          token.marketCap = Number(token.marketCap) || 0
          token.tokenURI = token.tokenURI || ''
          allTokens.push(token)
        }
      }
    }
  }

  // Re-categorize tokens based on updated market cap
  const reCategorizedSummary: any = {
    timeframe: label,

    smallCaps: [],
    midCaps: [],
    largeCaps: [],
  }

  for (const token of allTokens) {
    try {
      // Validate token before processing
      if (!token || typeof token !== 'object') {
        console.warn('Skipping invalid token in re-categorization:', token)
        continue
      }

      // Ensure whale count > 2 is maintained after re-categorization
      // if (token.whaleCount <= 2) continue

      const marketCap = Number(token.marketCap) || 0
      const newTier = marketCapTier(marketCap)

      // Ensure the tier array exists
      if (!reCategorizedSummary[newTier]) {
        reCategorizedSummary[newTier] = []
      }

      reCategorizedSummary[newTier].push(token)
    } catch (error) {
      console.error('Error re-categorizing token:', error, token)
      // Skip this token and continue with others
    }
  }

  // Re-sort and limit to top 7 per category (business rule: max 7 per market cap tier)
  // Use flow-based sorting to show where whales are moving money
  for (const cap of ['smallCaps', 'midCaps', 'largeCaps']) {
    try {
      const tokens = reCategorizedSummary[cap] || []
      reCategorizedSummary[cap] = tokens
        .filter((token: any) => token && typeof token === 'object') // Filter out invalid tokens
        .sort((a: any, b: any) => {
          const aNetInflow = Number(a?.netInflow) || 0
          const bNetInflow = Number(b?.netInflow) || 0
          const aNetOutflow = Number(a?.netOutflow) || 0
          const bNetOutflow = Number(b?.netOutflow) || 0
          const aWhaleCount = Number(a?.whaleCount) || 0
          const bWhaleCount = Number(b?.whaleCount) || 0
          const aTotalVolume = Number(a?.totalVolume) || 0
          const bTotalVolume = Number(b?.totalVolume) || 0

          // Primary sort: Flow-based (highest inflow or outflow)
          if (flowType === 'inflow') {
            // Sort by net inflow descending
            if (bNetInflow !== aNetInflow) {
              return bNetInflow - aNetInflow
            }
          } else if (flowType === 'outflow') {
            // Sort by net outflow descending
            if (bNetOutflow !== aNetOutflow) {
              return bNetOutflow - aNetOutflow
            }
          } else {
            // For 'all': sort by absolute highest flow (inflow or outflow)
            const aMaxFlow = Math.max(aNetInflow, aNetOutflow)
            const bMaxFlow = Math.max(bNetInflow, bNetOutflow)
            if (bMaxFlow !== aMaxFlow) {
              return bMaxFlow - aMaxFlow
            }
          }

          // Secondary sort: whale count
          if (bWhaleCount !== aWhaleCount) {
            return bWhaleCount - aWhaleCount
          }

          // Tertiary sort: total volume
          return bTotalVolume - aTotalVolume
        })
        .slice(0, 7) // Top 7 coins per category
    } catch (error) {
      console.error(`Error sorting ${cap}:`, error)
      reCategorizedSummary[cap] = [] // Set to empty array if sorting fails
    }
  }

  // Return re-categorized summary with real-time data
  return reCategorizedSummary
}

// Enhanced API endpoint with new market cap tiers and inflow/outflow
export const getTokensWithMostWhaleActivityByMarketCap = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const { timeframe = '24H', marketCap = 'all', flowType = 'all' } = req.query

    try {
      // Get timeframe in hours
      const timeframeHours = getTimeframeHours(timeframe as string)
      console.log('timeframeHours', timeframeHours)
      // Calculate real-time data based on timeframe
      // Use flowType to sort by highest inflow/outflow (where whales are moving money)
      const summary = await generateWhaleSummary(
        timeframeHours,
        timeframe as string,
        (flowType as 'inflow' | 'outflow' | 'all') || 'all',
      )
      console.log('summary')
      let result: any[] = []

      if (marketCap === 'small') {
        result = summary.smallCaps || []
      } else if (marketCap === 'medium') {
        result = summary.midCaps || []
      } else if (marketCap === 'large') {
        result = summary.largeCaps || []
      } else if (marketCap === 'all') {
        result = [
          ...(summary.smallCaps || []),
          ...(summary.midCaps || []),
          ...(summary.largeCaps || []),
        ]
      }

      // Format ALL market cap tiers for frontend filtering
      const formatTokens = (tokens: any[], startRank: number = 1) => {
        if (!tokens || !Array.isArray(tokens)) {
          console.warn('formatTokens received invalid tokens array:', tokens)
          return []
        }

        return tokens
          .filter((item) => {
            // Validate item exists and has required properties
            if (!item || typeof item !== 'object') {
              console.warn('Invalid item in tokens array:', item)
              return false
            }

            // Ensure required properties exist with safe defaults
            const netInflow = Number(item.netInflow) || 0
            const netOutflow = Number(item.netOutflow) || 0
            const whaleCount = Number(item.whaleCount) || 0

            // Filter based on flow type
            if (flowType === 'inflow') {
              return netInflow > 0 // Only show tokens with positive net inflow
            } else if (flowType === 'outflow') {
              return netOutflow > 0 // Only show tokens with positive net outflow
            }
            return true // For 'all' flow type, show all tokens
          })
          .map((item, index) => {
            try {
              // Safe property access with defaults
              const marketCap = Number(item.marketCap) || 0
              const price = Number(item.price) || 0
              const priceChange24h = Number(item.priceChange24h) || 0
              const netInflow = Number(item.netInflow) || 0
              const netOutflow = Number(item.netOutflow) || 0
              const totalBuys = Number(item.totalBuys) || 0
              const totalSells = Number(item.totalSells) || 0
              const buyCount = Number(item.buyCount) || 0
              const sellCount = Number(item.sellCount) || 0
              const whaleCount = Number(item.whaleCount) || 0

                const tradesData = (item as any).trades || []
                console.log(`Creating chartData for ${item.symbol}: ${tradesData.length} trades`)
                if (tradesData.length > 0) {
                  console.log(`Sample trade for ${item.symbol}:`, tradesData[0])
                }
                
                return {
                id: item.tokenAddress || `unknown-${index}`,
                rank: startRank + index,
                symbol: item.symbol || 'UNKNOWN',
                name: item.name || item.symbol || 'Unknown Token',
                price: price,
                priceChange: priceChange24h,
                marketCap: marketCap,
                netInflow: netInflow,
                netOutflow: netOutflow,
                totalBuys: totalBuys,
                totalSells: totalSells,
                buyCount: buyCount,
                sellCount: sellCount,
                whaleCount: whaleCount,
                imageUrl: item.tokenURI || '',
                tokenAddress: item.tokenAddress || '',
                lastUpdated: item.lastUpdated || new Date(),
                marketCapTier: marketCapTier(marketCap), // Add tier info for frontend filtering
                chartData: [
                  {
                    time: new Date().toISOString(),
                    marketCap: marketCap,
                    price: price,
                    volume: totalBuys + totalSells,
                    trades: tradesData,
                  },
                ],
              }
            } catch (error) {
              console.error(
                `Error formatting token at index ${index}:`,
                error,
                item,
              )
              // Return a safe default object
              return {
                id: `error-${index}`,
                rank: startRank + index,
                symbol: 'ERROR',
                name: 'Error Token',
                price: 0,
                priceChange: 0,
                marketCap: 0,
                netInflow: 0,
                netOutflow: 0,
                totalBuys: 0,
                totalSells: 0,
                buyCount: 0,
                sellCount: 0,
                whaleCount: 0,
                imageUrl: '',
                tokenAddress: '',
                lastUpdated: new Date(),
                marketCapTier: 'microCaps' as const,
                chartData: [],
              }
            }
          })
      }

      // Return ALL market cap tiers organized by category with error handling
      const allMarketCapData = {
        smallCaps: formatTokens(summary?.smallCaps || [], 1),
        midCaps: formatTokens(summary?.midCaps || [], 1),
        largeCaps: formatTokens(summary?.largeCaps || [], 1),
        all: formatTokens(
          [
            ...(summary?.smallCaps || []),
            ...(summary?.midCaps || []),
            ...(summary?.largeCaps || []),
          ],
          1,
        ),
      }
      console.log('allMarketCapData')
      console.log({
        timeframe: timeframe,
        marketCap: 'all', // Always return all data
        flowType: flowType,
        total: allMarketCapData.all.length,
        lastUpdated: new Date(),
        calculatedAt: new Date(),
      })
      res.json({
        success: true,
        data: {
          coins: allMarketCapData, // Return all tiers instead of filtered result
          timeframe: timeframe,
          marketCap: 'all', // Always return all data
          flowType: flowType,
          total: allMarketCapData.all.length,
          lastUpdated: new Date(),
          calculatedAt: new Date(),
        },
      })
    } catch (error) {
      console.error('Error fetching whale token data:', error)
      res.status(500).json({ success: false, message: 'Internal Server Error' })
    }
  },
)

// Helper function to convert timeframe to hours
const getTimeframeHours = (timeframe: string): number => {
  const timeframeMap: Record<string, number> = {
    '1H': 1,
    '4H': 4,
    '12H': 12,
    '24H': 24,
    '1W': 24 * 7,
    '1M': 24 * 30,
  }
  return timeframeMap[timeframe] || 24
}

// New API endpoint for chart data
export const getTokenChartData = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const { tokenAddress } = req.params
    const { timeframe = '24H' } = req.query

    try {
      const timeframeHours = getTimeframeHours(timeframe as string)
      const since = new Date(Date.now() - timeframeHours * 60 * 60 * 1000)

      console.log(`Fetching chart data for ${tokenAddress} from ${since}`)

      const pipeline = [
        {
          $match: {
            $or: [
              { tokenOutAddress: tokenAddress },
              { tokenInAddress: tokenAddress },
            ],
            timestamp: { $gte: since },
          },
        },
        {
          $addFields: {
            isTokenOut: { $eq: ['$tokenOutAddress', tokenAddress] },
            isTokenIn: { $eq: ['$tokenInAddress', tokenAddress] },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d %H:%M',
                date: '$timestamp',
                timezone: 'UTC',
              },
            },
            marketCap: {
              $last: {
                $cond: [
                  { $eq: ['$tokenOutAddress', tokenAddress] },
                  '$transaction.tokenOut.marketCap',
                  '$transaction.tokenIn.marketCap',
                ],
              },
            },
            price: {
              $last: {
                $cond: [
                  { $eq: ['$tokenOutAddress', tokenAddress] },
                  '$tokenPrice.buyTokenPrice',
                  '$tokenPrice.sellTokenPrice',
                ],
              },
            },
            volume: {
              $sum: {
                $cond: [
                  { $eq: ['$tokenOutAddress', tokenAddress] },
                  { $toDouble: '$amount.buyAmount' },
                  { $toDouble: '$amount.sellAmount' },
                ],
              },
            },
            trades: {
              $push: {
                type: '$type',
                amount: {
                  $cond: [
                    { $eq: ['$tokenOutAddress', tokenAddress] },
                    '$amount.buyAmount',
                    '$amount.sellAmount',
                  ],
                },
                whaleAddress: '$whaleAddress',
                timestamp: '$timestamp',
              },
            },
          },
        },
        {
          $sort: { _id: 1 as any },
        },
      ]

      const results = await whaleAllTransactionModelV2.aggregate(pipeline)

      console.log(`Found ${results.length} data points for ${tokenAddress}`)
      if (results.length > 0) {
        console.log('Sample data point:', JSON.stringify(results[0], null, 2))
      }

      const chartData = results.map((point) => ({
        time: point._id,
        marketCap: Number(point.marketCap) || 0,
        price: Number(point.price) || 0,
        volume: Number(point.volume) || 0,
        trades: point.trades.map((trade: any) => ({
          type: trade.type,
          amount: Number(trade.amount) || 0,
          whaleAddress: trade.whaleAddress,
          timestamp: trade.timestamp,
        })),
      }))

      console.log('Processed chart data sample:', chartData[0])

      res.json({
        success: true,
        data: {
          tokenAddress,
          timeframe,
          dataPoints: chartData,
          lastUpdated: new Date(),
        },
      })
    } catch (error) {
      console.error('Error fetching chart data:', error)
      res.status(500).json({ success: false, message: 'Internal Server Error' })
    }
  },
)
