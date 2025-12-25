import { Document, Schema, model } from 'mongoose'

export interface IWhaleAllTransactions extends Document {
  map(arg0: (tx: any) => any): unknown
  length: number
  signature: string
  amount: {
    buyAmount: string
    sellAmount: string
  }
  tokenAmount: {
    buyTokenAmount: string
    sellTokenAmount: string
  }
  tokenPrice: {
    buyTokenPrice: string
    sellTokenPrice: string
  }
  whaleLabel: string[]
  whaleTokenSymbol: string
  tokenInSymbol: string
  tokenOutSymbol: string
  whaleAddress: string
  tokenInAddress: string
  tokenOutAddress: string
  marketCap: {
    buyMarketCap: string
    sellMarketCap: string
  }
  outTokenURL: string
  whaleTokenURL: string
  inTokenURL: string
  type: 'buy' | 'sell' | 'both'
  bothType: {
    buyType: boolean
    sellType: boolean
  }[]
  hotnessScore: number
  timestamp: Date
  createdAt?: Date
}
const whaleAddressSchema = new Schema<IWhaleAllTransactions>(
  {
    signature: { type: String, unique: true, required: true },
    amount: {
      buyAmount: { type: String },
      sellAmount: { type: String },
    },

    tokenAmount: {
      buyTokenAmount: { type: String },
      sellTokenAmount: { type: String },
    },

    tokenPrice: {
      buyTokenPrice: { type: String },
      sellTokenPrice: { type: String },
    },
    whaleLabel: [String],
    whaleTokenSymbol: String,
    tokenInSymbol: String,
    tokenOutSymbol: String,
    whaleAddress: String,
    tokenInAddress: String,
    tokenOutAddress: String,
    marketCap: {
      buyMarketCap: { type: String },
      sellMarketCap: { type: String },
    },
    whaleTokenURL: String,
    inTokenURL: String,
    outTokenURL: String,
    hotnessScore: Number,
    type: { type: String, enum: ['buy', 'sell', 'both'], index: true },
    bothType: [
      {
        buyType: { type: Boolean, default: false },
        sellType: { type: Boolean, default: false },
      },
    ],
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
)

const whaleAllTransactionModel = model<IWhaleAllTransactions>(
  'whaleAllTransaction',
  whaleAddressSchema,
)

// Add indexes for better query performance
whaleAllTransactionModel.schema.index({ whaleAddress: 1, timestamp: 1 })
whaleAllTransactionModel.schema.index({ type: 1, createdAt: -1 })
whaleAllTransactionModel.schema.index({ hotnessScore: 1 })
whaleAllTransactionModel.schema.index({ whaleLabel: 1 })
whaleAllTransactionModel.schema.index({ whaleTokenSymbol: 1 })
whaleAllTransactionModel.schema.index({ tokenInSymbol: 1 })
whaleAllTransactionModel.schema.index({ tokenOutSymbol: 1 })
whaleAllTransactionModel.schema.index({ 'amount.buyAmount': 1 })
whaleAllTransactionModel.schema.index({ 'amount.sellAmount': 1 })
whaleAllTransactionModel.schema.index({ createdAt: -1 })

export default whaleAllTransactionModel
