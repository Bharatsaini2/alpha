/**
 * Jupiter Token List Integration
 * Fetches and caches the comprehensive token list from Jupiter API
 * Uses Jupiter Ultra Search API for real-time token search
 */

import { TokenInfo, EXTENDED_TOKEN_LIST } from "./tokenList"

// Jupiter API endpoints
const JUPITER_API_ENDPOINTS = [
  "https://token.jup.ag/strict",
  "https://cache.jup.ag/tokens",
  "https://tokens.jup.ag/tokens?tags=verified",
]

// Jupiter Ultra Search API endpoint
const JUPITER_ULTRA_SEARCH_URL = "https://api.jup.ag/ultra/v1/search"

// Cache configuration
const CACHE_KEY = "jupiter_token_list"
const CACHE_DURATION = 1000 * 60 * 60 // 1 hour

interface JupiterToken {
  address: string
  chainId?: number
  decimals: number
  name: string
  symbol: string
  logoURI?: string
  tags?: string[]
  extensions?: {
    coingeckoId?: string
  }
}

// Jupiter Ultra Search API response format
interface JupiterUltraToken {
  id: string // mint address
  name: string
  symbol: string
  icon?: string
  decimals: number
  twitter?: string
  telegram?: string
  website?: string
  dev?: string
  circSupply?: number
  totalSupply?: number
  tokenProgram?: string
  launchpad?: string
  fdv?: number
  mcap?: number
  usdPrice?: number
  liquidity?: number
  isVerified?: boolean
  tags?: string[]
}

interface TokenCache {
  tokens: TokenInfo[]
  timestamp: number
}

/**
 * Converts Jupiter token format to our TokenInfo format
 */
function convertJupiterToken(jupToken: JupiterToken): TokenInfo {
  return {
    address: jupToken.address,
    symbol: jupToken.symbol,
    name: jupToken.name,
    decimals: jupToken.decimals,
    image: jupToken.logoURI,
    tags: jupToken.tags,
    isPopular: false,
  }
}

/**
 * Converts Jupiter Ultra Search token format to our TokenInfo format
 */
function convertUltraToken(ultraToken: JupiterUltraToken): TokenInfo {
  return {
    address: ultraToken.id,
    symbol: ultraToken.symbol,
    name: ultraToken.name,
    decimals: ultraToken.decimals,
    image: ultraToken.icon,
    tags: ultraToken.tags,
    isPopular: false,
    // Extended info from Ultra API
    usdPrice: ultraToken.usdPrice,
    mcap: ultraToken.mcap,
    liquidity: ultraToken.liquidity,
    isVerified: ultraToken.isVerified,
  }
}

/**
 * Loads tokens from localStorage cache
 */
function loadFromCache(): TokenInfo[] | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null

    const data: TokenCache = JSON.parse(cached)
    const now = Date.now()

    // Check if cache is still valid
    if (now - data.timestamp < CACHE_DURATION) {
      console.log(`✅ Loaded ${data.tokens.length} tokens from cache`)
      return data.tokens
    }

    // Cache expired
    localStorage.removeItem(CACHE_KEY)
    return null
  } catch (error) {
    console.error("Failed to load token cache:", error)
    return null
  }
}

/**
 * Saves tokens to localStorage cache
 */
function saveToCache(tokens: TokenInfo[]): void {
  try {
    // Limit tokens to prevent localStorage quota issues
    // Keep only the most important tokens (popular + first 2000)
    const popularTokens = tokens.filter(t => t.isPopular)
    const otherTokens = tokens.filter(t => !t.isPopular).slice(0, 2000)
    const tokensToCache = [...popularTokens, ...otherTokens]
    
    const data: TokenCache = {
      tokens: tokensToCache,
      timestamp: Date.now(),
    }
    
    const jsonString = JSON.stringify(data)
    const sizeInMB = (jsonString.length / 1024 / 1024).toFixed(2)
    
    console.log(`💾 Attempting to cache ${tokensToCache.length} tokens (${sizeInMB}MB)`)
    
    localStorage.setItem(CACHE_KEY, jsonString)
    console.log(`✅ Successfully cached ${tokensToCache.length} tokens`)
  } catch (error: any) {
    if (error.name === 'QuotaExceededError') {
      console.warn('⚠️ localStorage quota exceeded, skipping cache')
      // Try to clear old cache and retry with fewer tokens
      try {
        localStorage.removeItem(CACHE_KEY)
        const limitedTokens = tokens.filter(t => t.isPopular).concat(
          tokens.filter(t => !t.isPopular).slice(0, 500)
        )
        const data: TokenCache = {
          tokens: limitedTokens,
          timestamp: Date.now(),
        }
        localStorage.setItem(CACHE_KEY, JSON.stringify(data))
        console.log(`✅ Cached ${limitedTokens.length} tokens (reduced set)`)
      } catch (retryError) {
        console.error("Failed to cache even reduced token set:", retryError)
      }
    } else {
      console.error("Failed to save token cache:", error)
    }
  }
}

/**
 * Fetches token list from Jupiter API with fallback to local list
 * @param useStrictList - If true, uses strict list (verified tokens only)
 * @returns Promise with array of tokens
 */
export async function fetchJupiterTokens(
  useStrictList: boolean = true
): Promise<TokenInfo[]> {
  try {
    // Try to load from cache first
    const cached = loadFromCache()
    if (cached && cached.length > 0) {
      return cached
    }

    console.log("🔄 Fetching tokens from Jupiter API...")

    // Try each endpoint
    for (const url of JUPITER_API_ENDPOINTS) {
      try {
        console.log(`Trying: ${url}`)
        
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          console.warn(`❌ ${url} returned ${response.status}`)
          continue
        }

        const data = await response.json()
        
        // Handle different response formats
        let jupiterTokens: JupiterToken[] = []
        if (Array.isArray(data)) {
          jupiterTokens = data
        } else if (data.tokens && Array.isArray(data.tokens)) {
          jupiterTokens = data.tokens
        } else {
          console.warn(`❌ Unexpected format from ${url}`)
          continue
        }

        if (jupiterTokens.length === 0) {
          console.warn(`❌ No tokens from ${url}`)
          continue
        }

        console.log(`✅ Fetched ${jupiterTokens.length} tokens from Jupiter`)

        // Convert to our format
        const tokens = jupiterTokens.map(convertJupiterToken)

        // Mark popular tokens
        markPopularTokens(tokens)

        // Save to cache (will be limited automatically)
        saveToCache(tokens)

        // Return ALL tokens (not just cached ones)
        console.log(`📊 Returning ${tokens.length} tokens for use`)
        return tokens
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.warn(`⏱️ Timeout fetching from ${url}`)
        } else {
          console.warn(`❌ Error from ${url}:`, error.message)
        }
        continue
      }
    }

    // All endpoints failed, use fallback
    console.warn("⚠️ All Jupiter endpoints failed, using local token list")
    throw new Error("All Jupiter API endpoints failed")
    
  } catch (error) {
    console.error("❌ Failed to fetch Jupiter tokens, using fallback")
    
    // Return extended token list as fallback
    const fallbackTokens = [...EXTENDED_TOKEN_LIST]
    markPopularTokens(fallbackTokens)
    
    // Cache the fallback list
    saveToCache(fallbackTokens)
    
    return fallbackTokens
  }
}

/**
 * Marks popular tokens in the list
 */
function markPopularTokens(tokens: TokenInfo[]): void {
  const popularAddresses = new Set([
    "So11111111111111111111111111111111111111112", // SOL
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", // mSOL
    "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", // ETH
    "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E", // BTC
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // JUP
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
  ])

  tokens.forEach((token) => {
    if (popularAddresses.has(token.address)) {
      token.isPopular = true
    }
  })
}

/**
 * Searches tokens by query
 * @param query - Search query (symbol, name, or address)
 * @param tokens - Token list to search
 * @returns Filtered tokens
 */
export function searchJupiterTokens(
  query: string,
  tokens: TokenInfo[]
): TokenInfo[] {
  if (!query || query.length < 1) return []

  const lowerQuery = query.toLowerCase()

  return tokens.filter(
    (token) =>
      token.symbol.toLowerCase().includes(lowerQuery) ||
      token.name.toLowerCase().includes(lowerQuery) ||
      token.address.toLowerCase().includes(lowerQuery) ||
      token.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))
  )
}

/**
 * Gets popular tokens from the list
 * @param tokens - Full token list
 * @returns Popular tokens
 */
export function getPopularJupiterTokens(tokens: TokenInfo[]): TokenInfo[] {
  return tokens.filter((token) => token.isPopular)
}

/**
 * Clears the token cache
 */
export function clearTokenCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
    console.log("🗑️ Token cache cleared")
  } catch (error) {
    console.error("Failed to clear token cache:", error)
  }
}

/**
 * Searches tokens using Jupiter Ultra Search API
 * This provides real-time search with rich token data including price, mcap, liquidity
 * @param query - Search query (symbol, name, or mint address)
 * @returns Promise with array of matching tokens
 */
export async function searchJupiterUltra(query: string): Promise<TokenInfo[]> {
  if (!query || query.length < 1) return []

  try {
    console.log(`🔍 Searching Jupiter Ultra for: "${query}"`)
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000) // 8s timeout
    
    const url = `${JUPITER_ULTRA_SEARCH_URL}?query=${encodeURIComponent(query)}`
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      console.warn(`❌ Jupiter Ultra Search returned ${response.status}`)
      throw new Error(`Jupiter Ultra Search failed: ${response.status}`)
    }

    const data: JupiterUltraToken[] = await response.json()
    
    if (!Array.isArray(data)) {
      console.warn("❌ Unexpected response format from Jupiter Ultra Search")
      throw new Error("Invalid response format")
    }

    console.log(`✅ Jupiter Ultra found ${data.length} tokens`)

    // Convert to our format
    const tokens = data.map(convertUltraToken)
    
    // Mark popular tokens
    markPopularTokens(tokens)

    return tokens
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn("⏱️ Jupiter Ultra Search timeout")
    } else {
      console.warn("❌ Jupiter Ultra Search error:", error.message)
    }
    
    // Return empty array - caller should fallback to local search
    return []
  }
}

/**
 * Refreshes the token list from Jupiter API
 * @param useStrictList - If true, uses strict list (verified tokens only)
 * @returns Promise with refreshed tokens
 */
export async function refreshJupiterTokens(
  useStrictList: boolean = true
): Promise<TokenInfo[]> {
  clearTokenCache()
  return fetchJupiterTokens(useStrictList)
}
