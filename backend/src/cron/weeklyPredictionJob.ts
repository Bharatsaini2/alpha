import cron from 'node-cron'
import { aggregateLast7Days } from '../controllers/insight.controller'
import { getISOWeek } from 'date-fns'
import { WeeklyAggregate } from '../models/weeklyAggregateSchema.model'

cron.schedule(
  '30 6 * * 0',
  async () => {
    console.log('🔄 Store The Weekly Prediction Data at Sunday...')

    try {
      const metrics = await aggregateLast7Days()
      const weekKey = `${new Date().getUTCFullYear()}-W${getISOWeek(new Date())}`
      await WeeklyAggregate.deleteMany({ isoWeek: weekKey })
      await WeeklyAggregate.create({
        isoWeek: weekKey,
        generatedAt: new Date(),
        metrics,
      })
      console.log('Weekly metrics frozen:', metrics.length)
    } catch (err) {
      console.error('❌ Cron job error:', err)
    }
  },
  { timezone: 'UTC' },
)
