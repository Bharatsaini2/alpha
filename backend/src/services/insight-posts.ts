import { TwitterApi } from 'twitter-api-v2'
import dotenv from 'dotenv'
import { formatNumber } from '../utils/FormatNumber'
import { dormantWhaleAlertModel } from '../models/dormant-whale-alert.model'
import { whaleExitAlertModel } from '../models/whaleExitAlert.modal'
import { WeeklyPrediction } from '../models/weeklyPredictionSchema.model'
import { Types } from 'mongoose'
import influencerWhaleTransactionsModelV2 from '../models/influencerWhaleTransactionsV2.model'
import { getKolPreviewImageBuffer } from '../controllers/kolPreviewImage.controller'

dotenv.config()

if (
  !process.env.ALPHAX_AGENT_X_API_KEY ||
  !process.env.ALPHAX_AGENT_X_API_KEY_SECRET ||
  !process.env.ALPHAX_AGENT_X_ACCESS_TOKEN ||
  !process.env.ALPHAX_AGENT_X_ACCESS_TOKEN_SECRET
) {
  throw new Error('Missing Twitter API credentials in environment variables')
}

const client = new TwitterApi({
  appKey: process.env.ALPHAX_AGENT_X_API_KEY,
  appSecret: process.env.ALPHAX_AGENT_X_API_KEY_SECRET,
  accessToken: process.env.ALPHAX_AGENT_X_ACCESS_TOKEN,
  accessSecret: process.env.ALPHAX_AGENT_X_ACCESS_TOKEN_SECRET,
})

const InsightXClient = client.readWrite

// *************************    Tokens With Most Whale Activity (Segmented by Timeframe & Market Cap)   **************
// export const postToTwitter = async (timeframe: string, summary: any) => {
//   const tf = timeframe.toUpperCase()

//   const postCategoryTweet = async (
//     emoji: string,
//     label: string,
//     tokens: any[],
//   ) => {
//     if (!tokens?.length) return

//     const formattedTokens = tokens
//       .slice(0, 3)
//       .map(
//         (t: any) =>
//           `$${t.symbol}  ${t.whaleCount} 🐋 | +$${formatNumber(t.totalVolume)}`,
//       )
//       .join('\n')

//     const tweet =
//       `🕒 ${tf} Whale Activity\n${emoji} ${label}\n` + formattedTokens
//     // + `\n${ending}`;

//     try {
//       await InsightXClient.v2.tweet(tweet.slice(0, 280))
//       console.log(`[Twitter] Tweeted for: ${label}`)
//     } catch (error) {
//       console.error(`[Twitter Error: ${label}]`, error)
//     }
//   }

//   await postCategoryTweet('🐣', 'Small Cap Tokens', summary.smallCaps)
//   await postCategoryTweet('🧠', 'Mid Cap Tokens', summary.midCaps)
//   await postCategoryTweet('🐋', 'Large Cap Tokens', summary.largeCaps)
// }
export const postToTwitter = async (timeframe: string, summary: any) => {
  const tf = timeframe.toUpperCase()

  const formatWhaleTweet = (
    capLabel: string,
    tokens: any[],
    tfLabel: string,
  ): string | null => {
    if (!tokens?.length) return null

    const medalEmojis = ['🥇', '🥈', '🥉', '🏅']

    const lines = tokens.slice(0, 3).map((token: any, idx: number) => {
      const symbol = token.symbol?.startsWith('$')
        ? token.symbol
        : `$${token.symbol}`
      const volume = formatNumber(token.netInflow)

      return `${medalEmojis[idx]} ${symbol} +$${volume} | ${token.whaleCount} 🐋`
    })

    return (
      `Top ${capLabel} Coins with Most Whale Activity (${tfLabel})\n` +
      lines.join('\n') +
      `\n\nPowered by @AlphaBlockAI`
    )
  }

  const capMap = [
    { emoji: '🐣', label: 'Small Cap', data: summary.smallCaps },
    { emoji: '🧠', label: 'Mid Cap', data: summary.midCaps },
    { emoji: '🐋', label: 'Large Cap', data: summary.largeCaps },
  ]

  for (const cap of capMap) {
    const tweet = formatWhaleTweet(cap.label, cap.data, tf)
    if (!tweet) continue

    try {
      await InsightXClient.v2.tweet(tweet.slice(0, 280))
      console.log(`[Twitter] Tweeted for: ${cap.label}`)
    } catch (error) {
      console.error(`[Twitter Error: ${cap.label}]`, error)
    }
  }
}

// *******************     Big Activity / Volume Spike Alert    *******************
export const spikeAlertPostToTwitter = async (message: string) => {
  try {
    await InsightXClient.v2.tweet(message)
    console.log('✅ Tweet posted successfully!')
  } catch (err) {
    console.error('❌ Error posting tweet:', err)
  }
}

//  ************************     Dormant whale alert    *****************
export const dormantWhaleAlert = async (
  alertMessage: string,
  details: {
    whaleAddress: string
    whaleTokenSymbol: string
    tokenOutSymbol: string
    amount: number
    marketCap: number
    daysSinceLastTx: number
  },
) => {
  try {
    const doc = {
      ...details,
      alertMessage,
      tweet: false,
      createdAt: new Date(),
    }

    // Save alert
    const result = await dormantWhaleAlertModel.updateOne(
      { whaleAddress: details.whaleAddress, alertMessage },
      { $setOnInsert: doc },
      { upsert: true },
    )

    if (result.upsertedCount > 0) {
      console.log('✅ Dormant whale alert saved.')
    } else {
      console.log('⚠️ Alert already exists.')
    }

    const tweet = await InsightXClient.v2.tweet(alertMessage)
    console.log('🐦 Tweet sent:', tweet.data.text)

    await dormantWhaleAlertModel.updateOne(
      { whaleAddress: details.whaleAddress, alertMessage },
      { $set: { tweet: true } },
    )
  } catch (err: any) {
    console.error('❌ Error posting dormant whale alert:', err)
  }
}

// *******************    whale exit Alert    **********************
export const postWhaleExitAlert = async ({
  signature,
  whaleSymbol,
  tokenSymbol,
  sellPercent,
  realizedPnL,
  remainingValue,
  unrealizedPnL,
  entryMarketCap,
  currentMarketCap,
  holdingDuration,
}: any) => {
  // Format numbers and handle signs properly
  const formatPnL = (value: number) => {
    const absVal = formatNumber(Math.abs(value))
    return `${value >= 0 ? '+' : '-'}$${absVal}`
  }
  const formattedRealizedPnL = formatPnL(realizedPnL)
  const formattedUnrealized = formatPnL(unrealizedPnL)
  const formattedRemaining = `$${formatNumber(Math.max(0, remainingValue))}`
  const formattedEntryMC = formatNumber(entryMarketCap)
  const formattedCurrentMC = formatNumber(currentMarketCap)

  const whaleExitAlertMessage = `⚠️ A $${whaleSymbol} whale just sold ${sellPercent.toFixed(0)}% of their $${tokenSymbol} position at $${formattedCurrentMC} MC 🐋
💸 Realized PnL: ${formattedRealizedPnL}
💼 Still Holding: ${formattedRemaining}
📉 Unrealized PnL:  ${formattedUnrealized}
🧠 Entered at: $${formattedEntryMC} MC
⏳ Holding Duration: ${holdingDuration} days`

  console.log('whaleExitAlertMessage------------', whaleExitAlertMessage)

  // post Alert to alphaInsight page
  try {
    await InsightXClient.v2.tweet(whaleExitAlertMessage)
    console.log('✅ Tweet posted successfully!')
    // ✅ Update tweetPosted in DB only if tweet is successful
    const updateResult = await whaleExitAlertModel.updateOne(
      { signature },
      { $set: { tweeted: true } },
    )
    console.log(
      'Tweet post status update for whale exit alert-------',
      updateResult,
    )
  } catch (err) {
    console.error('❌ Error posting tweet:', err)
  }
}

// ********************  KOL move Alert (with preview image)  ***************
export const postKOLAlertToTwitter = async (
  message: any,
  signature: string,
) => {
  try {
    if (!message) {
      console.warn('⚠️ Message is empty. Skipping tweet.')
      return false
    }
    try {
      let mediaId: string | undefined
      const imageBuffer = await getKolPreviewImageBuffer(signature)
      if (imageBuffer && imageBuffer.length > 0) {
        mediaId = await InsightXClient.v1.uploadMedia(imageBuffer, { type: 'png' })
      }

      const tweet = mediaId
        ? await InsightXClient.v2.tweet({
            text: message,
            media: { media_ids: [mediaId] },
          })
        : await InsightXClient.v2.tweet(message)
      console.log('Tweet posted successfully:', tweet.data?.text ?? tweet.data?.id)

      const updateResult = await influencerWhaleTransactionsModelV2.updateOne(
        { signature },
        { $set: { tweetPosted: true } },
      )
      console.log('Tweet post status update-------', updateResult)
    } catch (err: any) {
      console.error('Error posting KOL tweet or updating DB:', err)
    }
    return true
  } catch (err: any) {
    console.error('Error posting tweet:', err)
    return false
  }
}

// *****************  PredictionsToken Alert  ****************
export const predictionsTokenPostToTwitter = async (
  message: string,
  docId: Types.ObjectId,
) => {
  try {
    await InsightXClient.v2.tweet(message)
    console.log('✅ Tweet posted successfully!')
    try {
      await WeeklyPrediction.updateOne(
        { _id: docId },
        { $set: { tweetPosted: true } },
      )
      console.log('✅ tweetPosted flag updated in DB!')
    } catch (updateErr) {
      console.error('❌ Failed to update tweetPosted flag:', updateErr)
    }
  } catch (err) {
    console.error('❌ Error posting tweet:', err)
  }
}
