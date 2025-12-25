import { Request, Response } from 'express'
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors'
import influencerWhaleTransactionsModelV2 from '../models/influencerWhaleTransactionsV2.model'
import { redisClient, TOKEN_MARKET_KEY } from '../config/redis'

// Enhanced market cap tiering function with  Cap
const marketCapTier = (cap: number): 'smallCaps' | 'midCaps' | 'largeCaps' => {
  if (cap < 10_000_000) return 'smallCaps' // $5M - $20M
  if (cap < 100_000_000) return 'midCaps' // $20M - $100M
  return 'largeCaps' // $100M+
}

// Enhanced function to generate kol summary with inflow/outflow
// Business Rules:
// 1. Shows Top 7 coins in each category and timeframe
// 2. A coin will be displayed only if kol count > 2
// 3. Coins are sorted by highest inflow/outflow (where KOLs are moving money)
// 4. Example: If user selects  Cap + 4h timeframe → Show Top 7 coins with highest KOL money flow
// 5. If only 5 coins meet condition (≥2 kol count), then only those 5 will be shown
const generateKolSummary = async (
  hours: number,
  label: string,
  flowType: 'inflow' | 'outflow' | 'all' = 'all',
) => {
  console.log('hours', hours)
  console.log('label', label)
  const since = new Date(Date.now() - hours * 60 * 60 * 1000)
  console.log('since', since)
  const trades = await influencerWhaleTransactionsModelV2
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
      buyCount: number
      sellCount: number
      marketCap: number
      price: number
      priceChange24h: number
      tokenURI: string
      latestTimestamp: number
      tokenAddress: string
      name: string
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
    } else if (trade.type === 'both') {
      // Process as two logical entries
      if (trade.bothType?.[0]?.buyType) {
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
      }
      if (trade.bothType?.[0]?.sellType) {
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
    }
  }

  const summary: any = {
    timeframe: label,
    smallCaps: [],
    midCaps: [],
    largeCaps: [],
  }

  console.log('tokenMap', tokenMap)

  for (const [symbol, data] of Object.entries(tokenMap)) {
    // Only include tokens with kol count > 2
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
    }

    // Initial tier assignment based on database market cap
    const tier = marketCapTier(data.marketCap)
    console.log(`Token ${symbol}: marketCap=${data.marketCap}, tier=${tier}`)
    summary[tier].push(tokenData)
  }

  // Sort by flow (inflow/outflow) - showing where KOLs are moving money
  // Primary sort: highest inflow OR outflow based on flowType
  // Secondary sort: kol count
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

        // Secondary sort: kol count
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
        const cached = await redisClient.hgetall(key)

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

      // Ensure kol count > 2 is maintained after re-categorization
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
  // Use flow-based sorting to show where KOLs are moving money
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

          // Secondary sort: kol count
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
export const getTokensWithMostKolActivityByMarketCap = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const { timeframe = '24H', marketCap = 'all', flowType = 'all' } = req.query

    try {
      // Get timeframe in hours
      const timeframeHours = getTimeframeHours(timeframe as string)
      console.log('timeframeHours', timeframeHours)
      // Calculate real-time data based on timeframe
      // Use flowType to sort by highest inflow/outflow (where KOLs are moving money)
      const summary = await generateKolSummary(
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
                chartData: [],
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
      console.error('Error fetching kol token data:', error)
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
