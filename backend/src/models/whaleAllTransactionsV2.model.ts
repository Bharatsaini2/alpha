import { Document, Schema, model } from 'mongoose'

export interface IWhaleAllTransactionsV2 extends Document {
  map(arg0: (tx: any) => any): unknown
  length: number
  signature: string

  // Legacy fields - keeping for backward compatibility
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
    buyTokenPriceSol: string // SOL price for buy token
    sellTokenPriceSol: string // SOL price for sell token
  }
  // SOL amounts for buy and sell transactions
  solAmount: {
    buySolAmount: string
    sellSolAmount: string
  }

  transaction: {
    tokenIn: {
      symbol: string
      name: string
      address: string
      amount: string
      usdAmount: string // USD amount for tokenIn
      marketCap: string
      marketCapSol: string // SOL equivalent of market cap for tokenIn
      imageUrl: string
    }
    tokenOut: {
      symbol: string
      name: string
      address: string
      amount: string
      usdAmount: string // USD amount for tokenOut
      marketCap: string
      marketCapSol: string // SOL equivalent of market cap for tokenOut
      imageUrl: string
    }
    gasFee: string
    platform: string
    timestamp: Date
  }
  whaleLabel: string[]
  whaleTokenSymbol: string
  tokenInSymbol: string
  tokenOutSymbol: string
  whaleAddress: string
  tokenInAddress: string
  tokenOutAddress: string

  whale: {
    address: string
    imageUrl: string
    labels?: string[]
    symbol?: string
    name?: string
    marketCap?: string
  }

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

  age?: Date
  tokenInAge?: Date
  tokenOutAge?: Date
}

const whaleAddressSchemaV2 = new Schema<IWhaleAllTransactionsV2>(
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
      buyTokenPriceSol: { type: String }, // SOL price for buy token
      sellTokenPriceSol: { type: String }, // SOL price for sell token
    },
    // SOL amounts for buy and sell transactions
    solAmount: {
      buySolAmount: { type: String },
      sellSolAmount: { type: String },
    },

    transaction: {
      tokenIn: {
        symbol: { type: String, index: true },
        name: String,
        address: { type: String, index: true },
        amount: String,
        usdAmount: String, // USD amount for tokenIn
        marketCap: String,
        marketCapSol: String, // SOL equivalent of market cap for tokenIn
        imageUrl: String,
      },
      tokenOut: {
        symbol: { type: String, index: true },
        name: String,
        address: { type: String, index: true },
        amount: String,
        usdAmount: String, // USD amount for tokenOut
        marketCap: String,
        marketCapSol: String, // SOL equivalent of market cap for tokenOut
        imageUrl: String,
      },
      gasFee: String,
      platform: { type: String, index: true },
      timestamp: Date,
    },
    whaleLabel: [String],
    whaleTokenSymbol: String,
    tokenInSymbol: String,
    tokenOutSymbol: String,
    whaleAddress: String,
    tokenInAddress: String,
    tokenOutAddress: String,

    // Whale information
    whale: {
      address: { type: String, required: true, index: true },
      imageUrl: String,
      labels: [String],
      symbol: String,
      name: String,
      marketCap: String,
    },

    marketCap: {
      buyMarketCap: { type: String },
      sellMarketCap: { type: String },
    },
    whaleTokenURL: String,
    inTokenURL: String,
    outTokenURL: String,
    hotnessScore: { type: Number, index: true },
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
      index: true,
    },

    age: Date,
    tokenInAge: Date,
    tokenOutAge: Date,
  },
  { timestamps: true },
)

const whaleAllTransactionModelV2 = model<IWhaleAllTransactionsV2>(
  'whaleAllTransactionV2',
  whaleAddressSchemaV2,
)

// Enhanced indexes for better query performance
whaleAllTransactionModelV2.schema.index({ whaleAddress: 1, timestamp: -1 })
whaleAllTransactionModelV2.schema.index({ 'whale.address': 1, timestamp: -1 })
whaleAllTransactionModelV2.schema.index({ type: 1, createdAt: -1 })
whaleAllTransactionModelV2.schema.index({ hotnessScore: -1 })
whaleAllTransactionModelV2.schema.index({ whaleTokenSymbol: 1 })
whaleAllTransactionModelV2.schema.index({ tokenInSymbol: 1 })
whaleAllTransactionModelV2.schema.index({ tokenOutSymbol: 1 })
whaleAllTransactionModelV2.schema.index({ 'amount.buyAmount': 1 })
whaleAllTransactionModelV2.schema.index({ 'amount.sellAmount': 1 })
whaleAllTransactionModelV2.schema.index({ 'solAmount.buySolAmount': 1 })
whaleAllTransactionModelV2.schema.index({ 'solAmount.sellSolAmount': 1 })
whaleAllTransactionModelV2.schema.index({ 'tokenPrice.buyTokenPriceSol': 1 })
whaleAllTransactionModelV2.schema.index({ 'tokenPrice.sellTokenPriceSol': 1 })
whaleAllTransactionModelV2.schema.index({
  'transaction.tokenIn.marketCapSol': 1,
})
whaleAllTransactionModelV2.schema.index({
  'transaction.tokenOut.marketCapSol': 1,
})
whaleAllTransactionModelV2.schema.index({ createdAt: -1 })
whaleAllTransactionModelV2.schema.index({ 'transaction.platform': 1 })
whaleAllTransactionModelV2.schema.index({ 'transaction.tokenIn.symbol': 1 })
whaleAllTransactionModelV2.schema.index({ 'transaction.tokenOut.symbol': 1 })
whaleAllTransactionModelV2.schema.index({ 'transaction.usdAmount': 1 })
whaleAllTransactionModelV2.schema.index({ status: 1, timestamp: -1 })
whaleAllTransactionModelV2.schema.index({ timestamp: -1 })
whaleAllTransactionModelV2.schema.index({ 'transaction.tokenOut.address': 1 })
whaleAllTransactionModelV2.schema.index({ 'transaction.tokenIn.address': 1 })
whaleAllTransactionModelV2.schema.index({ type: 1, timestamp: -1 })
whaleAllTransactionModelV2.schema.index({
  timestamp: -1,
  type: 1,
  'transaction.tokenOut.address': 1,
})

export default whaleAllTransactionModelV2
