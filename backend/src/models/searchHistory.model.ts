import { Document, Schema, model } from 'mongoose'

export interface ISearchHistory extends Document {
  userId?: string // Optional for anonymous users
  sessionId?: string // For anonymous users
  query: string
  searchType: 'coin' | 'kol' | 'whale' | 'all'
  tokens: Array<{
    value: string
    type: 'coin' | 'kol' | 'whale' | 'mixed'
    label: string
    imageUrl?: string
    symbol?: string
    name?: string
    address?: string
    username?: string // For KOL tokens
  }>
  timestamp: Date
  frequency: number
  lastUsed: Date
  page: string // Which page the search was performed on
}

const searchHistorySchema = new Schema<ISearchHistory>(
  {
    userId: { type: String, index: true },
    sessionId: { type: String, index: true },
    query: { type: String, required: true, maxlength: 200 },
    searchType: {
      type: String,
      required: true,
      enum: ['coin', 'kol', 'whale', 'all'],
    },
    tokens: [
      {
        value: { type: String, required: true },
        type: {
          type: String,
          required: true,
          enum: ['coin', 'kol', 'whale', 'mixed'],
        },
        label: { type: String, required: true },
        imageUrl: { type: String },
        symbol: { type: String },
        name: { type: String },
        address: { type: String },
        username: { type: String }, // For KOL tokens
      },
    ],
    timestamp: { type: Date, default: Date.now, index: true },
    frequency: { type: Number, default: 1 },
    lastUsed: { type: Date, default: Date.now, index: true },
    page: { type: String, required: true },
  },
  {
    timestamps: true,
  },
)

// Compound indexes for efficient queries
searchHistorySchema.index({ userId: 1, lastUsed: -1 })
searchHistorySchema.index({ sessionId: 1, lastUsed: -1 })
searchHistorySchema.index({ query: 1, searchType: 1, page: 1 })

// TTL index to auto-delete old records (30 days)
searchHistorySchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 },
)

export const searchHistoryModel = model<ISearchHistory>(
  'SearchHistory',
  searchHistorySchema,
)
