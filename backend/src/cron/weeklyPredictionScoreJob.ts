import cron from 'node-cron'
import { scoreToken } from '../controllers/insight.controller'
import { getISOWeek } from 'date-fns'
import { WeeklyAggregate } from '../models/weeklyAggregateSchema.model'
import { WeeklyPrediction } from '../models/weeklyPredictionSchema.model'

cron.schedule(
  '30 9 * * 0',
  async () => {
    console.log('🔄 Give The Weekly Prediction Score at Sunday...')

    try {
      const weekKey = `${new Date().getUTCFullYear()}-W${getISOWeek(new Date())}`
      const doc = await WeeklyAggregate.findOne({ isoWeek: weekKey }).lean()

      if (!doc) {
        console.warn('No frozen metrics found for', weekKey)
        return
      }
      const eligible = doc.metrics.filter(
        (m) => m.uniqueWhales >= 2 && m.avgHotness! >= 7.5 && m.avgEntryMc <= 15000000,
      )


      const scored = eligible
        .map((m) => ({ ...m, predictionScore: scoreToken(m) }))
        .sort((a, b) => b.predictionScore - a.predictionScore)

      // s.predictionScore >= 75
      const top = scored.filter((s) => s.predictionScore >= 75).slice(0, 5)

      await WeeklyPrediction.deleteMany({ isoWeek: weekKey })

      await WeeklyPrediction.create({
        isoWeek: weekKey,
        generatedAt: new Date(),
        tokens: scored,
        topPicks: top,
      })
      console.log(
        'Weekly predictions stored:',
        top.map((t) => t.tokenAddress),
      )
    } catch (err) {
      console.error('❌ Cron job error:', err)
    }
  },
  { timezone: 'UTC' },
)
