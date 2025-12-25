import { model } from 'mongoose'
import { Schema, Types } from 'mongoose'

export interface AggregatedMetrics {
  tokenAddress: string
  avgHotness: number | null
  uniqueWhales: number
  smartWallets: number
  usdTotal: number // SUM( amount[0] ) — already USD
  avgEntryMc: number
  volumeSpikeRatio: number
}

export interface IWeeklyAggregate {
  _id: Types.ObjectId
  isoWeek: string
  generatedAt: Date
  metrics: AggregatedMetrics[]
}
const WeeklyAggregateSchema = new Schema<IWeeklyAggregate>({
  isoWeek: { type: String, index: true },
  generatedAt: Date,
  metrics: [],
})
export const WeeklyAggregate = model<IWeeklyAggregate>(
  'WeeklyAggregate',
  WeeklyAggregateSchema,
)
