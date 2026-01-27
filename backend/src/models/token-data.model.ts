import { Document, Schema, model } from 'mongoose'

export interface ITokenData extends Document {
  tokenAddress: string
  imageUrl: string | null
  symbol: string | null
  name: string | null
  lastUpdated: Date
  createdAt: Date
}

const tokenDataSchema = new Schema<ITokenData>(
  {
    tokenAddress: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    imageUrl: {
      type: String,
      default: null,
    },
    symbol: {
      type: String,
      default: null,
    },
    name: {
      type: String,
      default: null,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
)

// Index for faster lookups
tokenDataSchema.index({ tokenAddress: 1 })
tokenDataSchema.index({ lastUpdated: -1 })

const TokenDataModel = model<ITokenData>('TokenData', tokenDataSchema)

export default TokenDataModel
