import { Document, Schema, model } from 'mongoose'

interface ITokenSummary {
  symbol: string
  name: string
  whaleCount: number
  totalVolume: number
  netInflow: number
  netOutflow: number
  marketCap: number
  price: number
  priceChange24h: number
  volume24h: number
  tokenURI: string
  tokenAddress: string
  lastUpdated: Date
}

export interface ITopTokenMarketcap extends Document {
  timeframe: string
  generatedAt: Date
  smallCaps: ITokenSummary[]
  midCaps: ITokenSummary[]
  largeCaps: ITokenSummary[]
  lastUpdated: Date
}

const TokenSummarySchema = new Schema<ITokenSummary>({
  symbol: { type: String, required: true },
  name: { type: String, required: true },
  whaleCount: { type: Number, required: true },
  totalVolume: { type: Number, required: true },
  netInflow: { type: Number, required: true },
  netOutflow: { type: Number, required: true },
  marketCap: { type: Number, required: true },
  price: { type: Number, required: true },
  priceChange24h: { type: Number, default: 0 },
  volume24h: { type: Number, default: 0 },
  tokenURI: { type: String },
  tokenAddress: { type: String, required: true },
  lastUpdated: { type: Date, default: Date.now },
})

const TopTokenMarketcapSchema = new Schema<ITopTokenMarketcap>({
  timeframe: { type: String, required: true },
  generatedAt: { type: Date, default: Date.now },
  smallCaps: { type: [TokenSummarySchema], default: [] },
  midCaps: { type: [TokenSummarySchema], default: [] },
  largeCaps: { type: [TokenSummarySchema], default: [] },
  lastUpdated: { type: Date, default: Date.now },
})

const TopTokenMarketcapModel = model<ITopTokenMarketcap>(
  'TopTokenMarketcap',
  TopTokenMarketcapSchema,
)

export default TopTokenMarketcapModel
