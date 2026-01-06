// Trending Tokens Types
// Top Coins Types
export interface TopCoin {
  id: string
  rank: number
  symbol: string
  name: string
  price: number
  priceChange: number
  marketCap: number
  volume24h: number
  netInflow: number
  netOutflow: number
  totalBuys: number
  totalSells: number
  buyCount: number
  sellCount: number
  whaleCount: number
  imageUrl: string
  tokenAddress: string
  lastUpdated: string
  marketCapTier:  | "smallCaps" | "midCaps" | "largeCaps"
  chartData: ChartDataPoint[]
}

export interface TopCoinsResponse {
  success: boolean
  data: {
    coins: {
      smallCaps: TopCoin[]
      midCaps: TopCoin[]
      largeCaps: TopCoin[]
      all: TopCoin[]
    }
    timeframe: string
    marketCap: string
    flowType: string
    total: number
    lastUpdated: string
    calculatedAt: string
  }
}

// Top Kol Coins Types
export interface TopKolCoin {
  id: string
  rank: number
  symbol: string
  name: string
  price: number
  priceChange: number
  marketCap: number
  volume24h: number
  netInflow: number
  netOutflow: number
  totalBuys: number
  totalSells: number
  buyCount: number
  sellCount: number
  whaleCount: number
  imageUrl: string
  tokenAddress: string
  lastUpdated: string
  marketCapTier: | "smallCaps" | "midCaps" | "largeCaps"
  chartData: ChartDataPoint[]
}

export interface TopKolCoinsResponse {
  success: boolean
  data: {
    coins: {
      smallCaps: TopKolCoin[]
      midCaps: TopKolCoin[]
      largeCaps: TopKolCoin[]
      all: TopKolCoin[]
    }
    timeframe: string
    marketCap: string
    flowType: string
    total: number
    lastUpdated: string
    calculatedAt: string
  }
}

export interface ChartDataPoint {
  time: string
  marketCap: number
  price: number
  volume: number
  trades: Trade[]
}

export interface Trade {
  type: string
  amount: number
  whaleAddress: string
  timestamp: string
}

export interface ChartDataResponse {
  success: boolean
  data: {
    tokenAddress: string
    timeframe: string
    dataPoints: ChartDataPoint[]
    lastUpdated: string
  }
}

export interface TopCoinsParams {
  timeframe?: string
  marketCap?: string
  flowType?: string
}

export interface TopKolCoinsParams {
  timeframe?: string
  marketCap?: string
  flowType?: string
}

export interface ChartParams {
  timeframe?: string
  hours?: number
}

export interface TrendingToken {
  _id: string
  address: string
  logoURI: string
  marketcap: number
  name: string
  price: number
  price24hChangePercent: number
  rank: number
  symbol: string
  updateTime: string
  volume24hChangePercent: number | null
  volume24hUSD: number

  // New live market cap tracking fields
  marketcapChange5m?: number
  lastMarketcapUpdate?: string
  isLiveData?: boolean
  dataFreshness?: number | null
}

export interface TrendingTokensResponse {
  success: boolean
  data: {
    tokens: TrendingToken[]
    total: number
    limit: number
    offset: number
    updateTime: string
    liveMarketcapEnabled?: boolean
  }
}

// Whale Types
export interface Whale {
  _id: string
  address: string
  balance: number
  label?: string
  // Add more whale properties as needed
}

export interface WhaleResponse {
  success: boolean
  data: Whale[]
}

// Transaction Types
export interface Transaction {
  _id: string
  signature: string
  from: string
  to: string
  amount: number
  token: string
  timestamp: string
  // Add more transaction properties as needed
}

export interface TransactionResponse {
  success: boolean
  data: Transaction[]
}

// Token Types
export interface Token {
  _id: string
  address: string
  symbol: string
  name: string
  decimals: number
  // Add more token properties as needed
}

export interface TokenResponse {
  success: boolean
  data: Token[]
}

// Insight Types
export interface Insight {
  _id: string
  title: string
  content: string
  timestamp: string
  // Add more insight properties as needed
}

export interface InsightResponse {
  success: boolean
  data: Insight[]
}

// Influencer Types
export interface Influencer {
  _id: string
  name: string
  wallet: string
  followers: number
  // Add more influencer properties as needed
}

export interface InfluencerResponse {
  success: boolean
  data: Influencer[]
}
