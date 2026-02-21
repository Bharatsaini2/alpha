import { Document, Schema, model } from 'mongoose'

export interface IWalletTrade extends Document {
  signature: string // Transaction signature (unique)
  walletAddress: string // Wallet being tracked
  tradeEvent: 'BUY' | 'SELL' // Type of trade
  tokenAddress: string // Token contract address
  tokenSymbol: string // Token symbol (e.g., $QUANT)
  quantity: number // Amount in SOL
  quantityUsd: number // Amount in USD
  tokenAmount: number // Amount of tokens
  contract: string // Token contract address (same as tokenAddress)
  walletBalance: number // SOL balance after transaction
  profit?: number // Profit in SOL (only for SELL)
  profitUsd?: number // Profit in USD (only for SELL)
  status: 'confirmed' | 'pending' // Transaction status
  timestamp: Date // Transaction timestamp
  createdAt?: Date // Record creation time

  // PNL Calculation Fields (for SELL transactions)
  entryPrice?: number // Average entry price for this position
  exitPrice?: number // Exit price (for SELL)
  costBasis?: number // Total cost basis for sold tokens
  remainingBalance?: number // Remaining token balance after sell

  // For SELL transactions: Reference to the buy transaction
  buySignature?: string // Signature of the buy transaction this sell corresponds to
}

const walletTradeSchema = new Schema<IWalletTrade>(
  {
    signature: { type: String, unique: true, required: true, index: true },
    walletAddress: { type: String, required: true, index: true },
    tradeEvent: {
      type: String,
      enum: ['BUY', 'SELL'],
      required: true,
      index: true,
    },
    tokenAddress: { type: String, required: true, index: true },
    tokenSymbol: { type: String, required: true },
    quantity: { type: Number, required: true }, // Amount in SOL
    quantityUsd: { type: Number, required: true }, // Amount in USD
    tokenAmount: { type: Number, required: true }, // Amount of tokens
    contract: { type: String, required: true }, // Token contract address
    walletBalance: { type: Number, required: true }, // SOL balance after transaction
    profit: { type: Number }, // Profit in SOL (only for SELL)
    profitUsd: { type: Number }, // Profit in USD (only for SELL)
    status: {
      type: String,
      enum: ['confirmed', 'pending'],
      default: 'confirmed',
    },
    timestamp: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },

    // PNL Calculation Fields
    entryPrice: { type: Number },
    exitPrice: { type: Number },
    costBasis: { type: Number },
    remainingBalance: { type: Number },

    // Reference to buy transaction (indexed via schema.index below)
    buySignature: { type: String },
  },
  { timestamps: true },
)

// Indexes for better query performance
walletTradeSchema.index({ walletAddress: 1, timestamp: -1 })
walletTradeSchema.index({ tokenAddress: 1, timestamp: -1 })
walletTradeSchema.index({ tradeEvent: 1, timestamp: -1 })
walletTradeSchema.index({ walletAddress: 1, tokenAddress: 1, timestamp: -1 })
walletTradeSchema.index({ buySignature: 1 })

const WalletTradeModel = model<IWalletTrade>('WalletTrade', walletTradeSchema)

export default WalletTradeModel
