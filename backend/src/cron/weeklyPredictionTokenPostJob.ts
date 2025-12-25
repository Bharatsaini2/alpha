import cron from 'node-cron'
import {
  IWeeklyPrediction,
  WeeklyPrediction,
} from '../models/weeklyPredictionSchema.model'
import { predictionsTokenPostToTwitter } from '../services/insight-posts'
import { predictionsTokenPostToTelegram } from '../services/insight-telegram-posts'
import { formatNumber } from '../utils/FormatNumber'

cron.schedule(
  '30 12 * * 0',
  async () => {
    console.log('🔄 Twitter Post Of Token Prediction Data at Sunday...')

    try {
      const doc = await WeeklyPrediction.findOne()
        .sort({ generatedAt: -1 })
        .lean<IWeeklyPrediction & { topPicks: any[] }>()

      if (
        !doc ||
        !doc.topPicks?.length ||
        !doc?.topPicks ||
        doc.topPicks.length === 0
      ) {
        console.warn('⚠️  No topPicks found for latest week')
        return
      }

      // Take the first 5 picks
      const picks = doc.topPicks.slice(0, 5)
      if (picks.length === 0) {
        console.warn('⚠️  topPicks array is empty; skipping tweet')
        return
      }

      // 4️⃣ Build the ranked lines with emojis
      const ordinal = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']
      const lines = picks.map((p: any, i) => {
        const score = p.predictionScore
        // const mcM = (p.avgEntryMc / 1e6).toFixed(1) //function call formatnumber 
        const mcM = formatNumber(p.avgEntryMc)
        return `${ordinal[i]} $${p.symbol.toUpperCase()} — ${score}/100 | MC: $${mcM}M`
      })

      // 5️⃣ Compute overall averages
      const avgHotness =
        picks.reduce((sum, p: any) => sum + p.avgHotness, 0) / picks.length
      const avgWhales = Math.round(
        picks.reduce((sum, p: any) => sum + p.uniqueWhales, 0) / picks.length,
      )
      const avgSmart = Math.round(
        picks.reduce((sum, p: any) => sum + p.smartWallets, 0) / picks.length,
      )

      // 6️⃣ Assemble tweet
      const tweet = [
        'Top Coins to Watch This Week Powered by @AlphaBlockAI Prediction Bot 👀',
        '',
        ...lines,
        '',
        `🔥 Avg Hotness: ${avgHotness.toFixed(1)}/10`,
        `🐋 Whale Buyers: ${avgWhales}`,
        `🧠 Smart Wallets: ${avgSmart}%`,
      ].join('\n')

      await predictionsTokenPostToTwitter(tweet,doc._id);
      console.log(tweet)

      // 7 Telegram Alert
      const telegramAlert = [
        '🚨 AlphaBlockAI Weekly Prediction Bot',
        '',
        'Based on 7D whale activity, here are the top coins to watch this week:',
        '',
        ...lines,
        '',
        `🔥 Avg Hotness: ${avgHotness.toFixed(1)}/10`,
        `🐋 Whale Buyers: ${avgWhales}`,
        `🧠 Smart Wallets: ${avgSmart}%`,
      ].join('\n')

      await predictionsTokenPostToTelegram(telegramAlert)
      console.log(telegramAlert)
    } catch (err) {
      console.error('❌ Cron job error:', err)
    }
  },
  { timezone: 'UTC' },
)
