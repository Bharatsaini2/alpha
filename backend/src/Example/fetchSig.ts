import { Connection, PublicKey } from '@solana/web3.js'
import pc from 'picocolors'
import { redisClient } from '../config/redis'
import whaleAllTransactionModel from '../models/whale-all-transactions.model'
import { getParsedTransactions } from '../config/getParsedTransaction'
import { connectDB } from '../config/connectDb'

// // Initialize Solana connection
const solConnection = new Connection(
  'https://api.mainnet-beta.solana.com',
  'confirmed',
)

// Configuration
const WHALE_ADDRESS = 'CSEncqtqbmNRjve42sNnbs5cCSmrjUNsAEwc17XY2RCs'
const COOLDOWN = 10000
// const PROCESSED_TTL = 86400 // 24 hours in seconds
const PROCESSED_TTL = 43200 // 12 hours in seconds

// Helper functions
// const storeSignature = async (signature: string, whaleAddress: string) => {
//   const data = JSON.stringify({ signature, whaleAddress })
//   const exists = await redisClient.sismember('whale_signatures', data)
//   if (!exists) {
//     await redisClient.sadd('whale_signatures', data)
//     console.log(`Stored signature: ${signature}`)
//     return true
//   }
//   return false
// }

// Helper functions
const storeSignature = async (signature: string, whaleAddress: string) => {
  const ttlKey = `whale_sig:${signature}`
  const existsInTTL = await redisClient.exists(ttlKey)
  if (existsInTTL) {
    return false
  }
  // Add to 24h TTL cache
  await redisClient.setex(
    ttlKey,
    PROCESSED_TTL,
    JSON.stringify({ signature, whaleAddress }),
  )

  // Add to permanent set
  await redisClient.sadd(
    'whale_signatures',
    JSON.stringify({ signature, whaleAddress }),
  )
  console.log(`Stored new signature: ${signature}`)
  return true
}

const removeSignature = async (signature: string, whaleAddress: string) => {
  const data = JSON.stringify({ signature, whaleAddress })
  await redisClient.srem('whale_signatures', data)
  console.log(`Removed signature: ${signature}`)
}

const setLatestSignature = async (whaleAddress: string, signature: string) => {
  await redisClient.hset('whale_latest_signatures', whaleAddress, signature)
}

const getLatestSignature = async (whaleAddress: string) => {
  return await redisClient.hget('whale_latest_signatures', whaleAddress)
}

const fetchWithRetry = async (
  fn: () => Promise<any>,
  retries = 3,
  delay = 2000,
) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err: any) {
      if (err.message.includes('429')) {
        console.log(`429 rate limit, retry in ${delay * Math.pow(2, i)}ms`)
        await new Promise((res) => setTimeout(res, delay * Math.pow(2, i)))
      } else {
        throw err
      }
    }
  }
}

// Main monitor logic
const monitorWhale = async (whaleAddress: string) => {
  console.log(pc.green(`Monitoring whale: ${whaleAddress}`))
  const publicKey = new PublicKey(whaleAddress)
  let lastCallTime = 0

  solConnection.onAccountChange(publicKey, async () => {
    try {
      const now = Date.now()
      if (now - lastCallTime < COOLDOWN) {
        return
      }
      lastCallTime = now

      console.log(`Activity detected for ${whaleAddress}`)

      // Get latest stored signature to detect newer ones
      const latestKnownSignature = await getLatestSignature(whaleAddress)

      // Always fetch latest N txs
      const signatures = await fetchWithRetry(() =>
        solConnection.getSignaturesForAddress(publicKey, { limit: 3 }),
      )

      if (!signatures || signatures.length === 0) {
        console.log(`No new signatures for ${whaleAddress}`)
        return
      }

      let foundNew = false
      for (const sig of signatures) {
        if (sig.signature === latestKnownSignature) {
          console.log(`Reached previously known signature: ${sig.signature}`)
          break
        }
        const isNew = await storeSignature(sig.signature, whaleAddress)
        if (isNew) {
          foundNew = true
          console.log(`Processing tx: ${sig.signature}`)
        }
      }
      // Store newest signature if any new were processed
      if (foundNew) {
        await setLatestSignature(whaleAddress, signatures[0].signature)
      }
    } catch (err) {
      console.error(`Error for ${whaleAddress}:`, err)
    }
  })
}

// Start the monitor
monitorWhale(WHALE_ADDRESS)
