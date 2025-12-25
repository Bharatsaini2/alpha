import { Document, Schema, model } from 'mongoose'

interface IInfluencerWhaleAllTransactions extends Document {
  signature: string
  // amount: string
  // tokenAmount: string
  // tokenPrice: string
  amount: {
    buyAmount: string
    sellAmount: string
  }[]
  tokenAmount: {
    buyTokenAmount: string
    sellTokenAmount: string
  }[]
  tokenPrice: {
    buyTokenPrice: string
    sellTokenPrice: string
  }[]
  influencerHandle: string
  whaleAddress: string
  tokenInSymbol: string
  tokenOutSymbol: string
  tokenInAddress: string
  tokenOutAddress: string
  marketCap: string
  outTokenURL: string
  inTokenURL: string
  type: 'buy' | 'sell' | 'both'
  bothType: {
    buyType: boolean
    sellType: boolean
  }[]
  tweetPosted: boolean
  timestamp: Date
  createdAt?: Date
}
const influencerWhaleAddressSchema =
  new Schema<IInfluencerWhaleAllTransactions>(
    {
      signature: { type: String, unique: true, required: true },
      // amount: String,
      // tokenAmount: String,
      // tokenPrice: String,
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
      influencerHandle: String,
      tokenInSymbol: String,
      tokenOutSymbol: String,
      whaleAddress: String,
      tokenInAddress: String,
      tokenOutAddress: String,
      marketCap: String,
      inTokenURL: String,
      outTokenURL: String,
      type: { type: String, enum: ['buy', 'sell', 'both'], index: true },
      bothType: [
        {
          buyType: { type: Boolean, default: false },
          sellType: { type: Boolean, default: false },
        },
      ],
      tweetPosted: { type: Boolean, default: false },
      timestamp: {
        type: Date,
        default: Date.now,
      },
    },
    { timestamps: true },
  )

const influencerWhaleAllTransactionModel =
  model<IInfluencerWhaleAllTransactions>(
    'influencerWhaleAllTransaction',
    influencerWhaleAddressSchema,
  )
export default influencerWhaleAllTransactionModel
