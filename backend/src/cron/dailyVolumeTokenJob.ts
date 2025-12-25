import cron from 'node-cron'
import { getTokenData } from '../config/solana-tokens-config'
import whaleAllTransactionModel from '../models/whale-all-transactions.model'

import { startOfDay, subDays } from 'date-fns'
import { DailyTokenMetrics } from '../models/dailyTokenMetricsSchema.model'
import whaleAllTransactionModelV2 from '../models/whaleAllTransactionsV2.model'

cron.schedule(
  '30 18 * * *',
  async () => {
    console.log('🔄 Daily Volume Of Token Fetching...')

    try {
      const dateStr = new Date().toISOString().slice(0, 10)
      const yesterdayStart = startOfDay(subDays(new Date(), 1))
      const todayStart = startOfDay(new Date())

      const tokens = await whaleAllTransactionModelV2.aggregate([
        {
          $match: {
            timestamp: { $gte: yesterdayStart, $lt: todayStart },
            type: { $in: ['buy', 'both'] },
          },
        },
        { $unwind: '$amount' },
        { $unwind: '$bothType' },
        {
          $match: {
            'bothType.buyType': true,
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
          $group: {
            _id: '$tokenOutAddress',
          },
        },
      ])

      // console.log("tokens==============",tokens)

      for (const { _id: t } of tokens) {
        const vol = (await getTokenData(t)).volume24h

        await DailyTokenMetrics.updateOne(
          { tokenAddress: t, date: dateStr },
          { $set: { volume24h: vol } },
          { upsert: true },
        )
      }
      console.log('Daily volume snapshot done', tokens.length)
    } catch (err) {
      console.error('❌ Cron job error:', err)
    }
  },
  { timezone: 'UTC' },
)
