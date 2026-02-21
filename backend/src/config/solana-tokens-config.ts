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

// ✅ NEW: Track failed resolutions to prevent repeated API calls (short TTL so we retry soon)
const failedResolutions = new Map<string, number>()
const FAILED_RESOLUTION_TTL = 5 * 60 * 1000 // 5 minutes – retry Birdeye/RPC often

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

    // ✅ If price cache is fresh (< 5 minutes old), use it (but if mcap still 0, try Birdeye once)
    if (cachedPrice && (now - cachedPrice.timestamp) < PRICE_CACHE_TTL) {
      let marketCap = cachedPrice.marketCap
      if (marketCap === 0) {
        const birdEyeMarket = await getTokenMarketCapAndPriceUsingBirdEye(tokenAddress)
        if (birdEyeMarket != null) {
          const beCap = Number((birdEyeMarket as any).market_cap)
          if (beCap > 0) {
            marketCap = beCap
            priceDataCache.set(tokenAddress, { ...cachedPrice, marketCap, timestamp: now })
            logger.info(`✅ Filled mcap from Birdeye (was 0 in cache): ${tokenAddress} → ${marketCap}`)
          }
        }
      }
      logger.info(
        `✅ Using cached price data for ${tokenAddress} (age: ${Math.round((now - cachedPrice.timestamp) / 1000)}s)`,
      )
      return {
        price: cachedPrice.price,
        marketCap,
        imageUrl: cachedImageUrl,
        volume24h: cachedPrice.volume24h,
      }
    }

    // ✅ Cache miss or expired - fetch fresh data (DexScreener first, Birdeye fallback for price/mcap)
    logger.info(
      `📊 Fetching fresh price/marketCap for ${tokenAddress}`,
    )
    let price = 0
    let marketCap = 0
    let volume24h = 0
    let imageUrlFromDex: string | null = null

    const dexscrennerData = await getTokenDataFromDexScreener(tokenAddress)
    price = dexscrennerData.price
    marketCap = dexscrennerData.marketCap
    volume24h = dexscrennerData.volume24h
    imageUrlFromDex = dexscrennerData.imageUrl

    // ✅ Fallback: If DexScreener missing price and/or mcap, use Birdeye
    if (price === 0 || marketCap === 0) {
      logger.info(
        `📊 DexScreener missing price/mcap for ${tokenAddress}, using Birdeye market data`,
      )
      const birdEyeMarket = await getTokenMarketCapAndPriceUsingBirdEye(tokenAddress)
      if (birdEyeMarket != null) {
        if (price === 0) price = Number(birdEyeMarket.price) || 0
        if (marketCap === 0) {
          const beCap = Number((birdEyeMarket as any).market_cap) ?? 0
          marketCap = beCap
          if (beCap > 0) logger.info(`✅ Birdeye mcap for ${tokenAddress}: ${marketCap}`)
        }
      } else {
        logger.warn(`Birdeye market data returned null for ${tokenAddress} (mcap may stay 0)`)
      }
    }
    if (price === 0) {
      const fallbackPrice = await getTokenPrice(tokenAddress)
      price = fallbackPrice
    }

    // ✅ Store price data in cache
    priceDataCache.set(tokenAddress, {
      price,
      marketCap,
      volume24h,
      timestamp: now
    })

    let imageUrl = cachedImageUrl

    if (!imageUrl) {
      logger.info(
        `🔍 Image not in DB for ${tokenAddress}, fetching from DexScreener`,
      )
      imageUrl = imageUrlFromDex || null

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

    const ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    logger.info(`💾 Stored token imageUrl in DB for ${tokenAddress} at IST ${ist}`)

    return {
      price,
      marketCap,
      imageUrl: imageUrl || null,
      volume24h,
    }
  } catch (error: any) {
    logger.error(
      { error },
      `❌ Error in getTokenDataWithFallback for ${tokenAddress}`,
    )
    // Last-resort: try Birdeye for price/mcap before giving up
    try {
      const birdEyeMarket = await getTokenMarketCapAndPriceUsingBirdEye(tokenAddress)
      if (birdEyeMarket) {
        const price = Number(birdEyeMarket.price) || 0
        const marketCap = Number((birdEyeMarket as any).market_cap) ?? 0
        if (price > 0 || marketCap > 0) {
          logger.info(`✅ Recovered price/mcap from Birdeye after DexScreener error`)
          return {
            price,
            marketCap,
            imageUrl: null,
            volume24h: 0,
          }
        }
      }
    } catch (_) {
      // ignore
    }
    return { price: 0, marketCap: 0, imageUrl: null, volume24h: 0 }
  }
}

// Fetch token metadata (symbol, name, imageUrl) from DexScreener only. Used as first source before Birdeye.
async function getTokenMetadataFromDexScreener(tokenAddress: string): Promise<{
  symbol: string
  name: string
  imageUrl: string | null
} | null> {
  const url = `https://api.dexscreener.com/latest/dex/search?q=${tokenAddress}`
  try {
    const response = await axios.get(url, { timeout: 10000 })
    if (!response.data?.pairs?.length) return null
    const pair = response.data.pairs[0]
    const base = pair.baseToken || {}
    const quote = pair.quoteToken || {}
    const addr = (tokenAddress || '').toLowerCase()
    const token = (base.address || '').toLowerCase() === addr ? base : (quote.address || '').toLowerCase() === addr ? quote : base
    const symbol = (token.symbol || '').trim() || (base.symbol || '').trim() || (quote.symbol || '').trim()
    const name = (token.name || '').trim() || (base.name || '').trim() || (quote.name || '').trim() || symbol
    const imageUrl = pair.info?.imageUrl || token.imageUrl || null
    if (!symbol && !name) return null
    logger.info(`✅ DexScreener metadata: ${tokenAddress.slice(0, 8)}… → ${symbol || 'n/a'} (${name || 'n/a'})`)
    return {
      symbol: symbol || 'Unknown',
      name: name || symbol || 'Unknown',
      imageUrl,
    }
  } catch (error: any) {
    logger.warn({ tokenAddress, msg: error?.message }, 'DexScreener metadata failed')
    return null
  }
}

// Fetch token data from DexScreener API (price, mcap, volume, imageUrl). Image: Dex only here; Birdeye fallback is in getTokenDataWithFallback.
async function getTokenDataFromDexScreener(
  tokenAddress: string,
  retries = 3,
): Promise<{
  price: number
  marketCap: number
  imageUrl: string | null
  volume24h: number
  symbol?: string | null
  name?: string | null
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
    const base = tokenData.baseToken || {}
    const quote = tokenData.quoteToken || {}
    const addr = (tokenAddress || '').toLowerCase()
    const token = (base.address || '').toLowerCase() === addr ? base : (quote.address || '').toLowerCase() === addr ? quote : base

    let price = parseFloat(tokenData.priceUsd) || 0
    const volume24h = tokenData.volume?.['h24'] || 0
    const marketCap = tokenData.marketCap ? parseFloat(tokenData.marketCap) : 0
    let imageUrl = tokenData.info?.imageUrl || token.imageUrl || null

    // ✅ Fallback: If DexScreener price = 0, use Jupiter price
    if (price === 0) {
      const fallbackPrice = await getTokenPrice(tokenAddress)
      price = fallbackPrice
    }

    // ✅ Do NOT call Birdeye here; caller (getTokenDataWithFallback) does Dex then Birdeye for image
    const symbol = (token.symbol || '').trim() || null
    const name = (token.name || '').trim() || (symbol || null)

    return {
      price,
      marketCap,
      imageUrl,
      volume24h,
      symbol: symbol || undefined,
      name: name || undefined,
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

    const creationTime = response?.data?.data?.blockHumanTime ?? null

    // Cache for 7 days (token creation time never changes)
    // Cache even if null to prevent repeated API calls for tokens without creation time
    const cacheValue = creationTime || 'UNKNOWN'
    try {
      await redisClient.setex(cacheKey, 7 * 24 * 60 * 60, cacheValue)
    } catch (error) {
      logger.warn(`Redis cache write failed for ${cacheKey}:${String(error)}`)
    }

    return creationTime
  } catch (error: any) {
    const msg = error?.message ?? String(error)
    const status = error?.response?.status
    logger.warn({ tokenAddress, status }, `Birdeye creation info failed: ${msg}`)
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
  } catch (error: any) {
    const msg = error?.message ?? String(error)
    const status = error?.response?.status
    logger.warn({ tokenAddress, status }, `Birdeye market data failed: ${msg}`)
    return null
  }
}

// ---------------------------------------------------------------------------
// Historical SOL price + swap-ratio pricing (production-grade, no per-tx DEX)
// Use swap ratio for exact price in SOL; historical SOL→USD for USD at swap time.
// ---------------------------------------------------------------------------

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const HISTORICAL_SOL_CACHE_TTL = 10 * 60 * 1000 // 10 min
const historicalSolPriceCache = new Map<number, { price: number; ts: number }>()

/**
 * Get SOL price in USD at a given unix timestamp (seconds).
 * Uses Birdeye history_price so PnL and "price at swap" are correct (not current price).
 * Cached by 5-min bucket to avoid rate limits.
 */
export async function getHistoricalSolPrice(timestampUnixSeconds: number): Promise<number> {
  const bucket = Math.floor(timestampUnixSeconds / 300) * 300
  const now = Date.now()
  const cached = historicalSolPriceCache.get(bucket)
  if (cached && now - cached.ts < HISTORICAL_SOL_CACHE_TTL) {
    return cached.price
  }

  try {
    const timeFrom = Math.max(0, timestampUnixSeconds - 120)
    const timeTo = timestampUnixSeconds + 120
    const url = `https://public-api.birdeye.so/defi/history_price?address=${SOL_MINT}&type=1m&time_from=${timeFrom}&time_to=${timeTo}&address_type=token`
    const response = await birdEyeClient.get(url, {
      timeout: 10000,
      headers: { 'x-chain': 'solana' },
    })
    const items = response.data?.data?.items as Array<{ unixTime: number; value: number }> | undefined
    if (!items?.length) {
      const fallback = await getTokenPrice(SOL_MINT)
      historicalSolPriceCache.set(bucket, { price: fallback, ts: now })
      return fallback
    }
    let best = items[0]
    for (const item of items) {
      if (Math.abs(item.unixTime - timestampUnixSeconds) < Math.abs(best.unixTime - timestampUnixSeconds)) {
        best = item
      }
    }
    const price = Number(best.value) || 0
    if (price > 0) historicalSolPriceCache.set(bucket, { price, ts: now })
    return price
  } catch (err: any) {
    logger.warn({ err: err?.message, timestamp: timestampUnixSeconds }, 'getHistoricalSolPrice failed, using current SOL price')
    const fallback = await getTokenPrice(SOL_MINT)
    return fallback
  }
}

/**
 * Price in SOL from the swap itself (on-chain, exact). No API.
 * priceSOL = solAmount / tokenAmount (e.g. 10 SOL / 2_000_000 tokens = 0.000005 SOL per token).
 */
export function getSwapRatioPriceSOL(solAmount: number, tokenAmount: number): number | null {
  if (tokenAmount <= 0 || !Number.isFinite(solAmount)) return null
  const price = solAmount / tokenAmount
  return Number.isFinite(price) ? price : null
}

/**
 * USD price at swap time using swap ratio + historical SOL price.
 * Use this for "price at swap" and PnL so we don't rely on current DEX price.
 */
export async function getSwapRatioPriceUSDAtTimestamp(
  solAmount: number,
  tokenAmount: number,
  timestampUnixSeconds: number,
): Promise<number> {
  const priceSOL = getSwapRatioPriceSOL(solAmount, tokenAmount)
  if (priceSOL == null) return 0
  const solUsd = await getHistoricalSolPrice(timestampUnixSeconds)
  return priceSOL * solUsd
}

/** Image: DB/Redis cache first, then DexScreener, then Birdeye. Persist to DB so next buy/sell gets it from cache. */
export async function getTokenImageUrl(tokenAddress: string) {
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

  // Check TokenDataModel so same token on next buy/sell gets image from cache
  try {
    const dbRow = await TokenDataModel.findOne({ tokenAddress }).select('imageUrl').lean()
    if (dbRow?.imageUrl) {
      try {
        await redisClient.setex(cacheKey, 7 * 24 * 60 * 60, dbRow.imageUrl)
      } catch (_) {}
      return dbRow.imageUrl
    }
  } catch (error) {
    logger.warn({ tokenAddress }, `TokenDataModel read for image failed: ${String(error)}`)
  }

  // 1) DexScreener first
  const dex = await getTokenMetadataFromDexScreener(tokenAddress)
  if (dex?.imageUrl) {
    try {
      await redisClient.setex(cacheKey, 7 * 24 * 60 * 60, dex.imageUrl)
      await safeUpdateTokenDataModel(tokenAddress, { imageUrl: dex.imageUrl })
    } catch (e) {
      logger.warn(`Redis/DB cache write failed for ${cacheKey}:${String(e)}`)
    }
    return dex.imageUrl
  }

  // 2) Birdeye fallback
  const url = `https://public-api.birdeye.so/defi/v3/token/meta-data/single?address=${tokenAddress}`
  try {
    const response = await axios.get(url, {
      headers: {
        'X-API-KEY': BIRD_EYE_API_KEY,
        accept: 'application/json',
        'x-chain': 'solana',
      },
    })

    const data = response?.data?.data
    const imageUrl = (data?.logo_uri ?? (data as any)?.logoURI) ?? null

    if (imageUrl) {
      try {
        await redisClient.setex(cacheKey, 7 * 24 * 60 * 60, imageUrl)
        await safeUpdateTokenDataModel(tokenAddress, { imageUrl })
      } catch (error) {
        logger.warn(`Redis/DB cache write failed for ${cacheKey}:${String(error)}`)
      }
    }

    return imageUrl
  } catch (error: any) {
    const msg = error?.message ?? String(error)
    const status = error?.response?.status
    logger.warn({ tokenAddress, status }, `Birdeye image url failed: ${msg}`)
    return null
  }
}

/** DexScreener first for symbol, name, imageUrl; then Birdeye for any missing. */
export async function getTokenMetadataAndImage(tokenAddress: string): Promise<{
  symbol: string
  name: string
  imageUrl: string | null
} | null> {
  // 1) DexScreener first (symbol, name, imageUrl)
  const dex = await getTokenMetadataFromDexScreener(tokenAddress)
  let symbol = dex?.symbol ?? ''
  let name = dex?.name ?? ''
  let imageUrl = dex?.imageUrl ?? null

  // 2) Birdeye fallback for any missing
  if (!symbol || symbol === 'Unknown' || !name || name === 'Unknown' || !imageUrl) {
    const url = `https://public-api.birdeye.so/defi/v3/token/meta-data/single?address=${tokenAddress}`
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'X-API-KEY': BIRD_EYE_API_KEY,
          accept: 'application/json',
          'x-chain': 'solana',
        },
      })
      const data = response?.data?.data
      if (data) {
        if (!symbol || symbol === 'Unknown') {
          const raw = (data.symbol ?? data.symbol_str ?? (data as any).Symbol ?? '').toString().trim()
          symbol = raw || 'Unknown'
        }
        if (!name || name === 'Unknown') {
          const rawName = (data.name ?? (data as any).token_name ?? (data as any).display_name ?? data.symbol ?? symbol).toString().trim()
          name = rawName.length > 0 ? rawName : symbol
        }
        if (!imageUrl) {
          imageUrl = (data.logo_uri ?? (data as any).logoURI ?? (data as any).logo_uri) ?? null
        }
      }
    } catch (error: any) {
      logger.warn({ tokenAddress, msg: error?.message }, 'Birdeye metadata+image fallback failed')
    }
  }

  if (!symbol && !name) return null
  // Persist image to TokenDataModel so next buy/sell of same token loads image from cache
  if (imageUrl) {
    safeUpdateTokenDataModel(tokenAddress, { imageUrl }).catch((e) =>
      logger.warn({ tokenAddress }, `Failed to persist JIT image to TokenData: ${String(e)}`),
    )
  }
  return {
    symbol: symbol || 'Unknown',
    name: name || symbol || 'Unknown',
    imageUrl,
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
    const ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    logger.info(`💾 Cached: ${tokenAddress.slice(0, 8)}... → ${symbol} [${source}] at IST ${ist}`)
  } catch (error) {
    logger.error({ error }, `❌ Failed to save to cache: ${tokenAddress}`)
    throw error
  }
}

// ✅ NEW: Track failed resolutions
async function markTokenResolutionFailed(tokenAddress: string): Promise<void> {
  failedResolutions.set(tokenAddress, Date.now())
  // Do NOT persist to Redis – so after restart we retry APIs and may get real symbol/name
}

async function isTokenResolutionFailed(tokenAddress: string): Promise<boolean> {
  const failed = failedResolutions.get(tokenAddress)
  return !!(failed && (Date.now() - failed) < FAILED_RESOLUTION_TTL)
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

// ✅ Normalize symbol for pump.fun tokens: allow "Pump" so we don't show Unknown
function normalizeSymbolForPumpFun(symbol: string | undefined, tokenAddress: string): string {
  if (!symbol || typeof symbol !== 'string') return (symbol ?? '').trim()
  const trimmed = symbol.trim()
  if (tokenAddress.toLowerCase().endsWith('pump') && trimmed.toLowerCase() === 'pump') return 'Pump'
  return trimmed
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
    const symbol = normalizeSymbolForPumpFun(metadata.symbol?.trim(), tokenAddress)

    if (isValidMetadata(symbol)) {
      console.log(`✅ RPC found: ${symbol}`)
      const name = (metadata.name ?? symbol).trim() || symbol
      await saveTokenToCache(tokenAddress, symbol, name, 'rpc')
      return { symbol, name }
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

      // ✅ Find the best pair (highest liquidity) - token can be base OR quote
      const normalizeAddr = (a: string) => (a || '').toLowerCase()
      const target = normalizeAddr(tokenAddress)
      const pairsWithToken = response.data.pairs.filter((pair: any) => {
        const base = normalizeAddr(pair.baseToken?.address)
        const quote = normalizeAddr(pair.quoteToken?.address)
        return base === target || quote === target
      })
      const bestPair = pairsWithToken
        .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0]

      if (!bestPair) {
        logger.info(`No valid pairs found for token ${tokenAddress}`)
        return null
      }

      const isBase = normalizeAddr(bestPair.baseToken?.address) === target
      const tokenInfo = isBase ? bestPair.baseToken : bestPair.quoteToken
      const symbol = tokenInfo?.symbol?.toUpperCase()
      const name = tokenInfo?.name

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

// Return: success with symbol/name, or _invalid when we got data but rejected it, or null on error/no data
type BirdEyeMetadataResult =
  | { symbol: string; name: string }
  | { _invalid: true; rawSymbol: string; rawName: string }
  | null

// Helper: Try BirdEye API for token symbol/name (paid plan – primary fallback for metadata)
async function tryBirdEyeMetadata(tokenAddress: string): Promise<BirdEyeMetadataResult> {
  const maxRetries = 3
  const url = `https://public-api.birdeye.so/defi/v3/token/meta-data/single?address=${tokenAddress}`

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`🔄 Trying BirdEye API for symbol/name (attempt ${attempt}/${maxRetries}): ${tokenAddress}`)

      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'X-API-KEY': BIRD_EYE_API_KEY,
          accept: 'application/json',
          'x-chain': 'solana',
        },
      })

      const data = response?.data?.data
      if (!data) {
        logger.warn(`BirdEye metadata returned no data for ${tokenAddress}`)
        return null
      }

      // Birdeye returns symbol, name (and sometimes logo_uri / logoURI)
      const rawSymbol = (data.symbol ?? data.symbol_str ?? (data as any).Symbol ?? '').toString().trim()
      const symbol = normalizeSymbolForPumpFun(rawSymbol, tokenAddress)
      const rawName = (data.name ?? (data as any).token_name ?? (data as any).display_name ?? data.symbol ?? rawSymbol).toString().trim()
      // Prefer real name when non-empty; otherwise fall back to symbol (?? treats "" as truthy for fallback)
      const name = rawName.length > 0 ? rawName : (data.symbol ?? rawSymbol).toString().trim()
      const displayName = name.length > 0 ? name : symbol

      if (isValidMetadata(symbol)) {
        logger.info(`✅ BirdEye found: ${symbol} (${displayName})`)
        await saveTokenToCache(tokenAddress, symbol, displayName, 'birdeye')
        return { symbol, name: displayName }
      }

      logger.warn(`BirdEye returned invalid/rejected symbol for ${tokenAddress}: rawSymbol="${rawSymbol}" -> symbol="${symbol}" (name="${displayName}")`)
      return { _invalid: true, rawSymbol: symbol || rawSymbol, rawName: displayName }
    } catch (error: any) {
      const msg = error?.message ?? String(error)
      const status = error?.response?.status
      logger.warn({ tokenAddress, attempt, status }, `BirdEye metadata attempt failed: ${msg}`)

      if (attempt < maxRetries && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET')) {
        const waitTime = 2000 * attempt
        await new Promise((r) => setTimeout(r, waitTime))
        continue
      }
      return null
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

  // ✅ Step 2: DexScreener first (symbol, name, imageUrl) then Birdeye
  const dexResult = await getTokenMetadataFromDexScreener(tokenAddress)
  if (dexResult && isValidMetadata(dexResult.symbol)) {
    logger.info(`✅ DexScreener found: ${dexResult.symbol} (${dexResult.name})`)
    await saveTokenToCache(tokenAddress, dexResult.symbol, dexResult.name || dexResult.symbol, 'dexscreener')
    tokenMetadataCache.set(tokenAddress, {
      symbol: dexResult.symbol,
      name: dexResult.name || dexResult.symbol,
      timestamp: now,
    })
    // Persist image to TokenDataModel so next buy/sell of same token gets image from cache
    if (dexResult.imageUrl) {
      safeUpdateTokenDataModel(tokenAddress, { imageUrl: dexResult.imageUrl }).catch((e) =>
        logger.warn({ tokenAddress }, `Failed to persist Dex image to TokenData: ${String(e)}`),
      )
    }
    return { symbol: dexResult.symbol, name: dexResult.name || dexResult.symbol }
  }

  // ✅ Fallback 3: BirdEye API (symbol, name; image is separate)
  const birdEyeResult = await tryBirdEyeMetadata(tokenAddress)
  if (birdEyeResult && !('_invalid' in birdEyeResult)) {
    tokenMetadataCache.set(tokenAddress, {
      symbol: birdEyeResult.symbol,
      name: birdEyeResult.name,
      timestamp: now
    })
    return birdEyeResult
  }

  // ✅ Fallback 3: RPC metadata (on-chain data, often fails for new tokens)
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

  // ✅ Only mark as failed when Birdeye/RPC actually returned data we rejected (invalid symbol).
  // If Birdeye returned null (API error / no data), do NOT mark failed so we retry next time (e.g. token gets indexed, or transient error).
  const birdeyeReturnedInvalid = birdEyeResult != null && '_invalid' in birdEyeResult
  if (birdeyeReturnedInvalid) {
    await markTokenResolutionFailed(tokenAddress)
  }
  
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
