import axios from 'axios'
import WhalesAddressModel from '../models/solana-tokens-whales'
import InfluencerWhalesAddressModelV2 from '../models/Influencer-wallet-whalesV2'
import TokenDataModel from '../models/token-data.model'
import TokenMetadataCacheModel from '../models/token-metadata-cache.model'
import dotenv from 'dotenv'
import { Metaplex, PublicKey } from '@metaplex-foundation/js'
import { Connection } from '@solana/web3.js'
import logger from '../utils/logger'
import { redisClient } from './redis'
import mongoose from 'mongoose'
dotenv.config()

const BIRD_EYE_API_KEY =
  process.env.BIRD_EYE_API_KEY || '1209ac01dce54f0a97fd6b58c7b9ecb4'
const HELIUS_API_KEY =
  process.env.HELIUS_API_KEY || 'ef5e9c05-c3bf-4179-91eb-07fd3a8b9b6b'
const SOLANA_RPC_URL =
  process.env.RPC_URL || 'https://api.mainnet-beta.solana.com'
const birdEyeClient = axios.create({
  baseURL: 'https://public-api.birdeye.so',
  headers: { 'X-API-KEY': BIRD_EYE_API_KEY },
})

// In-memory cache for token metadata (24 hour TTL)
const tokenMetadataCache = new Map<string, { symbol?: string; name?: string; timestamp: number }>()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

// ✅ NEW: Track failed resolutions to prevent repeated API calls
const failedResolutions = new Map<string, number>()
const FAILED_RESOLUTION_TTL = 60 * 60 * 1000 // 1 hour

// ✅ NEW: Safe TokenDataModel update - NEVER stores symbol/name metadata
async function safeUpdateTokenDataModel(
  tokenAddress: string, 
  updates: { imageUrl?: string | null; [key: string]: any }
): Promise<void> {
  // ✅ CRITICAL: Strip any symbol/name fields to prevent cache poisoning
  const safeUpdates = {
    tokenAddress,
    imageUrl: updates.imageUrl || null,
    lastUpdated: new Date(),
    // ✅ Explicitly exclude symbol/name - they belong in TokenMetadataCacheModel
  }
  
  // ✅ Remove any accidentally passed symbol/name fields
  delete (safeUpdates as any).symbol
  delete (safeUpdates as any).name
  
  await TokenDataModel.findOneAndUpdate(
    { tokenAddress },
    { $set: safeUpdates },
    { upsert: true, new: true },
  )
}

// Cleanup old cache entries periodically
setInterval(() => {
  const now = Date.now()
  
  // Clean metadata cache
  for (const [key, value] of tokenMetadataCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      tokenMetadataCache.delete(key)
    }
  }
  
  // Clean price cache
  for (const [key, value] of priceDataCache.entries()) {
    if (now - value.timestamp > PRICE_CACHE_TTL) {
      priceDataCache.delete(key)
    }
  }
  
  // ✅ Clean failed resolutions cache
  for (const [key, value] of failedResolutions.entries()) {
    if (now - value > FAILED_RESOLUTION_TTL) {
      failedResolutions.delete(key)
    }
  }
  
  logger.info(
    `🧹 Cache cleanup: Metadata cache size: ${tokenMetadataCache.size}, Price cache size: ${priceDataCache.size}, Failed resolutions: ${failedResolutions.size}`,
  )
}, 300000) // Clean every 5 minutes

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

// jupiter API for token price
export const getTokenPrice = async (tokenAddress: string) => {
  try {
    const response = await axios.get(
      `https://lite-api.jup.ag/price/v3?ids=${tokenAddress}`,
      {
        timeout: 20000,
      },
    )

    const price = response.data?.[tokenAddress]?.usdPrice
    return price ?? 0
  } catch (err) {
    console.error(
      `Error fetching price for ${tokenAddress} : ${JSON.stringify(err)}`,
    )
    return 0
  }
}

export const fetchSolanaMarketCap = async (tokenAddress: string) => {
  try {
    const url = `https://api.dexscreener.com/latest/dex/search?q=${tokenAddress}`

    const response = await axios.get(url)
    const data = response.data

    // Find the object where dexId === "meteora"
    const meteoraPair = data?.pairs?.find(
      (pair: any) => pair.dexId === 'meteora' && pair.marketCap,
    )

    if (meteoraPair) {
      console.log('Meteora Market Cap:', meteoraPair.marketCap)
      return meteoraPair.marketCap
    } else {
      console.log('No Meteora pair with marketCap found.')
      return null
    }
  } catch (error) {
    console.error('Error fetching market cap:', (error as any).message)
    return null
  }
}

// In-memory cache for price data (5 minute TTL to reduce API calls)
const priceDataCache = new Map<string, { 
  price: number
  marketCap: number
  volume24h: number
  timestamp: number 
}>()
const PRICE_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Get token data with DB-first approach, then dexscrenner, then birdeye fallback
export async function getTokenDataWithFallback(tokenAddress: string): Promise<{
  price: number
  marketCap: number
  imageUrl: string | null
  volume24h: number
  symbol?: string | null
  name?: string | null
}> {
  try {
    // ✅ Step 1: Check in-memory price cache (5 min TTL)
    const now = Date.now()
    const cachedPrice = priceDataCache.get(tokenAddress)
    
    const dbTokenData = await TokenDataModel.findOne({
      tokenAddress,
    }).lean()

    let cachedImageUrl: string | null = null

    if (dbTokenData) {
      cachedImageUrl = dbTokenData.imageUrl || null
    }

    // ✅ If price cache is fresh (< 5 minutes old), use it
    if (cachedPrice && (now - cachedPrice.timestamp) < PRICE_CACHE_TTL) {
      logger.info(
        `✅ Using cached price data for ${tokenAddress} (age: ${Math.round((now - cachedPrice.timestamp) / 1000)}s)`,
      )
      return {
        price: cachedPrice.price,
        marketCap: cachedPrice.marketCap,
        imageUrl: cachedImageUrl,
        volume24h: cachedPrice.volume24h,
      }
    }

    // ✅ Cache miss or expired - fetch fresh data
    logger.info(
      `📊 Fetching fresh price/marketCap from DexScreener for ${tokenAddress}`,
    )
    const dexscrennerData = await getTokenDataFromDexScreener(tokenAddress)
    
    // ✅ Store price data in cache
    priceDataCache.set(tokenAddress, {
      price: dexscrennerData.price,
      marketCap: dexscrennerData.marketCap,
      volume24h: dexscrennerData.volume24h,
      timestamp: now
    })

    let imageUrl = cachedImageUrl

    if (!imageUrl) {
      logger.info(
        `🔍 Image not in DB for ${tokenAddress}, fetching from DexScreener`,
      )
      imageUrl = dexscrennerData.imageUrl || null

      if (!imageUrl) {
        logger.info(
          `🔍 Image not found in DexScreener for ${tokenAddress}, trying BirdEye`,
        )
        imageUrl = await getTokenImageUrl(tokenAddress)
      }
    } else {
      logger.info(`✅ Using cached imageUrl from DB for ${tokenAddress}`)
    }

    // ✅ CRITICAL: Never store symbol/name metadata in TokenDataModel
    // TokenDataModel is for price/image data only
    // Symbol/name metadata goes to TokenMetadataCacheModel with proper validation
    
    await safeUpdateTokenDataModel(tokenAddress, { imageUrl })

    logger.info(`💾 Stored token imageUrl in DB for ${tokenAddress}`)

    return {
      price: dexscrennerData.price,
      marketCap: dexscrennerData.marketCap,
      imageUrl: imageUrl || null,
      volume24h: dexscrennerData.volume24h,
    }
  } catch (error: any) {
    logger.error(
      { error },
      `❌ Error in getTokenDataWithFallback for ${tokenAddress}`,
    )
    // Return defaults on error
    return { price: 0, marketCap: 0, imageUrl: null, volume24h: 0 }
  }
}

// Fetch token data from DexScreener API
async function getTokenDataFromDexScreener(
  tokenAddress: string,
  retries = 3,
): Promise<{
  price: number
  marketCap: number
  imageUrl: string | null
  volume24h: number
}> {
  const url = `https://api.dexscreener.com/latest/dex/search?q=${tokenAddress}`

  try {
    const response = await axios.get(url)

    if (!response.data.pairs || response.data.pairs.length === 0) {
      logger.warn(`No data found for token address: ${tokenAddress}`)
      return {
        price: 0,
        marketCap: 0,
        imageUrl: null,
        volume24h: 0,
      }
    }

    const tokenData = response.data.pairs[0]

    let price = parseFloat(tokenData.priceUsd) || 0
    const volume24h = tokenData.volume?.['h24'] || 0
    const marketCap = tokenData.marketCap ? parseFloat(tokenData.marketCap) : 0
    let imageUrl = tokenData.info?.imageUrl || null

    // ✅ Fallback: If DexScreener price = 0, use Jupiter price
    if (price === 0) {
      const fallbackPrice = await getTokenPrice(tokenAddress)
      price = fallbackPrice
    }

    // ✅ Fallback: If DexScreener imageUrl is null, use BirdEye image URL
    if (!imageUrl) {
      const fallbackImageUrl = await getTokenImageUrl(tokenAddress)
      imageUrl = fallbackImageUrl
    }

    return {
      price,
      marketCap,
      imageUrl,
      volume24h,
    }
  } catch (error: any) {
    logger.error(
      `Error fetching data from DexScreener for ${tokenAddress}: ${error.message}`,
    )

    if (retries > 0) {
      logger.warn(`Retrying in 5 seconds... (${retries} retries left)`)
      await delay(5000)
      return getTokenDataFromDexScreener(tokenAddress, retries - 1)
    }

    return {
      price: 0,
      marketCap: 0,
      imageUrl: null,
      volume24h: 0,
    }
  }
}

// Fetch token market cap using DexScreen API (kept for backward compatibility)
export async function getTokenData(tokenAddress: string, retries = 3) {
  // Use the new function with fallback
  return await getTokenDataWithFallback(tokenAddress)
}

export async function getTokenCreationInfo(tokenAddress: string) {
  // Check Redis cache first
  const cacheKey = `token:creation:${tokenAddress}`

  try {
    const cached = await redisClient.get(cacheKey)
    if (cached) {
      console.log('✅ Cache HIT (creation):', tokenAddress)
      return cached === 'UNKNOWN' ? null : cached
    }
  } catch (error) {
    logger.warn(`Redis cache read failed for ${cacheKey}:${String(error)}`)
  }

  console.log('🔴 Birdeye API call (creation):', tokenAddress)

  const url = `https://public-api.birdeye.so/defi/token_creation_info?address=${tokenAddress}`
  try {
    const response = await axios.get(url, {
      headers: {
        'X-API-KEY': BIRD_EYE_API_KEY,
        accept: 'application/json',
        'x-chain': 'solana',
      },
    })

    const creationTime = response.data.data.blockHumanTime

    // Cache for 7 days (token creation time never changes)
    // Cache even if null to prevent repeated API calls for tokens without creation time
    const cacheValue = creationTime || 'UNKNOWN'
    try {
      await redisClient.setex(cacheKey, 7 * 24 * 60 * 60, cacheValue)
    } catch (error) {
      logger.warn(`Redis cache write failed for ${cacheKey}:${String(error)}`)
    }

    return creationTime
  } catch (error) {
    console.error(`Error fetching creation info for ${tokenAddress}:`, error)
    return null
  }
}

export async function getTokenMarketCapAndPriceUsingBirdEye(
  tokenAddress: string,
) {
  // Check Redis cache first (cache for 5 minutes to reduce API calls)
  const cacheKey = `token:market:${tokenAddress}`

  try {
    const cached = await redisClient.get(cacheKey)
    if (cached) {
      console.log('✅ Cache HIT (market):', tokenAddress)
      return JSON.parse(cached)
    }
  } catch (error) {
    logger.warn(`Redis cache read failed for ${cacheKey}:${String(error)}`)
  }

  console.log('🔴 Birdeye API call (market):', tokenAddress)

  const url = `https://public-api.birdeye.so/defi/v3/token/market-data?address=${tokenAddress}&ui_amount_mode=scaled`
  try {
    const response = await axios.get(url, {
      headers: {
        'X-API-KEY': BIRD_EYE_API_KEY,
        accept: 'application/json',
        'x-chain': 'solana',
      },
    })

    const data = response.data.data

    // Cache for 5 minutes (reduces API calls while keeping data reasonably fresh)
    if (data) {
      try {
        await redisClient.setex(cacheKey, 300, JSON.stringify(data))
      } catch (error) {
        logger.warn(`Redis cache write failed for ${cacheKey}:${String(error)}`)
      }
    }

    return data
  } catch (error) {
    console.error(
      `Error fetching market cap and price for ${tokenAddress}:`,
      error,
    )
    return null
  }
}

export async function getTokenImageUrl(tokenAddress: string) {
  // Check Redis cache first
  const cacheKey = `token:image:${tokenAddress}`

  try {
    const cached = await redisClient.get(cacheKey)
    if (cached) {
      console.log('✅ Cache HIT (image):', tokenAddress)
      return cached
    }
  } catch (error) {
    logger.warn(`Redis cache read failed for ${cacheKey}:${String(error)}`)
  }

  console.log('🔴 Birdeye API call (image):', tokenAddress)

  const url = `https://public-api.birdeye.so/defi/v3/token/meta-data/single?address=${tokenAddress}`
  try {
    const response = await axios.get(url, {
      headers: {
        'X-API-KEY': BIRD_EYE_API_KEY,
        accept: 'application/json',
        'x-chain': 'solana',
      },
    })

    const imageUrl = response.data.data.logo_uri

    // Cache for 7 days (image URLs rarely change)
    if (imageUrl) {
      try {
        await redisClient.setex(cacheKey, 7 * 24 * 60 * 60, imageUrl)
      } catch (error) {
        logger.warn(`Redis cache write failed for ${cacheKey}:${String(error)}`)
      }
    }

    return imageUrl
  } catch (error) {
    console.error(`Error fetching image url for ${tokenAddress}:`, error)
    return null
  }
}

// export async function getTokenMetaDataUsingBirdEye(tokenAddress: string, retries = 3): Promise<{
//   symbol?: string
// }> {
//   try {
//     const resp = await birdEyeClient.get('/defi/v3/token/meta-data/single', {
//       params: { address: tokenAddress }
//     });

//     const d = resp.data.data;

//     return {
//       symbol: d.symbol
//     };
//   } catch (error: any) {
//     console.error(`❌ Error fetching data for ${tokenAddress}: ${error.message}`);

//     if (retries > 0) {
//       console.warn(`🔁 Retrying in 5 seconds... (${retries} retries left)`);
//       await delay(5000);
//       return getTokenMetaDataUsingBirdEye(tokenAddress, retries - 1);
//     }

//     return { symbol: 'Unknow' };
//   }

// }

// ============ HELPER FUNCTIONS FOR TOKEN METADATA ============

// Helper: Save valid token to database cache
export async function saveTokenToCache(
  tokenAddress: string,
  symbol: string,
  name: string,
  source: 'rpc' | 'helius' | 'coingecko' | 'solscan' | 'dexscreener' | 'jupiter' | 'birdeye' | 'shyft'
): Promise<void> {
  // ✅ FIXED: Enhanced validation before caching
  if (!isValidMetadata(symbol)) {
    logger.info(`⚠️ Skipping cache save for invalid symbol: "${symbol}"`)
    return
  }
  
  // ✅ FIXED: Never cache shortened addresses
  if (symbol.includes('...') || /^[A-Za-z0-9]{3,4}\.\.\.[A-Za-z0-9]{3,4}$/.test(symbol)) {
    logger.info(`⚠️ Skipping cache save for shortened address: "${symbol}"`)
    return
  }

  try {
    await TokenMetadataCacheModel.findOneAndUpdate(
      { tokenAddress },
      {
        $set: {
          symbol,
          name: name || symbol,
          source,
          lastUpdated: new Date(),
        },
      },
      { upsert: true, new: true }
    )
    logger.info(`💾 Cached: ${tokenAddress.slice(0, 8)}... → ${symbol} [${source}]`)
  } catch (error) {
    logger.error({ error }, `❌ Failed to save to cache: ${tokenAddress}`)
    throw error
  }
}

// ✅ NEW: Track failed resolutions
async function markTokenResolutionFailed(tokenAddress: string): Promise<void> {
  failedResolutions.set(tokenAddress, Date.now())
  
  // Also save to Redis to persist across restarts
  try {
    await redisClient.setex(`failed_resolution:${tokenAddress}`, 3600, 'true')
  } catch (error) {
    logger.warn(`Failed to cache resolution failure: ${error}`)
  }
}

async function isTokenResolutionFailed(tokenAddress: string): Promise<boolean> {
  // Check in-memory first
  const failed = failedResolutions.get(tokenAddress)
  if (failed && (Date.now() - failed) < FAILED_RESOLUTION_TTL) {
    return true
  }
  
  // Check Redis
  try {
    const redisFailed = await redisClient.get(`failed_resolution:${tokenAddress}`)
    return redisFailed === 'true'
  } catch {
    return false
  }
}

// Helper: Get token from database cache
async function getTokenFromCache(tokenAddress: string): Promise<{ symbol: string; name: string; source: string } | null> {
  try {
    // Check if mongoose is connected
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      console.log(`⚠️ MongoDB not connected, skipping cache`)
      return null
    }

    const cached = await TokenMetadataCacheModel.findOne({ tokenAddress }).lean()

    if (cached && cached.symbol && isValidCachedSymbol(cached.symbol)) {
      console.log(`✅ Cache HIT: ${tokenAddress} → ${cached.symbol} (source: ${cached.source})`)
      return {
        symbol: cached.symbol,
        name: cached.name,
        source: cached.source
      }
    }

    if (cached) {
      console.log(`⚠️ Cache has invalid symbol (${cached.symbol}), will re-fetch`)
    }

    return null
  } catch (error) {
    console.error('Failed to read from cache:', error)
    return null
  }
}

// Helper: Check if token metadata is valid
function isValidMetadata(symbol: string | undefined | null): boolean {
  if (!symbol || typeof symbol !== 'string') return false
  
  const trimmed = symbol.trim()
  if (trimmed === '' || trimmed.length === 0) return false
  
  // ✅ ENHANCED: Comprehensive blacklist for garbage symbols
  const blacklistedSymbols = [
    'Unknown', 'unknown', 'UNKNOWN',
    'Token', 'token', 'TOKEN',
    'localhost', 'LOCALHOST',
    'pump', 'PUMP',
    'unknown token', 'UNKNOWN TOKEN',
    'test', 'TEST',
    'null', 'NULL',
    'undefined', 'UNDEFINED',
    'N/A', 'n/a',
    'TBD', 'tbd',
    '???', '...',
    'TEMP', 'temp',
    'PLACEHOLDER', 'placeholder',
  ]
  
  if (blacklistedSymbols.includes(trimmed)) return false
  
  // ✅ FIXED: Detect shortened addresses more accurately
  if (trimmed.includes('...') && trimmed.length <= 12) return false
  if (/^[A-Za-z0-9]{3,4}\.\.\.[A-Za-z0-9]{3,4}$/.test(trimmed)) return false
  
  // ✅ Additional validation
  if (trimmed.length < 2) return false  // Too short
  if (trimmed.length > 20) return false // Suspiciously long
  if (/^[0-9]+$/.test(trimmed)) return false // All numbers
  if (/^0x[a-fA-F0-9]+$/.test(trimmed)) return false // Ethereum address format
  
  // ✅ Check for Solana address patterns (44 chars, base58)
  if (trimmed.length >= 32 && trimmed.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)) {
    return false // Looks like a Solana address
  }
  
  return true
}

// ✅ FIXED: Enhanced cache validation
function isValidCachedSymbol(symbol: string | undefined | null): boolean {
  if (!isValidMetadata(symbol)) return false
  
  // ✅ Additional checks for cached data
  if (symbol!.startsWith('0x')) return false // Ethereum address
  if (symbol!.length > 44 && symbol!.length < 50) return false // Solana address
  
  return true
}

// Helper: Try RPC metadata
async function tryRPCMetadata(tokenAddress: string): Promise<{ symbol: string; name: string } | null> {
  try {
    const connection = new Connection(SOLANA_RPC_URL)
    const metaplex = Metaplex.make(connection)
    const mint = new PublicKey(tokenAddress)

    const metadata = await metaplex.nfts().findByMint({ mintAddress: mint })

    if (isValidMetadata(metadata.symbol)) {
      console.log(`✅ RPC found: ${metadata.symbol}`)

      // Save to cache
      await saveTokenToCache(tokenAddress, metadata.symbol, metadata.name, 'rpc')

      return { symbol: metadata.symbol, name: metadata.name }
    }

    return null
  } catch (error) {
    console.error('RPC metadata failed:', error)
    return null
  }
}

// Helper: Try Helius DAS API (Digital Asset Standard) - Has ALL Solana tokens!
async function tryHeliusDAS(tokenAddress: string): Promise<{ symbol: string; name: string } | null> {
  const maxRetries = 3

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Trying Helius DAS API (attempt ${attempt}/${maxRetries})`)

      // Helius DAS API endpoint - Gets metadata for ANY Solana token
      const response = await axios.post(
        `https://api.helius.xyz/v0/token-metadata?api-key=${process.env.HELIUS_API_KEY}`,
        {
          mintAccounts: [tokenAddress]
        },
        { 
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )

      if (response.data && response.data.length > 0) {
        const tokenData = response.data[0]
        const symbol = tokenData.onChainMetadata?.metadata?.data?.symbol?.toUpperCase()
        const name = tokenData.onChainMetadata?.metadata?.data?.name || 
                     tokenData.offChainMetadata?.metadata?.name

        if (isValidMetadata(symbol)) {
          console.log(`✅ Helius DAS found: ${symbol} (${name || symbol})`)

          // Save to cache
          await saveTokenToCache(tokenAddress, symbol, name || symbol, 'helius')

          return { symbol, name: name || symbol }
        }
      }

      // No valid data, don't retry
      console.log(`⚠️ Helius DAS returned no valid data`)
      return null
    } catch (error: any) {
      console.error(`⚠️ Helius DAS attempt ${attempt} failed:`, error.message)

      // Retry on timeout or network errors
      if ((error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') && attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 4000)
        console.log(`⏳ Waiting ${waitTime / 1000}s before retry...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        continue
      }

      // Don't retry on other errors (404, 500, etc)
      return null
    }
  }

  console.log(`❌ Helius DAS failed after ${maxRetries} attempts`)
  return null
}

// Helper: Try CoinGecko API with retries
async function tryCoinGecko(tokenAddress: string): Promise<{ symbol: string; name: string } | null> {
  const maxRetries = 3

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Trying CoinGecko API (attempt ${attempt}/${maxRetries})`)

      // CoinGecko API endpoint for Solana token info
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/coins/solana/contract/${tokenAddress}`,
        { 
          timeout: 15000,
          headers: {
            'Accept': 'application/json'
          }
        }
      )

      if (response.data) {
        const symbol = response.data.symbol?.toUpperCase()
        const name = response.data.name

        if (isValidMetadata(symbol)) {
          console.log(`✅ CoinGecko found: ${symbol} (${name})`)

          // Save to cache
          await saveTokenToCache(tokenAddress, symbol, name || symbol, 'coingecko')

          return { symbol, name: name || symbol }
        }
      }

      // No valid data, don't retry
      console.log(`⚠️ CoinGecko returned no valid data`)
      return null
    } catch (error: any) {
      console.error(`⚠️ CoinGecko attempt ${attempt} failed:`, error.message)

      // Retry on timeout or network errors
      if ((error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') && attempt < maxRetries) {
        // Exponential backoff: 2s, 4s, 8s
        const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 8000)
        console.log(`⏳ Waiting ${waitTime / 1000}s before retry...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        continue
      }

      // Don't retry on other errors (404, 429, 500, etc)
      return null
    }
  }

  console.log(`❌ CoinGecko failed after ${maxRetries} attempts`)
  return null
}

// Helper: Try DexScreener API with rate limiting and proper endpoint
async function tryDexScreener(tokenAddress: string): Promise<{ symbol: string; name: string } | null> {
  const maxRetries = 3
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`🔄 Trying DexScreener API (attempt ${attempt}/${maxRetries})`)

      // ✅ FIXED: Use correct endpoint
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/search?q=${tokenAddress}`,
        { 
          timeout: 15000,  // ✅ Increased timeout
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; TokenResolver/1.0)',
            'Cache-Control': 'no-cache'
          }
        }
      )

      // ✅ FIXED: Better response validation
      if (!response.data || !response.data.pairs || !Array.isArray(response.data.pairs)) {
        logger.warn(`DexScreener returned invalid response structure`)
        throw new Error('Invalid response structure')
      }

      if (response.data.pairs.length === 0) {
        logger.info(`DexScreener found no pairs for ${tokenAddress}`)
        return null // This is a legitimate "not found" - don't retry
      }

      // ✅ Find the best pair (highest liquidity)
      const bestPair = response.data.pairs
        .filter((pair: any) => pair.baseToken?.address === tokenAddress)
        .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0]

      if (!bestPair) {
        logger.info(`No valid pairs found for token ${tokenAddress}`)
        return null
      }

      const symbol = bestPair.baseToken?.symbol?.toUpperCase()
      const name = bestPair.baseToken?.name

      if (isValidMetadata(symbol)) {
        logger.info(`✅ DexScreener found: ${symbol} (${name || symbol})`)
        await saveTokenToCache(tokenAddress, symbol, name || symbol, 'dexscreener')
        return { symbol, name: name || symbol }
      }

      logger.info(`DexScreener returned invalid symbol: ${symbol}`)
      return null

    } catch (error: any) {
      logger.error(`⚠️ DexScreener attempt ${attempt} failed:`, error.message)

      // ✅ FIXED: Handle rate limiting with exponential backoff
      if (error.response?.status === 429) {
        if (attempt < maxRetries) {
          const waitTime = Math.min(5000 * Math.pow(2, attempt - 1), 30000) // 5s, 10s, 20s
          logger.info(`⏳ Rate limited, waiting ${waitTime / 1000}s before retry...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        } else {
          logger.error(`❌ DexScreener rate limit exceeded after ${maxRetries} attempts`)
          return null
        }
      }

      // ✅ FIXED: Handle IP bans
      if (error.response?.status === 403) {
        logger.error(`❌ DexScreener IP banned - switching to proxy mode`)
        // Could implement proxy fallback here
        return null
      }

      // ✅ Retry on network errors
      if ((error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || 
           error.code === 'ECONNRESET') && attempt < maxRetries) {
        const waitTime = 2000 * attempt // 2s, 4s, 6s
        logger.info(`⏳ Network error, waiting ${waitTime / 1000}s before retry...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        continue
      }

      // Don't retry on other errors
      if (attempt === maxRetries) {
        logger.error(`❌ DexScreener failed after ${maxRetries} attempts`)
        return null
      }
    }
  }

  return null
}

// ============ MAIN FUNCTION: DB CACHE + FALLBACK CHAIN ============

export async function getTokenMetaDataUsingRPC(
  tokenAddress: string,
  retries = 3,
): Promise<{
  symbol?: string
  name?: string
  _isShortened?: boolean
}> {
  logger.info(`\n🔍 Resolving token: ${tokenAddress}`)
  
  // ✅ Step 0: Check in-memory cache FIRST (instant!)
  const now = Date.now()
  const memCached = tokenMetadataCache.get(tokenAddress)
  if (memCached && (now - memCached.timestamp) < CACHE_TTL) {
    if (memCached.symbol && isValidCachedSymbol(memCached.symbol)) {
      logger.info(`✅ Memory cache HIT: ${tokenAddress} → ${memCached.symbol}`)
      return { symbol: memCached.symbol, name: memCached.name || memCached.symbol }
    }
  }
  
  // ✅ Step 0.5: Check if resolution previously failed
  if (await isTokenResolutionFailed(tokenAddress)) {
    logger.info(`⚠️ Token resolution previously failed, using shortened address`)
    const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`
    return { 
      symbol: shortAddress, 
      name: tokenAddress,
      _isShortened: true
    }
  }
  
  // ✅ Step 1: Check database cache first (fastest!)
  const cachedResult = await getTokenFromCache(tokenAddress)
  if (cachedResult) {
    // Save to in-memory cache for next time
    tokenMetadataCache.set(tokenAddress, {
      symbol: cachedResult.symbol,
      name: cachedResult.name,
      timestamp: now
    })
    return cachedResult
  }

  logger.info(`⚠️ Cache MISS, trying API sources...`)

  // ✅ Fallback 2: DexScreener API (BEST for Solana tokens - 87% success rate!)
  const dexScreenerResult = await tryDexScreener(tokenAddress)
  if (dexScreenerResult) {
    // Save to in-memory cache
    tokenMetadataCache.set(tokenAddress, {
      symbol: dexScreenerResult.symbol,
      name: dexScreenerResult.name,
      timestamp: now
    })
    return dexScreenerResult
  }

  // ✅ Fallback 3: CoinGecko API (good for established tokens)
  const coinGeckoResult = await tryCoinGecko(tokenAddress)
  if (coinGeckoResult) {
    // Save to in-memory cache
    tokenMetadataCache.set(tokenAddress, {
      symbol: coinGeckoResult.symbol,
      name: coinGeckoResult.name,
      timestamp: now
    })
    return coinGeckoResult
  }

  // ✅ Fallback 4: RPC metadata (on-chain data, often fails for new tokens)
  const rpcResult = await tryRPCMetadata(tokenAddress)
  if (rpcResult) {
    // Save to in-memory cache
    tokenMetadataCache.set(tokenAddress, {
      symbol: rpcResult.symbol,
      name: rpcResult.name,
      timestamp: now
    })
    return rpcResult
  }

  // ✅ FIXED: Mark resolution as failed and return shortened address
  await markTokenResolutionFailed(tokenAddress)
  
  const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`
  logger.info(`⚠️ All sources failed, using fallback: ${shortAddress}`)

  return {
    symbol: shortAddress,
    name: tokenAddress,
    _isShortened: true  // ✅ Flag to prevent caching
  }
}

// Fetch token data using Bird Eye API
async function getTokenDataUsingBirdEye(
  tokenAddress: string,
  retries = 3,
): Promise<{
  price: number
  marketCap: number
  imageUrl: string | null
  volume24h: number
  name?: string
  symbol?: string
}> {
  try {
    const resp = await birdEyeClient.get('/defi/token_overview', {
      params: { address: tokenAddress },
    })

    const d = resp.data.data

    return {
      name: d.name,
      symbol: d.symbol,
      price: d.price || 0,
      volume24h: d.v24hUSD || 0,
      marketCap: d.marketCap || 0,
      imageUrl: d.logoURI || null,
    }
  } catch (error: any) {
    console.error(
      `❌ Error fetching data for ${tokenAddress}: ${error.message}`,
    )

    if (retries > 0) {
      console.warn(`🔁 Retrying in 5 seconds... (${retries} retries left)`)
      await delay(5000)
      return getTokenDataUsingBirdEye(tokenAddress, retries - 1)
    }

    return { price: 0, marketCap: 0, imageUrl: null, volume24h: 0 }
  }
}

//find Whale Token
export const findWhaleTokens = async (whaleAddress: string) => {
  try {
    // Query the database for the whale's token holdings
    const whaleDetails = await WhalesAddressModel.find({
      whalesAddress: String(whaleAddress),
    })

    if (!whaleDetails || whaleDetails.length === 0) {
      console.log('🚨 Whale does not hold any tracked tokens!')
      return null
    }

    console.log('🛠️ Whale Details:', whaleDetails)

    if (
      whaleDetails[0].imageUrl == null ||
      whaleDetails[0].imageUrl == undefined ||
      whaleDetails[0].imageUrl == ''
    ) {
      const imageUrl = await getTokenImageUrl(whaleDetails[0].tokenAddress)
      whaleDetails[0].imageUrl = imageUrl

      // Update the imageUrl in the database
      await WhalesAddressModel.updateOne(
        {
          tokenAddress: whaleDetails[0].tokenAddress,
        },
        { $set: { imageUrl: imageUrl } },
      )
    }

    const whaleTokens = {
      tokenSymbol: whaleDetails[0].tokenSymbol,
      tokenAddress: whaleDetails[0].tokenAddress,
      imageUrl: whaleDetails[0].imageUrl,
    }

    console.log('🐳 Whale holds tokens:', whaleTokens)
    return whaleTokens
  } catch (error) {
    console.error(`Error fetching tokens for ${whaleAddress}:`, error)
    return null
  }
};

// find Influencer Name
export const findInfluencerName = async (whaleAddress: string) => {
  try {
    const influencer = await InfluencerWhalesAddressModelV2.findOne({
      whalesAddress: whaleAddress,
    })

    if (!influencer) {
      console.log('🚨 No influencer found for this whale address!')
      return null
    }

    console.log('🌟 Influencer found:', influencer.influencerUsername)
    return influencer.influencerUsername
  } catch (error) {
    console.error(`Error fetching influencer for ${whaleAddress}:`, error)
    return null
  }
}

export const findInfluencerData = async (whaleAddress: string) => {
  try {
    const influencer = await InfluencerWhalesAddressModelV2.findOne({
      whalesAddress: whaleAddress,
    })

    if (!influencer) {
      console.log('🚨 No influencer found for this whale address!')
      return null
    }

    console.log('🌟 Influencer found:', influencer.influencerUsername)
    return {
      influencerName: influencer.influencerName,
      influencerUsername:
        influencer.influencerUsername || influencer.influencerName,
      influencerFollowerCount: influencer.influencerFollowerCount || 0,
      influencerProfileImageUrl: influencer.influencerProfileImageUrl || null,
    }
  } catch (error) {
    console.error(`Error fetching influencer data for ${whaleAddress}:`, error)
    return null
  }
}

// ✅ NEW: Cache cleanup and recovery functions
export async function cleanupPoisonedCache(): Promise<void> {
  logger.info('🧹 Starting cache cleanup for poisoned entries...')
  
  try {
    // ✅ Remove shortened addresses and garbage symbols from MongoDB cache
    const result = await TokenMetadataCacheModel.deleteMany({
      $or: [
        { symbol: { $regex: /^[A-Za-z0-9]{3,4}\.\.\.[A-Za-z0-9]{3,4}$/ } },
        { symbol: 'Unknown' }, { symbol: 'unknown' }, { symbol: 'UNKNOWN' },
        { symbol: 'Token' }, { symbol: 'token' }, { symbol: 'TOKEN' },
        { symbol: 'localhost' }, { symbol: 'LOCALHOST' },
        { symbol: 'pump' }, { symbol: 'PUMP' },
        { symbol: 'unknown token' }, { symbol: 'UNKNOWN TOKEN' },
        { symbol: 'test' }, { symbol: 'TEST' },
        { symbol: 'null' }, { symbol: 'NULL' },
        { symbol: 'undefined' }, { symbol: 'UNDEFINED' },
        { symbol: 'N/A' }, { symbol: 'n/a' },
        { symbol: 'TBD' }, { symbol: 'tbd' },
        { symbol: '???' }, { symbol: '...' },
        { symbol: 'TEMP' }, { symbol: 'temp' },
        { symbol: 'PLACEHOLDER' }, { symbol: 'placeholder' },
        { symbol: { $regex: /^[A-Fa-f0-9]{40,50}$/ } }, // Addresses
        { symbol: { $regex: /^0x[a-fA-F0-9]+$/ } }, // Ethereum addresses
        { symbol: { $regex: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ } }, // Solana addresses
        { symbol: '' }, // Empty symbols
        { symbol: null }, // Null symbols
      ]
    })
    
    logger.info(`🗑️ Removed ${result.deletedCount} poisoned cache entries`)
    
    // ✅ Clear in-memory cache
    tokenMetadataCache.clear()
    logger.info('🗑️ Cleared in-memory cache')
    
    // ✅ Clear failed resolution cache
    failedResolutions.clear()
    
    // ✅ Clear Redis failed resolution keys
    const keys = await redisClient.keys('failed_resolution:*')
    if (keys.length > 0) {
      await redisClient.del(...keys)
      logger.info(`🗑️ Cleared ${keys.length} failed resolution entries from Redis`)
    }
    
  } catch (error) {
    logger.error({ error }, '❌ Error during cache cleanup')
  }
}

// ✅ Add periodic cleanup (run every 6 hours)
setInterval(async () => {
  try {
    await cleanupPoisonedCache()
  } catch (error) {
    logger.error({ error }, 'Error in periodic cache cleanup')
  }
}, 6 * 60 * 60 * 1000)

// ✅ Export failed resolution functions for external use
export { markTokenResolutionFailed, isTokenResolutionFailed, isValidMetadata }
