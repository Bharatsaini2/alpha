import { spikeAlertModel } from '../models/spikeAlertModel'
import whaleAllTransactionModel from '../models/whale-all-transactions.model'
import whaleAllTransactionModelV2 from '../models/whaleAllTransactionsV2.model'
import { postToTwitterUsingAccount1 } from '../services/clusterAlert1'
import { postToTwitterUsingAccount2 } from '../services/clusterAlert2'
import { spikeAlertPostToTwitter } from '../services/insight-posts'
import { formatNumber } from './FormatNumber'

// isDormantWhale alert
export const isDormantWhale = async (whaleAddress: string) => {
  try {
    const now = new Date()

    const { timestamp }: any = await whaleAllTransactionModelV2
      .findOne({
        whaleAddress,
        timestamp: { $lt: now },
      })
      .sort({ timestamp: -1 })
      .lean()

    console.log(`timestamp`, timestamp)

    if (timestamp) {
      const lastTxTime = new Date(timestamp)
      const diffMs = now.getTime() - lastTxTime.getTime()
      const daysSinceLastTx = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      console.log('daysSinceLastTx----------', daysSinceLastTx)
      const isDormant = daysSinceLastTx > 30
      console.log('isDormant------------', isDormant)
      if (isDormant) {
        return {
          isDormant: isDormant,
          daysSinceLastTx: daysSinceLastTx,
        }
      } else {
        return null
      }
    }
  } catch (err: any) {
    console.error(`Error while getting the dormant status of the whale`, err)
    return { isDormant: false, daysSinceLastTx: null }
  }
}

// live rolling evaluation for volume spike alert
export const isTokenVolumeSpike = async (
  tokenAddress: string,
  tokenLatestMarketCap: number,
) => {
  const now = new Date()
  const sevenMinsAgo = new Date(now.getTime() - 7 * 60 * 1000) // get buy enrty time
  const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000) // get cooldown time for same token

  const oneMinAgo = new Date(now.getTime() - 1 * 60 * 1000)
  const twoMinAgo = new Date(now.getTime() - 2 * 60 * 1000)

  // Check cooldown
  const recentAlert = await spikeAlertModel.findOne({
    tokenOutAddress: tokenAddress,
    createdAt: { $gte: thirtyMinsAgo },
  })
  if (recentAlert) return

  // Get whale buys in the last 15 mins for this token
  const txs = await whaleAllTransactionModelV2.aggregate([
    {
      $match: {
        tokenOutAddress: tokenAddress,
        timestamp: { $gte: sevenMinsAgo },
        type: 'buy',  // ✅ Updated: Split swaps now create separate BUY records
      },
    },
    { $unwind: '$amount' },
    { $unwind: '$marketCap' },
    { $unwind: '$bothType' },
    {
      $match: {
        type: 'buy',  // ✅ Updated: Simplified query
      },
    },
    {
      $group: {
        _id: '$tokenOutAddress',
        inflow: {
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
        whales: { $addToSet: '$whaleAddress' },
        symbol: { $first: '$tokenOutSymbol' },
        marketCap: { $first: '$marketCap.buyMarketCap' },
        avgHotness: { $avg: '$hotnessScore' },
      },
    },
  ])

  if (!txs.length) return
  const token = txs[0]
  const inflow = token.inflow || 0
  const whaleCount = token.whales.length
  const avgHotness = token.avgHotness || []
  const latestMarketCap =
    Number(tokenLatestMarketCap) || Number(token.marketCap) || 0

  let isSniperInvolved = false

  if (token.whaleLabels && token.whaleLabels.length > 0) {
    for (const labels of token.whaleLabels) {
      if (Array.isArray(labels) && labels.includes('SNIPER')) {
        isSniperInvolved = true
        break
      }
    }
  }

  // Debug Log
  console.log('🔫 SNIPER TAG PRESENT:', isSniperInvolved)

  // list of buys in last 1 min
  const last1min = await whaleAllTransactionModelV2.countDocuments({
    tokenOutAddress: tokenAddress,
    timestamp: { $gte: oneMinAgo },
    type: 'buy',  // ✅ Updated: Split swaps now create separate BUY records
  })

  // list of buys in last 2 min
  const last2min = await whaleAllTransactionModelV2.countDocuments({
    tokenOutAddress: tokenAddress,
    timestamp: { $gte: twoMinAgo },
    type: 'buy',  // ✅ Updated: Split swaps now create separate BUY records
  })

  let matchedSpecialCondition: string[] = []

  //  CONDITION SET A → POST TO ACCOUNT 1
  const volThresholdAcc1 = isSniperInvolved ? 3000 : 7000
  if (
    latestMarketCap <= 2_000_000 &&
    last1min > 0 &&
    whaleCount >= 2 &&
    inflow >= volThresholdAcc1
  ) {
    matchedSpecialCondition.push('ACCOUNT_1')
  }

  //  CONDITION SET B → POST TO ACCOUNT 2
  const volThresholdAcc2 = isSniperInvolved ? 5000 : 10000
  if (
    latestMarketCap <= 3_000_000 &&
    last2min > 0 &&
    whaleCount >= 3 &&
    inflow >= volThresholdAcc2
  ) {
    matchedSpecialCondition.push('ACCOUNT_2')
  }

  // Thresholds
  let inflowThreshold = 0
  let minWhales = 0

  if (latestMarketCap < 10_000_000) {
    inflowThreshold = 9000
    minWhales = 3
  } else if (latestMarketCap <= 50_000_000) {
    inflowThreshold = 15000
    minWhales = 2
  } else {
    inflowThreshold = 30000
    minWhales = 3
  }

  if (inflow < inflowThreshold || whaleCount < minWhales) return

  // Get 24H inflow
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const inflow24h = await whaleAllTransactionModelV2.aggregate([
    {
      $match: {
        tokenOutAddress: tokenAddress,
        timestamp: { $gte: dayAgo },
        type: 'buy',  // ✅ Updated: Split swaps now create separate BUY records
      },
    },
    { $unwind: '$amount' },
    { $unwind: '$bothType' },
    {
      $match: {
        type: 'buy',  // ✅ Updated: Simplified query
      },
    },
    {
      $group: {
        _id: null,
        total: {
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
      },
    },
  ])

  const total24h = inflow24h?.[0]?.total || 0
  const avgPerHour = total24h / 24
  const spikeRatio = avgPerHour ? inflow / avgPerHour : 0

  if (spikeRatio < 3) return // Not a spike

  // ✅ ALERT
  const isLowMarketCap = latestMarketCap < 3_000_000
  // const endsWithFilteredSuffix =
  //   tokenAddress.endsWith('bonk') || tokenAddress.endsWith('boop')
  // const caLine = isLowMarketCap && !endsWithFilteredSuffix ? `• CA: ${tokenAddress}\n\n` : ''
  const caLine = isLowMarketCap ? `• CA: ${tokenAddress}\n\n` : ''

  let timeframeText = '7 minutes' // default

  if (
    matchedSpecialCondition.includes('ACCOUNT_1') &&
    matchedSpecialCondition.includes('ACCOUNT_2')
  ) {
    timeframeText = '1–2 minutes'
  } else if (matchedSpecialCondition.includes('ACCOUNT_1')) {
    timeframeText = '1 minute'
  } else if (matchedSpecialCondition.includes('ACCOUNT_2')) {
    timeframeText = '2 minutes'
  }

  const alert =
    `🚨 Whale Cluster Alert 🐋\n` +
    `$${token.symbol} just saw $${formatNumber(inflow)} inflow in the last ${timeframeText}\n` +
    `• ${whaleCount} new whales entered\n` +
    `• Volume surged ${spikeRatio.toFixed(2)}x vs 24H avg\n` +
    `• Market Cap: $${formatNumber(latestMarketCap)}\n` +
    `• Hotness Score: ${avgHotness.toFixed(1)}/10\n\n` +
    caLine +
    `Alpha powered by @AlphaBlockAI\n`

  await spikeAlertModel.create({
    tokenOutAddress: tokenAddress,
    symbol: token.symbol,
    inflow,
    latestMarketCap,
    spikeRatio,
    whaleCount,
    avgHotnessScore: avgHotness,
    tweet: alert,
    createdAt: new Date(),
  })

  let posted = false

  if (matchedSpecialCondition.includes('ACCOUNT_1')) {
    await postToTwitterUsingAccount1(alert)
    console.log('📢 Posted to Account 1 (alphabot101)')
    posted = true
  }

  if (matchedSpecialCondition.includes('ACCOUNT_2')) {
    await postToTwitterUsingAccount2(alert)
    console.log('📢 Posted to Account 2 (alphabot102)')
    posted = true
  }

  // If none of the new conditions matched → default posting
  if (!posted) {
    await spikeAlertPostToTwitter(alert)
    console.log('📢 Posted to DEFAULT Twitter account')
  }
  console.log(`📢 Spike alert posted for ${token.symbol}`)
}
