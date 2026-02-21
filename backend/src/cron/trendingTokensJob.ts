import cron from 'node-cron'
import axios from 'axios'
import TrendingToken from '../models/trendingTokens.model'
import TokenPriceHistory from '../models/tokenPriceHistory.model'
import { redisClient } from '../config/redis'
import dotenv from 'dotenv'
dotenv.config()

interface BirdEyeToken {
  address: string
  decimals: number
  liquidity: number
  logoURI: string
  name: string
  symbol: string
  volume24hUSD: number
  volume24hChangePercent: number
  rank: number
  price: number
  price24hChangePercent: number
  fdv: number
  marketcap: number
}

interface BirdEyeResponse {
  success: boolean
  data: {
    updateUnixTime: number
    updateTime: string
    tokens: BirdEyeToken[]
    total: number
  }
}

let isRunning = false

const BIRD_EYE_API_KEY =
  process.env.BIRD_EYE_API_KEY || '1209ac01dce54f0a97fd6b58c7b9ecb4'

// Fetch tokens in batches to get 50 total tokens
const fetchTokensInBatches = async (
  totalTokens: number = 50,
): Promise<BirdEyeToken[]> => {
  const batchSize = 20 // API limit
  const batches = Math.ceil(totalTokens / batchSize)
  const allTokens: BirdEyeToken[] = []

  console.log(
    `🔄 Fetching ${totalTokens} tokens in ${batches} batches of ${batchSize}`,
  )

  for (let i = 0; i < batches; i++) {
    try {
      const offset = i * batchSize
      const limit = Math.min(batchSize, totalTokens - i * batchSize)

      console.log(
        `📡 Fetching batch ${i + 1}/${batches} - offset: ${offset}, limit: ${limit}`,
      )

      const response = await axios.get<BirdEyeResponse>(
        'https://public-api.birdeye.so/defi/token_trending',
        {
          params: {
            sort_by: 'rank',
            sort_type: 'asc',
            offset: offset,
            limit: limit,
            ui_amount_mode: 'scaled',
          },
          headers: {
            accept: 'application/json',
            'x-chain': 'solana',
            'X-API-KEY': BIRD_EYE_API_KEY,
          },
          timeout: 30000, // 30 seconds timeout
        },
      )

      if (!response.data.success) {
        throw new Error(
          `BirdEye API returned unsuccessful response for batch ${i + 1}`,
        )
      }

      const { tokens } = response.data.data
      allTokens.push(...tokens)

      console.log(`✅ Batch ${i + 1} completed - got ${tokens.length} tokens`)

      // Add a small delay between requests to be respectful to the API
      if (i < batches - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000)) // 1 second delay
      }
    } catch (error) {
      console.error(`❌ Error fetching batch ${i + 1}:`, error)
      // Continue with other batches even if one fails
    }
  }

  console.log(`📊 Total tokens fetched: ${allTokens.length}`)
  return allTokens
}

// Remove duplicates and ensure proper ranking
const deduplicateAndRankTokens = (tokens: BirdEyeToken[]): BirdEyeToken[] => {
  // Create a map to remove duplicates by address
  const uniqueTokensMap = new Map<string, BirdEyeToken>()

  tokens.forEach((token) => {
    if (!uniqueTokensMap.has(token.address)) {
      uniqueTokensMap.set(token.address, token)
    }
  })

  // Convert back to array and sort by rank
  const uniqueTokens = Array.from(uniqueTokensMap.values())
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 50) // Ensure we only keep top 50

  console.log(
    `🔍 Deduplicated tokens: ${tokens.length} → ${uniqueTokens.length}`,
  )

  return uniqueTokens
}

const fetchAndStoreTrendingTokens = async () => {
  if (isRunning) {
    console.log('Trending tokens job already running, skipping...')
    return
  }

  isRunning = true

  try {
    console.log('🔄 Starting trending tokens fetch...')

    // Fetch 50 trending tokens in batches
    const rawTokens = await fetchTokensInBatches(50)

    if (rawTokens.length === 0) {
      throw new Error('No tokens were fetched from BirdEye API')
    }

    // Remove duplicates and ensure proper ranking
    const uniqueTokens = deduplicateAndRankTokens(rawTokens)

    if (uniqueTokens.length === 0) {
      throw new Error('No unique tokens after deduplication')
    }

    // Get the update time
    const updateUnixTime = Math.floor(Date.now() / 1000)
    const updateTime = new Date().toISOString()

    console.log(
      `📊 Fetched ${uniqueTokens.length} unique trending tokens from BirdEye API`,
    )

    // Process and store tokens
    await processAndStoreTokens(uniqueTokens, updateUnixTime, updateTime)

    // Update Redis timestamp for job coordination
    await redisClient.set(
      'trending:tokens:last_update',
      new Date().toISOString(),
    )

    console.log('✅ Trending tokens job completed successfully')
  } catch (error) {
    console.error('❌ Error in trending tokens job:', error)
  } finally {
    isRunning = false
  }
}

const processAndStoreTokens = async (
  tokens: BirdEyeToken[],
  updateUnixTime: number,
  updateTime: string,
) => {
  try {
    // Clear ALL old data before storing new data (fresh data every 24 hours)
    console.log('🗑️ Clearing all old trending tokens data...')
    await TrendingToken.deleteMany({})
    console.log('✅ All old data cleared')

    const TARGET_TOKEN_COUNT = 50
    let successfulTokens = 0
    let failedTokens = 0
    let currentTokens = [...tokens] // Copy tokens array to work with
    let batchNumber = 1
    const insertedAddresses = new Set<string>()

    console.log(`🎯 Target: Store exactly ${TARGET_TOKEN_COUNT} tokens`)

    while (successfulTokens < TARGET_TOKEN_COUNT && currentTokens.length > 0) {
      console.log(
        `\n🔄 Processing batch ${batchNumber} - ${currentTokens.length} tokens available`,
      )

      // Process current batch of tokens
      for (let index = 0; index < currentTokens.length; index++) {
        const token = currentTokens[index]

        // Skip if we already have enough tokens
        if (successfulTokens >= TARGET_TOKEN_COUNT) {
          console.log(`✅ Target reached! Stopping processing.`)
          break
        }

        // Skip tokens with completely missing required data
        if (!token.address || !token.symbol) {
          console.warn(
            `⚠️ Skipping token with missing address or symbol: ${token.symbol || 'Unknown'}`,
          )
          failedTokens++
          continue
        }

        // Skip if already inserted in this run
        if (insertedAddresses.has(token.address)) {
          console.warn(
            `⚠️ Skipping duplicate token in current run: ${token.symbol} (${token.address})`,
          )
          continue
        }

        try {
          // Validate and provide fallback values for required fields
          const tokenData = {
            address: token.address || 'unknown',
            rank: token.rank || 0,
            name: token.name || 'Unknown Token',
            symbol: token.symbol || 'UNKNOWN',
            logoURI: token.logoURI || '',
            volume24hChangePercent: token.volume24hChangePercent ?? 0, // Use nullish coalescing for 0 values
            price: token.price ?? 0,
            price24hChangePercent: token.price24hChangePercent ?? 0,
            volume24hUSD: token.volume24hUSD ?? 0,
            liquidity: token.liquidity ?? 0,
            marketcap: token.marketcap ?? 0,
            fdv: token.fdv ?? 0,
            decimals: token.decimals || 9,
            updateUnixTime,
            updateTime: new Date(updateTime),
          }

          // Insert new token data with initial tracking fields
          const newTokenData = {
            ...tokenData,
            previousPrice: tokenData.price,
            previousMarketcap: tokenData.marketcap,
            previousVolume24h: tokenData.volume24hUSD,
            priceChange5m: 0,
            marketcapChange5m: 0,
            volumeChange5m: 0,
            lastPriceUpdate: new Date(),
            lastMarketcapUpdate: new Date(),
            lastVolumeUpdate: new Date(),
          }

          // Upsert to avoid duplicate key errors if the same address appears again
          const upsertResult = await TrendingToken.updateOne(
            { address: token.address },
            { $setOnInsert: newTokenData },
            { upsert: true },
          )

          const wasInserted = Boolean(
            // present only when a new document was inserted
            (upsertResult as any)?.upsertedId,
          )

          if (wasInserted) {
            // Store initial price history only when inserted the first time
            await TokenPriceHistory.create({
              tokenAddress: token.address,
              symbol: token.symbol,
              price: tokenData.price,
              marketcap: tokenData.marketcap,
              volume24h: tokenData.volume24hUSD,
              priceChange5m: 0,
              marketcapChange5m: 0,
              volumeChange5m: 0,
              timestamp: new Date(),
              updateType: 'token_list',
              source: 'birdeye_api',
            })

            insertedAddresses.add(token.address)

            console.log(
              `💾 Stored token ${successfulTokens + 1}/${TARGET_TOKEN_COUNT}: ${token.symbol} (Rank: ${token.rank})`,
            )
            successfulTokens++
          } else {
            console.log(
              `↩️ Already processed in this run, skipping: ${token.symbol} (${token.address})`,
            )
          }
        } catch (tokenError: any) {
          // Gracefully ignore duplicate key errors
          if (tokenError?.code === 11000) {
            console.warn(
              `⚠️ Duplicate address detected, skipping: ${token.symbol} (${token.address})`,
            )
            continue
          }

          console.error(
            `❌ Error processing token ${token.symbol}:`,
            tokenError,
          )
          // Log the specific validation errors
          if (tokenError.errors) {
            Object.keys(tokenError.errors).forEach((key) => {
              console.error(`  - ${key}: ${tokenError.errors[key].message}`)
            })
          }
          failedTokens++
        }
      }

      // If we still need more tokens, fetch another batch
      if (successfulTokens < TARGET_TOKEN_COUNT) {
        const remainingNeeded = TARGET_TOKEN_COUNT - successfulTokens
        console.log(
          `\n🔄 Need ${remainingNeeded} more tokens. Fetching additional batch...`,
        )

        try {
          let additionalTokens = await fetchTokensInBatches(
            remainingNeeded + 10,
          ) // Fetch extra to account for potential failures
          if (additionalTokens.length > 0) {
            // Deduplicate and filter out addresses already inserted in this run
            additionalTokens = deduplicateAndRankTokens(
              additionalTokens,
            ).filter((t) => !insertedAddresses.has(t.address))

            currentTokens = additionalTokens
            batchNumber++
            console.log(
              `📦 Fetched ${additionalTokens.length} additional tokens`,
            )
          } else {
            console.warn(
              `⚠️ Could not fetch additional tokens. Stopping with ${successfulTokens} tokens.`,
            )
            break
          }
        } catch (fetchError) {
          console.error(`❌ Error fetching additional tokens:`, fetchError)
          break
        }
      }
    }

    console.log(
      `\n🎯 Final Result: ${successfulTokens}/${TARGET_TOKEN_COUNT} tokens stored successfully (${failedTokens} failed)`,
    )

    // Verify the count in database
    const storedCount = await TrendingToken.countDocuments()
    console.log(`📊 Verification: ${storedCount} tokens stored in database`)

    if (storedCount < TARGET_TOKEN_COUNT) {
      console.warn(
        `⚠️ Warning: Only ${storedCount}/${TARGET_TOKEN_COUNT} tokens stored. Some tokens may have failed validation.`,
      )
    } else {
      console.log(
        `✅ Success: Exactly ${storedCount} tokens stored in database!`,
      )
    }
  } catch (error) {
    console.error('Error processing and storing tokens:', error)
    throw error
  }
}

const getLatestTrendingTokens = async (limit: number = 20) => {
  try {
    const tokens = await TrendingToken.find()
      .sort({ rank: 1 })
      .limit(limit)
      .select(
        'address rank name symbol logoURI volume24hChangePercent price price24hChangePercent volume24hUSD marketcap',
      )
      .lean()

    return tokens
  } catch (error) {
    console.error('Error fetching latest trending tokens:', error)
    return []
  }
}

const manualTrigger = async () => {
  console.log('🚀 Manual trigger for trending tokens job')
  try {
    await fetchAndStoreTrendingTokens()
    console.log('✅ Manual trigger completed successfully')

    // Verify final count
    const finalCount = await TrendingToken.countDocuments()
    console.log(`📊 Final verification: ${finalCount}/50 tokens in database`)

    if (finalCount === 50) {
      console.log('🎉 Perfect! All 50 tokens stored successfully!')
    } else if (finalCount >= 45) {
      console.log(
        `⚠️ Good: ${finalCount}/50 tokens stored (${50 - finalCount} missing)`,
      )
    } else {
      console.log(
        `❌ Poor: Only ${finalCount}/50 tokens stored (${50 - finalCount} missing)`,
      )
    }
  } catch (error) {
    console.error('❌ Manual trigger failed:', error)
  }
}

// Optional: disable to save BirdEye credits (trending list will be empty/stale)
const birdEyeCronsDisabled = process.env.DISABLE_BIRD_EYE_CRONS === 'true' || process.env.DISABLE_BIRD_EYE_CRONS === '1'

const startTrendingTokensCron = () => {
  if (birdEyeCronsDisabled) {
    console.log('⏸️  Trending tokens cron disabled (DISABLE_BIRD_EYE_CRONS)')
    return
  }
  console.log('Trending tokens cron job started - running every 1 hour')
  const cronJob = cron.schedule('0 * * * *', async () => {
    await fetchAndStoreTrendingTokens()
  })

  // Register the cron job with process manager
  try {
    const { registerCron } = require('../config/processManager')
    registerCron(
      'trending-tokens-cron',
      'Trending tokens cron job (daily)',
      cronJob,
    )
    console.log('✅ Trending tokens cron job registered with process manager')
  } catch (error) {
    console.warn('⚠️ Could not register cron job with process manager:', error)
  }
}

const checkDatabaseStatus = async () => {
  try {
    const count = await TrendingToken.countDocuments()
    const tokens = await TrendingToken.find()
      .sort({ rank: 1 })
      .limit(5)
      .select('symbol rank')
      .lean()

    console.log(`📊 Database Status: ${count}/50 tokens`)
    if (tokens.length > 0) {
      console.log(
        '📋 Sample tokens:',
        tokens.map((t) => `${t.symbol} (Rank: ${t.rank})`).join(', '),
      )
    }

    return { count, tokens }
  } catch (error) {
    console.error('❌ Error checking database status:', error)
    return { count: 0, tokens: [] }
  }
}

export {
  startTrendingTokensCron,
  fetchAndStoreTrendingTokens,
  getLatestTrendingTokens,
  manualTrigger,
  checkDatabaseStatus,
}

startTrendingTokensCron()
