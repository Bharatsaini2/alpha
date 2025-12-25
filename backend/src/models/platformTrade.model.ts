import { Document, Schema, model } from 'mongoose'

export interface IPlatformTrade extends Document {
  signature: string // Transaction signature (unique)
  walletAddress: string // User's wallet address
  inputMint: string // Token being sold
  outputMint: string // Token being bought
  inputAmount: number // Amount of input token
  outputAmount: number // Amount of output token received
  platformFee: number // Fee collected in output token
  timestamp: Date // Transaction timestamp
  priorityLevel?: string // Priority level used ('Low', 'Medium', 'High', 'VeryHigh')
  createdAt?: Date // Record creation time
}

const platformTradeSchema = new Schema<IPlatformTrade>(
  {
    signature: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    walletAddress: {
      type: String,
      required: true,
      index: true,
    },
    inputMint: {
      type: String,
      required: true,
    },
    outputMint: {
      type: String,
      required: true,
    },
    inputAmount: {
      type: Number,
      required: true,
    },
    outputAmount: {
      type: Number,
      required: true,
    },
    platformFee: {
      type: Number,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
    priorityLevel: {
      type: String,
      required: false,
      enum: ['Low', 'Medium', 'High', 'VeryHigh'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
)

// Compound index for efficient user-specific time-based queries
platformTradeSchema.index({ walletAddress: 1, timestamp: -1 })

// Index for priority level queries (for analytics and filtering)
platformTradeSchema.index({ priorityLevel: 1 })

const PlatformTradeModel = model<IPlatformTrade>(
  'PlatformTrade',
  platformTradeSchema,
)

export default PlatformTradeModel
