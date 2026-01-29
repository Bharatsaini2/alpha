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
const SOLANA_RPC_URL =
  process.env.RPC_URL || 'https://api.mainnet-beta.solana.com'
const birdEyeClient = axios.create({
  baseURL: 'https://public-api.birdeye.so',
  headers: { 'X-API-KEY': BIRD_EYE_API_KEY },
})

// In-memory cache for token metadata (24 hour TTL)
const tokenMetadataCache = new Map<string, { symbol?: string; name?: string; timestamp: number }>()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

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
    const dbTokenData = await TokenDataModel.findOne({
      tokenAddress,
    }).lean()

    let cachedImageUrl: string | null = null

    if (dbTokenData) {
      cachedImageUrl = dbTokenData.imageUrl || null
    }

    logger.info(
      `📊 Fetching fresh price/marketCap/name/symbol from DexScreener for ${tokenAddress}`,
    )
    const dexscrennerData = await getTokenDataFromDexScreener(tokenAddress)

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

    const tokenDataToStore = {
      tokenAddress,
      imageUrl: imageUrl || null,
      lastUpdated: new Date(),
    }

    await TokenDataModel.findOneAndUpdate(
      { tokenAddress },
      { $set: tokenDataToStore },
      { upsert: true, new: true },
    )

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
async function saveTokenToCache(
  tokenAddress: string,
  symbol: string,
  name: string,
  source: 'rpc' | 'solscan' | 'dexscreener' | 'jupiter' | 'birdeye'
): Promise<void> {
  // ⚠️ CRITICAL: NEVER save "Unknown" or fallback addresses to cache
  if (!symbol || symbol === 'Unknown' || symbol.trim() === '' || symbol.includes('...')) {
    console.log(`⚠️ Skipping cache save for invalid symbol: ${symbol}`)
    return // Never save invalid tokens
  }

  try {
    // Check if mongoose is connected
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      console.log(`⚠️ MongoDB not connected, skipping cache save`)
      return
    }

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
    console.log(`💾 Saved to cache: ${tokenAddress} → ${symbol} (source: ${source})`)
  } catch (error) {
    console.error('Failed to save to cache:', error)
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

    if (cached && cached.symbol && !cached.symbol.includes('...') && cached.symbol !== 'Unknown') {
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
  return !!(symbol && symbol !== 'Unknown' && symbol.trim() !== '')
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

// Helper: Try DexScreener with retries
async function tryDexScreener(tokenAddress: string): Promise<{ symbol: string; name: string } | null> {
  const maxRetries = 5 // Increased from 3

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Trying DexScreener (attempt ${attempt}/${maxRetries})`)

      // ✅ CORRECT: Use /dex/tokens/{address} for direct token metadata lookup
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
        { timeout: 15000 } // Increased from 10s to 15s
      )

      if (response.data?.pairs && response.data.pairs.length > 0) {
        const pair = response.data.pairs[0]
        const symbol = pair.baseToken?.symbol
        const name = pair.baseToken?.name

        if (isValidMetadata(symbol)) {
          console.log(`✅ DexScreener found: ${symbol} (${name})`)

          // Save to cache
          await saveTokenToCache(tokenAddress, symbol, name || symbol, 'dexscreener')

          return { symbol, name: name || symbol }
        }
      }

      // No valid data, don't retry
      console.log(`⚠️ DexScreener returned no valid data`)
      return null
    } catch (error: any) {
      console.error(`⚠️ DexScreener attempt ${attempt} failed:`, error.message)

      // Retry on timeout or network errors
      if ((error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') && attempt < maxRetries) {
        // Exponential backoff: 2s, 4s, 8s, 16s
        const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 16000)
        console.log(`⏳ Waiting ${waitTime / 1000}s before retry...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        continue
      }

      // Don't retry on other errors (404, 500, etc)
      return null
    }
  }

  console.log(`❌ DexScreener failed after ${maxRetries} attempts`)
  return null
}

// Helper: Try Jupiter Token List (MOST RELIABLE)
async function tryJupiterTokenList(tokenAddress: string): Promise<{ symbol: string; name: string } | null> {
  try {
    console.log(`🔄 Trying Jupiter Token List`)

    // Jupiter has a comprehensive token list that's very reliable
    const response = await axios.get(
      'https://token.jup.ag/strict',
      { timeout: 5000 }
    )

    if (response.data && Array.isArray(response.data)) {
      const token = response.data.find((t: any) => t.address === tokenAddress)

      if (token && isValidMetadata(token.symbol)) {
        console.log(`✅ Jupiter found: ${token.symbol} (${token.name})`)

        // Save to cache
        await saveTokenToCache(tokenAddress, token.symbol, token.name || token.symbol, 'jupiter')

        return { symbol: token.symbol, name: token.name || token.symbol }
      }
    }

    return null
  } catch (error: any) {
    console.error(`⚠️ Jupiter Token List failed:`, error.message)
    return null
  }
}

// Helper: Try Solscan API (VERY RELIABLE, no rate limits for metadata)
async function trySolscan(tokenAddress: string): Promise<{ symbol: string; name: string } | null> {
  try {
    console.log(`🔄 Trying Solscan API`)

    const response = await axios.get(
      `https://api.solscan.io/token/meta?token=${tokenAddress}`,
      { timeout: 5000 }
    )

    if (response.data) {
      const symbol = response.data.symbol
      const name = response.data.name

      if (isValidMetadata(symbol)) {
        console.log(`✅ Solscan found: ${symbol} (${name})`)

        // Save to cache
        await saveTokenToCache(tokenAddress, symbol, name || symbol, 'solscan')

        return { symbol, name: name || symbol }
      }
    }

    return null
  } catch (error: any) {
    console.error(`⚠️ Solscan failed:`, error.message)
    return null
  }
}

// Helper: Try Birdeye API (requires API key)
async function tryBirdeye(tokenAddress: string): Promise<{ symbol: string; name: string } | null> {
  try {
    console.log(`🔄 Trying Birdeye API`)

    const response = await axios.get(
      `https://public-api.birdeye.so/defi/v3/token/meta-data/single?address=${tokenAddress}`,
      {
        headers: {
          'X-API-KEY': BIRD_EYE_API_KEY,
          'accept': 'application/json',
          'x-chain': 'solana',
        },
        timeout: 5000
      }
    )

    if (response.data?.data) {
      const symbol = response.data.data.symbol
      const name = response.data.data.name

      if (isValidMetadata(symbol)) {
        console.log(`✅ Birdeye found: ${symbol} (${name})`)

        // Save to cache
        await saveTokenToCache(tokenAddress, symbol, name || symbol, 'birdeye' as any)

        return { symbol, name: name || symbol }
      }
    }

    return null
  } catch (error: any) {
    console.error(`⚠️ Birdeye failed:`, error.message)
    return null
  }
}

// ============ MAIN FUNCTION: DB CACHE + FALLBACK CHAIN ============

export async function getTokenMetaDataUsingRPC(
  tokenAddress: string,
  retries = 3,
): Promise<{
  symbol?: string
  name?: string
}> {
  console.log(`\n🔍 Resolving token: ${tokenAddress}`)

  // ✅ Step 1: Check database cache first (fastest!)
  const cachedResult = await getTokenFromCache(tokenAddress)
  if (cachedResult) {
    return cachedResult
  }

  console.log(`⚠️ Cache MISS, trying API sources...`)

  // ✅ Fallback 2: DexScreener (most reliable, with 5 retries and exponential backoff)
  const dexResult = await tryDexScreener(tokenAddress)
  if (dexResult) {
    return dexResult
  }

  // ✅ Fallback 3: Birdeye (if API key is available)
  if (BIRD_EYE_API_KEY && BIRD_EYE_API_KEY !== '1209ac01dce54f0a97fd6b58c7b9ecb4') {
    const birdeyeResult = await tryBirdeye(tokenAddress)
    if (birdeyeResult) {
      return birdeyeResult
    }
  } else {
    console.log(`⚠️ Birdeye API key not configured, skipping`)
  }

  // ✅ Fallback 4: Jupiter Token List (comprehensive but slower)
  const jupiterResult = await tryJupiterTokenList(tokenAddress)
  if (jupiterResult) {
    return jupiterResult
  }

  // ✅ Fallback 5: RPC metadata (optional, often fails for new tokens)
  const rpcResult = await tryRPCMetadata(tokenAddress)
  if (rpcResult) {
    return rpcResult
  }

  // ✅ Fallback 6: Shortened address (last resort - NOT cached)
  const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`
  console.log(`⚠️ All sources failed, using fallback: ${shortAddress}`)

  return {
    symbol: shortAddress,
    name: tokenAddress,
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
