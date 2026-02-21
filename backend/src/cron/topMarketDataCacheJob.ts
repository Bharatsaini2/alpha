import cron from 'node-cron'
import pc from 'picocolors'
import whaleAllTransactionModelV2 from '../models/whaleAllTransactionsV2.model'
import influencerWhaleTransactionsModelV2 from '../models/influencerWhaleTransactionsV2.model'
import { getTokenMarketCapAndPriceUsingBirdEye } from '../config/solana-tokens-config'
import { TOKEN_MARKET_KEY } from '../config/redis'
import { PublicKey } from '@solana/web3.js'
import { redisClient } from '../config/redis'

const CRON_SCHEDULE = process.env.TOP_MARKET_CACHE_CRON || '0 */6 * * *'
const TTL_SECONDS = Number(process.env.TOP_MARKET_CACHE_TTL_SECONDS || 10800)
const CONCURRENCY = Number(process.env.TOP_MARKET_CACHE_CONCURRENCY || 8)

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const isValidSolanaAddress = (addr: string): boolean => {
  try {
    new PublicKey(addr)
    return true
  } catch {
    return false
  }
}

const uniqueNonEmpty = (items: (string | undefined | null)[]): string[] => {
  const seen = new Set<string>()
  for (const v of items) {
    if (!v || typeof v !== 'string') continue
    const clean = v.trim()
    if (!clean) continue
    if (!isValidSolanaAddress(clean)) continue
    // IMPORTANT: Do NOT lowercase Solana addresses; base58 is case-sensitive
    if (!seen.has(clean)) seen.add(clean)
  }
  return [...seen]
}

async function collectUniqueTokenAddresses(): Promise<string[]> {
  const since = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // last 1 day
  console.log(
    '🔍 Collecting unique token addresses since:',
    since.toISOString(),
  )

  // Query minimal fields to reduce memory
  const [whaleTxs, kolTxs] = await Promise.all([
    whaleAllTransactionModelV2
      .find(
        { timestamp: { $gte: since } },
        {
          signature: 1,
          tokenInAddress: 1,
          tokenOutAddress: 1,
          'transaction.tokenIn.address': 1,
          'transaction.tokenOut.address': 1,
        },
      )
      .lean(),
    influencerWhaleTransactionsModelV2
      .find(
        { timestamp: { $gte: since } },
        {
          signature: 1,
          tokenInAddress: 1,
          tokenOutAddress: 1,
          'transaction.tokenIn.address': 1,
          'transaction.tokenOut.address': 1,
        },
      )
      .lean(),
  ])
  console.log(`📦 Retrieved ${JSON.stringify(whaleTxs)} whale txs`)

  const whales = whaleTxs.flatMap((t: any) => [
    t?.tokenInAddress,
    t?.tokenOutAddress,
    t?.transaction?.tokenIn?.address,
    t?.transaction?.tokenOut?.address,
  ])

  const kols = kolTxs.flatMap((t: any) => [
    t?.tokenInAddress,
    t?.tokenOutAddress,
    t?.transaction?.tokenIn?.address,
    t?.transaction?.tokenOut?.address,
  ])

  return uniqueNonEmpty([...whales, ...kols])
}

async function upsertMarketToRedis(tokenAddress: string): Promise<boolean> {
  try {
    console.log('🔄 Fetching market data for: ', tokenAddress)

    const data = await getTokenMarketCapAndPriceUsingBirdEye(tokenAddress)

    const price = Number(data?.price) || 0
    const marketCap = Number(data?.market_cap) || 0
    
    const payload: Record<string, string> = {
      price: String(price),
      marketCap: String(marketCap),
      updatedAt: new Date().toISOString(),
    }

    const key = TOKEN_MARKET_KEY(tokenAddress)
    await redisClient.hset(key, payload)
    await redisClient.expire(key, TTL_SECONDS)
    return true
  } catch (err) {
    console.error('❌ Failed to fetch/store market data for', tokenAddress, err)
    return false
  }
}

async function processInBatches(addresses: string[]) {
  let success = 0
  let failure = 0
  const groups = chunk(addresses, CONCURRENCY)
  for (const grp of groups) {
    const results = await Promise.all(grp.map((a) => upsertMarketToRedis(a)))
    for (const r of results) {
      if (r) {
        success++
      } else {
        failure++
      }
    }
    // tiny delay to avoid rate limits
    await new Promise((res) => setTimeout(res, 500))
  }
  return { success, failure }
}

async function refreshMarketCache() {
  const started = Date.now()
  console.log('🔄 Top Market Data Cache: collecting tokens (7d)...')
  const tokens = await collectUniqueTokenAddresses()
  console.log(`📦 Unique tokens collected: ${tokens.length}`)
  console.log(`📊 Estimated CU usage for this run: ${tokens.length * 15} CUs`)
  console.log(`📊 Estimated Birdeye API calls: ${tokens.length}`)

  const { success, failure } = await processInBatches(tokens)
  const ms = Date.now() - started
  console.log(
    pc.green(
      `✅ Market cache updated: success=${success} failure=${failure} in ${ms}ms`,
    ),
  )
  console.log(`📊 Actual API calls made: ${success + failure}`)
}

// Optional: disable to save BirdEye credits (Top Coins pages will use 0/stale price from Redis)
const birdEyeCronsDisabled = process.env.DISABLE_BIRD_EYE_CRONS === 'true' || process.env.DISABLE_BIRD_EYE_CRONS === '1'

let cronJob: cron.ScheduledTask | null = null
if (!birdEyeCronsDisabled) {
  // Schedule - Every 6 hours (tokens from last 1 day only)
  cronJob = cron.schedule(
    CRON_SCHEDULE,
    async () => {
      try {
        await refreshMarketCache()
      } catch (e) {
        console.error('❌ Market data cache cron failed:', e)
      }
    },
    { timezone: 'UTC' },
  )
  // Register with process manager when available
  try {
    const { registerCron } = require('../config/processManager')
    registerCron(
      'top-market-data-cache',
      'Cache price/marketCap for tokens (Top Coins & Top KOL) every 6h',
      cronJob,
    )
    console.log('🗓️  Registered top-market-data-cache cron with process manager')
  } catch (err) {
    console.warn('⚠️ Could not register top-market-data-cache cron:', err)
  }
} else {
  console.log('⏸️  top-market-data-cache cron disabled (DISABLE_BIRD_EYE_CRONS)')
}

// Allow manual trigger for debugging
export const manualTopMarketCacheRefresh = refreshMarketCache
