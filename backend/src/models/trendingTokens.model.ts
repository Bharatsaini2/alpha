import mongoose, { Schema, Document } from 'mongoose'

export interface ITrendingToken extends Document {
  address: string
  rank: number
  name: string
  symbol: string
  logoURI: string
  volume24hChangePercent: number
  price: number
  price24hChangePercent: number
  volume24hUSD: number
  liquidity: number
  marketcap: number
  fdv: number
  decimals: number
  updateUnixTime: number
  updateTime: Date

  // New fields for live market cap tracking
  previousMarketcap: number // Previous marketcap for change calculation
  marketcapChange5m: number // 5-minute marketcap change percentage
  lastMarketcapUpdate: Date // Timestamp of last marketcap update

  createdAt: Date
  updatedAt: Date
}

const TrendingTokenSchema: Schema = new Schema(
  {
    address: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    rank: {
      type: Number,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    symbol: {
      type: String,
      required: true,
    },
    logoURI: {
      type: String,
      required: true,
    },
    volume24hChangePercent: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    price24hChangePercent: {
      type: Number,
      required: true,
    },
    volume24hUSD: {
      type: Number,
      required: true,
    },
    liquidity: {
      type: Number,
      required: true,
    },
    marketcap: {
      type: Number,
      required: true,
    },
    fdv: {
      type: Number,
      required: true,
    },
    decimals: {
      type: Number,
      required: true,
    },
    updateUnixTime: {
      type: Number,
      required: true,
    },
    updateTime: {
      type: Date,
      required: true,
    },

    // New fields for live market cap tracking
    previousMarketcap: {
      type: Number,
      default: 0,
    },
    marketcapChange5m: {
      type: Number,
      default: 0,
    },
    lastMarketcapUpdate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'trending_tokens',
  },
)

// Create compound index for better query performance
TrendingTokenSchema.index({ rank: 1, updateTime: -1 })
TrendingTokenSchema.index({ volume24hChangePercent: -1, updateTime: -1 })

export default mongoose.model<ITrendingToken>(
  'TrendingToken',
  TrendingTokenSchema,
)
