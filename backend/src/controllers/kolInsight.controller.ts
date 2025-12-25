
import influencerWhaleTransactionsModelV2 from '../models/influencerWhaleTransactionsV2.model'
import { kolHotnessScoreModel, kolPurchaseRecordModel } from '../models/KolHotnessScore.model'

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

// ***************************   TO DO Calculate Early Buyer label  ************************

// *********************  Calculate HOTNESS SCORE   ******************************

const getKolRoiWinRate = async (
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

export const getKolHotnessScore = async (
  txSignature: string,
  kolAddress: string,
  txAmount: number,
  txMarketCap: number,
  tokenAddress: string,
  influencerFollowerCount: number,
) => {
  try {
    let hotnessScore = 0
    let volumeSpikeBonus = 0
    const now = new Date()
    // 2. Apply KOL Influence Bonus based on follower count
    let kolBonus = 0
    if (influencerFollowerCount >= 100000) {
      // Mega KOL
      kolBonus = 3
    } else if (influencerFollowerCount >= 10000) {
      // Mid KOL
      kolBonus = 2
    } else if (influencerFollowerCount >= 1000) {
      // Micro KOL
      kolBonus = 1
    }
    // Low influence KOLs (<1K followers) get 0 bonus
    hotnessScore += kolBonus


    // 3. Apply KOL Historical Success Bonus (based on ROI)
    const { winRate, averageROI } = await getKolRoiWinRate(kolAddress)
    console.log(`KOL ROI:`, averageROI)

    let kolPerformanceBonus = 0
    if (averageROI >= 200) {
      kolPerformanceBonus = 3
    } else if (averageROI >= 100 && averageROI < 200) {
      kolPerformanceBonus = 2  
    } else if (averageROI >= 50 && averageROI < 100) {
      kolPerformanceBonus = 1
    } else if (averageROI < 0) {
      kolPerformanceBonus = -1
    }
    hotnessScore += kolPerformanceBonus

   
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
    const txs = await influencerWhaleTransactionsModelV2.aggregate([
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
      const inflow24h = await influencerWhaleTransactionsModelV2.aggregate([
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

      if (spikeRatio >= 3) {
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
    const hotnessRecord = await kolHotnessScoreModel
      .findOne({ tokenAddress }, { createTimestamp: 0 })
      .lean()

    let timeBonusScore = 0
    if (hotnessRecord) {
      const {
        firstBuyTxnSignature,
        isFirstBuyCompleted,
        uniqueKolAddresses,
      } = hotnessRecord
      let uniqueKolAddressesCount = uniqueKolAddresses.length

      if (firstBuyTxnSignature === txSignature) {
        timeBonusScore += 2
      }
      if (uniqueKolAddressesCount < 3) {
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
    const isMultipleBuySameCoin = await kolPurchaseRecordModel.exists({
      tokenAddress,
      kolAddress,
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

// *******************    Calculate Win Rate/Average ROI/complete and profitable Trade  for hotness Score and Smart Money Label   *******************
async function computeWinRateAndAvgROIForWhale(
  whaleAddress: string,
  cutoffFixed: Date,
) {
  const txns = await influencerWhaleTransactionsModelV2
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

    // Handle BUY part
    if (isBuy) {
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
