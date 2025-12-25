import mongoose, { Schema, Document } from 'mongoose'

export interface ITokenPriceHistory extends Document {
  tokenAddress: string
  symbol: string
  price: number
  marketcap: number
  volume24h: number
  priceChange5m: number
  marketcapChange5m: number
  volumeChange5m: number
  timestamp: Date
  updateType: 'token_list' | 'price_update'
  source: string
  createdAt: Date
}

const TokenPriceHistorySchema: Schema = new Schema(
  {
    tokenAddress: {
      type: String,
      required: true,
      index: true,
    },
    symbol: {
      type: String,
      required: true,
      index: true,
    },
    price: {
      type: Number,
      required: true,
    },
    marketcap: {
      type: Number || null,
      required: true,
    },
    volume24h: {
      type: Number || null,
      required: true,
    },
    priceChange5m: {
      type: Number,
      default: 0,
    },
    marketcapChange5m: {
      type: Number,
      default: 0,
    },
    volumeChange5m: {
      type: Number,
      default: 0,
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
    updateType: {
      type: String,
      enum: ['token_list', 'price_update'],
      required: true,
      index: true,
    },
    source: {
      type: String,
      required: true,
      default: 'birdeye_api',
    },
  },
  {
    timestamps: true,
    collection: 'token_price_history',
  },
)

// Create compound indexes for better query performance
TokenPriceHistorySchema.index({ tokenAddress: 1, timestamp: -1 })
TokenPriceHistorySchema.index({ tokenAddress: 1, updateType: 1, timestamp: -1 })
TokenPriceHistorySchema.index({ timestamp: -1, updateType: 1 })

// TTL index to automatically delete records older than 30 days
TokenPriceHistorySchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 },
)

export default mongoose.model<ITokenPriceHistory>(
  'TokenPriceHistory',
  TokenPriceHistorySchema,
)
