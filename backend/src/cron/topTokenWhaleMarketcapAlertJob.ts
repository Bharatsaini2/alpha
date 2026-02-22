import cron from 'node-cron'
import axios from 'axios'
import { postToTwitter } from '../services/insight-posts'
import dotenv from 'dotenv'
dotenv.config()

const Base_URL = process.env.SERVER_URL || 'https://api.alpha-block.ai/api/v1'

const API_URL = `${Base_URL}/insight/add-token-whales-byMarketCap`

// 4h removed from X alerts; only 12h, 24h, 1w, 1m
const timeframes = ['12h', '24h', '1w', '1m']

const scheduleMap: Record<string, string> = {
  '12h': '0 */12 * * *', // Every 12 hours
  '24h': '0 0 * * *', // Every day at midnight
  '1w': '0 0 * * 0', // Every Sunday
  '1m': '0 0 1 * *', // First day of month
}

timeframes.forEach((tf) => {
  cron.schedule(scheduleMap[tf], async () => {
    try {
      console.log(`[Cron] Running whale summary for ${tf}`)
      const response = await axios.post(API_URL, { timeframe: tf })
      const data = response.data

      await postToTwitter(tf, data)
    } catch (error: any) {
      console.error(`[Cron Error] for ${tf}`, error.message)
    }
  })
})
