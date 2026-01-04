import { PublicKey } from '@solana/web3.js'
import mongoose from 'mongoose'
import pc from 'picocolors'
import { connectDB, getDataBaseInfo } from '../config/connectDb'
import { getParsedTransactions } from '../config/getParsedTransaction'
import { redisClient } from '../config/redis'
import { solConnection } from '../config/solana-config'
import {
  findInfluencerData,
  getTokenData,
  getTokenMetaDataUsingRPC,
  getTokenCreationInfo,
  getTokenPrice,
  fetchSolanaMarketCap,
} from '../config/solana-tokens-config'
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors'
import { postKOLAlertToTwitter } from '../services/insight-posts'
import { formatNumber } from '../utils/FormatNumber'
import influencerWhaleTransactionsModelV2 from '../models/influencerWhaleTransactionsV2.model'
import {
  kolHotnessScoreModel,
  kolPurchaseRecordModel,
} from '../models/KolHotnessScore.model'
import { getKolHotnessScore } from './kolInsight.controller'
import { broadcastTransaction } from '../app'
import { getKolProfileFollowerFunction } from '../services/KolProfileFollower'
import { alertMatcherService } from '../services/alertMatcher.service'
import Redis from 'ioredis'
import { Queue, Worker } from 'bullmq'
import logger from '../utils/logger'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import WebSocket from 'ws'
import { createBullBoard } from '@bull-board/api'

function startOfUTCDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
}

function endOfUTCDay(date: Date): Date {
  // make midnight of next UTC day, then subtract 1 ms
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) -
    1,
  )
}

// ============ BULLMQ QUEUE SETUP ============
const signatureKolQueue = new Queue('signature-processing-kol', {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 1000,
    removeOnFail: 500,
  },
})

// ============ CACHING LAYER ============
const tokenDataCache = new Map<string, { data: any; timestamp: number }>()
const whaleTokenCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 60000 // 60 seconds
const TIME_IN_SECONDS_KOL = Number(process.env.TIME_IN_SECONDS_KOL) || 5000

// Cleanup cache periodically
setInterval(() => {
  const now = Date.now()

  for (const [key, value] of tokenDataCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      tokenDataCache.delete(key)
    }
  }

  for (const [key, value] of whaleTokenCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      whaleTokenCache.delete(key)
    }
  }

  logger.info(
    `Cache cleanup: Token cache size: ${tokenDataCache.size}, Kol cache size: ${whaleTokenCache.size}`,
  )
}, 300000) // Clean every 5 minutes

// ============ CONFIGURATION ============
const HELIUS_WS_URL =
  process.env.WSS_URL ||
  'wss://atlas-mainnet.helius-rpc.com/?api-key=ba7496c3-65bf-4a12-a4a2-fb6c20cd4e96'

const COOLDOWN = 10000 // 10 sec per whale
const MAX_SIGNATURES = 3 // process up to 3 latest signatures per whale
const MAX_TRACKED_WHALES = 10000
let ws: WebSocket | null = null
let lastCallTimes: Record<string, number> = {}
let reconnectTimeout: NodeJS.Timeout | null = null
let isMonitoringStarted = false
let monitoredWhales: string[] = []
const SUBSCRIPTION_BATCH_SIZE = 50
const NUM_WORKERS = Number(process.env.NUM_WORKERS_KOL) || 1 // Number of parallel workers
const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY_KOL) || 8
const limiter = Number(process.env.RATE_LIMIT_MAX_KOL) || 30
let workers: Worker[] = []

// ============ UTILITY FUNCTIONS ============
const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

// Clean up lastCallTimes to prevent memory leak
const cleanupLastCallTimes = () => {
  if (Object.keys(lastCallTimes).length > MAX_TRACKED_WHALES) {
    const entries = Object.entries(lastCallTimes)
      .sort(([, a], [, b]) => a - b)
      .slice(0, 1000)

    entries.forEach(([key]) => delete lastCallTimes[key])
    logger.info('Cleaned up old lastCallTimes entries')
  }
}

setInterval(cleanupLastCallTimes, 600000) // Clean every 10 minutes

const storeSignature = async (signature: string, whaleAddress: string) => {
  const exists = await redisClient.sismember(
    'influencer_whale_signatures',
    JSON.stringify({ signature, whaleAddress }),
  )

  if (exists) {
    return false
  }

  // Add to permanent set
  await redisClient.sadd(
    'influencer_whale_signatures',
    JSON.stringify({ signature, whaleAddress }),
  )
  logger.info(
    `Stored new signature: ${signature} for influncer whale: ${whaleAddress}`,
  )
  return true
}
const setLatestSignature = async (whaleAddress: string, signature: string) => {
  await redisClient.hset(
    'influencer_latest_signatures',
    whaleAddress,
    signature,
  )
}

const getLatestSignature = async (whaleAddress: string) => {
  return await redisClient.hget('influencer_latest_signatures', whaleAddress)
}

// Retry function with exponential backoff to handle "429 Too Many Requests"
async function fetchWithRetry(fetchFn: any, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchFn()
    } catch (err: any) {
      if (err.message.includes('429')) {
        logger.info(
          `Too many requests, retrying in ${delay * Math.pow(2, i)}ms...`,
        )
        await new Promise((res) => setTimeout(res, delay * Math.pow(2, i))) // Wait longer on each retry
      } else {
        throw err
      }
    }
  }
}

// ---------------- WebSocket Core ---------------- //
function connectWhaleStream(whaleAddresses: string[]) {
  if (ws) {
    logger.info(pc.yellow('Closing old WebSocket before reconnecting...'))
    ws.close()
  }

  ws = new WebSocket(HELIUS_WS_URL)

  ws.on('open', () => {
    logger.info(pc.green('✅ Connected to Helius WebSocket'))
    subscribeKols(whaleAddresses)
    startPing(ws!)
  })

  ws.on('message', async (data) => {
    const msgStr = data.toString('utf8')
    try {
      const msg = JSON.parse(msgStr)
      if (msg.result && msg.id) {
        logger.info(pc.green(`✅ Subscribed successfully: ID ${msg.id}`))
      } else if (msg.method === 'transactionNotification') {
        const tx = msg.params.result

        logger.info(
          pc.magenta(`🐋 Tx Notification received for ${tx.signature}`),
        )
        handleTransactionEvent(tx)
      } else {
        logger.info(pc.gray('Other message:'), msg)
      }
    } catch (err) {
      logger.error({ err }, pc.red('❌ JSON parse error:'))
    }
  })

  ws.on('error', (err) => {
    logger.error({ err }, pc.red('⚠️ WebSocket error:'))
  })

  ws.on('close', () => {
    logger.info(pc.red('🔌 WebSocket closed — attempting reconnect...'))
    if (reconnectTimeout) clearTimeout(reconnectTimeout)
    reconnectTimeout = setTimeout(
      () => connectWhaleStream(whaleAddresses),
      5000,
    )
  })
}

// ---------------- Subscription ---------------- //
function subscribeKols(whaleAddresses: string[]) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    logger.error('WebSocket is not connected.')
    return
  }

  logger.info(`Subscribing to ${whaleAddresses.length} kol addresses.`)

  const request = {
    jsonrpc: '2.0',
    id: 2, // A single ID for this one request
    method: 'transactionSubscribe',
    params: [
      {
        // Pass the entire array of addresses here
        accountInclude: whaleAddresses,
      },
      {
        commitment: 'finalized',
        encoding: 'jsonParsed',
        transactionDetails: 'full',
        showRewards: false,
        maxSupportedTransactionVersion: 0,
      },
    ],
  }

  ws.send(JSON.stringify(request))
  logger.info(
    pc.cyan(`📡 Subscribed to all kol addresses in a single request.`),
  )
}

function subscribeKolsInBatches(whaleAddresses: string[]) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('WebSocket is not connected.')
    return
  }

  console.log(
    `Subscribing to ${whaleAddresses.length} KOL addresses in batches of ${SUBSCRIPTION_BATCH_SIZE}.`,
  )

  const batches = chunkArray(whaleAddresses, SUBSCRIPTION_BATCH_SIZE)

  batches.forEach((batch, index) => {
    setTimeout(() => {
      const request = {
        jsonrpc: '2.0',
        id: `kol-${index + 1}`,
        method: 'transactionSubscribe',
        params: [
          {
            accountInclude: batch,
          },
          {
            commitment: 'finalized',
            encoding: 'jsonParsed',
            transactionDetails: 'full',
            showRewards: false,
            maxSupportedTransactionVersion: 0,
          },
        ],
      }

      ws!.send(JSON.stringify(request))
      console.log(
        pc.cyan(
          `📡 KOL Subscribed batch ${index + 1}/${batches.length} (${batch.length} addresses)`,
        ),
      )
    }, index * 100) // Stagger subscriptions by 100ms
  })
}

// ---------------- Transaction Handler ---------------- //
async function handleTransactionEvent(tx: any) {
  try {
    const signature = tx?.signature

    const transactionData = tx?.transaction

    if (!transactionData || !signature) {
      console.warn(
        '⚠️ Malformed transaction notification: missing signature or transaction data',
      )
      return
    }

    const message = transactionData.transaction.message

    if (!message || !message.accountKeys) {
      console.warn('⚠️ No message or accountKeys found in transaction payload')
      return
    }

    const accounts = message.accountKeys.map((a: any) => a.pubkey)

    logger.info(`Processing tx: ${signature}`)

    if (accounts.length === 0) return

    // Find which whale this transaction belongs to
    const kolAddress = accounts.find((acc: string) =>
      monitoredKols.includes(acc),
    )
    logger.info(`Identified kol address: ${kolAddress}`)

    if (!kolAddress) return

    const signatureData = JSON.stringify({ signature, kolAddress })
    const exists = await redisClient.sismember(
      'influencer_whale_signatures',
      signatureData,
    )

    if (exists) {
      logger.info(`Signature ${signature} already processed, skipping kol`)
      return
    }

    const txMeta = tx?.transaction?.meta

    if (!txMeta) {
      logger.warn(`No transaction meta for ${signature}, skipping`)
      return
    }

    // Check if transaction succeeded
    if (txMeta.err !== null) {
      logger.info(
        `Transaction ${signature} failed on-chain (err: ${JSON.stringify(txMeta.err)}), skipping`,
      )
      return
    }

    await redisClient.sadd('influencer_whale_signatures', signatureData)

    // Skip if already processed
    // const isNew = await storeSignature(signature, kolAddress)
    // if (!isNew) return
    await signatureKolQueue.add(
      'process-signature-kol',
      {
        signature,
        kolAddress,
        transactionData: tx,
      },
      {
        priority: 1,
        removeOnComplete: true,
        removeOnFail: false,
      },
    )
    logger.info(pc.magenta(`👤 New kol Tx Detected: ${signature}`))
    await setLatestSignature(kolAddress, signature)
  } catch (err) {
    logger.error({ err }, pc.red('Error handling transaction:'))
  }
}

// ---------------- Ping Handler ---------------- //
function startPing(ws: WebSocket) {
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping()
      logger.info(pc.gray('↪️ Ping sent'))
    }
  }, 30000)
}

// ============ WORKER FOR PROCESSING SIGNATURES ============

console.log(pc.cyan(`\n🚀 Initializing ${NUM_WORKERS} workers...`))
console.log(`Redis Connection Status Kol: ${redisClient.status}`)
console.log(`Queue Name: signature-processing-kol`)
console.log(`Concurrency per worker Kol: ${WORKER_CONCURRENCY}\n`)

for (let i = 0; i < NUM_WORKERS; i++) {
  try {
    console.log(pc.yellow(`Creating worker Kol ${i}...`))

    // ✅ Duplicate Redis connection for each worker
    const workerConnection = redisClient.duplicate()

    const worker = new Worker(
      'signature-processing-kol',
      async (job) => {
        if (!job.data) {
          console.error(
            pc.red(`[Worker ${i}] ❌ Job data is KOL null/undefined`),
          )
          return
        }

        const { signature, kolAddress, transactionData } = job.data

        // ✅ Validate required fields
        if (!signature || !kolAddress) {
          console.error(
            pc.red(
              `[Worker ${i}] ❌ Invalid job data KOL - missing signature or kolAddress:`,
            ),
            { signature, kolAddress },
          )
          return
        }

        console.log(
          pc.green(
            `[Worker ${i}] Processing signature KOL: ${signature} for Kol: ${kolAddress}`,
          ),
        )

        try {
          const signatureData = {
            signature,
            kolAddress,
            transactionData: transactionData || null, // Handle missing transactionData gracefully
          }
          await processInfluencerSignature(JSON.stringify(signatureData))
          console.log(
            pc.green(
              `[Worker Kol ${i}] ✅ Successfully processed KOL: ${signature}`,
            ),
          )
        } catch (error) {
          console.error(
            pc.red(`[Worker Kol ${i}] ❌ Error processing KOL: ${signature}:`),
            error,
          )
          throw error
        }
      },
      {
        connection: workerConnection,
        concurrency: WORKER_CONCURRENCY,
        limiter: {
          max: limiter,
          duration: TIME_IN_SECONDS_KOL,
        },
        autorun: true,
      },
    )

    // 🔍 Add all event listeners BEFORE pushing to array
    worker.on('ready', () => {
      console.log(pc.green(`✅ Worker ${i} is KOL READY`))
    })

    worker.on('active', (job) => {
      console.log(pc.cyan(`[Worker ${i}] Job ${job.id} is KOL now ACTIVE`))
    })

    worker.on('completed', (job) => {
      console.log(pc.green(`✅ [Worker ${i}] Job ${job.id} Kol completed`))
    })

    worker.on('failed', (job, err) => {
      console.log(
        pc.red(`❌ [Worker ${i}] Kol Job ${job?.id} failed: ${err.message}`),
      )
    })

    worker.on('error', (err) => {
      console.error(pc.red(`[Worker ${i}] Kol ERROR:`), err)
    })

    worker.on('stalled', (jobId) => {
      console.warn(pc.yellow(`[Worker ${i}] Kol Job ${jobId} STALLED`))
    })

    workers.push(worker)
    console.log(pc.green(`✅ Worker ${i} Kol created and ready\n`))
  } catch (error) {
    console.error(pc.red(`❌ Failed to create Kol worker ${i}:`), error)
    throw error
  }
}

console.log(pc.green(`🎉 All ${NUM_WORKERS} Kol workers started successfully`))
console.log(
  `Total capacity: ${NUM_WORKERS * WORKER_CONCURRENCY} Kol concurrent jobs\n`,
)

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/admin/queues')

createBullBoard({
  queues: [new BullMQAdapter(signatureKolQueue)],
  serverAdapter: serverAdapter,
  options: {
    uiConfig: {
      boardTitle: 'Kol Transaction Queue Monitor',
    },
  },
})

export const getQueueStats = async () => {
  const counts = await signatureKolQueue.getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed',
  )

  return counts
}

setInterval(async () => {
  try {
    const stats = await getQueueStats()
    logger.info(
      {
        '⏳ Waiting': stats.waiting,
        '⚡ Active': stats.active,
        '✅ Completed': stats.completed,
        '❌ Failed': stats.failed,
        '🕒 Delayed': stats.delayed,
      },
      '📊 Queue Stats:',
    )

    // Alert if backlog is growing
    if (stats.waiting > 1000) {
      logger.warn(pc.yellow(`⚠️ Large backlog: ${stats.waiting} jobs waiting!`))
    }
  } catch (error) {
    logger.error({ error }, 'Error getting queue stats:')
  }
}, 15000)

setInterval(async () => {
  try {
    const stats = await getQueueStats()

    // Get oldest waiting job
    if (stats.waiting > 0) {
      const waitingJobs = await signatureKolQueue.getWaiting(0, 1)
      if (waitingJobs.length > 0) {
        const oldestJob = waitingJobs[0]
        const age = Date.now() - oldestJob.timestamp

        logger.info(
          {
            waiting: stats.waiting,
            active: stats.active,
            oldestJobAge: `${Math.round(age / 1000)}s`,
          },
          '📊 Queue Stats KOL',
        )

        if (age > 30000) {
          // Over 30 seconds old
          logger.warn(
            `⚠️  Queue KOL lag detected! Oldest job is ${Math.round(age / 1000)}s old`,
          )
        }
      }
    }
  } catch (error) {
    logger.error({ error }, 'Error getting queue stats KOL')
  }
}, 15000)

let monitoredKols: string[] = []
export const monitorInfluencerWhales = async (whaleAddresses: string[]) => {
  try {
    monitoredKols = whaleAddresses
    logger.info(
      pc.green('🚀 Starting Enhanced Kol Monitor (WebSocket mode)...'),
    )
    connectWhaleStream(whaleAddresses)
  } catch (error) {
    logger.info({ error }, pc.red('Error in monitoredKols:'))
  }
}

export const getInfluencerWhaleLatestTransactions = catchAsyncErrors(
  async (req: any, res: any) => {
    // Check if the monitoring service is already active
    if (isMonitoringStarted) {
      logger.info('✅ Kol monitoring is already active. No action needed.')
      // Immediately tell the client that the service is running
      return res.status(200).json({
        status: 'active',
        message: 'Kol transaction monitoring is already running.',
      })
    }

    // If we reach here, monitoring has NOT started yet.
    // Set the flag to true IMMEDIATELY to prevent race conditions
    isMonitoringStarted = true
    logger.info('🚀 Starting Kol monitoring for the first time...')

    // --- Respond to the User Immediately ---
    // Tell the client that the monitoring service is now starting.
    // Use status code 202 (Accepted) to indicate a background process has begun.
    res.status(202).json({
      status: 'initializing',
      message: 'Request accepted. Starting Kol transaction monitoring service.',
    })
      ; (async () => {
        try {
          const db = await getDataBaseInfo(mongoose)
          const client = db.dbClient
          await client.connect()
          const database = client.db(db?.dbName)
          const collection = database.collection('influencerwhalesaddressv2')

          const influencerWhales = await collection
            .find({}, { projection: { whalesAddress: 1, _id: 0 } })
            .toArray()
          const allInfluencerWhaleAddresses = influencerWhales.flatMap(
            (doc) => doc.whalesAddress,
          )
          logger.info(
            { allInfluencerWhaleAddresses },
            'Influencers Whale Addresses:',
          )
          await client.close()
          // const allWhaleAddresses = ['ruok2pybjpftuQ75qfzgHgebB91vSbCAK91dkButHdr','C3TdUaDVdE74wYutyCkj7NRXqRfLgq2UFRZFab9MEUBs']
          // logger.info('Whale Addresses:', allWhaleAddresses)
          await monitorInfluencerWhales(allInfluencerWhaleAddresses)
        } catch (err: any) {
          logger.error(`error while fetching large transaction of a Kol`)
          isMonitoringStarted = false
        }
      })()
  },
)

// ****************   2. Parse signatures for influencer *********************

// 🛠️ Helper: Get symbol safely
const resolveSymbol = async (token: any) => {
  if (token.symbol && token.symbol !== 'Unknown' && token.symbol !== 'Token') {
    return { symbol: token.symbol, name: token.name || token.symbol }
  }

  try {
    const metadata = await getTokenMetaDataUsingRPC(token.token_address)
    return metadata || { symbol: 'Unknown', name: 'Unknown' }
  } catch {
    return { symbol: 'Unknown', name: 'Unknown' }
  }
}
// Store Transactions in MongoDB
const storeInfluencerTransactionInDB = async (
  signature: string,
  details: any,
  isBuy: boolean,
  isSell: boolean,
  parsedTx: any,
  txStatus: any,
): Promise<void> => {
  let clampedHotnessScore = 0

  if (isBuy) {
    clampedHotnessScore = Math.max(0, Math.min(details.hotnessScore ?? 0, 10))
  }

  let typeValue: 'buy' | 'sell' | 'both'
  if (isBuy && isSell) {
    typeValue = 'both'
  } else if (isBuy) {
    typeValue = 'buy'
  } else {
    typeValue = 'sell'
  }

  let platform = details.platform
  const gasFee = details.gasFee

  // Calculate token ages (time since creation) for both tokens
  let tokenInAge: Date | null = null
  let tokenOutAge: Date | null = null

  // Helper function to get token age
  const getTokenAge = async (
    tokenSymbol: string,
    tokenAddress: string,
  ): Promise<Date | null> => {
    try {
      // Check if token is SOL or WSOL - use fixed date
      if (
        tokenSymbol?.toUpperCase() === 'SOL' ||
        tokenSymbol?.toUpperCase() === 'WSOL'
      ) {
        // SOL launch date: March 16, 2020 in UTC
        return new Date('2020-03-16T00:00:00.000Z')
      } else if (tokenAddress) {
        // Get token creation info from BirdEye API
        const creationTimestamp = await getTokenCreationInfo(tokenAddress)
        if (creationTimestamp) {
          // getTokenCreationInfo returns ISO date string like "2025-07-14T21:21:00.000Z"
          const dateObj = new Date(creationTimestamp)

          // Validate the date
          if (isNaN(dateObj.getTime())) {
            console.warn('Invalid date from API:', creationTimestamp)
            return null
          } else {
            return dateObj
          }
        }
      }
      return null
    } catch (error) {
      logger.error({ error }, 'Error calculating token age:')
      return null
    }
  }

  // Calculate ages for both tokens
  try {
    const [inAge, outAge] = await Promise.all([
      getTokenAge(details.tokenInSymbol, details.tokenInAddress),
      getTokenAge(details.tokenOutSymbol, details.tokenOutAddress),
    ])
    tokenInAge = inAge
    tokenOutAge = outAge
  } catch (error) {
    logger.error({ error }, 'Error calculating token ages:')
    tokenInAge = null
    tokenOutAge = null
  }

  if (
    details.tokenInSymbol.toUpperCase().toString() === 'SOL' ||
    details.tokenInSymbol.toUpperCase().toString() === 'WSOL'
  ) {
    const tokenSolMarketCap = await fetchSolanaMarketCap(details.tokenInAddress)
    details.inMarketCap = tokenSolMarketCap
    details.buyMarketCapSol = tokenSolMarketCap / details.tokenInPrice
  }

  if (
    details.tokenOutSymbol.toUpperCase().toString() === 'SOL' ||
    details.tokenOutSymbol.toUpperCase().toString() === 'WSOL'
  ) {
    const tokenSolMarketCap = await fetchSolanaMarketCap(
      details.tokenOutAddress,
    )

    details.outMarketCap = tokenSolMarketCap
    details.sellMarketCapSol = tokenSolMarketCap / details.tokenOutPrice
  }

  const transactionData = {
    signature,
    amount: {
      buyAmount: details.tokenOutUsdAmount || 0,
      sellAmount: details.tokenInUsdAmount || 0,
    },

    tokenAmount: {
      buyTokenAmount: details.tokenOutAmount || 0,
      sellTokenAmount: details.tokenInAmount || 0,
    },

    tokenPrice: {
      buyTokenPrice: details.tokenOutPrice || 0,
      sellTokenPrice: details.tokenInPrice || 0,
      buyTokenPriceSol: details.sellTokenPriceSol || 0,
      sellTokenPriceSol: details.buyTokenPriceSol || 0,
    },

    solAmount: {
      buySolAmount: details.tokenOutSolAmount || 0,
      sellSolAmount: details.tokenInSolAmount || 0,
    },

    // Enhanced transaction object with new fields
    transaction: {
      tokenIn: {
        symbol: details.tokenInSymbol || 'Unknown',
        name: details.tokenInName || 'Unknown', // Will be enhanced with metadata
        address: details.tokenInAddress || '',
        amount: details.tokenInAmount?.toString() || '0',
        marketCap: details.inMarketCap?.toString() || '0',
        imageUrl: details.inTokenURL || null,
        marketCapSol: details.buyMarketCapSol?.toString() || '0',
        usdAmount: details.tokenInUsdAmount?.toString() || '0',
      },
      tokenOut: {
        symbol: details.tokenOutSymbol || 'Unknown',
        name: details.tokenOutName || 'Unknown', // Will be enhanced with metadata
        address: details.tokenOutAddress || '',
        amount: details.tokenOutAmount?.toString() || '0',
        marketCap: details.outMarketCap?.toString() || '0',
        imageUrl: details.outTokenURL || null,
        marketCapSol: details.sellMarketCapSol?.toString() || '0',
        usdAmount: details.tokenOutUsdAmount?.toString() || '0',
      },
      gasFee: gasFee,
      platform: platform,
      timestamp: new Date(),
    },

    influencerName: details.influencerName,
    influencerUsername: details.influencerUsername,
    influencerFollowerCount: details.influencerFollowerCount,
    influencerProfileImageUrl: details.influencerProfileImageUrl,
    tokenInSymbol: details.tokenInSymbol,
    tokenOutSymbol: details.tokenOutSymbol,
    whaleAddress: details.kolAddress, // Map kolAddress to whaleAddress for database compatibility
    kolAddress: details.kolAddress,
    tokenInAddress: details.tokenInAddress,
    tokenOutAddress: details.tokenOutAddress,
    // marketCap: isSell ? details.inMarketCap : details.outMarketCap,
    marketCap: {
      buyMarketCap: details.outMarketCap || 0,
      sellMarketCap: details.inMarketCap || 0,
    },
    outTokenURL: details.outTokenURL,
    inTokenURL: details.inTokenURL,
    type: typeValue,
    bothType: [
      {
        buyType: typeValue === 'both' ? true : false,
        sellType: typeValue === 'both' ? true : false,
      },
    ],
    hotnessScore: clampedHotnessScore,
    timestamp: new Date(),
    age: tokenInAge, // Keep for backward compatibility - use tokenInAge as default
    tokenInAge: tokenInAge,
    tokenOutAge: tokenOutAge,
  }

  // store transaction in DB
  const savedTransaction =
    await influencerWhaleTransactionsModelV2.create(transactionData)
  logger.info(
    pc.green('✅ Stored whale transaction in MongoDB with enhanced V2 fields'),
  )

  // Trigger alert matching asynchronously (non-blocking)
  setImmediate(() => {
    alertMatcherService
      .processTransaction(savedTransaction as any)
      .catch((error) => {
        logger.error({
          component: 'influencer.controller',
          operation: 'storeInfluencerWhaleTransactionV2',
          txHash: savedTransaction.signature,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          },
          message: 'Alert matching failed for influencer transaction',
        })
      })
  })

  // Emit event for all whale transactions
  broadcastTransaction({
    type: 'allInfluencerWhaleTransactions',
    data: savedTransaction,
  })
}
// Check and Post AlphaWhale twitter Alerts
const checkAndPostKOLAlert = async (
  details: any,
  isBuy: boolean,
  // txValue: number,
  signature: string,
): Promise<void> => {
  let alertMessage = ''
  logger.info(
    pc.red(
      `The whale should be considered under token ${details.tokenOutSymbol}: ${details.influencerUsername}`,
    ),
  )
  const formattedValue = formatNumber(details.tokenOutUsdAmount)
  const formattedMarketCap = formatNumber(details.outMarketCap)
  logger.info(`formatted token value is as: ${formattedValue}`)

  if (isBuy) {
    logger.info(
      pc.yellow(
        '==========================   inside twitter   ==========================',
      ),
    )

    await upsertKolHotnessScoreDetails(
      details.tokenOutAddress,
      details.kolAddress,
      signature,
    )

    // Apply +3 hotness score bonus for $ALPHA token
    const isAlphaToken =
      details.tokenOutSymbol === 'ALPHA' || details.tokenOutSymbol === '$ALPHA'
    let hotnessScoreWithBonus =
      (details.hotnessScore ?? 0) + (isAlphaToken ? 3 : 0)

    const clampedHotnessScore = Math.max(0, Math.min(hotnessScoreWithBonus, 10))

    if (details.tokenOutUsdAmount > 3000) {
      alertMessage = `🚨 KOL Move Alert 👀\n\n🔥 Hotness Score: ${clampedHotnessScore.toFixed(1)}/10\n\nWallet tied to ${details.influencerUsername} just bought $${formattedValue} of $${details.tokenOutSymbol} at $${formattedMarketCap} MC 🐋\n\n`
    }

    logger.info(`alertMessage==============', ${alertMessage}`)

    // Update hotness score in database if ALPHA token (with +3 bonus)
    if (isAlphaToken) {
      try {
        await influencerWhaleTransactionsModelV2.updateOne(
          { signature },
          { $set: { hotnessScore: clampedHotnessScore } },
        )
        logger.info(
          `✅ Updated hotness score for ALPHA token: ${clampedHotnessScore}`,
        )
      } catch (error) {
        logger.error({ error }, 'Error updating hotness score for ALPHA token')
      }
    }

    // Post to twitter
    if (alertMessage) {
      await postKOLAlertToTwitter(alertMessage, signature)
    }
  }
}

const processInfluencerSignature = async (
  signatureJson: any,
): Promise<void> => {
  // ) => {
  if (!signatureJson) {
    logger.error(
      '❌ processSignature called KOL with null/undefined signatureJson',
    )
    return
  }

  let parsedData
  try {
    parsedData = JSON.parse(signatureJson)
  } catch (error) {
    logger.error(
      { error, signatureJson },
      '❌ Failed to parse signatureJson KOL',
    )
    return
  }

  const { signature, kolAddress, transactionData } = parsedData

  // ✅ Validate parsed data
  if (!signature || !kolAddress) {
    logger.error(
      { parsedData },
      '❌ Missing required fields in parsed data KOL',
    )
    return
  }
  logger.info(`signature KOL : ${signature}`)
  logger.info(`kolAddress KOL : ${kolAddress}`)

  try {
    // ✅ Add Redis-based duplicate check for race condition prevention
    const duplicateKey = `processing_signature_kol:${signature}`
    const isProcessing = await redisClient.set(
      duplicateKey,
      '1',
      'EX',
      300,
      'NX',
    ) // 5 min TTL

    if (!isProcessing) {
      logger.info(
        `Transaction ${signature} is already being processed by another worker KOL. Skipping.`,
      )
      return
    }

    if (
      await influencerWhaleTransactionsModelV2
        .findOne({ signature })
        .select('signature')
        .lean()
    ) {
      logger.info(
        `Transaction ${signature} already exists in influencer. Skipping.`,
      )
      await redisClient.del(duplicateKey)
      return
    }

    let txStatus
    if (transactionData) {
      // Use transaction data from WebSocket notification
      logger.info('Using cached transaction data from WebSocket KOL')

      // ✅ Enhanced validation for transactionData
      if (
        !transactionData ||
        typeof transactionData !== 'object' ||
        !transactionData.transaction?.meta ||
        transactionData.transaction.meta.err !== null
      ) {
        logger.info(
          `Transaction ${signature} is invalid (from cache) KOL. Skipping.`,
        )
        return
      }

      txStatus = transactionData // Use cached data
    } else {
      // ✅ Add timeout and retry logic for RPC calls
      const maxRetries = 3
      let retryCount = 0

      while (retryCount < maxRetries) {
        try {
          const statuses = (await Promise.race([
            solConnection.getSignatureStatuses([signature]),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('RPC timeout')), 10000),
            ),
          ])) as any

          if (!statuses.value[0] || statuses.value[0].err !== null) {
            logger.info(`Transaction ${signature} is invalid. Skipping. KOL`)
            return
          }

          txStatus = (await Promise.race([
            solConnection.getParsedTransaction(signature, {
              maxSupportedTransactionVersion: 0,
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('RPC timeout')), 15000),
            ),
          ])) as any

          if (!txStatus || !txStatus.meta || txStatus.meta.err !== null) {
            logger.info(`Transaction ${signature} is invalid. Skipping. KOL`)
            return
          }

          break // Success, exit retry loop
        } catch (error) {
          retryCount++
          logger.warn(
            `RPC call failed (attempt ${retryCount}/${maxRetries}) KOL: ${String(error)}`,
          )

          if (retryCount >= maxRetries) {
            logger.error(
              `Transaction ${signature} failed after ${maxRetries} retries KOL. Skipping.`,
            )
            return
          }

          // Wait before retry (exponential backoff)
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, retryCount) * 1000),
          )
        }
      }
    }

    logger.info(pc.cyan(`\n⚡ Processing signature: ${signature}`))

    const parsedData = await Promise.race([
      getParsedTransactions(signature),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('getParsedTransactions timeout KOL')),
          20000,
        ),
      ),
    ]).catch(async (e) => {
      logger.error({ e }, 'RPCError:')

      // ✅ Retry logic for getParsedTransactions
      const maxRetries = 2
      for (let i = 1; i <= maxRetries; i++) {
        try {
          logger.info(
            `Retrying getParsedTransactions (attempt ${i}/${maxRetries}) KOL`,
          )
          await new Promise((resolve) => setTimeout(resolve, i * 2000)) // Wait before retry

          const retryData = await Promise.race([
            getParsedTransactions(signature),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('getParsedTransactions timeout KOL')),
                20000,
              ),
            ),
          ])

          logger.info(`✅ getParsedTransactions succeeded on retry ${i} KOL`)
          return retryData
        } catch (retryError) {
          logger.warn(`Retry ${i} failed: ${String(retryError)}`)
          if (i === maxRetries) {
            logger.error(`All retries failed for getParsedTransactions`)
            return null
          }
        }
      }
      return null
    })

    if (!parsedData) return

    const parsedTx = JSON.parse(parsedData)

    logger.info(`TX Type KOL: ${parsedTx.result?.type}`)

    // Check if transaction succeeded
    if (!parsedTx.success) {
      logger.info(`KOL [Filter] Skipping ${signature}: Transaction failed`)
      return
    }

    // Instead of checking transaction type, check for swap indicators
    const tokenBalanceChanges = parsedTx.result?.token_balance_changes || []
    const hasSwapIndicators = tokenBalanceChanges.length >= 2

    if (!hasSwapIndicators) {
      logger.info(
        `KOL [Filter] Skipping ${signature}: No swap indicators found (${tokenBalanceChanges.length} balance changes)`,
      )
      return
    }

    logger.info(
      `✅ Swap detected via token balance changes (${tokenBalanceChanges.length} changes)`,
    )

    const actions = parsedTx?.result?.actions

    if (!actions || actions.length === 0) {
      logger.info(`KOL [Filter] Skipping ${signature}: No actions found.`)
      return
    }

    const protocolName = parsedTx.result.protocol?.name || 'Unknown'
    const gasFee = parsedTx.result.fee
    const swapper = parsedTx.result.signers[0] || kolAddress

    let tokenIn: any = null
    let tokenOut: any = null
    let swapSource: 'tokens_swapped' | 'token_balance' | 'token_transfer' =
      'tokens_swapped'

    const actionInfo = actions[0]?.info

    if (actionInfo?.tokens_swapped) {
      tokenIn = actionInfo.tokens_swapped.in
      tokenOut = actionInfo.tokens_swapped.out
      swapSource = 'tokens_swapped'
      logger.info(`✅ Swap data extracted from: tokens_swapped`)
    } else if (
      parsedTx.result?.token_balance_changes &&
      parsedTx.result.token_balance_changes.length > 0
    ) {
      logger.info(
        `⚠️ tokens_swapped not found. Checking token_balance_changes...`,
      )

      const balanceChanges = parsedTx.result.token_balance_changes.filter(
        (change: any) => change.owner === swapper && change.change_amount !== 0,
      )

      // Negative change = token OUT, Positive change = token IN
      const tokenSentChange = balanceChanges.find(
        (c: any) => c.change_amount < 0,
      )
      const tokenReceivedChange = balanceChanges.find(
        (c: any) => c.change_amount > 0,
      )

      if (tokenSentChange && tokenReceivedChange) {
        tokenIn = {
          token_address: tokenSentChange.mint,
          amount:
            Math.abs(tokenSentChange.change_amount) /
            Math.pow(10, tokenSentChange.decimals),
          symbol: tokenSentChange.symbol || 'Unknown',
          name: tokenSentChange.name || 'Unknown',
        }

        tokenOut = {
          token_address: tokenReceivedChange.mint,
          amount:
            tokenReceivedChange.change_amount /
            Math.pow(10, tokenReceivedChange.decimals),
          symbol: tokenReceivedChange.symbol || 'Unknown',
          name: tokenReceivedChange.name || 'Unknown',
        }
        swapSource = 'token_balance'
        logger.info(`✅ Swap data extracted from: token_balance_changes`)
      }
    } else {
      logger.info(
        `⚠️ tokens_swapped and token_balance_changes not found. Using TOKEN_TRANSFER fallback...`,
      )

      const transfers = actions.filter((a: any) => a.type === 'TOKEN_TRANSFER')

      const sentTransfer = transfers.find((t: any) => t.info.sender === swapper)
      const receivedTransfer = transfers.find(
        (t: any) => t.info.receiver === swapper,
      )

      if (sentTransfer && receivedTransfer) {
        tokenIn = {
          token_address: sentTransfer.info.token_address,
          amount: sentTransfer.info.amount,
          symbol: 'Unknown',
          name: 'Unknown',
        }

        tokenOut = {
          token_address: receivedTransfer.info.token_address,
          amount: receivedTransfer.info.amount,
          symbol: 'Unknown',
          name: 'Unknown',
        }
        swapSource = 'token_transfer'
        logger.info(`✅ Swap data extracted from: TOKEN_TRANSFER`)
      }
    }

    if (!tokenIn || !tokenOut) {
      logger.info(
        `KOL [Filter] Skipping ${signature}: Unable to extract swap data from any source.`,
      )
      return
    }

    logger.info(
      pc.blue(
        `Swap Source: ${swapSource} | ${tokenIn.symbol || tokenIn.token_address} -> ${tokenOut.symbol || tokenOut.token_address}`,
      ),
    )

    const [inSymbol, outSymbol] = await Promise.all([
      resolveSymbol(tokenIn),
      resolveSymbol(tokenOut),
    ])

    const inSymbolData =
      typeof inSymbol === 'string'
        ? { symbol: inSymbol, name: inSymbol }
        : inSymbol
    const outSymbolData =
      typeof outSymbol === 'string'
        ? { symbol: outSymbol, name: outSymbol }
        : outSymbol

    // Update token symbols if resolved
    if (tokenIn.symbol === 'Unknown') {
      tokenIn.symbol = inSymbolData.symbol
      tokenIn.name = inSymbolData.name
    }
    if (tokenOut.symbol === 'Unknown') {
      tokenOut.symbol = outSymbolData.symbol
      tokenOut.name = outSymbolData.name
    }

    const excludedTokens = ['SOL', 'WSOL', 'USDT', 'USDC', 'USD1']
    const excludedAddresses = [
      'So11111111111111111111111111111111111111112', // SOL/WSOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    ]


    // 1) Basic "excluded" checks
    const inputExcluded =
      excludedTokens.includes(tokenIn.symbol) ||
      excludedAddresses.includes(tokenIn.token_address)
    const outputExcluded =
      excludedTokens.includes(tokenOut.symbol) ||
      excludedAddresses.includes(tokenOut.token_address)
    const bothNonExcluded = !inputExcluded && !outputExcluded // spl to spl

    // 2) Now classify
    // Buy: receiving non-excluded token (or both non-excluded)
    // Sell: selling non-excluded token for excluded token (or both non-excluded)
    const isBuy = bothNonExcluded || (!outputExcluded && inputExcluded)
    const isSell = bothNonExcluded || (outputExcluded && !inputExcluded)

    if (!isBuy && !isSell) return

    logger.info(pc.blue(`Valid swap: ${tokenIn.symbol} -> ${tokenOut.symbol}`))

    let outTokenData: any = {}
    let inTokenData: any = {}
    let influencerHandle: any = {}
    let influencerData: any = null

    const solPrice = await getTokenPrice(
      'So11111111111111111111111111111111111111112',
    )

    try {
      const [out, inT, influencerDataResult] = await Promise.all([
        getTokenData(tokenOut.token_address),
        getTokenData(tokenIn.token_address),
        findInfluencerData(kolAddress),
      ])
      outTokenData = out
      inTokenData = inT
      influencerData = influencerDataResult
      influencerHandle = influencerData?.influencerUsername || null
      // }
    } catch (error) {
      logger.error({ error }, `Error fetching token data for ${signature}:`)
      return
    }

    // ✅ Fallback: If output token price is 0 but we have input token price,
    // estimate output price from swap ratio (for buy transactions)
    if (
      (outTokenData?.price === 0 || !outTokenData?.price) &&
      inTokenData?.price > 0 &&
      tokenOut.amount > 0
    ) {
      const estimatedOutPrice =
        (tokenIn.amount * inTokenData.price) / tokenOut.amount
      if (estimatedOutPrice > 0) {
        outTokenData.price = estimatedOutPrice
        logger.info(
          `⚠️ Output token price not found for ${tokenOut.token_address}, estimated from swap ratio: $${estimatedOutPrice.toFixed(8)}`,
        )
      }
    }

    // ✅ Fallback: If input token price is 0 but we have output token price,
    // estimate input price from swap ratio (for sell transactions)
    if (
      (inTokenData?.price === 0 || !inTokenData?.price) &&
      outTokenData?.price > 0 &&
      tokenIn.amount > 0
    ) {
      const estimatedInPrice =
        (tokenOut.amount * outTokenData.price) / tokenIn.amount
      if (estimatedInPrice > 0) {
        inTokenData.price = estimatedInPrice
        logger.info(
          `⚠️ Input token price not found for ${tokenIn.token_address}, estimated from swap ratio: $${estimatedInPrice.toFixed(8)}`,
        )
      }
    }

    const tokenInSolAmount =
      (tokenIn.amount * (inTokenData?.price || 0)) / solPrice
    const tokenOutSolAmount =
      (tokenOut.amount * (outTokenData?.price || 0)) / solPrice

    const buyTokenPriceSol = inTokenData?.price / solPrice || 0
    const sellTokenPriceSol = outTokenData?.price / solPrice || 0
    const buyMarketCapSol = inTokenData?.marketCap / solPrice || 0
    const sellMarketCapSol = outTokenData?.marketCap / solPrice || 0
    const gasFeeUSD = gasFee * solPrice || 0
    const tokenInUsdAmount = tokenIn.amount * (inTokenData?.price || 0)
    const tokenOutUsdAmount = tokenOut.amount * (outTokenData?.price || 0)

    // Debug logging for price issues
    if (tokenOutUsdAmount === 0 && isBuy && tokenInUsdAmount > 0) {
      logger.warn(
        `⚠️ Buy transaction ${signature}: Output token USD amount is 0 despite input value of $${tokenInUsdAmount.toFixed(2)}. Token: ${tokenOut.token_address}, Price: $${outTokenData?.price || 0}`,
      )
    }
    // Use influencer data from the model (updated by weekly cron job)
    let influencerName = influencerData?.influencerName || null
    let influencerFollowerCount = influencerData?.influencerFollowerCount || 0
    let influencerProfileImageUrl =
      influencerData?.influencerProfileImageUrl || null
    // Extract Values
    const tokenDetails = {
      signature,
      kolAddress,
      influencerName: influencerName,
      influencerUsername:
        influencerData?.influencerUsername || influencerHandle,
      influencerFollowerCount: influencerFollowerCount,
      influencerProfileImageUrl: influencerProfileImageUrl,
      tokenInSymbol: inSymbolData.symbol,
      tokenInName: inSymbolData.name,
      tokenOutSymbol: outSymbolData.symbol,
      tokenOutName: outSymbolData.name,
      tokenInAddress: tokenIn.token_address,
      tokenOutAddress: tokenOut.token_address,
      tokenInAmount: tokenIn.amount,
      tokenOutAmount: tokenOut.amount,
      tokenInPrice: inTokenData?.price,
      tokenOutPrice: outTokenData?.price,
      tokenInUsdAmount: tokenInUsdAmount,
      tokenOutUsdAmount: tokenOutUsdAmount,
      tokenInSolAmount: tokenInSolAmount,
      tokenOutSolAmount: tokenOutSolAmount,
      buyTokenPriceSol: buyTokenPriceSol,
      sellTokenPriceSol: sellTokenPriceSol,
      buyMarketCapSol: buyMarketCapSol,
      sellMarketCapSol: sellMarketCapSol,
      inMarketCap: inTokenData?.marketCap,
      outMarketCap: outTokenData?.marketCap,

      outTokenURL: outTokenData?.imageUrl || null,
      inTokenURL: inTokenData?.imageUrl || null,
      hotnessScore: 0,
      platform: protocolName,
      gasFee: gasFeeUSD,
    }

    // Calculate Transaction Value
    // const txValue = isSell
    //   ? tokenDetails.tokenInAmount * (inTokenData?.price || 0)
    //   : tokenDetails.tokenOutAmount * (outTokenData?.price || 0)
    // const tokenPrice = isSell ? inTokenData?.price : outTokenData?.price
    // const tokenAmount = isSell
    //   ? tokenDetails.tokenInAmount
    //   : tokenDetails.tokenOutAmount

    let txValue: number = 0
    let tokenPrice: number = 0
    let tokenAmount: number = 0

    let sellTxValue: number = 0
    let sellTokenPrice: number = 0
    let sellTokenAmt: number = 0

    let buyTxValue: number = 0
    let buyTokenPrice: number = 0
    let buyTokenAmt: number = 0

    if (isSell && !isBuy) {
      // Pure sell
      txValue = tokenDetails?.tokenInUsdAmount
      tokenPrice = tokenDetails?.tokenInPrice
      tokenAmount = tokenDetails?.tokenInAmount
    }
    if (isBuy && !isSell) {
      // Pure buy
      txValue = tokenDetails?.tokenOutUsdAmount
      tokenPrice = tokenDetails?.tokenOutPrice
      tokenAmount = tokenDetails?.tokenOutAmount
    }
    if (isSell && isBuy) {
      sellTxValue = tokenDetails?.tokenInUsdAmount
      sellTokenPrice = tokenDetails?.tokenInPrice
      sellTokenAmt = tokenDetails?.tokenInAmount

      buyTxValue = tokenDetails?.tokenOutUsdAmount
      buyTokenPrice = tokenDetails?.tokenOutPrice
      buyTokenAmt = tokenDetails?.tokenOutAmount
    }

    // Log only relevant transaction details based on buy/sell
    if (isSell) {
      logger.info(
        pc.yellow(
          `Sell Transaction: In Token ${tokenDetails.tokenInSymbol}: ${tokenDetails.tokenInAmount} at $${tokenDetails.tokenInPrice || 0} => Value: $${tokenDetails.tokenInUsdAmount.toFixed(2)}`,
        ),
      )
    }
    if (isBuy) {
      const buyValue = isSell ? buyTxValue : txValue
      const buyPrice = isSell ? buyTokenPrice : tokenPrice
      logger.info(
        pc.green(
          `Buy Transaction: Out Token ${tokenDetails.tokenOutSymbol}: ${tokenDetails.tokenOutAmount} at $${buyPrice || tokenDetails.tokenOutPrice || 0} => Value: $${(buyValue || tokenDetails.tokenOutUsdAmount || 0).toFixed(2)}`,
        ),
      )
    }

    // if (txValue < 10) return
    if (
      txValue != null &&
      txValue < 10 &&
      sellTxValue != null &&
      sellTxValue < 10 &&
      buyTxValue != null &&
      buyTxValue < 10
    ) {
      return
    }

    // logger.info(pc.cyan(`Transaction Value: $${txValue.toFixed(2)}`))

    // Store buy/sell transaction grater then $10 in MongoDB (If it doesn't exist)
    try {
      if (isBuy) {
        if (
          (txValue > 10 || buyTxValue > 10) &&
          (txValue < 140 || buyTxValue < 140)
        ) {
          await storeRepeatedTransactions(
            tokenDetails.tokenOutAddress,
            tokenDetails.kolAddress,
            signature,
            txValue > 0 ? txValue : buyTxValue,
          )
        }
      }

      if (txValue > 10 || sellTxValue > 10 || buyTxValue > 10) {
        if (isBuy) {
          const hotnessScore = await getKolHotnessScore(
            signature,
            tokenDetails.kolAddress,
            tokenDetails.tokenOutUsdAmount,
            tokenDetails.outMarketCap,
            tokenDetails.tokenOutAddress,
            tokenDetails.influencerFollowerCount,
          )
          tokenDetails.hotnessScore! = Number(hotnessScore)
        }
        await storeInfluencerTransactionInDB(
          signature,
          tokenDetails,
          isBuy,
          isSell,
          parsedTx,
          txStatus,
        )
      }

      // // Check & Post Alerts to alpha whale
      if (isBuy) {
        await checkAndPostKOLAlert(tokenDetails, isBuy, signature)
      }
    } catch (error) {
      logger.error({ error }, `Error processing transaction ${signature}:`)
    }
  } catch (err) {
    logger.error({ err }, `Error processing signature ${signature}: KOL`)
  } finally {
    try {
      // ✅ Clean up Redis processing key
      const duplicateKey = `processing_signature_kol:${signature}`
      await redisClient.del(duplicateKey)

      await redisClient.srem(
        'influencer_whale_signatures',
        JSON.stringify({ signature, kolAddress }),
      )
      logger.info(`Signature removed from Redis: ${signature} KOL`)

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }
    } catch (cleanupError) {
      logger.error(
        { cleanupError },
        `Error cleaning up signature ${signature}: KOL`,
      )
    }
  }
}

export const storeRepeatedTransactions = async (
  tokenAddress: string,
  kolAddress: string,
  txnSignature: string,
  amount: number,
) => {
  const smallBuyThreshold = 1_000
  const dailySmallBuyLimit = 2

  try {
    if (amount >= smallBuyThreshold) return
    const now = new Date()
    // const utcStart = startOfDay(d);
    // const utcEnd   = endOfDay(d);

    const start = startOfUTCDay(now)
    const end = endOfUTCDay(now)

    const todayCount = await kolPurchaseRecordModel.countDocuments({
      tokenAddress,
      kolAddress,
      amount: { $lt: smallBuyThreshold },
      timestamp: { $gte: start, $lte: end },
    })
    if (todayCount >= dailySmallBuyLimit) {
      return
    }
    const isDailyLimitReached = todayCount + 1 >= dailySmallBuyLimit
    await kolPurchaseRecordModel.create({
      tokenAddress,
      kolAddress,
      txnSignature,
      amount,
      timestamp: now,
      isDailyLimitReached,
    })
  } catch (err: any) {
    logger.error('Error while storing repeated transactions', err)
  }
}

const NORMAL_CONCURRENCY = 2 // Concurrency for smaller batches (< 500)
const CHUNK_CONCURRENCY = 1 // Concurrency for large batches (> 500)
const CHUNK_SIZE = 100 // Number of signatures to process per chunk

// get signature details
export const getInfluencerSignatureDetails = async (): Promise<void> => {
  try {
    logger.info(' Starting signature processing influencer_whale_signatures...')

    // Check Redis memory usage first
    const signatureCount = await redisClient.scard(
      'influencer_whale_signatures',
    )
    logger.info(`📊 Found ${signatureCount} signatures in Redis`)

    if (signatureCount === 0) {
      logger.info('✅ No signatures to process')
      return
    }

    const { default: pLimit } = await import('p-limit')

    // If too many signatures, process in smaller chunks
    // if (signatureCount > 500) {
    //   logger.info(
    //     `⚠️ Large dataset detected (${signatureCount} signatures). Processing in chunks...`,
    //   )
    //   await processSignaturesKolInChunks(pLimit(CHUNK_CONCURRENCY))
    // } else {
    // For smaller datasets, use the original approach
    await processSignaturesKolNormally(pLimit(NORMAL_CONCURRENCY))
    // }
  } catch (err) {
    logger.error({ err }, 'Error:')
  }
}

const processSignaturesKolNormally = async (limit: any) => {
  const signatures: string[] = await redisClient.smembers(
    'influencer_whale_signatures',
  )
  logger.info(`📦 Processing ${signatures.length} signatures normally`)

  if (signatures.length === 0) return

  await connectDB()

  const tasks = signatures.map((signatureJson) =>
    limit(() => processInfluencerSignature(signatureJson)),
  )

  await Promise.all(tasks)
  logger.info(`✅ Processed ${signatures.length} signatures normally`)
}

// Process signatures in chunks (for large datasets)
const processSignaturesKolInChunks = async (limit: any) => {
  let processedCount = 0
  let cursor = '0'
  let hasMore = true

  while (hasMore) {
    // Get chunk of signatures
    const [nextCursor, signatures] = await redisClient.sscan(
      'influencer_whale_signatures',
      cursor,
      'COUNT',
      CHUNK_SIZE,
    )

    if (signatures.length === 0) {
      hasMore = false
      break
    }

    logger.info(`📦 Processing chunk: ${signatures.length} signatures`)

    // Process this chunk
    await connectDB()

    const tasks = signatures.map((signatureJson) =>
      limit(() => processInfluencerSignature(signatureJson)),
    )

    await Promise.all(tasks)
    processedCount += signatures.length

    logger.info(`✅ Chunk completed. Total processed: ${processedCount}`)
    cursor = nextCursor
    if (cursor === '0') {
      hasMore = false
    }
    // Small delay between chunks
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  logger.info(`🎉 All chunks completed. Total processed: ${processedCount}`)
}

export const getAllInfluencerWhaleTransactions = async (
  page: number = 1,
  limit: number = 50,
  filters: {
    searchQuery?: string
    searchType?: 'kol' | 'coin' | 'all' // New parameter to specify search type
    hotness?: string | null
    transactionType?: string | null
    amount?: string | null
    ageMin?: string | null
    ageMax?: string | null
    marketCapMin?: string | null
    marketCapMax?: string | null
  } = {},
) => {
  try {
    const startTime = Date.now()
    const skip = (page - 1) * limit

    const filterQuery: any = {}
    const orConditions: any[] = []

    // Search query filter with intelligent search type detection
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const searchQuery = filters.searchQuery.trim()
      const searchTerms = searchQuery
        .split(/[,\s]+/)
        .map((term) => term.trim())
        .filter((term) => term.length > 0)

      logger.info(`🔍 Parsed search terms:', ${searchTerms}`)

      // Enhanced search type detection for multiple terms
      let searchType = filters.searchType || 'all'

      // For multiple terms, analyze the mix to determine best strategy
      if (!filters.searchType && searchTerms.length > 1) {
        const termTypes = searchTerms.map((term) => {
          const cleanTerm = term.startsWith('@') ? term.slice(1) : term

          // Check for addresses
          const isSolanaAddress =
            cleanTerm.length >= 32 &&
            cleanTerm.length <= 44 &&
            cleanTerm.match(/^[1-9A-HJ-NP-Za-km-z]+$/)
          const isEthereumAddress =
            cleanTerm.startsWith('0x') && cleanTerm.length > 20

          if (isSolanaAddress || isEthereumAddress) return 'coin'
          if (
            term.startsWith('@') ||
            (!cleanTerm.match(/^[A-Z0-9]+$/) && cleanTerm.length > 2)
          )
            return 'kol'
          if (cleanTerm.length <= 10 && cleanTerm.match(/^[A-Z0-9]+$/))
            return 'coin'

          return 'mixed'
        })

        // If all terms are of the same type, use that type; otherwise use 'all'
        const uniqueTypes = [...new Set(termTypes)]
        if (uniqueTypes.length === 1 && uniqueTypes[0] !== 'mixed') {
          searchType = uniqueTypes[0]
        }
      } else if (!filters.searchType && searchTerms.length === 1) {
        // Single term auto-detection (existing logic)
        const term = searchTerms[0]
        const cleanTerm = term.startsWith('@') ? term.slice(1) : term

        const isSolanaAddress =
          cleanTerm.length >= 32 &&
          cleanTerm.length <= 44 &&
          cleanTerm.match(/^[1-9A-HJ-NP-Za-km-z]+$/)
        const isEthereumAddress =
          cleanTerm.startsWith('0x') && cleanTerm.length > 20
        const isContractAddress = isSolanaAddress || isEthereumAddress

        const isLikelyUsername =
          term.startsWith('@') ||
          (!cleanTerm.includes(' ') &&
            !cleanTerm.match(/^[A-Z0-9]+$/) &&
            cleanTerm.length > 2)
        const isLikelySymbol =
          cleanTerm.length <= 10 && cleanTerm.match(/^[A-Z0-9]+$/)

        if (isContractAddress || isLikelySymbol) {
          searchType = 'coin'
        } else if (isLikelyUsername) {
          searchType = 'kol'
        }
      }

      // FIXED: Build search conditions for all terms (flattened structure)
      for (const term of searchTerms) {
        const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const termRegex = new RegExp(escapedTerm, 'i')
        console.log('termRegex : ', termRegex)

        // Handle username search (remove @ if present)
        const cleanTerm = term.startsWith('@') ? term.slice(1) : term
        const cleanEscapedTerm = cleanTerm.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&',
        )

        // Add conditions based on search type - DIRECTLY to orConditions array
        if (searchType === 'all' || searchType === 'kol') {
          const usernamePatterns = [
            { influencerUsername: { $regex: escapedTerm, $options: 'i' } }, // Exact as entered
            { influencerUsername: { $regex: cleanEscapedTerm, $options: 'i' } }, // Without @
            {
              influencerUsername: {
                $regex: `^@?${cleanEscapedTerm}$`,
                $options: 'i',
              },
            }, // With optional @

            { influencerName: termRegex }, // Name search
            {
              influencerName: {
                $regex: `^${cleanEscapedTerm}$`,
                $options: 'i',
              },
            },
          ]
          // KOL/Influencer conditions
          orConditions.push(...usernamePatterns)
        }

        if (searchType === 'all' || searchType === 'coin') {
          // Coin/Token conditions
          orConditions.push(
            { whaleTokenSymbol: termRegex },
            { tokenInSymbol: termRegex },
            { tokenOutSymbol: termRegex },
            { whaleAddress: termRegex },
            { tokenInAddress: termRegex },
            { tokenOutAddress: termRegex },
            { 'transaction.tokenIn.address': termRegex },
            { 'transaction.tokenOut.address': termRegex },
            { 'transaction.tokenIn.symbol': termRegex },
            { 'transaction.tokenOut.symbol': termRegex },
          )
        }
      }

      logger.info(
        `🔍 Total OR conditions: ${orConditions.length} for ${searchTerms.length} terms`,
      )
    }
    // Combine $or conditions if we have multiple
    if (orConditions.length > 0) {
      filterQuery.$or = orConditions
    }

    // Amount filter - separate from $or conditions
    if (filters.amount) {
      const amountThreshold = parseFloat(filters.amount)
      if (!isNaN(amountThreshold)) {
        // Handle amount filter with proper string to number conversion
        const amountConditions = {
          $or: [
            {
              $expr: {
                $gte: [
                  {
                    $cond: [
                      { $eq: [{ $type: '$amount.buyAmount' }, 'string'] },
                      { $toDouble: '$amount.buyAmount' },
                      0,
                    ],
                  },
                  amountThreshold,
                ],
              },
            },
            {
              $expr: {
                $gte: [
                  {
                    $cond: [
                      { $eq: [{ $type: '$amount.sellAmount' }, 'string'] },
                      { $toDouble: '$amount.sellAmount' },
                      0,
                    ],
                  },
                  amountThreshold,
                ],
              },
            },
          ],
        }

        // If we already have $or conditions, we need to combine them properly
        if (filterQuery.$or) {
          // Create a new filterQuery to avoid circular references
          const newFilterQuery = { ...filterQuery }
          filterQuery.$and = [{ $or: newFilterQuery.$or }, amountConditions]
          delete filterQuery.$or
        } else {
          Object.assign(filterQuery, amountConditions)
        }
      }
    }

    // Transaction type filter
    if (filters.transactionType) {
      filterQuery.type = filters.transactionType
    }

    // Hotness score filter
    if (filters.hotness) {
      switch (filters.hotness) {
        case 'high':
          filterQuery.hotnessScore = { $gte: 8, $lte: 10 }
          break
        case 'medium':
          filterQuery.hotnessScore = { $gte: 5, $lte: 7 }
          break
        case 'low':
          filterQuery.hotnessScore = { $gte: 1, $lte: 4 }
          break
      }
    }

    // Age filter (in minutes) - filter by token creation age
    if (filters.ageMin || filters.ageMax) {
      const ageQuery: any = {}
      const now = new Date()

      if (filters.ageMin) {
        const minAgeMs = parseInt(filters.ageMin) * 60 * 1000 // Convert minutes to milliseconds
        ageQuery.$lte = new Date(now.getTime() - minAgeMs)
        logger.info(
          `🕐 Age Min: ${filters.ageMin}m = ${minAgeMs}ms = ${new Date(now.getTime() - minAgeMs)}`,
        )
      }

      if (filters.ageMax) {
        const maxAgeMs = parseInt(filters.ageMax) * 60 * 1000 // Convert minutes to milliseconds
        ageQuery.$gte = new Date(now.getTime() - maxAgeMs)
        logger.info(
          `🕐 Age Max: ${filters.ageMax}m = ${maxAgeMs}ms = ${new Date(now.getTime() - maxAgeMs)}`,
        )
      }

      filterQuery.age = ageQuery
      logger.info(`🕐 Age Filter Query:`, ageQuery)
    }

    // Market Cap filter (in K - thousands)
    if (filters.marketCapMin || filters.marketCapMax) {
      // Convert user input from K to actual values for comparison
      const minMarketCap = filters.marketCapMin
        ? parseFloat(filters.marketCapMin) * 1000
        : null
      const maxMarketCap = filters.marketCapMax
        ? parseFloat(filters.marketCapMax) * 1000
        : null

      logger.info(
        `💰 Market Cap Filter: User input Min: ${filters.marketCapMin}k, Max: ${filters.marketCapMax}k`,
      )
      logger.info(
        `💰 Market Cap Filter: Converted Min: ${minMarketCap}, Max: ${maxMarketCap}`,
      )
      logger.info(
        `💰 Transaction Type Filter: ${filters.transactionType || 'all'}`,
      )

      // Create market cap conditions based on transaction type
      let marketCapConditions: any = {}

      if (filters.transactionType === 'buy') {
        logger.info(
          `💰 Applying BUY market cap filter: Only checking buyMarketCap`,
        )
        // For buy transactions, only check buyMarketCap
        marketCapConditions = {
          $expr: {
            $and: [
              { $ne: ['$marketCap.buyMarketCap', null] },
              { $ne: ['$marketCap.buyMarketCap', ''] },
              { $isNumber: { $toDouble: '$marketCap.buyMarketCap' } },
              ...(minMarketCap
                ? [
                  {
                    $gte: [
                      { $toDouble: '$marketCap.buyMarketCap' },
                      minMarketCap,
                    ],
                  },
                ]
                : []),
              ...(maxMarketCap
                ? [
                  {
                    $lte: [
                      { $toDouble: '$marketCap.buyMarketCap' },
                      maxMarketCap,
                    ],
                  },
                ]
                : []),
            ],
          },
        }
      } else if (filters.transactionType === 'sell') {
        logger.info(
          `💰 Applying SELL market cap filter: Only checking sellMarketCap`,
        )
        // For sell transactions, only check sellMarketCap
        marketCapConditions = {
          $expr: {
            $and: [
              { $ne: ['$marketCap.sellMarketCap', null] },
              { $ne: ['$marketCap.sellMarketCap', ''] },
              { $isNumber: { $toDouble: '$marketCap.sellMarketCap' } },
              ...(minMarketCap
                ? [
                  {
                    $gte: [
                      { $toDouble: '$marketCap.sellMarketCap' },
                      minMarketCap,
                    ],
                  },
                ]
                : []),
              ...(maxMarketCap
                ? [
                  {
                    $lte: [
                      { $toDouble: '$marketCap.sellMarketCap' },
                      maxMarketCap,
                    ],
                  },
                ]
                : []),
            ],
          },
        }
      } else {
        logger.info(
          `💰 Applying ALL market cap filter: Checking both buyMarketCap AND sellMarketCap`,
        )
        // For all transactions (no type filter), check both buy and sell market caps
        marketCapConditions = {
          $or: [
            {
              $expr: {
                $and: [
                  { $ne: ['$marketCap.buyMarketCap', null] },
                  { $ne: ['$marketCap.buyMarketCap', ''] },
                  { $isNumber: { $toDouble: '$marketCap.buyMarketCap' } },
                  ...(minMarketCap
                    ? [
                      {
                        $gte: [
                          { $toDouble: '$marketCap.buyMarketCap' },
                          minMarketCap,
                        ],
                      },
                    ]
                    : []),
                  ...(maxMarketCap
                    ? [
                      {
                        $lte: [
                          { $toDouble: '$marketCap.buyMarketCap' },
                          maxMarketCap,
                        ],
                      },
                    ]
                    : []),
                ],
              },
            },
            {
              $expr: {
                $and: [
                  { $ne: ['$marketCap.sellMarketCap', null] },
                  { $ne: ['$marketCap.sellMarketCap', ''] },
                  { $isNumber: { $toDouble: '$marketCap.sellMarketCap' } },
                  ...(minMarketCap
                    ? [
                      {
                        $gte: [
                          { $toDouble: '$marketCap.sellMarketCap' },
                          minMarketCap,
                        ],
                      },
                    ]
                    : []),
                  ...(maxMarketCap
                    ? [
                      {
                        $lte: [
                          { $toDouble: '$marketCap.sellMarketCap' },
                          maxMarketCap,
                        ],
                      },
                    ]
                    : []),
                ],
              },
            },
          ],
        }
      }

      logger.info(
        `💰 Market Cap Filter Query:,
       ${JSON.stringify(marketCapConditions, null, 2)}`,
      )

      // Combine with existing filters using $and if we already have $or conditions
      if (filterQuery.$and) {
        filterQuery.$and.push(marketCapConditions)
      } else if (Object.keys(filterQuery).length > 0) {
        // Create a new filterQuery to avoid circular references
        const newFilterQuery = { ...filterQuery }
        filterQuery.$and = [newFilterQuery, marketCapConditions]
      } else {
        Object.assign(filterQuery, marketCapConditions)
      }

      // Add debug logging for the final filter query
      logger.info(
        `🔍 Final Filter Query:,
        ${JSON.stringify(filterQuery, null, 2)}`,
      )
    }

    // logger.info('🔍 Filter query:', JSON.stringify(filterQuery, null, 2))
    logger.info(`📊 Query params:', ${{ page, limit, skip, filters }}`)
    logger.info(
      `🔍 Final Filter Query:', ${JSON.stringify(filterQuery, null, 2)}`,
    )

    const [transactions, total] = await Promise.all([
      influencerWhaleTransactionsModelV2
        .find(filterQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .allowDiskUse(true)
        .lean(),
      influencerWhaleTransactionsModelV2.countDocuments(filterQuery),
    ])

    const endTime = Date.now()
    const queryTime = endTime - startTime

    logger.info(
      `📦 Page ${page} | Found: ${transactions.length} / ${total} with filters | Query time: ${queryTime}ms`,
    )

    return {
      transactions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      queryTime,
    }
  } catch (err) {
    logger.error({ err }, '❌ Error in getAllWhaleTransactions:')
    throw err
  }
}

const upsertKolHotnessScoreDetails = async (
  tokenAddress: string,
  kolAddress: string,
  txSignature: string,
) => {
  try {
    const existing = await kolHotnessScoreModel.findOne({ tokenAddress }).lean()
    if (!existing) {
      await kolHotnessScoreModel.create({
        tokenAddress,
        firstBuyTxnSignature: txSignature,
        uniqueKolAddresses: [kolAddress],
        isFirstBuyCompleted: true,
        createTimestamp: new Date(),
      })
      return 'Created new hotness record'
    }
    if (existing.uniqueKolAddresses.includes(kolAddress)) {
      return 'Skipped: whale address already added'
    }
    if (existing.uniqueKolAddresses.length >= 5) {
      return 'Skipped: already 5 whale addresses'
    }
    await kolHotnessScoreModel.updateOne(
      { tokenAddress },
      {
        $addToSet: { uniqueKolAddresses: kolAddress },
      },
    )
  } catch (err: any) {
    logger.error(`error updating the hotness score`, err)
  }
}

export const visualizeKols = async (req: any, res: any) => {
  try {
    const { timeframe = '15m', minWhales = 2, minInflow = 5000 } = req.query

    // convert timeframe (e.g. "15m") into minutes
    const minutes = parseInt(timeframe.replace('m', ''), 10)
    const cutoff = new Date(Date.now() - minutes * 60 * 1000)

    // fetch transactions in timeframe
    const txs = await influencerWhaleTransactionsModelV2
      .find({
        timestamp: { $gte: cutoff },
      })
      .lean()

    // group by token (tokenOut mostly = coin bought)

    const tokenMap: Record<string, any> = {}

    txs.forEach((tx) => {
      const tokenId = tx.tokenOutAddress || tx.tokenInAddress
      if (!tokenId) return

      if (!tokenMap[tokenId]) {
        tokenMap[tokenId] = {
          coin: {
            id: tokenId,
            symbol:
              tx.transaction.tokenOut?.symbol || tx.transaction.tokenIn?.symbol,
            name: tx.transaction.tokenOut?.name || tx.transaction.tokenIn?.name,
            imageUrl:
              tx.transaction.tokenOut?.imageUrl ||
              tx.transaction.tokenIn?.imageUrl,
            totalBuyInflow: 0,
          },
          whales: {},
          transactions: [],
        }
      }

      const tokenData = tokenMap[tokenId]

      // whale info
      const whaleId = tx.whaleAddress
      if (!tokenData.whales[whaleId]) {
        tokenData.whales[whaleId] = {
          id: whaleId,
          address: whaleId,
          buyVolume: 0,
          sellVolume: 0,
          lastAction: tx.timestamp,
        }
      }
      logger.info('🐳 Token data before pushing transaction:', tokenData)

      // aggregate buy/sell
      const usdAmount =
        tx.type === 'buy'
          ? Number(tx.transaction.tokenOut?.usdAmount || 0)
          : Number(tx.transaction.tokenIn?.usdAmount || 0)

      logger.info(`🐳 Usd amount:', ${usdAmount}`)

      if (tx.type === 'buy') {
        tokenData.coin.totalBuyInflow += usdAmount
        tokenData.whales[whaleId].buyVolume += usdAmount
      } else {
        tokenData.whales[whaleId].sellVolume += usdAmount
      }
      logger.info('🐳 Token data after aggregation:', tokenData)
      // update last action
      tokenData.whales[whaleId].lastAction = tx.timestamp

      // push transaction link
      tokenData.transactions.push({
        whaleId,
        type: tx.type,
        amount: usdAmount,
      })
      logger.info('🐳 Token data after pushing transaction:', tokenData)
    })

    // filter by whales + inflow
    const result = Object.values(tokenMap).filter(
      (t: any) =>
        Object.keys(t.whales).length >= Number(minWhales) &&
        t.coin.totalBuyInflow >= Number(minInflow),
    )

    return res.status(200).json({ success: true, data: result })
  } catch (error) {
    logger.error({ error }, '❌ Error in visualizeWhales:')
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error' })
  }
}

export const visualizeKolsV2 = async (req: any, res: any) => {
  try {
    const { timeframe = '15m', minKols = 2, minInflow = 0 } = req.query
    const minutes = parseInt(timeframe.replace('m', ''), 10)
    const cutoff = new Date(Date.now() - minutes * 60 * 1000)

    const result = await influencerWhaleTransactionsModelV2.aggregate([
      { $match: { timestamp: { $gte: cutoff } } },

      // 🔄 Expand "both" into two transactions (buy + sell)
      {
        $facet: {
          trades: [
            {
              $match: { type: { $in: ['buy', 'sell'] } },
            },
            {
              $project: {
                tokenId: {
                  $cond: [
                    { $eq: ['$type', 'buy'] },
                    '$tokenOutAddress', // For buy: tokenOut is the token being bought
                    '$tokenInAddress', // For sell: tokenIn is the token being sold
                  ],
                },
                whaleId: '$whaleAddress',
                type: '$type',
                timestamp: 1,
                // Fix: Use actual data structure from your database
                usdAmount: {
                  $cond: [
                    { $eq: ['$type', 'buy'] },
                    { $toDouble: { $ifNull: ['$amount.buyAmount', '0'] } },
                    { $toDouble: { $ifNull: ['$amount.sellAmount', '0'] } },
                  ],
                },
                symbol: {
                  $cond: [
                    { $eq: ['$type', 'buy'] },
                    '$tokenOutSymbol',
                    '$tokenInSymbol',
                  ],
                },
                name: {
                  $cond: [
                    { $eq: ['$type', 'buy'] },
                    '$tokenOutSymbol', // Using symbol as name since name field not in your data
                    '$tokenInSymbol',
                  ],
                },
                imageUrl: {
                  $cond: [
                    { $eq: ['$type', 'buy'] },
                    '$outTokenURL',
                    '$inTokenURL',
                  ],
                },
                // Include influencer fields
                influencerName: '$influencerName',
                influencerUsername: '$influencerUsername',
                influencerProfileImageUrl: '$influencerProfileImageUrl',
                influencerFollowerCount: '$influencerFollowerCount',
              },
            },
          ],
          bothTrades: [
            {
              $match: { type: 'both' },
            },
            {
              $project: {
                whaleId: '$whaleAddress',
                timestamp: 1,
                buyTrade: {
                  tokenId: '$tokenOutAddress',
                  type: 'buy',
                  usdAmount: {
                    $toDouble: { $ifNull: ['$amount.buyAmount', '0'] },
                  },
                  symbol: '$tokenOutSymbol',
                  name: '$tokenOutSymbol',
                  imageUrl: '$outTokenURL',
                },
                sellTrade: {
                  tokenId: '$tokenInAddress',
                  type: 'sell',
                  usdAmount: {
                    $toDouble: { $ifNull: ['$amount.sellAmount', '0'] },
                  },
                  symbol: '$tokenInSymbol',
                  name: '$tokenInSymbol',
                  imageUrl: '$inTokenURL',
                },
              },
            },
            {
              $project: {
                expanded: [
                  {
                    tokenId: '$buyTrade.tokenId',
                    whaleId: '$whaleId',
                    type: '$buyTrade.type',
                    usdAmount: '$buyTrade.usdAmount',
                    symbol: '$buyTrade.symbol',
                    name: '$buyTrade.name',
                    imageUrl: '$buyTrade.imageUrl',
                    timestamp: '$timestamp',
                    // Include influencer fields
                    influencerName: '$influencerName',
                    influencerUsername: '$influencerUsername',
                    influencerProfileImageUrl: '$influencerProfileImageUrl',
                    influencerFollowerCount: '$influencerFollowerCount',
                  },
                  {
                    tokenId: '$sellTrade.tokenId',
                    whaleId: '$whaleId',
                    type: '$sellTrade.type',
                    usdAmount: '$sellTrade.usdAmount',
                    symbol: '$sellTrade.symbol',
                    name: '$sellTrade.name',
                    imageUrl: '$sellTrade.imageUrl',
                    timestamp: '$timestamp',
                    // Include influencer fields
                    influencerName: '$influencerName',
                    influencerUsername: '$influencerUsername',
                    influencerProfileImageUrl: '$influencerProfileImageUrl',
                    influencerFollowerCount: '$influencerFollowerCount',
                  },
                ],
              },
            },
            { $unwind: '$expanded' },
            { $replaceRoot: { newRoot: '$expanded' } },
          ],
        },
      },

      // 🔗 Merge back trades + bothTrades
      {
        $project: {
          allTrades: { $concatArrays: ['$trades', '$bothTrades'] },
        },
      },
      { $unwind: '$allTrades' },
      { $replaceRoot: { newRoot: '$allTrades' } },

      // 🐳 Group by whale per token
      {
        $group: {
          _id: { tokenId: '$tokenId', whaleId: '$whaleId' },
          trades: {
            $push: {
              type: '$type',
              amount: '$usdAmount',
              timestamp: '$timestamp',
            },
          },
          buyVolume: {
            $sum: { $cond: [{ $eq: ['$type', 'buy'] }, '$usdAmount', 0] },
          },
          sellVolume: {
            $sum: { $cond: [{ $eq: ['$type', 'sell'] }, '$usdAmount', 0] },
          },
          lastAction: { $max: '$timestamp' },
          tokenInfo: {
            $first: {
              $cond: [
                { $ifNull: ['$symbol', false] },
                { symbol: '$symbol', name: '$name', imageUrl: '$imageUrl' },
                null,
              ],
            },
          },
          // Add influencer information from original document
          influencerName: { $first: '$influencerName' },
          influencerUsername: { $first: '$influencerUsername' },
          influencerProfileImageUrl: { $first: '$influencerProfileImageUrl' },
          influencerFollowerCount: { $first: '$influencerFollowerCount' },
        },
      },

      {
        $match: {
          buyVolume: { $gt: 0 },
        },
      },

      // 📊 Group by token
      {
        $group: {
          _id: '$_id.tokenId',
          whales: {
            $push: {
              id: '$_id.whaleId',
              address: '$_id.whaleId',
              buyVolume: '$buyVolume',
              sellVolume: '$sellVolume',
              lastAction: '$lastAction',
              trades: '$trades',
              // Include influencer information
              influencerName: '$influencerName',
              influencerUsername: '$influencerUsername',
              influencerProfileImageUrl: '$influencerProfileImageUrl',
              influencerFollowerCount: '$influencerFollowerCount',
            },
          },
          totalBuyInflow: { $sum: '$buyVolume' },
          totalSellOutflow: { $sum: '$sellVolume' },
          tokenInfo: { $first: '$tokenInfo' },
        },
      },

      // 🎯 Filter by conditions (only check buy volume, not sell volume)
      {
        $match: {
          $expr: {
            $and: [
              { $gte: [{ $size: '$whales' }, Number(minKols)] },
              { $gte: ['$totalBuyInflow', Number(minInflow)] },
            ],
          },
        },
      },

      // 🎨 Final shape
      {
        $project: {
          _id: 0,
          coin: {
            id: '$_id',
            symbol: { $ifNull: ['$tokenInfo.symbol', ''] },
            name: { $ifNull: ['$tokenInfo.name', ''] },
            imageUrl: { $ifNull: ['$tokenInfo.imageUrl', ''] },
            totalBuyInflow: '$totalBuyInflow',
            totalSellOutflow: '$totalSellOutflow',
          },
          whales: '$whales', // All kols in this array already have buy transactions
        },
      },
    ])

    return res.status(200).json({ success: true, data: result })
  } catch (error) {
    logger.error({ error }, '❌ Error in visualizeKolsV2:')
    return res
      .status(500)
      .json({ success: false, message: 'Internal Server Error' })
  }
}

const gracefulShutdown = async (signal: string = 'SIGTERM') => {
  console.log(
    pc.yellow(`\n🛑 Received ${signal} - Starting graceful shutdown...`),
  )

  // Create a timeout to force exit if shutdown takes too long
  const forceExitTimeout = setTimeout(() => {
    console.error(pc.red('❌ Shutdown timeout exceeded - forcing exit'))
    process.exit(1)
  }, 25000) // 25 seconds (less than PM2's 30s timeout)

  try {
    const startTime = Date.now()

    // 1. Stop accepting new WebSocket messages
    if (ws) {
      console.log('📡 Closing WebSocket connection...')
      ws.removeAllListeners('message') // Stop processing new messages
      ws.close()
      console.log('✅ WebSocket closed')
    }

    // 2. Get queue stats before shutdown
    try {
      const statsBefore = await getQueueStats()
      console.log('📊 Queue stats before shutdown:', {
        waiting: statsBefore.waiting,
        active: statsBefore.active,
        completed: statsBefore.completed,
        failed: statsBefore.failed,
      })
    } catch (err) {
      console.error('Error getting queue stats:', err)
    }

    // 3. Close all workers (wait for active jobs to complete)
    console.log(
      '👷 Closing workers (waiting max 10 seconds for active jobs)...',
    )
    const workerClosePromises = workers.map(
      async (worker: any, index: number) => {
        try {
          // Add timeout for each worker
          await Promise.race([
            worker.close(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('Worker close timeout')),
                10000,
              ),
            ),
          ])
          console.log(`✅ Worker ${index} closed`)
        } catch (error) {
          console.warn(`⚠️  Worker ${index} close timeout - forcing`)
          await worker.close({ force: true }) // Force close if timeout
        }
      },
    )

    await Promise.all(workerClosePromises)
    console.log('✅ All workers closed')

    // 4. Obliterate queue (remove all jobs)
    console.log('🗑️  Obliterating queue (removing all jobs)...')
    try {
      await Promise.race([
        signatureKolQueue.obliterate({ force: true }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Obliterate timeout')), 5000),
        ),
      ])
      console.log('✅ Queue obliterated - all jobs removed')
    } catch (error) {
      console.warn('⚠️  Queue obliterate timeout - continuing shutdown')
    }

    // 5. Close queue connection
    console.log('🔌 Closing queue connection...')
    await signatureKolQueue.close()
    console.log('✅ Queue connection closed')

    // 6. Close Redis connections
    console.log('💾 Closing Redis connections...')

    console.log('✅ Redis connections closed')

    // 7. Clear the force exit timeout
    clearTimeout(forceExitTimeout)

    const shutdownTime = Date.now() - startTime
    console.log(
      pc.green(
        `🎉 Graceful shutdown completed successfully in ${shutdownTime}ms`,
      ),
    )

    process.exit(0)
  } catch (error) {
    clearTimeout(forceExitTimeout)
    console.error(pc.red('❌ Error during shutdown:'), error)
    process.exit(1)
  }
}

// Handle all shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// PM2 shutdown message (for Windows or when shutdown_with_message: true)
process.on('message', (msg) => {
  if (msg === 'shutdown') {
    gracefulShutdown('PM2_SHUTDOWN')
  }
})

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('❌ Uncaught Exception:', error)
  await gracefulShutdown('UNCAUGHT_EXCEPTION')
})

process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason)
  await gracefulShutdown('UNHANDLED_REJECTION')
})
