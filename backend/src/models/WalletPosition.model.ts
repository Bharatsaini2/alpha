import { Document, Schema, model } from 'mongoose'

export interface IWalletPosition extends Document {
  walletAddress: string // Wallet being tracked
  tokenAddress: string // Token contract address
  tokenSymbol: string // Token symbol

  // Position tracking (accumulates all buys)
  totalTokensBought: number // Total tokens bought (all buys combined)
  totalCostBasis: number // Total cost in USD (all buys combined)
  avgEntryPrice: number // Average entry price: totalCostBasis / totalTokensBought

  // Sell tracking
  totalTokensSold: number // Total tokens sold so far
  remainingBalance: number // Current balance: totalTokensBought - totalTokensSold

  // For handling existing balances (before tracking started)
  initialBalance?: number // Tokens that existed before tracking
  initialCostBasis?: number // Estimated cost for initial balance

  // Last updated
  lastUpdated: Date
  createdAt?: Date
}

const walletPositionSchema = new Schema<IWalletPosition>(
  {
    walletAddress: { type: String, required: true, index: true },
    tokenAddress: { type: String, required: true, index: true },
    tokenSymbol: { type: String, required: true },

    // Position tracking (accumulates all buys)
    totalTokensBought: { type: Number, default: 0 }, // Total tokens bought (all buys)
    totalCostBasis: { type: Number, default: 0 }, // Total cost in USD (all buys)
    avgEntryPrice: { type: Number, default: 0 }, // Average entry price

    // Sell tracking
    totalTokensSold: { type: Number, default: 0 },
    remainingBalance: { type: Number, default: 0 },

    // For handling existing balances
    initialBalance: { type: Number },
    initialCostBasis: { type: Number },

    // Last updated
    lastUpdated: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

// Unique compound index on walletAddress + tokenAddress
walletPositionSchema.index(
  { walletAddress: 1, tokenAddress: 1 },
  { unique: true },
)
walletPositionSchema.index({ walletAddress: 1, lastUpdated: -1 })
walletPositionSchema.index({ tokenAddress: 1 })

const WalletPositionModel = model<IWalletPosition>(
  'WalletPosition',
  walletPositionSchema,
)

export default WalletPositionModel
