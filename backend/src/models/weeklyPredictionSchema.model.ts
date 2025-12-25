import { model, Schema, Types } from 'mongoose'
import { AggregatedMetrics } from './weeklyAggregateSchema.model'

export interface IWeeklyPrediction {
  _id: Types.ObjectId
  isoWeek: string
  generatedAt: Date
  tokens: Array<AggregatedMetrics & { predictionScore: number }>
  topPicks: []
  tweetPosted: boolean
}
const WeeklyPredictionSchema = new Schema<IWeeklyPrediction>({
  isoWeek: { type: String, index: true },
  generatedAt: Date,
  tokens: [],
  topPicks: [],
  tweetPosted: { type: Boolean, default: false },
})
export const WeeklyPrediction = model<IWeeklyPrediction>(
  'WeeklyPrediction',
  WeeklyPredictionSchema,
)
