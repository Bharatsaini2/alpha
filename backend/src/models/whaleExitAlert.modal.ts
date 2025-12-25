import { Document, Schema, model } from 'mongoose'

export interface IWhaleExitAlert extends Document {
  signature: string
  whaleSymbol: string
  tokenSymbol: string
  whaleAddress: string
  tokenAddress: string
  sellPercent: number
  realizedPnL: number
  unrealizedPnL: number
  remainingValue: number
  entryMarketCap: number
  currentMarketCap: number
  holdingDuration: number
  tweeted: boolean
  createdAt: Date
}

const whaleExitAlertSchema = new Schema<IWhaleExitAlert>({
  signature: { type: String, required: true },
  whaleSymbol: { type: String, required: true },
  tokenSymbol: { type: String, required: true },
  whaleAddress: { type: String, required: true },
  tokenAddress: { type: String, required: true },
  sellPercent: { type: Number, required: true },
  realizedPnL: { type: Number, required: true },
  unrealizedPnL: { type: Number, required: true },
  remainingValue: { type: Number, required: true },
  entryMarketCap: { type: Number, required: true },
  currentMarketCap: { type: Number, required: true },
  holdingDuration: { type: Number, required: true },
  tweeted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
})

export const whaleExitAlertModel = model<IWhaleExitAlert>(
  'WhaleExitAlert',
  whaleExitAlertSchema,
)
