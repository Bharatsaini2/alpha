import { model, Schema } from 'mongoose'

export interface IDailyTokenMetrics {
  tokenAddress: string
  date: string
  volume24h: number
}
const DailyTokenMetricsSchema = new Schema<IDailyTokenMetrics>({
  tokenAddress: { type: String, index: true },
  date: {
    type: String,
    required: true,
    default: () => new Date().toISOString().slice(0, 10),
  },
  volume24h: Number,
})
DailyTokenMetricsSchema.index({ tokenAddress: 1, date: 1 }, { unique: true })
export const DailyTokenMetrics = model<IDailyTokenMetrics>(
  'DailyTokenMetrics',
  DailyTokenMetricsSchema,
)
