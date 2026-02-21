import { Document, Schema, model } from 'mongoose'
import logger from '../utils/logger'
import { PRIORITY_ASSETS } from '../utils/shyftParserV2.types'

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
  classificationSource?: string // e.g., 'v2_parser_split_sell', 'v2_parser_split_buy'
  hotnessScore: number
  timestamp: Date
  createdAt?: Date

  age?: Date
  tokenInAge?: Date
  tokenOutAge?: Date
}

const whaleAddressSchemaV2 = new Schema<IWhaleAllTransactionsV2>(
  {
    // ✅ FIXED: Removed unique constraint to allow split swaps (2 records per signature)
    // Compound unique index (signature, type) is added below
    signature: { type: String, required: true, index: true },

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
        symbol: { type: String },
        name: String,
        address: { type: String },
        amount: String,
        usdAmount: String, // USD amount for tokenIn
        marketCap: String,
        marketCapSol: String, // SOL equivalent of market cap for tokenIn
        imageUrl: String,
      },
      tokenOut: {
        symbol: { type: String },
        name: String,
        address: { type: String },
        amount: String,
        usdAmount: String, // USD amount for tokenOut
        marketCap: String,
        marketCapSol: String, // SOL equivalent of market cap for tokenOut
        imageUrl: String,
      },
      gasFee: String,
      platform: { type: String },
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
    classificationSource: { type: String, index: true }, // e.g., 'v2_parser_split_sell', 'v2_parser_split_buy'
    timestamp: {
      type: Date,
      default: Date.now,
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

// ✅ CRITICAL: Compound unique index to allow split swaps (same signature, different type)
// This replaces the old unique constraint on signature alone
whaleAllTransactionModelV2.schema.index(
  { signature: 1, type: 1 },
  { unique: true, name: 'signature_type_unique' }
)

// 🔥 CRITICAL: Model-level pre-save hook validation
// Prevents bypassing controller validation
whaleAllTransactionModelV2.schema.pre('save', function(next) {
  const doc = this as IWhaleAllTransactionsV2
  
  // ✅ Validate numeric values (catch NaN)
  const buyAmount = parseFloat(doc.amount.buyAmount)
  const sellAmount = parseFloat(doc.amount.sellAmount)
  
  if (isNaN(buyAmount)) {
    const error = new Error(
      `Architectural violation: amount.buyAmount is not a valid number. ` +
      `Signature: ${doc.signature}, Type: ${doc.type}, Value: ${doc.amount.buyAmount}`
    )
    
    logger.error(
      {
        signature: doc.signature,
        type: doc.type,
        buyAmount: doc.amount.buyAmount,
      },
      'Model-level validation failed: Invalid buyAmount (NaN)'
    )
    
    return next(error)
  }
  
  if (isNaN(sellAmount)) {
    const error = new Error(
      `Architectural violation: amount.sellAmount is not a valid number. ` +
      `Signature: ${doc.signature}, Type: ${doc.type}, Value: ${doc.amount.sellAmount}`
    )
    
    logger.error(
      {
        signature: doc.signature,
        type: doc.type,
        sellAmount: doc.amount.sellAmount,
      },
      'Model-level validation failed: Invalid sellAmount (NaN)'
    )
    
    return next(error)
  }
  
  // ✅ Validate non-negative amounts
  if (buyAmount < 0) {
    const error = new Error(
      `Architectural violation: amount.buyAmount cannot be negative. ` +
      `Signature: ${doc.signature}, Type: ${doc.type}, Value: ${buyAmount}`
    )
    
    logger.error(
      {
        signature: doc.signature,
        type: doc.type,
        buyAmount,
      },
      'Model-level validation failed: Negative buyAmount'
    )
    
    return next(error)
  }
  
  if (sellAmount < 0) {
    const error = new Error(
      `Architectural violation: amount.sellAmount cannot be negative. ` +
      `Signature: ${doc.signature}, Type: ${doc.type}, Value: ${sellAmount}`
    )
    
    logger.error(
      {
        signature: doc.signature,
        type: doc.type,
        sellAmount,
      },
      'Model-level validation failed: Negative sellAmount'
    )
    
    return next(error)
  }
  
  // ✅ Validate SOL amounts are null when SOL not involved
  // ✅ Fix #1: Use mint address, not symbol (symbols are not stable)
  const tokenInAddress = doc.transaction?.tokenIn?.address || doc.tokenInAddress
  const tokenOutAddress = doc.transaction?.tokenOut?.address || doc.tokenOutAddress
  
  const hasSOLInTransaction = 
    tokenInAddress === PRIORITY_ASSETS.SOL ||
    tokenInAddress === PRIORITY_ASSETS.WSOL ||
    tokenOutAddress === PRIORITY_ASSETS.SOL ||
    tokenOutAddress === PRIORITY_ASSETS.WSOL
  
  if (!hasSOLInTransaction) {
    const buySolAmount = doc.solAmount?.buySolAmount
    const sellSolAmount = doc.solAmount?.sellSolAmount
    
    // Check if SOL amounts are non-null and non-empty
    const hasBuySolAmount = buySolAmount !== null && buySolAmount !== undefined && buySolAmount !== ''
    const hasSellSolAmount = sellSolAmount !== null && sellSolAmount !== undefined && sellSolAmount !== ''
    
    if (hasBuySolAmount || hasSellSolAmount) {
      const error = new Error(
        `Architectural violation: SOL amounts must be null when SOL not involved. ` +
        `Signature: ${doc.signature}, Type: ${doc.type}`
      )
      
      logger.error(
        {
          signature: doc.signature,
          type: doc.type,
          buySolAmount: doc.solAmount?.buySolAmount,
          sellSolAmount: doc.solAmount?.sellSolAmount,
          tokenInAddress,
          tokenOutAddress,
        },
        'Model-level validation failed: Fabricated SOL amounts detected'
      )
      
      return next(error)
    }
  }
  
  // ✅ Validate SOL amounts are non-negative when not null
  if (doc.solAmount?.buySolAmount !== null && doc.solAmount?.buySolAmount !== undefined && doc.solAmount?.buySolAmount !== '') {
    const buySolAmount = parseFloat(doc.solAmount.buySolAmount)
    
    if (isNaN(buySolAmount)) {
      const error = new Error(
        `Architectural violation: solAmount.buySolAmount is not a valid number. ` +
        `Signature: ${doc.signature}, Type: ${doc.type}, Value: ${doc.solAmount.buySolAmount}`
      )
      
      logger.error(
        {
          signature: doc.signature,
          type: doc.type,
          buySolAmount: doc.solAmount.buySolAmount,
        },
        'Model-level validation failed: Invalid buySolAmount (NaN)'
      )
      
      return next(error)
    }
    
    if (buySolAmount < 0) {
      const error = new Error(
        `Architectural violation: solAmount.buySolAmount cannot be negative. ` +
        `Signature: ${doc.signature}, Type: ${doc.type}, Value: ${buySolAmount}`
      )
      
      logger.error(
        {
          signature: doc.signature,
          type: doc.type,
          buySolAmount,
        },
        'Model-level validation failed: Negative buySolAmount'
      )
      
      return next(error)
    }
  }
  
  if (doc.solAmount?.sellSolAmount !== null && doc.solAmount?.sellSolAmount !== undefined && doc.solAmount?.sellSolAmount !== '') {
    const sellSolAmount = parseFloat(doc.solAmount.sellSolAmount)
    
    if (isNaN(sellSolAmount)) {
      const error = new Error(
        `Architectural violation: solAmount.sellSolAmount is not a valid number. ` +
        `Signature: ${doc.signature}, Type: ${doc.type}, Value: ${doc.solAmount.sellSolAmount}`
      )
      
      logger.error(
        {
          signature: doc.signature,
          type: doc.type,
          sellSolAmount: doc.solAmount.sellSolAmount,
        },
        'Model-level validation failed: Invalid sellSolAmount (NaN)'
      )
      
      return next(error)
    }
    
    if (sellSolAmount < 0) {
      const error = new Error(
        `Architectural violation: solAmount.sellSolAmount cannot be negative. ` +
        `Signature: ${doc.signature}, Type: ${doc.type}, Value: ${sellSolAmount}`
      )
      
      logger.error(
        {
          signature: doc.signature,
          type: doc.type,
          sellSolAmount,
        },
        'Model-level validation failed: Negative sellSolAmount'
      )
      
      return next(error)
    }
  }
  
  // ✅ Validate split swaps are not merged into "both" type
  if (doc.type === 'both' && doc.classificationSource?.includes('v2_parser_split')) {
    const error = new Error(
      `Architectural violation: Split swaps must be stored as separate records. ` +
      `Signature: ${doc.signature}`
    )
    
    logger.error(
      {
        signature: doc.signature,
        classificationSource: doc.classificationSource,
      },
      'Model-level validation failed: Attempted to create merged "both" record for split swap'
    )
    
    return next(error)
  }
  
  // ✅ Validate USD contamination guard
  // Check if amount fields suspiciously match USD amounts
  // This is a heuristic check - if amount fields are very close to USD amounts,
  // it's likely USD contamination
  if (doc.transaction?.tokenIn?.usdAmount && doc.transaction?.tokenOut?.usdAmount) {
    const tokenInUsd = parseFloat(doc.transaction.tokenIn.usdAmount)
    const tokenOutUsd = parseFloat(doc.transaction.tokenOut.usdAmount)
    
    if (!isNaN(tokenInUsd) && !isNaN(tokenOutUsd)) {
      // Check if buyAmount or sellAmount suspiciously matches USD amounts
      // Allow 1% tolerance for rounding
      const buyMatchesInUsd = Math.abs(buyAmount - tokenInUsd) / Math.max(tokenInUsd, 1) < 0.01
      const buyMatchesOutUsd = Math.abs(buyAmount - tokenOutUsd) / Math.max(tokenOutUsd, 1) < 0.01
      const sellMatchesInUsd = Math.abs(sellAmount - tokenInUsd) / Math.max(tokenInUsd, 1) < 0.01
      const sellMatchesOutUsd = Math.abs(sellAmount - tokenOutUsd) / Math.max(tokenOutUsd, 1) < 0.01
      
      // If amount fields match USD values AND they're different from each other
      // (same values could be coincidence), flag it
      if ((buyMatchesInUsd || buyMatchesOutUsd || sellMatchesInUsd || sellMatchesOutUsd) && 
          Math.abs(buyAmount - sellAmount) > 0.01) {
        logger.warn(
          {
            signature: doc.signature,
            type: doc.type,
            buyAmount,
            sellAmount,
            tokenInUsd,
            tokenOutUsd,
            buyMatchesInUsd,
            buyMatchesOutUsd,
            sellMatchesInUsd,
            sellMatchesOutUsd,
          },
          'Model-level validation warning: Amount fields suspiciously match USD amounts (possible contamination)'
        )
        
        // Note: We log a warning but don't block the save
        // This is because legitimate cases might match USD values
        // The warning allows monitoring for patterns
      }
    }
  }
  
  next()
})

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
