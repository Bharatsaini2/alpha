import axios from "axios"
import type {
  TrendingTokensResponse,
  WhaleResponse,
  TransactionResponse,
  TokenResponse,
  InsightResponse,
  InfluencerResponse,
  TopCoinsResponse,
  TopCoinsParams,
  ChartParams,
  ChartDataResponse,
  TopKolCoinsParams,
  TopKolCoinsResponse,
} from "./types"

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_SERVER_URL || "http://localhost:9090/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Enable cookies for cross-origin requests
})

// Request interceptor for adding auth tokens if needed
api.interceptors.request.use(
  (config) => {
    // You can add authentication tokens here if needed
    // const token = localStorage.getItem('token');
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for handling common errors
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    // Handle common errors here
    if (error.response?.status === 401) {
      // Handle unauthorized
      console.error("Unauthorized access")
    } else if (error.response?.status === 500) {
      // Handle server errors
      console.error("Server error occurred")
    }
    return Promise.reject(error)
  }
)

// API endpoints
export const topCoinsAPI = {
  getTopCoins: (params?: TopCoinsParams) =>
    api.get<TopCoinsResponse>("/top-coins", { params }),

  getTokenChartData: (tokenAddress: string, params?: ChartParams) =>
    api.get<ChartDataResponse>(`/top-coins/${tokenAddress}/chart`, { params }),

  getTopKolCoins: (params?: TopKolCoinsParams) =>
    api.get<TopKolCoinsResponse>("/top-coins-kol", { params }),
}

export const trendingTokensAPI = {
  getTrendingTokens: (limit: number = 50) =>
    api.get<TrendingTokensResponse>(`/trending-tokens?limit=${limit}`),
}

export const whaleAPI = {
  getWhales: (params?: any) => api.get<WhaleResponse>("/whale", { params }),
  getWhaleTransactions: (params?: any) =>
    api.get<TransactionResponse>("/transactions", { params }),
}

export const tokenAPI = {
  getTokens: (params?: any) => api.get<TokenResponse>("/token", { params }),
}

export const insightAPI = {
  getInsights: (params?: any) =>
    api.get<InsightResponse>("/insight", { params }),
}

export const influencerAPI = {
  getInfluencers: (params?: any) =>
    api.get<InfluencerResponse>("/influencer", { params }),
}

export default api
