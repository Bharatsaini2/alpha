import cron from 'node-cron'
import { redisClient } from '../config/redis'
import { getTokenData, getTokenPrice } from '../config/solana-tokens-config'
import whaleAllTransactionModelV2 from '../models/whaleAllTransactionsV2.model'

/**
 * Only the fields we project from Mongo.
 */
interface TxProjection {
  tokenInAddress?: string
  tokenOutAddress?: string
  timestamp: Date
}

/**
 * Cron: runs at minute 0 of every hour
 */
cron.schedule('0 * * * *', async () => {
  console.log('🔄 1-hour transaction-based price job starting…')

  try {
    // 1) Read last-processed timestamp (if any)
    const lastTsStr = await redisClient.get('lastProcessedTimestamp')
    let query = {}
    let lastProcessed: Date = new Date(0)
    console.log(lastTsStr)

    if (lastTsStr) {
      lastProcessed = new Date(lastTsStr)
      query = { timestamp: { $gt: lastProcessed } }
    } else {
      console.log(
        '→ No lastProcessedTimestamp found: first run will scan ALL docs',
      )
    }

    // 2) Fetch new (or all) txns, projecting only the addresses + timestamp, excluding _id
    const txns = await whaleAllTransactionModelV2
      .find(query)
      .select('tokenInAddress tokenOutAddress timestamp _id')
      .lean<TxProjection[]>()
      .exec()

    if (!txns.length) {
      console.log(
        `→ No transactions to process since ${lastProcessed.toISOString()}`,
      )
    }

    // 3) Gather unique token addresses from those transactions
    const existingAddrs = await redisClient.smembers('processedAddresses')
    const addrSet = new Set<string>(existingAddrs)

    for (const tx of txns) {
      if (tx.tokenInAddress) addrSet.add(tx.tokenInAddress)
      if (tx.tokenOutAddress) addrSet.add(tx.tokenOutAddress)
    }

    // 4) For each new address, fetch price & cache it, and record it permanently in Redis set
    for (const address of Array.from(addrSet)) {
      try {
        let { price } = await getTokenData(address)
        if (price === 0) {
          price = await getTokenPrice(address)
        }
        await redisClient.set(`price:${address}`, price.toString())
        console.log(`→ Cached price for ${address}: $${price}`)
      } catch (fetchErr) {
        console.error(`✖ Failed to fetch price for ${address}:`, fetchErr)
      }
    }

    if (addrSet.size) {
      await redisClient.del('processedAddresses')
      await redisClient.sadd('processedAddresses', ...Array.from(addrSet))
      await redisClient.persist('processedAddresses')
    }

    // 5) Update lastProcessedTimestamp to the max timestamp seen
    if (txns.length) {
      const maxTs = txns
        .map((tx) => tx.timestamp)
        .reduce((a, b) => (a > b ? a : b), lastProcessed)
      await redisClient.set('lastProcessedTimestamp', maxTs.toISOString())
    }

    console.log(
      `✅ Done: processed ${txns.length} txns, ${addrSet.size} distinct addresses.`,
    )
  } catch (err) {
    console.error('❌ Cron job error:', err)
  }
})
