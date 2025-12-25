import { Document, Schema, model } from 'mongoose'

export interface ISpikeAlert extends Document {
  tokenOutAddress: string
  symbol: string
  inflow: number
  marketCap?: number
  spikeRatio?: number
  whaleCount?: number
  avgHotnessScore?:number
  tweet?: string
  createdAt: Date
}

const spikeAlertSchema = new Schema<ISpikeAlert>({
  tokenOutAddress: { type: String, required: true },
  symbol: { type: String, required: true },
  inflow: { type: Number, required: true },
  marketCap: { type: Number },
  spikeRatio: { type: Number },
  whaleCount: { type: Number },
  avgHotnessScore: { type: Number },
  tweet: { type: String },
  createdAt: { type: Date, default: Date.now },
})

export const spikeAlertModel = model<ISpikeAlert>(
  'SpikeAlert',
  spikeAlertSchema,
)
