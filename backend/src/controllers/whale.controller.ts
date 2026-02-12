import { PublicKey } from '@solana/web3.js'
import { Request, Response } from 'express'
import mongoose from 'mongoose'
import pc from 'picocolors'
import { broadcastTransaction } from '../app'
import { connectDB, getDataBaseInfo } from '../config/connectDb'
import { getParsedTransactions } from '../config/getParsedTransaction'
import { redisClient } from '../config/redis'
import { solConnection } from '../config/solana-config'
import {
  findWhaleTokens,
  getTokenData,
  getTokenMetaDataUsingRPC,
  getTokenCreationInfo,
  getTokenPrice,
  fetchSolanaMarketCap,
  saveTokenToCache,
  isTokenResolutionFailed,
  isValidMetadata,
} from '../config/solana-tokens-config'
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors'
import {
  hotnessScoreModel,
  purchaseRecordModel,
} from '../models/hotness-score.model'
import WhalesAddressModel from '../models/solana-tokens-whales'
import whaleBigTransactionModel from '../models/whale-big-transactions.model'
// import { whaleExitAlertModel } from '../models/whaleExitAlert.modal'
import { whaleWalletLabelModel } from '../models/whaleLabel.model'
import { dormantWhaleAlert } from '../services/insight-posts'
import { postAlertToTwitter } from '../services/twitter-post'
import { isDormantWhale, isTokenVolumeSpike } from '../utils/insight-utilities'
import {
  addWhaleLabel,
  getWhaleLabelsByAddress,
} from '../utils/whale-wallet-label-utililies'
import { getHotnessScore } from './insight.controller'
import whaleAllTransactionModelV2 from '../models/whaleAllTransactionsV2.model'
import InfluencerWhalesAddressModelV2 from '../models/Influencer-wallet-whalesV2'
import { alertMatcherService } from '../services/alertMatcher.service'
// import {endOfUTCDay, startOfUTCDay} from "date-fns";
import dotenv from 'dotenv'
import WebSocket from 'ws'
import Redis from 'ioredis'
import { Queue, Worker } from 'bullmq'
import logger from '../utils/logger'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { parseShyftTransaction, ShyftTransaction } from '../utils/shyftParser'
import { parseShyftTransactionV2 } from '../utils/shyftParserV2'
import { 
  mapParserAmountsToStorage, 
  mapSOLAmounts 
} from '../utils/splitSwapStorageMapper'
dotenv.config()

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
const signatureQueue = new Queue('signature-processing', {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
})

// ============ CACHING LAYER ============
const tokenDataCache = new Map<string, { data: any; timestamp: number }>()
const whaleTokenCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 60000 // 60 seconds

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
    `Cache cleanup: Token cache size: ${tokenDataCache.size}, Whale cache size: ${whaleTokenCache.size}`,
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

const NUM_WORKERS = Number(process.env.NUM_WORKERS_WHALE) || 1 // Number of parallel workers
const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY_WHALE) || 8
const limiter = Number(process.env.RATE_LIMIT_MAX_WHALE) || 30
const TIME_IN_SECONDS_WHALE = Number(process.env.TIME_IN_SECONDS_WHALE) || 5000
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
  logger.info(
    `Attempting to store signature: ${signature} for whale: ${whaleAddress}`,
  )

  const exists = await redisClient.sismember(
    'whale_signatures',
    JSON.stringify({ signature, whaleAddress }),
  )

  if (exists) {
    return false
  }

  // Add to permanent set
  await redisClient.sadd(
    'whale_signatures',
    JSON.stringify({ signature, whaleAddress }),
  )
  logger.info(`Stored new signature: ${signature}`)
  return true
}

const setLatestSignature = async (whaleAddress: string, signature: string) => {
  await redisClient.hset('whale_latest_signatures', whaleAddress, signature)
}

const getLatestSignature = async (whaleAddress: string) => {
  return await redisClient.hget('whale_latest_signatures', whaleAddress)
}

// ---------------- WebSocket Core ---------------- //
function connectWhaleStream(whaleAddresses: string[]) {
  if (ws) {
    logger.info(pc.yellow('Closing old WebSocket before reconnecting...'))
    ws.close()
  }

  ws = new WebSocket(HELIUS_WS_URL)

  ws.on('open', () => {
    ws!.send(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'ping' }))
    logger.info(pc.green('✅ Connected to Helius WebSocket'))
    subscribeWhales(whaleAddresses)
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
function subscribeWhales(whaleAddresses: string[]) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    logger.error('WebSocket is not connected.')
    return
  }

  logger.info(`Subscribing to ${whaleAddresses.length} whale addresses.`)

  const request = {
    jsonrpc: '2.0',
    id: 420, // A single ID for this one request
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
    pc.cyan(`📡 Subscribed to all whale addresses in a single request.`),
  )
}

function subscribeWhalesInBatches(whaleAddresses: string[]) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('WebSocket is not connected.')
    return
  }

  console.log(
    `Subscribing to ${whaleAddresses.length} whale addresses in batches of ${SUBSCRIPTION_BATCH_SIZE}.`,
  )

  const batches = chunkArray(whaleAddresses, SUBSCRIPTION_BATCH_SIZE)

  batches.forEach((batch, index) => {
    setTimeout(() => {
      const request = {
        jsonrpc: '2.0',
        id: `whale-${index + 1}`,
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
          `📡 Whale Subscribed batch ${index + 1}/${batches.length} (${batch.length} addresses)`,
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
    const whaleAddress = accounts.find((acc: string) =>
      monitoredWhales.includes(acc),
    )
    logger.info(`Identified whale address: ${whaleAddress}`)

    if (!whaleAddress) return

    const signatureData = JSON.stringify({ signature, whaleAddress })
    const exists = await redisClient.sismember(
      'whale_signatures',
      signatureData,
    )

    if (exists) {
      logger.info(`Signature ${signature} already processed, skipping`)
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

    await redisClient.sadd('whale_signatures', signatureData)

    await signatureQueue.add(
      'process-signature',
      {
        signature,
        whaleAddress,
        transactionData: tx,
      },
      {
        priority: 1,
        removeOnComplete: true,
        removeOnFail: false,
      },
    )

    logger.info(pc.magenta(`🐋 New Whale Tx Detected: ${signature}`))
    await setLatestSignature(whaleAddress, signature)
  } catch (err) {
    logger.error({ err }, pc.red('Error handling transaction:'))
  }
}

// ---------------- Ping Handler ---------------- //
function startPing(ws: WebSocket) {
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'ping' }))
      logger.info(pc.gray('↪️ Ping sent'))
    }
  }, 30000)
}

console.log(pc.cyan(`\n🚀 Initializing ${NUM_WORKERS} workers...`))
console.log(`Redis Connection Status: ${redisClient.status}`)
console.log(`Queue Name: signature-processing`)
console.log(`Concurrency per worker: ${WORKER_CONCURRENCY}\n`)

for (let i = 0; i < NUM_WORKERS; i++) {
  try {
    console.log(pc.yellow(`Creating worker ${i}...`))

    // ✅ Duplicate Redis connection for each worker
    const workerConnection = redisClient.duplicate()

    const worker = new Worker(
      'signature-processing',
      async (job) => {
        // ✅ Enhanced data extraction with validation
        if (!job.data) {
          console.error(pc.red(`[Worker ${i}] ❌ Job data is null/undefined`))
          return
        }

        const { signature, whaleAddress, transactionData } = job.data

        // ✅ Validate required fields
        if (!signature || !whaleAddress) {
          console.error(
            pc.red(
              `[Worker ${i}] ❌ Invalid job data - missing signature or whaleAddress:`,
            ),
            { signature, whaleAddress },
          )
          return
        }

        console.log(
          pc.green(
            `[Worker ${i}] Processing signature: ${signature} for whale: ${whaleAddress}`,
          ),
        )

        try {
          // ✅ Pass complete data including transactionData
          const signatureData = {
            signature,
            whaleAddress,
            transactionData: transactionData || null, // Handle missing transactionData gracefully
          }

          await processSignature(JSON.stringify(signatureData))
          console.log(
            pc.green(`[Worker ${i}] ✅ Successfully processed: ${signature}`),
          )
        } catch (error) {
          console.error(
            pc.red(`[Worker ${i}] ❌ Error processing ${signature}:`),
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
          duration: TIME_IN_SECONDS_WHALE,
        },
        autorun: true,
      },
    )

    // 🔍 Add all event listeners BEFORE pushing to array
    worker.on('ready', () => {
      console.log(pc.green(`✅ Worker ${i} is READY`))
    })

    worker.on('active', (job) => {
      console.log(pc.cyan(`[Worker ${i}] Job ${job.id} is now ACTIVE`))
    })

    worker.on('completed', (job) => {
      console.log(pc.green(`✅ [Worker ${i}] Job ${job.id} completed`))
    })

    worker.on('failed', (job, err) => {
      console.log(
        pc.red(`❌ [Worker ${i}] Job ${job?.id} failed: ${err.message}`),
      )
    })

    worker.on('error', (err) => {
      console.error(pc.red(`[Worker ${i}] ERROR:`), err)
    })

    worker.on('stalled', (jobId) => {
      console.warn(pc.yellow(`[Worker ${i}] Job ${jobId} STALLED`))
    })

    workers.push(worker)
    console.log(pc.green(`✅ Worker ${i} created and ready\n`))
  } catch (error) {
    console.error(pc.red(`❌ Failed to create worker ${i}:`), error)
    throw error
  }
}

console.log(pc.green(`🎉 All ${NUM_WORKERS} workers started successfully`))
console.log(
  `Total capacity: ${NUM_WORKERS * WORKER_CONCURRENCY} concurrent jobs\n`,
)

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/admin/queues')

createBullBoard({
  queues: [new BullMQAdapter(signatureQueue)],
  serverAdapter: serverAdapter,
  options: {
    uiConfig: {
      boardTitle: 'Whale Transaction Queue Monitor',
    },
  },
})

export const getQueueStats = async () => {
  const counts = await signatureQueue.getJobCounts(
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
      const waitingJobs = await signatureQueue.getWaiting(0, 1)
      if (waitingJobs.length > 0) {
        const oldestJob = waitingJobs[0]
        const age = Date.now() - oldestJob.timestamp

        logger.info(
          {
            waiting: stats.waiting,
            active: stats.active,
            oldestJobAge: `${Math.round(age / 1000)}s`,
          },
          '📊 Queue Stats',
        )

        if (age > 30000) {
          // Over 30 seconds old
          logger.warn(
            `⚠️  Queue lag detected! Oldest job is ${Math.round(age / 1000)}s old`,
          )
        }
      }
    }
  } catch (error) {
    logger.error({ error }, 'Error getting queue stats')
  }
}, 15000)

export const monitorWhales = async (whaleAddresses: string[]) => {
  try {
    monitoredWhales = whaleAddresses
    logger.info(
      pc.green('🚀 Starting Enhanced Whale Monitor (WebSocket mode)...'),
    )
    connectWhaleStream(whaleAddresses)
  } catch (error) {
    logger.error({ error }, pc.red('Error in monitorWhales:'))
  }
}

export const getWhaleAddressesCount = catchAsyncErrors(async () => {
  try {
    const whales = await WhalesAddressModel.find({}, 'whalesAddress').lean()
    const totalWhaleAddresses = whales.reduce(
      (sum: any, doc: any) => sum + doc.whalesAddress.length,
      0,
    )
    logger.info(`totalWhaleAddresses`, totalWhaleAddresses)
  } catch (error) {
    logger.error({ error }, 'Error calculating total whale addresses:')
    return 0
  }
})

export const getWhaleLatestTransactions = catchAsyncErrors(
  async (req: any, res: any) => {
    // Check if the monitoring service is already active
    if (isMonitoringStarted) {
      logger.info('✅ Whale monitoring is already active. No action needed.')
      // Immediately tell the client that the service is running
      return res.status(200).json({
        status: 'active',
        message: 'Whale transaction monitoring is already running.',
      })
    }

    // If we reach here, monitoring has NOT started yet.
    // Set the flag to true IMMEDIATELY to prevent race conditions
    isMonitoringStarted = true
    logger.info('🚀 Starting whale monitoring for the first time...')

    // --- Respond to the User Immediately ---
    // Tell the client that the monitoring service is now starting.
    // Use status code 202 (Accepted) to indicate a background process has begun.
    res.status(202).json({
      status: 'initializing',
      message:
        'Request accepted. Starting whale transaction monitoring service.',
    })
      ; (async () => {
        try {
          const db = await getDataBaseInfo(mongoose)
          const client = db.dbClient
          await client.connect()
          const database = client.db(db?.dbName)
          const collection = database.collection('whalesaddresses')

          const whales = await collection
            .find({}, { projection: { whalesAddress: 1, _id: 0 } })
            .toArray()
          const allWhaleAddresses = whales.flatMap((doc) => doc.whalesAddress)
          logger.info({ allWhaleAddresses }, 'Whale Addresses:')
          await client.close()
          // const allWhaleAddresses = ['ruok2pybjpftuQ75qfzgHgebB91vSbCAK91dkButHdr','C3TdUaDVdE74wYutyCkj7NRXqRfLgq2UFRZFab9MEUBs']
          // logger.info('Whale Addresses:', allWhaleAddresses)
          await monitorWhales(allWhaleAddresses)
        } catch (err: any) {
          logger.error(`error while fetching large transaction of a whale`)
          isMonitoringStarted = false
        }
      })()
  },
)

// ****************   2. Parse signatures  *********************
const processSignature = async (signatureJson: any): Promise<void> => {
  // ✅ Enhanced input validation
  if (!signatureJson) {
    logger.error('❌ processSignature called with null/undefined signatureJson')
    return
  }

  let parsedData
  try {
    parsedData = JSON.parse(signatureJson)
  } catch (error) {
    logger.error({ error, signatureJson }, '❌ Failed to parse signatureJson')
    return
  }

  const { signature, whaleAddress, transactionData } = parsedData

  // ✅ Validate parsed data
  if (!signature || !whaleAddress) {
    logger.error({ parsedData }, '❌ Missing required fields in parsed data')
    return
  }

  logger.info(`signature : ${signature}`)
  logger.info(`whaleAddress : ${whaleAddress}`)
  // let signature = '38TGnhZxyKmgFqiGSJuVr8k2qb89mDH5ViAzZYF69nrShwEPkbdSqSyVSzbYcgGE4K6dZyFcg519ym22E7pXGm6T'
  // let whaleAddress = 'CWaTfG6yzJPQRY5P53nQYHdHLjCJGxpC7EWo5wzGqs3n'
  try {
    // ✅ Add Redis-based duplicate check for race condition prevention
    const duplicateKey = `processing_signature:${signature}`
    const isProcessing = await redisClient.set(
      duplicateKey,
      '1',
      'EX',
      300,
      'NX',
    ) // 5 min TTL

    if (!isProcessing) {
      logger.info(
        `Transaction ${signature} is already being processed by another worker. Skipping.`,
      )
      return
    }

    // ✅ Check database for existing transaction
    if (
      await whaleAllTransactionModelV2
        .findOne({ signature })
        .select('signature')
        .lean()
    ) {
      logger.info(
        `Transaction ${signature} already exists in database. Skipping.`,
      )
      // Clean up Redis key
      await redisClient.del(duplicateKey)
      return
    }

    let txStatus
    if (transactionData) {
      // Use transaction data from WebSocket notification
      logger.info('Using cached transaction data from WebSocket')

      // ✅ Enhanced validation for transactionData
      if (
        !transactionData ||
        typeof transactionData !== 'object' ||
        !transactionData.transaction?.meta ||
        transactionData.transaction.meta.err !== null
      ) {
        logger.info(
          `Transaction ${signature} is invalid (from cache). Skipping.`,
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
            logger.info(`Transaction ${signature} is invalid. Skipping.`)
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
            logger.info(`Transaction ${signature} is invalid. Skipping.`)
            return
          }

          break // Success, exit retry loop
        } catch (error) {
          retryCount++
          logger.warn(
            `RPC call failed (attempt ${retryCount}/${maxRetries}): ${String(error)}`,
          )

          if (retryCount >= maxRetries) {
            logger.error(
              `Transaction ${signature} failed after ${maxRetries} retries. Skipping.`,
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

    // ✅ Add timeout and retry for getParsedTransactions
    const parsedData = await Promise.race([
      getParsedTransactions(signature),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('getParsedTransactions timeout')),
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
            `Retrying getParsedTransactions (attempt ${i}/${maxRetries})`,
          )
          await new Promise((resolve) => setTimeout(resolve, i * 2000)) // Wait before retry

          const retryData = await Promise.race([
            getParsedTransactions(signature),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('getParsedTransactions timeout')),
                20000,
              ),
            ),
          ])

          logger.info(`✅ getParsedTransactions succeeded on retry ${i}`)
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

    const txType = parsedTx.result?.type

    logger.info(`TX Type Whale: ${txType}`)

    // ✅ Step 1: Status Gate - ONLY check if transaction succeeded
    if (!parsedTx.success) {
      logger.info(`Whale [Filter] Skipping ${signature}: Transaction failed`)
      return
    }

    // ✅ Step 2: Let V2 parser handle ALL classification logic
    // DO NOT pre-filter by type, balance changes, or actions
    // V2 parser has sophisticated logic to handle all cases
    logger.info(`📋 Transaction type: ${txType} (will be analyzed by V2 parser)`)

    const actions = parsedTx?.result?.actions || []
    const protocolName = parsedTx.result.protocol?.name || 'Unknown'
    const gasFee = parsedTx.result.fee
    const swapper = parsedTx.result.signers[0] || whaleAddress

    // ✅ STEP 3: Call V2 Parser with whale-specific context
    // CRITICAL FIX: Filter token balance changes to only include whale's changes
    // This ensures the parser sees the transaction from the whale's perspective
    logger.info(pc.cyan('🔍 Calling V2 parser for classification...'))
    
    // Convert to V2 format with whale-specific filtering
    const v2Input = {
      signature: signature,
      timestamp: parsedTx.result.timestamp ? new Date(parsedTx.result.timestamp).getTime() : Date.now(),
      status: parsedTx.result.status || 'Success',
      fee: parsedTx.result.fee || 0,
      fee_payer: whaleAddress, // ✅ Use whale as fee payer to force correct swapper identification
      signers: [whaleAddress], // ✅ Use whale as signer
      protocol: parsedTx.result.protocol,
      token_balance_changes: parsedTx.result.token_balance_changes.filter(
        (change: any) => change.owner === whaleAddress
      ), // ✅ Only include whale's token changes to get correct perspective
      actions: parsedTx.result.actions || []
    }

    const parseResult = parseShyftTransactionV2(v2Input)

    if (parseResult.success && parseResult.data) {
      const swapData = parseResult.data

      // ✅ Handle SplitSwapPair by creating TWO separate records (SELL and BUY)
      // Use MongoDB transaction for atomic writes
      if ('sellRecord' in swapData) {
        logger.info(
          pc.magenta(`🔄 Split Swap Pair detected - creating separate SELL and BUY records`)
        )
        
        // 🔥 CRITICAL: Use MongoDB transaction for atomic writes
        const session = await mongoose.startSession()
        
        try {
          await session.startTransaction()
          
          // Create SELL record
          await processSingleSwapTransaction(
            swapData.sellRecord,
            signature,
            parsedTx,
            txStatus,
            whaleAddress,
            protocolName,
            gasFee,
            'v2_parser_split_sell',
            session // Pass session for transaction
          )
          
          // Create BUY record
          await processSingleSwapTransaction(
            swapData.buyRecord,
            signature,
            parsedTx,
            txStatus,
            whaleAddress,
            protocolName,
            gasFee,
            'v2_parser_split_buy',
            session // Pass session for transaction
          )
          
          // Commit only if both succeed
          await session.commitTransaction()
          
          logger.info(
            pc.green(`✅ Split swap pair processed - created separate SELL and BUY records for ${signature}`)
          )
          
          // Increment success metric (structured logging for observability)
          logger.info({
            metric: 'split_swap_records_created',
            signature,
            swapper: swapData.swapper,
            count: 2
          }, 'Split swap records created successfully')
          
        } catch (error) {
          // Abort transaction on any failure
          await session.abortTransaction()
          
          logger.error(
            { 
              signature, 
              error: error instanceof Error ? error.message : String(error),
              swapper: swapData.swapper
            },
            'Split swap transaction failed, rolled back'
          )
          
          // Increment failure metric (structured logging for observability)
          logger.error({
            metric: 'split_swap_transaction_failures',
            signature,
            swapper: swapData.swapper,
            error: error instanceof Error ? error.message : String(error)
          }, 'Split swap transaction failed')
          
          throw error
        } finally {
          session.endSession()
        }
        
        return // Exit early, transaction processed
      } else {
        // Handle regular ParsedSwap - single transaction
        await processSingleSwapTransaction(
          swapData,
          signature,
          parsedTx,
          txStatus,
          whaleAddress,
          protocolName,
          gasFee,
          'v2_parser'
        )
        return // Exit early, transaction processed
      }
    }
    
    // V2 parser rejected transaction
    logger.info(
      `Whale [Filter] Skipping ${signature}: V2 parser rejected (reason: ${parseResult.erase?.reason || 'unknown'})`,
    )
    return
  } catch (err) {
    logger.error({ err }, `Error processing signature ${signature}:`)
  } finally {
    try {
      // ✅ Clean up Redis processing key
      const duplicateKey = `processing_signature:${signature}`
      await redisClient.del(duplicateKey)

      await redisClient.srem(
        'whale_signatures',
        JSON.stringify({ signature, whaleAddress }),
      )
      logger.info(`Signature removed from Redis: ${signature}`)

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }
    } catch (cleanupError) {
      logger.error(
        { cleanupError },
        `Error cleaning up signature ${signature}:`,
      )
    }
  }
}

// ✅ EXTRACTED FUNCTION: Process a single swap transaction
async function processSingleSwapTransaction(
  parsedSwap: any,
  signature: string,
  parsedTx: any,
  txStatus: string,
  whaleAddress: string,
  protocolName: string,
  gasFee: number,
  classificationSource: string,
  session?: mongoose.ClientSession // Optional MongoDB session for transactions
) {
  try {
    logger.info(
      pc.green(
        `✅ Parser classified: ${parsedSwap.direction} | confidence: ${parsedSwap.confidence} | source: ${classificationSource}`,
      ),
    )

    // ✅ Apply confidence filtering if configured (Task 3.3)
    const minConfidence = process.env.MIN_ALERT_CONFIDENCE
    if (minConfidence) {
      const { meetsMinimumConfidence } = require('../utils/shyftParser')
      if (!meetsMinimumConfidence(parsedSwap, minConfidence)) {
        logger.info(
          pc.yellow(
            `Whale [Filter] Skipping ${signature}: Confidence ${parsedSwap.confidence} below minimum ${minConfidence}`,
          ),
        )
        return
      }
    }

    // ✅ Extract token data from V2 parser result (using balance-based structure)
    const tokenIn = {
      token_address: parsedSwap.direction === 'BUY' ? parsedSwap.quoteAsset.mint : parsedSwap.baseAsset.mint,
      amount: parsedSwap.direction === 'BUY' 
        ? (parsedSwap.amounts.swapInputAmount || parsedSwap.amounts.totalWalletCost || 0)
        : (parsedSwap.amounts.baseAmount || 0),
      symbol: parsedSwap.direction === 'BUY' ? (parsedSwap.quoteAsset.symbol || 'Unknown') : (parsedSwap.baseAsset.symbol || 'Unknown'),
      name: parsedSwap.direction === 'BUY' ? (parsedSwap.quoteAsset.symbol || 'Unknown') : (parsedSwap.baseAsset.symbol || 'Unknown'),
    }

    const tokenOut = {
      token_address: parsedSwap.direction === 'BUY' ? parsedSwap.baseAsset.mint : parsedSwap.quoteAsset.mint,
      amount: parsedSwap.direction === 'BUY' 
        ? (parsedSwap.amounts.baseAmount || 0)
        : (parsedSwap.amounts.swapOutputAmount || parsedSwap.amounts.netWalletReceived || 0),
      symbol: parsedSwap.direction === 'BUY' ? (parsedSwap.baseAsset.symbol || 'Unknown') : (parsedSwap.quoteAsset.symbol || 'Unknown'),
      name: parsedSwap.direction === 'BUY' ? (parsedSwap.baseAsset.symbol || 'Unknown') : (parsedSwap.quoteAsset.symbol || 'Unknown'),
    }

    const confidence = parsedSwap.confidence

    logger.info(
      pc.blue(
        `Swap: ${tokenIn.symbol || tokenIn.token_address} -> ${tokenOut.symbol || tokenOut.token_address}`,
      ),
    )

    // ✅ DEBUG: Log before resolveSymbol calls
    logger.info(`🔍 About to resolve symbols for tokenIn: ${tokenIn.token_address} (${tokenIn.symbol}) and tokenOut: ${tokenOut.token_address} (${tokenOut.symbol})`)

    // ✅ Resolve token symbols (enhance metadata)
    const [inSymbol, outSymbol] = await Promise.all([
      resolveSymbol(tokenIn),
      resolveSymbol(tokenOut),
    ])

    // ✅ DEBUG: Log after resolveSymbol calls
    logger.info(`🔍 Resolved symbols - tokenIn: ${JSON.stringify(inSymbol)}, tokenOut: ${JSON.stringify(outSymbol)}`)

    const inSymbolData =
      typeof inSymbol === 'string'
        ? { symbol: inSymbol, name: inSymbol }
        : inSymbol
    const outSymbolData =
      typeof outSymbol === 'string'
        ? { symbol: outSymbol, name: outSymbol }
        : outSymbol

    // Update token symbols if resolved
    if (!tokenIn.symbol || tokenIn.symbol === 'Unknown' || tokenIn.symbol.trim() === '') {
      tokenIn.symbol = inSymbolData.symbol
      tokenIn.name = inSymbolData.name
    }
    if (!tokenOut.symbol || tokenOut.symbol === 'Unknown' || tokenOut.symbol.trim() === '') {
      tokenOut.symbol = outSymbolData.symbol
      tokenOut.name = outSymbolData.name
    }

    // ✅ FIXED: Cache tokens only if valid (enhanced validation)
    // Cache tokenIn (if valid and not shortened)
    if (inSymbolData.symbol && !inSymbolData._isShortened && isValidMetadata(inSymbolData.symbol)) {
      // V2 parser: check quoteAsset or baseAsset based on direction
      const v2Symbol = parsedSwap.direction === 'BUY' ? parsedSwap.quoteAsset.symbol : parsedSwap.baseAsset.symbol
      const source = (v2Symbol && v2Symbol === inSymbolData.symbol) ? 'shyft' : 'dexscreener'
      logger.info(`💾 Caching tokenIn: ${inSymbolData.symbol} (${tokenIn.token_address.slice(0, 8)}...) [${source}]`)
      try {
        await saveTokenToCache(tokenIn.token_address, inSymbolData.symbol, inSymbolData.name, source)
      } catch (err) {
        logger.error({ err }, `❌ Failed to cache tokenIn: ${tokenIn.token_address}`)
      }
    } else {
      logger.info(`⚠️ Skipping cache for tokenIn: ${inSymbolData.symbol} (invalid or shortened)`)
    }
    
    // Cache tokenOut (if valid and not shortened)
    if (outSymbolData.symbol && !outSymbolData._isShortened && isValidMetadata(outSymbolData.symbol)) {
      // V2 parser: check baseAsset or quoteAsset based on direction
      const v2Symbol = parsedSwap.direction === 'BUY' ? parsedSwap.baseAsset.symbol : parsedSwap.quoteAsset.symbol
      const source = (v2Symbol && v2Symbol === outSymbolData.symbol) ? 'shyft' : 'dexscreener'
      logger.info(`💾 Caching tokenOut: ${outSymbolData.symbol} (${tokenOut.token_address.slice(0, 8)}...) [${source}]`)
      try {
        await saveTokenToCache(tokenOut.token_address, outSymbolData.symbol, outSymbolData.name, source)
      } catch (err) {
        logger.error({ err }, `❌ Failed to cache tokenOut: ${tokenOut.token_address}`)
      }
    } else {
      logger.info(`⚠️ Skipping cache for tokenOut: ${outSymbolData.symbol} (invalid or shortened)`)
    }

    // ✅ Use V2 parser's direction for isBuy/isSell classification
    const isBuy = parsedSwap.direction === 'BUY'
    const isSell = parsedSwap.direction === 'SELL'

    if (!isBuy && !isSell) {
      logger.info(
        pc.yellow(
          `Whale [Filter] Skipping ${signature}: Parser classified as non-swap`,
        ),
      )
      return
    }

    logger.info(pc.blue(`Valid swap: ${tokenIn.symbol} -> ${tokenOut.symbol}`))

    let outTokenData: any = {}
    let inTokenData: any = {}
    let whaleToken: any = {}

    const solPrice = await getTokenPrice(
      'So11111111111111111111111111111111111111112',
    )

    try {
      const [out, inT, whale] = await Promise.all([
        getTokenData(tokenOut.token_address),
        getTokenData(tokenIn.token_address),
        findWhaleTokens(whaleAddress),
      ])
      outTokenData = out
      inTokenData = inT
      whaleToken = whale
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

    // ✅ Safety check: Prevent division by zero (Infinity bug fix)
    const safeSolPrice = solPrice && solPrice > 0 ? solPrice : 94 // Default to $94 if invalid
    
    // ✅ Log warning if solPrice was invalid
    if (!solPrice || solPrice <= 0) {
      logger.warn({
        signature,
        solPrice,
        fallbackUsed: 94
      }, 'Invalid SOL price detected, using fallback value')
    }

    const tokenInSolAmount =
      (tokenIn.amount * (inTokenData?.price || 0)) / safeSolPrice
    const tokenOutSolAmount =
      (tokenOut.amount * (outTokenData?.price || 0)) / safeSolPrice

    const buyTokenPriceSol = inTokenData?.price / safeSolPrice || 0
    const sellTokenPriceSol = outTokenData?.price / safeSolPrice || 0
    const buyMarketCapSol = inTokenData?.marketCap / safeSolPrice || 0
    const sellMarketCapSol = outTokenData?.marketCap / safeSolPrice || 0
    const gasFeeUSD = gasFee * solPrice || 0

    // Extract Values
    const tokenDetails = {
      signature,
      whaleAddress,
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
      tokenInUsdAmount: tokenIn.amount * (inTokenData?.price || 0),
      tokenOutUsdAmount: tokenOut.amount * (outTokenData?.price || 0),
      tokenInSolAmount: tokenInSolAmount,
      tokenOutSolAmount: tokenOutSolAmount,
      buyTokenPriceSol: buyTokenPriceSol,
      sellTokenPriceSol: sellTokenPriceSol,
      buyMarketCapSol: buyMarketCapSol,
      sellMarketCapSol: sellMarketCapSol,
      inMarketCap: inTokenData?.marketCap,
      outMarketCap: outTokenData?.marketCap,
      whaleTokenSymbol: whaleToken?.tokenSymbol || '',
      whaleTokenAddress: whaleToken?.tokenAddress || '',
      whaleTokenURL: whaleToken?.imageUrl || null,
      outTokenURL: outTokenData?.imageUrl || null,
      inTokenURL: inTokenData?.imageUrl || null,
      hotnessScore: 0,
      platform: protocolName,
      gasFee: gasFeeUSD,
    }

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

    // ✅ FIXED: Don't filter out split transactions with undefined values
    // For split transactions, values might be undefined initially
    // Only skip if ALL values are defined AND all are below $2
    const hasDefinedValue = txValue != null || sellTxValue != null || buyTxValue != null
    const allValuesBelowThreshold = 
      (txValue == null || txValue < 2) &&
      (sellTxValue == null || sellTxValue < 2) &&
      (buyTxValue == null || buyTxValue < 2)
    
    // Only return if we have at least one defined value AND all defined values are below $2
    if (hasDefinedValue && allValuesBelowThreshold) {
      const maxValue = Math.max(txValue || 0, sellTxValue || 0, buyTxValue || 0)
      if (maxValue < 2 && maxValue > 0) {
        logger.info(`Skipping transaction ${signature}: Max value $${maxValue.toFixed(2)} below $2 threshold`)
        return
      }
    }

    // Store buy/sell transaction grater then $200 in MongoDB (If it doesn't exist)
    try {
      if (isBuy) {
        if (
          (txValue > 2 || buyTxValue > 2) &&
          (txValue < 400 || buyTxValue < 400)
        ) {
          await storeRepeatedTransactions(
            tokenDetails.tokenOutAddress,
            tokenDetails.whaleAddress,
            signature,
            txValue > 0 ? txValue : buyTxValue,
          )
        }
      }

      if (txValue > 2 || sellTxValue > 2 || buyTxValue > 2) {
        if (isBuy) {
          const hotnessScore = await getHotnessScore(
            signature,
            tokenDetails.whaleAddress,
            tokenDetails.tokenOutUsdAmount,
            tokenDetails.outMarketCap,
            tokenDetails.tokenOutAddress,
          )
          tokenDetails.hotnessScore! = Number(hotnessScore)
        }
        await storeTransactionInDB(
          signature,
          tokenDetails,
          isBuy,
          isSell,
          parsedTx,
          txStatus,
          classificationSource,
          confidence.toString(), // Convert number to string
          parsedSwap, // Pass parsedSwap for amount mapping
          session, // Pass session for transaction
          safeSolPrice // Pass SOL price for SOL equivalent calculation
        )
      }

      // Check sell Transaction and post Alerts to alpha insight under whale exit
      if (isSell) {
        if (txValue >= 5000 || sellTxValue >= 5000) {
          const tokenAddress = tokenDetails.tokenInAddress
          const previousHoldings = await getWhaleTokenHoldingBeforeSell(
            whaleAddress,
            tokenAddress,
            signature,
          )

          const sellPercentage =
            (sellTokenAmt / previousHoldings.amountBefore!) * 100

          if (sellPercentage > 100) {
            console.warn(
              `⚠️ Sell percentage is over 100%. This may indicate a token account mismatch or incorrect token decimals.`,
            )
            return
          }
          const isExitSell =
            sellPercentage >= 50 && (txValue >= 5000 || sellTxValue >= 5000)
          logger.info({ isExitSell }, 'isExitSell---------------')
        }
      }

      // Check & Post Alerts to alpha whale
      if (isBuy) {
        // volumn spike alert
        await isTokenVolumeSpike(
          tokenDetails.tokenOutAddress,
          outTokenData?.marketCap,
        )
        // alpha whale twitter post for whale transaction
        await checkAndPostAlert(tokenDetails, isBuy, signature)

        // Dorment whale alert and assign label
        if (tokenDetails.tokenOutUsdAmount >= 2000) {
          const isDormantStatus = await isDormantWhale(
            tokenDetails.whaleAddress,
          )

          if (isDormantStatus?.isDormant) {
            // Add dormant label to wallet
            await addWhaleLabel({
              whaleAddress: tokenDetails.whaleAddress,
              label: 'DORMANT WHALE',
              whaleTokenSymbol: tokenDetails.whaleTokenSymbol,
              whaleTokenImageUrl: tokenDetails.whaleTokenURL,
            })

            const shortAddress = `${tokenDetails.whaleAddress.slice(0, 6)}…${tokenDetails.whaleAddress.slice(-4)}`
            const dormantWhaleAlertMessage =
              `💤 Dormant Whale Wake-Up\n` +
              `Wallet ${shortAddress} ($${tokenDetails.whaleTokenSymbol} Whale) just became active after ${isDormantStatus!.daysSinceLastTx} days of silence.Bought $${formatNumber(tokenDetails.tokenOutUsdAmount)} of $${tokenDetails.tokenOutSymbol} at $${formatNumber(tokenDetails.outMarketCap)} MC 🐋\n\n` +
              `Alpha powered by @AlphaBlockAI`

            await dormantWhaleAlert(dormantWhaleAlertMessage, {
              whaleAddress: tokenDetails.whaleAddress,
              whaleTokenSymbol: tokenDetails.whaleTokenSymbol,
              tokenOutSymbol: tokenDetails.tokenOutSymbol,
              amount: tokenDetails.tokenOutUsdAmount,
              marketCap: tokenDetails.outMarketCap,
              daysSinceLastTx: isDormantStatus.daysSinceLastTx!,
            })
          }
        }
      }
    } catch (error) {
      logger.error({ error }, `Error processing transaction ${signature}:`)
    }
  } catch (err) {
    logger.error({ err }, `Error processing signature ${signature}:`)
  } finally {
    try {
      // ✅ Clean up Redis processing key
      const duplicateKey = `processing_signature:${signature}`
      await redisClient.del(duplicateKey)

      await redisClient.srem(
        'whale_signatures',
        JSON.stringify({ signature, whaleAddress }),
      )
      logger.info(`Signature removed from Redis: ${signature}`)

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }
    } catch (cleanupError) {
      logger.error(
        { cleanupError },
        `Error cleaning up signature ${signature}:`,
      )
    }
  }
}

// Format large numbers
const formatNumber = (value: number): string => {
  if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B'
  if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M'
  if (value >= 1e3) return (value / 1e3).toFixed(2) + 'K'
  return value.toFixed(2)
}

// 🛠️ Helper: Get symbol safely with intelligent caching
const resolveSymbol = async (token: any) => {
  // ✅ DEBUG: Log function entry
  logger.info(`🔍 [resolveSymbol] Called for token: ${token.token_address} with symbol: ${token.symbol}`)
  
  try {
    // ✅ STEP 1: Check if SHYFT already provided valid symbol (FASTEST - no API call!)
    if (isValidMetadata(token.symbol)) {
      logger.info(`✅ Using SHYFT symbol: ${token.symbol} (no API call needed)`)
      
      // ✅ FIXED: Cache SHYFT symbols too!
      try {
        await saveTokenToCache(token.token_address, token.symbol, token.name || token.symbol, 'shyft')
        logger.info(`💾 Cached SHYFT symbol: ${token.symbol} for ${token.token_address.slice(0, 8)}...`)
      } catch (err) {
        logger.error({ err }, `❌ Failed to cache SHYFT symbol: ${token.token_address}`)
      }
      
      return { symbol: token.symbol, name: token.name || token.symbol }
    }
    
    logger.info(`⚠️ SHYFT symbol missing or invalid (${token.symbol}), checking cache/API for ${token.token_address}...`)
    
    // ✅ STEP 1.5: Check if resolution previously failed
    if (await isTokenResolutionFailed(token.token_address)) {
      logger.info(`⚠️ Token resolution previously failed, using shortened address`)
      const shortAddress = `${token.token_address.slice(0, 4)}...${token.token_address.slice(-4)}`
      return { symbol: shortAddress, name: token.token_address, _isShortened: true }
    }
    
    // ✅ STEP 2: SHYFT doesn't have it - check cache/API (fallback)
    const metadata = await getTokenMetaDataUsingRPC(token.token_address)
    
    // ✅ FIXED: Better validation for resolved metadata
    if (metadata && !metadata._isShortened && isValidMetadata(metadata.symbol)) {
      logger.info(`✅ Resolved symbol: ${metadata.symbol} for ${token.token_address}`)
      return metadata
    }
    
    // ✅ STEP 3: Last resort - shortened contract address
    const shortAddress = `${token.token_address.slice(0, 4)}...${token.token_address.slice(-4)}`
    logger.info(`⚠️ All sources failed, using fallback: ${shortAddress} for ${token.token_address}`)
    return { 
      symbol: shortAddress,
      name: token.token_address,
      _isShortened: true
    }
  } catch (error) {
    logger.error({ error }, `❌ Error in resolveSymbol for ${token.token_address}`)
    // On error, try SHYFT symbol first
    if (isValidMetadata(token.symbol)) {
      return { symbol: token.symbol, name: token.name || token.symbol }
    }
    
    // Last resort: use contract address
    const shortAddress = `${token.token_address.slice(0, 4)}...${token.token_address.slice(-4)}`
    return { 
      symbol: shortAddress,
      name: token.token_address,
      _isShortened: true
    }
  }
}

// *********************  for sell  *************
// whale Token holding
const getWhaleTokenHoldingBeforeSell = async (
  whaleAddress: string,
  tokenAddress: string,
  sellTxSignature: string,
) => {
  // 1. Get the slot of the sell transaction
  const tx = await solConnection.getTransaction(sellTxSignature, {
    commitment: 'finalized',
    maxSupportedTransactionVersion: 0,
  })

  if (!tx || !tx.slot) throw new Error('Transaction or slot not found.')
  // Search the account matching the whale's token account
  const tokenBalanceInfo = tx.meta?.preTokenBalances?.find(
    (balance) =>
      balance.owner === whaleAddress && balance.mint === tokenAddress,
  )

  if (!tokenBalanceInfo)
    throw new Error('Token balance info before transaction not found.')

  return {
    amountBefore: tokenBalanceInfo.uiTokenAmount.uiAmount,
  }
}

// find whale exit P&L info
const getRealizedPnLAndEntryDetails = async (
  whaleAddress: string,
  tokenAddress: string,
  tokenPrice: number,
  sellAmount: number,
) => {
  const buys = await whaleAllTransactionModelV2
    .find({
      whaleAddress,
      tokenOutAddress: tokenAddress,
      $or: [
        { type: 'buy' }  // ✅ Updated: Split swaps now create separate BUY records,
      ],
    })
    .sort({ timestamp: 1 })
    .lean()

  const totalTokensBought = buys.reduce(
    (sum, tx) =>
      sum + parseFloat((tx.tokenAmount as any)?.buyTokenAmount || '0'),
    0,
  )
  const totalCost = buys.reduce(
    (sum, tx) => sum + parseFloat((tx.amount as any)?.buyAmount || '0'),
    0,
  )

  const avgEntryPrice =
    totalTokensBought > 0 ? totalCost / totalTokensBought : 0

  const sells = await whaleAllTransactionModelV2
    .find({
      whaleAddress,
      tokenInAddress: tokenAddress,
      $or: [
        { type: 'sell' }  // ✅ Updated: Split swaps now create separate SELL records,
      ],
    })
    .lean()

  const totalTokensSold = sells.reduce(
    (sum, tx) =>
      sum + parseFloat((tx.tokenAmount as any)?.sellTokenAmount || '0'),
    0,
  )

  const realizedPnL = (tokenPrice - avgEntryPrice) * sellAmount
  const remainingBalance = Math.max(0, totalTokensBought - totalTokensSold)
  const unrealizedPnL = (tokenPrice - avgEntryPrice) * remainingBalance

  const earliestTx = buys[0]
  const entryMarketCap = (earliestTx.marketCap as any)?.buyMarketCap || '0'
  const entryTimestamp = earliestTx?.timestamp || new Date()

  const holdingDuration =
    (Date.now() - new Date(entryTimestamp).getTime()) / (1000 * 60 * 60 * 24)

  return {
    realizedPnL,
    unrealizedPnL,
    remainingValue: remainingBalance * tokenPrice,
    entryMarketCap,
    holdingDuration: parseFloat(holdingDuration.toFixed(1)),
  }
}

// *************  for Buy ***********************
// Duplicate Alert scan function
const isDuplicateAlert = async (
  whaleAddress: string,
  tokenOutSymbol: string,
  currentAmount: number,
): Promise<boolean> => {
  const now = new Date()
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)

  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)

  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)

  // 1. Check daily count
  const dailyCount = await whaleBigTransactionModel.countDocuments({
    whaleAddress,
    tokenOutSymbol,
    type: 'buy',
    timestamp: { $gte: startOfDay, $lte: endOfDay },
  })

  logger.info(`dailyCount--------', ${dailyCount}`)

  if (dailyCount >= 2) {
    logger.info(
      pc.gray(`⏩ Skipping: Reached daily alert limit for ${tokenOutSymbol}`),
    )
    return true
  }

  const recentTx = await whaleBigTransactionModel
    .findOne({
      whaleAddress,
      tokenOutSymbol,
      type: 'buy',
      timestamp: { $gte: tenMinutesAgo },
    })
    .sort({ timestamp: -1 })
    .lean()

  logger.info(`recentTx==========', ${recentTx}`)

  if (recentTx) {
    const previousAmount: any = recentTx.amount[0] || 0
    logger.info('📦 Previous Amount:', previousAmount)
    const isMuchBigger = currentAmount > previousAmount * 1.5 // amount atleast 50% bigger
    logger.info(`📦 Is much bigger:', ${isMuchBigger}`)

    if (!isMuchBigger) {
      logger.info(
        pc.gray(
          `⏩ Skipping: Duplicate transaction for ${tokenOutSymbol} within 10 mins`,
        ),
      )
      return true
    }
  }

  return false
}

// calculate score
const calculatePriorityScore = async (
  details: any,
  txValue: number,
): Promise<number> => {
  let score = 0

  // 1. Buy Size
  if (txValue < 1000) score += 1
  else if (txValue <= 3000) score += 3
  else score += 5

  // 2. New Coin Entry (no buys yet today)
  const countForCoinToday = await whaleBigTransactionModel.countDocuments({
    tokenOutSymbol: details.tokenOutSymbol,
    type: 'buy',
    timestamp: {
      $gte: new Date(new Date().setHours(0, 0, 0, 0)),
    },
  })
  if (countForCoinToday === 0) score += 3

  // 3. Trending Token
  // if (await isTrendingToken(details.tokenOutSymbol)) score += 2

  // 4. First-time interaction for this whale with this coin
  const hasInteractedBefore = await whaleBigTransactionModel.exists({
    whaleAddress: details.whaleAddress,
    tokenOutSymbol: details.tokenOutSymbol,
  })
  if (!hasInteractedBefore) score += 2

  // 5. Cross-Ecosystem Buy
  if (details.whaleTokenSymbol !== details.tokenOutSymbol) score += 1

  // 6. Repeat Twitter Post (same wallet + token already posted in last 30 mins)
  const recentBuy = await whaleBigTransactionModel.findOne({
    whaleAddress: details.whaleAddress,
    tokenOutSymbol: details.tokenOutSymbol,
    type: 'buy',
    tweetPosted: true,
    timestamp: { $gte: new Date(Date.now() - 30 * 60 * 1000) },
  })
  if (recentBuy) score -= 2

  // 7. Too Much Alert Spam for this coin?
  if (countForCoinToday >= 5) score -= 3

  return score
}

// calculate threshold
const getCurrentPriorityThreshold = async (): Promise<number> => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dailyPostCount = await whaleBigTransactionModel.countDocuments({
    timestamp: { $gte: today },
    tweetPosted: true,
  })

  logger.info(`dailyPostCount---------', ${dailyPostCount}`)

  // Apply tiered thresholds
  if (dailyPostCount > 150) return 8
  if (dailyPostCount > 90) return 7
  return 6
}

// Store Transactions in MongoDB
const storeTransactionInDB = async (
  signature: string,
  details: any,
  isBuy: boolean,
  isSell: boolean,
  parsedTx: any,
  txStatus: any,
  classificationSource?: string,
  confidence?: string,
  parsedSwap?: any, // Parser V2 output for amount mapping
  session?: mongoose.ClientSession, // MongoDB session for transactions
  solPrice?: number // SOL price for SOL equivalent calculation
): Promise<void> => {
  let clampedHotnessScore = 0

  if (isBuy) {
    clampedHotnessScore = Math.max(0, Math.min(details.hotnessScore ?? 0, 10))
  }

  // Log classification source and confidence
  if (classificationSource || confidence) {
    logger.info(
      pc.cyan(
        `📊 Classification: source=${classificationSource || 'unknown'}, confidence=${confidence || 'unknown'}`,
      ),
    )
  }

  let typeValue: 'buy' | 'sell' | 'both'
  
  // ✅ FIX: Use classification source to determine type
  // Split swaps now create separate 'sell' and 'buy' records
  if (classificationSource === 'v2_parser_split_sell') {
    typeValue = 'sell'
  } else if (classificationSource === 'v2_parser_split_buy') {
    typeValue = 'buy'
  } else if (isBuy && isSell) {
    typeValue = 'both'
  } else if (isBuy) {
    typeValue = 'buy'
  } else {
    typeValue = 'sell'
  }

  // ✅ Get whale labels
  const whaleLabel = await getWhaleLabelsByAddress(details.whaleAddress)

  let enhancedWhaleLabels = [...whaleLabel]

  // Extract platform information from parsed transaction
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

  // ✅ PHASE B FIX: Use new amount mapping utilities from Phase A
  // Map Parser V2 amounts to storage fields (actual token amounts, not USD values)
  let amountMapping
  let solAmountMapping
  
  if (parsedSwap) {
    // Use Phase A utilities for correct amount mapping
    const storageAmounts = mapParserAmountsToStorage(parsedSwap)
    amountMapping = storageAmounts.amount
    
    // ✅ FIX: Pass USD amounts and SOL price for SOL equivalent calculation
    solAmountMapping = mapSOLAmounts(
      parsedSwap,
      details.tokenInUsdAmount,
      details.tokenOutUsdAmount,
      solPrice  // Use solPrice parameter
    )
  } else {
    // Fallback for legacy code paths (should not happen with V2 parser)
    const transactionValue = Math.max(details.tokenOutUsdAmount || 0, details.tokenInUsdAmount || 0)
    amountMapping = {
      buyAmount: transactionValue,
      sellAmount: transactionValue,
    }
    solAmountMapping = {
      buySolAmount: details.tokenOutSolAmount || 0,
      sellSolAmount: details.tokenInSolAmount || 0,
    }
    
    logger.warn({
      signature,
      classificationSource,
      message: 'Using fallback amount mapping - parsedSwap not provided'
    })
  }
  
  const transactionData = {
    signature, // ✅ FIX: Add signature to the transaction data
    amount: amountMapping,

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

    solAmount: solAmountMapping,

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

    whaleLabel: enhancedWhaleLabels,
    whaleTokenSymbol: details.whaleTokenSymbol,
    tokenInSymbol: details.tokenInSymbol,
    tokenOutSymbol: details.tokenOutSymbol,
    whaleAddress: details.whaleAddress,
    tokenInAddress: details.tokenInAddress,
    tokenOutAddress: details.tokenOutAddress,

    whale: {
      address: details.whaleAddress,
      imageUrl: details.whaleTokenURL || null,
      labels: enhancedWhaleLabels,
      symbol: details.whaleTokenSymbol || '',
      name: details.whaleTokenSymbol || '',
      marketCap: details.outMarketCap?.toString() || '0',
    },

    marketCap: {
      buyMarketCap: details.outMarketCap || 0,
      sellMarketCap: details.inMarketCap || 0,
    },
    whaleTokenURL: details.whaleTokenURL,
    outTokenURL: details.outTokenURL,
    inTokenURL: details.inTokenURL,
    type: typeValue,
    bothType: [
      {
        buyType: false,  // ✅ Updated: No longer using 'both' type for split swaps
        sellType: false,  // ✅ Updated: No longer using 'both' type for split swaps
      },
    ],
    hotnessScore: clampedHotnessScore,
    timestamp: new Date(),
    age: tokenInAge, // Keep for backward compatibility - use tokenInAge as default
    tokenInAge: tokenInAge,
    tokenOutAge: tokenOutAge,
  }

  // Save transaction with optional session for atomic operations
  const savedTransaction = session
    ? await whaleAllTransactionModelV2.create([transactionData], { session })
    : await whaleAllTransactionModelV2.create(transactionData)
  
  // Extract the document (create with session returns an array)
  const transactionDoc = Array.isArray(savedTransaction) ? savedTransaction[0] : savedTransaction
  
  logger.info(
    pc.green('✅ Stored whale transaction in MongoDB with enhanced V2 fields'),
  )

  // Trigger alert matching asynchronously (non-blocking)
  setImmediate(() => {
    // Convert Mongoose document to plain object for alert matching
    const plainTransaction = transactionDoc.toObject ? transactionDoc.toObject() : transactionDoc
    
    alertMatcherService
      .processTransaction(plainTransaction)
      .catch((error) => {
        logger.error({
          component: 'whale.controller',
          operation: 'storeWhaleTransactionV2',
          txHash: transactionDoc.signature,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          },
          message: 'Alert matching failed for whale transaction',
        })
      })
  })

  // Emit event for all whale transactions
  broadcastTransaction({
    type: 'allWhaleTransactions',
    data: transactionDoc,
  })
}

export const storeRepeatedTransactions = async (
  tokenAddress: string,
  whaleAddress: string,
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

    const todayCount = await purchaseRecordModel.countDocuments({
      tokenAddress,
      whaleAddress,
      amount: { $lt: smallBuyThreshold },
      timestamp: { $gte: start, $lte: end },
    })
    if (todayCount >= dailySmallBuyLimit) {
      return
    }
    const isDailyLimitReached = todayCount + 1 >= dailySmallBuyLimit
    await purchaseRecordModel.create({
      tokenAddress,
      whaleAddress,
      txnSignature,
      amount,
      timestamp: now,
      isDailyLimitReached,
    })
  } catch (err: any) {
    logger.error({ err }, 'Error while storing repeated transactions')
  }
}

const upsertHotnessScoreDetails = async (
  tokenAddress: string,
  whaleAddress: string,
  txSignature: string,
) => {
  try {
    const existing = await hotnessScoreModel.findOne({ tokenAddress }).lean()
    if (!existing) {
      await hotnessScoreModel.create({
        tokenAddress,
        firstBuyTxnSignature: txSignature,
        uniqueWhaleAddresses: [whaleAddress],
        isFirstBuyCompleted: true,
        createTimestamp: new Date(),
      })
      return 'Created new hotness record'
    }
    if (existing.uniqueWhaleAddresses.includes(whaleAddress)) {
      return 'Skipped: whale address already added'
    }
    if (existing.uniqueWhaleAddresses.length >= 5) {
      return 'Skipped: already 5 whale addresses'
    }
    await hotnessScoreModel.updateOne(
      { tokenAddress },
      {
        $addToSet: { uniqueWhaleAddresses: whaleAddress },
      },
    )
  } catch (err: any) {
    logger.error({ err }, `error updating the hotness score`)
  }
}

// Check and Post AlphaWhale twitter Alerts
const checkAndPostAlert = async (
  details: any,
  isBuy: boolean,
  signature: string,
): Promise<void> => {
  let alertMessage = ''
  let shouldStore = false
  let explorerLink = ''
  logger.info(
    pc.red(
      `The whale should be considered under token ${details.tokenOutSymbol}: ${details.whaleTokenSymbol}`,
    ),
  )
  explorerLink = `app.alpha-block.ai/transaction/${signature}?type=whale`
  const formattedValue = formatNumber(details.tokenOutUsdAmount)
  const formattedMarketCap = formatNumber(details.outMarketCap)
  logger.info({ formattedValue }, `formatted token value is as:`)

  if (isBuy) {
    logger.info(
      pc.yellow(
        '==========================   inside twitter   ==========================',
      ),
    )
    // if(txValue >100000)
    if (details.tokenOutUsdAmount > 100000) {
      alertMessage = `🚨🚨🚨 Massive Move! A $${details.whaleTokenSymbol} whale just added $${formattedValue} of $${details.tokenOutSymbol} at $${formattedMarketCap} MC🐋`
      shouldStore = true
    } else if (details.tokenOutUsdAmount > 75000) {
      alertMessage = `🚨 Massive Move! A $${details.whaleTokenSymbol} whale just added $${formattedValue} of $${details.tokenOutSymbol} at $${formattedMarketCap} MC🐋`
      shouldStore = true
    } else if (details.tokenOutUsdAmount > 50000) {
      alertMessage = `A $${details.whaleTokenSymbol} whale just added $${formattedValue} of $${details.tokenOutSymbol} at $${formattedMarketCap} MC🐋`
      shouldStore = true
    } else if (details.tokenOutUsdAmount > 1000) {
      alertMessage = `A $${details.whaleTokenSymbol} whale just added $${formattedValue} of $${details.tokenOutSymbol} at $${formattedMarketCap} MC🐋`
      shouldStore = true
    }
  }

  if (alertMessage) {
    const score = await calculatePriorityScore(
      details,
      details.tokenOutUsdAmount,
    )
    const threshold = await getCurrentPriorityThreshold()
    logger.info(pc.blue(`🧠 Alert Score: ${score} | Threshold: ${threshold}`))
    const isDuplicate = await isDuplicateAlert(
      details.whaleAddress,
      details.tokenOutSymbol,
      details.tokenOutUsdAmount,
    )
    logger.info(` ✅ isDuplicate--------', ${isDuplicate}`)
    await upsertHotnessScoreDetails(
      details.tokenOutAddress,
      details.whaleAddress,
      signature,
    )
    // const hotnessScore = await getHotnessScore(
    //   signature,
    //   details.whaleAddress,
    //   // txValue,
    //   details.tokenOutUsdAmount,
    //   details.outMarketCap,
    //   details.tokenOutAddress,
    // )

    // Apply +3 hotness score bonus for $ALPHA token
    const isAlphaToken =
      details.tokenOutSymbol === 'ALPHA' || details.tokenOutSymbol === '$ALPHA'
    let hotnessScoreWithBonus =
      (details.hotnessScore ?? 0) + (isAlphaToken ? 3 : 0)

    const clampedHotnessScore = Math.max(0, Math.min(hotnessScoreWithBonus, 10))
    const scoreLine = `🔥 Hotness Score: ${clampedHotnessScore.toFixed(1)}/10`
    const finalAlertMessage = `${alertMessage.trim()}\n\n${scoreLine}\n\n${explorerLink}`

    // ✅ Get whale labels
    const whaleLabel = await getWhaleLabelsByAddress(details.whaleAddress)

    let enhancedWhaleLabels = [...whaleLabel]

    const txnDetail = {
      signature: signature,
      amount: details.tokenOutUsdAmount,
      tokenAmount: details.tokenOutAmount || 0,
      tokenPrice: details.tokenOutPrice || 0,
      whaleLabel: enhancedWhaleLabels,
      whaleTokenSymbol: details.whaleTokenSymbol,
      tokenInSymbol: details.tokenInSymbol,
      tokenOutSymbol: details.tokenOutSymbol,
      whaleAddress: details.whaleAddress,
      tokenInAddress: details.tokenInAddress,
      tokenOutAddress: details.tokenOutAddress,
      marketCap: details.outMarketCap,
      type: 'buy',
      whaleTokenURL: details.whaleTokenURL,
      outTokenURL: details.outTokenURL,
      inTokenURL: details.inTokenURL,
      alertMessage: finalAlertMessage,
      hotnessScore: clampedHotnessScore,
      timestamp: new Date(),
    }
    const result = await whaleBigTransactionModel.updateOne(
      { signature: signature },
      { $setOnInsert: txnDetail },
      { upsert: true },
    )

    // Update hotness score in database if ALPHA token (with +3 bonus)
    // Use $set to ensure it updates even if document already exists
    if (isAlphaToken) {
      try {
        await whaleAllTransactionModelV2.updateOne(
          { signature: signature },
          { $set: { hotnessScore: clampedHotnessScore } },
        )
        logger.info(
          pc.green(
            `✅ Updated hotness score for ALPHA token: ${clampedHotnessScore}`,
          ),
        )
      } catch (error) {
        logger.error({ error }, 'Error updating hotness score for ALPHA token')
      }
    }

    if (isDuplicate) {
      logger.info(pc.yellow('Duplicate alert detected. Skipping alert.'))
      return
    }
    if (score >= threshold) {
      await postAlertToTwitter(finalAlertMessage, shouldStore, signature)
    } else {
      logger.info(
        pc.gray(
          `⏩ Skipping: Alert score (${score}) below threshold (${threshold})`,
        ),
      )
    }
  }
}

const NORMAL_CONCURRENCY = 2 // Concurrency for smaller batches (< 500)
const CHUNK_CONCURRENCY = 1 // Concurrency for large batches (> 500)
const CHUNK_SIZE = 100 // Number of signatures to process per chunk

export const getSignatureDetails = async (): Promise<void> => {
  try {
    logger.info(' Starting signature processing...')

    // Check Redis memory usage first
    const signatureCount = await redisClient.scard('whale_signatures')
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
    //   await processSignaturesInChunks(pLimit(CHUNK_CONCURRENCY))
    // } else {
    // For smaller datasets, use the original approach
    await processSignaturesNormally(pLimit(NORMAL_CONCURRENCY))
    // }
  } catch (err) {
    logger.error({ err }, 'Error:')
  }
}

const processSignaturesNormally = async (limit: any) => {
  const signatures: string[] = await redisClient.smembers('whale_signatures')
  logger.info(`📦 Processing ${signatures.length} signatures normally`)

  if (signatures.length === 0) return

  await connectDB()

  const tasks = signatures.map((signatureJson) =>
    limit(() => processSignature(signatureJson)),
  )

  await Promise.all(tasks)
  logger.info(`✅ Processed ${signatures.length} signatures normally`)
}

// Process signatures in chunks (for large datasets)
const processSignaturesInChunks = async (limit: any) => {
  let processedCount = 0
  let cursor = '0'
  let hasMore = true

  while (hasMore) {
    const [nextCursor, signatures] = await redisClient.sscan(
      'whale_signatures',
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
      limit(() => processSignature(signatureJson)),
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

// ******************   GET all whale transactions  *********************
// export const getAllWhaleTransactions = async () => {
//   try {
//     logger.info('✅ GET /whale-transactions hit')
//     const transactions = await whaleAllTransactionModelV2
//       .find()
//       .sort({ createdAt: -1 })
//       .limit(1000)
//     logger.info('📦 Transactions found:', transactions.length)
//     return transactions
//   } catch (err) {
//     console.error('Error:', err)
//   }
// }

// ****************** GET paginated whale transactions with filters *********************

export const getAllWhaleTransactions = async (
  page: number = 1,
  limit: number = 50,
  filters: {
    searchQuery?: string
    searchType?: 'coin' | 'whale' | 'all' // Whale controller only needs coin search
    hotness?: string | null
    transactionType?: string | null
    tags?: string[]
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

    // Enhanced multi-token search logic
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const searchQuery = filters.searchQuery.trim()

      // Parse multiple search terms (comma or space separated)
      const searchTerms = searchQuery
        .split(/[,\s]+/)
        .map((term) => term.trim())
        .filter((term) => term.length > 0)
        .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

      logger.info({ searchTerms }, '🔍 Parsed search terms:')

      let searchType = filters.searchType || 'all'

      // Auto-detect search type for single terms
      if (!filters.searchType && searchTerms.length === 1) {
        const term = searchTerms[0]
        const isContractAddress = term.startsWith('0x') && term.length > 20
        const isSolanaAddress =
          term.length >= 32 && term.length <= 44 && /^[A-Za-z0-9]+$/.test(term)
        const isTokenSymbol =
          term.length <= 10 && term.match(/^[A-Z0-9]+$/) && !term.includes(' ')

        if (isContractAddress || isSolanaAddress || isTokenSymbol) {
          searchType = 'coin'
        } else {
          // Default to 'all' for ambiguous cases
          searchType = 'all'
        }
      }

      // Create search conditions for each term
      const termConditions: any[] = []

      for (const term of searchTerms) {
        const termRegex = new RegExp(term, 'i')
        const termOrConditions: any[] = []

        if (searchType === 'all') {
          termOrConditions.push(
            { whaleAddress: termRegex },
            { 'whale.address': termRegex },
            { 'whale.name': termRegex },
            { whaleLabel: { $elemMatch: { $regex: termRegex } } },
            // coins
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

        if (searchType === 'whale') {
          termOrConditions.push(
            { whaleAddress: termRegex },
            { 'whale.address': termRegex },
            { 'whale.name': termRegex },
            { whaleLabel: { $elemMatch: { $regex: termRegex } } },
          )
        }

        if (searchType === 'coin') {
          // Check if term looks like an address (prioritize exact address matches)
          const isAddress =
            (term.startsWith('0x') && term.length > 20) ||
            (term.length >= 32 &&
              term.length <= 44 &&
              /^[A-Za-z0-9]+$/.test(term))

          if (isAddress) {
            // For addresses, prioritize exact matches
            termOrConditions.push(
              { tokenInAddress: term },
              { tokenOutAddress: term },
              { 'transaction.tokenIn.address': term },
              { 'transaction.tokenOut.address': term },
              // Fallback to regex for partial matches
              { tokenInAddress: termRegex },
              { tokenOutAddress: termRegex },
              { 'transaction.tokenIn.address': termRegex },
              { 'transaction.tokenOut.address': termRegex },
            )
          } else {
            // For symbols/names, use regex matching
            termOrConditions.push(
              { whaleTokenSymbol: termRegex },
              { tokenInSymbol: termRegex },
              { tokenOutSymbol: termRegex },
              { tokenInAddress: termRegex },
              { tokenOutAddress: termRegex },
              { 'transaction.tokenIn.address': termRegex },
              { 'transaction.tokenOut.address': termRegex },
              { 'transaction.tokenIn.symbol': termRegex },
              { 'transaction.tokenOut.symbol': termRegex },
              { 'transaction.tokenIn.name': termRegex },
              { 'transaction.tokenOut.name': termRegex },
            )
          }
        }

        if (termOrConditions.length > 0) {
          termConditions.push({ $or: termOrConditions })
        }
      }

      if (termConditions.length > 0) {
        if (termConditions.length === 1) {
          orConditions.push(...termConditions[0].$or)
        } else {
          orConditions.push(...termConditions)
        }
      }
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

    if (filters.tags && filters.tags.length > 0) {
      filterQuery.whaleLabel = {
        $elemMatch: {
          $regex: new RegExp(`^(${filters.tags.join('|')})$`, 'i'),
        },
      }
    }

    // Age filter (in minutes) - filter by transaction time (recency)
    // NOTE: Changed from 'age' (token creation) to 'timestamp' (transaction time) 
    // because token creation age data is often missing (null), and UI implies "Transaction Age"
    if (filters.ageMin || filters.ageMax) {
      const ageQuery: any = {}
      const now = new Date()

      if (filters.ageMin) {
        const minAgeMs = parseInt(filters.ageMin) * 60 * 1000 // Convert minutes to milliseconds
        ageQuery.$lte = new Date(now.getTime() - minAgeMs)
        logger.info(
          `🕐 Age Min (Tx Time): ${filters.ageMin}m = ${minAgeMs}ms = ${new Date(now.getTime() - minAgeMs)}`,
        )
      }

      if (filters.ageMax) {
        const maxAgeMs = parseInt(filters.ageMax) * 60 * 1000 // Convert minutes to milliseconds
        ageQuery.$gte = new Date(now.getTime() - maxAgeMs)
        logger.info(
          `🕐 Age Max (Tx Time): ${filters.ageMax}m = ${maxAgeMs}ms = ${new Date(now.getTime() - maxAgeMs)}`,
        )
      }

      filterQuery.timestamp = ageQuery
      logger.info(`🕐 Age (Timestamp) Filter Query:`, ageQuery)
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
        `💰 Market Cap Conditions: ${JSON.stringify(
          marketCapConditions,
          null,
          2,
        )}`,
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

      logger.info({ filterQuery }, '💰 Updated Filter Query with Market Cap:')
    }

    // logger.info('🔍 Filter query:', JSON.stringify(filterQuery, null, 2))
    logger.info({ page, limit, skip, filters }, '📊 Query params:')

    const [transactions, total] = await Promise.all([
      whaleAllTransactionModelV2
        .find(filterQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .allowDiskUse(true)
        .lean(),
      whaleAllTransactionModelV2.countDocuments(filterQuery),
    ])

    // Enhance transactions with image URLs for better search suggestions
    const enhancedTransactions = transactions.map((tx: any) => ({
      ...tx,
      // Ensure image URLs are available for search suggestions
      coinImageUrl:
        tx.outTokenURL ||
        tx.inTokenURL ||
        tx.transaction?.tokenOut?.imageUrl ||
        tx.transaction?.tokenIn?.imageUrl,
      whaleImageUrl: tx.whaleTokenURL || tx.whale?.imageUrl,
      // Add search-friendly fields
      searchableCoinSymbol: tx.tokenOutSymbol || tx.tokenInSymbol,
      searchableCoinName:
        tx.transaction?.tokenOut?.name || tx.transaction?.tokenIn?.name,
      searchableCoinAddress: tx.tokenOutAddress || tx.tokenInAddress,
      searchableWhaleName: tx.whale?.name || tx.whaleTokenSymbol,
      searchableWhaleAddress: tx.whaleAddress,
    }))

    const endTime = Date.now()
    const queryTime = endTime - startTime

    logger.info(
      `📦 Page ${page} | Found: ${transactions.length} / ${total} with filters | Query time: ${queryTime}ms`,
    )

    return {
      transactions: enhancedTransactions,
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

// *********************    GET latest 5 whale transactions    *********************
export const getLatestWhaleAlert = async () => {
  try {
    logger.info('✅ Fetching latest 5 whale transactions...')

    const transactions = await whaleBigTransactionModel
      .find({ tweetPosted: true })
      .sort({ createdAt: -1 })
      .limit(5)

    return transactions
  } catch (error) {
    logger.error({ error }, '❌ Error fetching latest whale transactions:')
    throw new Error('Internal Server Error')
  }
}

//  **************************  Get Whale Labels  *************************
export const getWhaleLabels = catchAsyncErrors(
  async (_req: Request, res: Response) => {
    const { address } = _req.params
    try {
      const whale = await whaleWalletLabelModel.findOne({
        whaleAddress: address,
      })

      if (!whale) {
        return res.status(404).json({ message: 'Whale not found' })
      }

      return res.json({ labels: whale.whaleLabel })
    } catch (err: any) {
      logger.error({ err }, 'Error fetching whale labels:')
      return res.status(500).json({ message: 'Internal server error' })
    }
  },
)
function parseInflowValue(value: string | number): number {
  if (typeof value === 'number') return value
  if (!value) return 0

  const str = value.toUpperCase().trim()
  if (str.endsWith('K')) return parseFloat(str) * 1000
  if (str.endsWith('M')) return parseFloat(str) * 1_000_000
  if (str.endsWith('B')) return parseFloat(str) * 1_000_000_000

  return parseFloat(str) || 0
}

export const visualizeWhales = async (req: any, res: any) => {
  try {
    const { timeframe = '15m', minWhales = 2, minInflow = 0 } = req.query

    const minutes = parseInt(timeframe.replace('m', ''), 10)
    const cutoff = new Date(Date.now() - minutes * 60 * 1000)

    const result = await whaleAllTransactionModelV2.aggregate([
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
        },
      },

      // 🚫 Filter out whale-token combinations with no buy volume BEFORE grouping by token
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
              { $gte: [{ $size: '$whales' }, Number(minWhales)] },
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
          whales: '$whales', // All whales in this array already have buy transactions
        },
      },
    ])

    return res.status(200).json({ success: true, data: result })
  } catch (error) {
    logger.error({ error }, '❌ Error in visualizeWhales:')
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error' })
  }
}

// *********************    GET coin suggestions    *********************
export const getCoinSuggestions = async (req: Request, res: Response) => {
  try {
    const { q, limit = 20 } = req.query

    if (!q || typeof q !== 'string' || q.trim().length < 1) {
      return res.json({ suggestions: [] })
    }

    const searchQuery = q.trim()
    const searchLimit = Math.min(parseInt(limit as string) || 20, 50) // Cap at 50

    logger.info(`🔍 Fetching coin suggestions for: "${searchQuery}"`)

    // Simplified aggregation pipeline
    const transactions = await whaleAllTransactionModelV2.aggregate([
      {
        $match: {
          $or: [
            {
              'transaction.tokenIn.symbol': {
                $regex: searchQuery,
                $options: 'i',
              },
            },
            {
              'transaction.tokenOut.symbol': {
                $regex: searchQuery,
                $options: 'i',
              },
            },
            {
              'transaction.tokenIn.name': {
                $regex: searchQuery,
                $options: 'i',
              },
            },
            {
              'transaction.tokenOut.name': {
                $regex: searchQuery,
                $options: 'i',
              },
            },
            {
              'transaction.tokenIn.address': {
                $regex: searchQuery,
                $options: 'i',
              },
            },
            {
              'transaction.tokenOut.address': {
                $regex: searchQuery,
                $options: 'i',
              },
            },
          ],
        },
      },
      {
        // Add both tokenIn and tokenOut as separate documents
        $addFields: {
          tokens: ['$transaction.tokenIn', '$transaction.tokenOut'],
        },
      },
      {
        $unwind: '$tokens',
      },
      {
        // Filter tokens that match the search query
        $match: {
          $or: [
            {
              'tokens.symbol': {
                $regex: searchQuery,
                $options: 'i',
              },
            },
            {
              'tokens.name': {
                $regex: searchQuery,
                $options: 'i',
              },
            },
            {
              'tokens.address': {
                $regex: searchQuery,
                $options: 'i',
              },
            },
          ],
        },
      },
      {
        // Group by token address to get unique tokens
        $group: {
          _id: '$tokens.address',
          token: { $first: '$tokens' },
          transactionCount: { $sum: 1 },
        },
      },
      {
        // Replace root with token data
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              '$token',
              { transactionCount: '$transactionCount' },
            ],
          },
        },
      },
      {
        // Filter out tokens without required fields
        $match: {
          address: { $exists: true, $ne: null },
          $or: [
            { symbol: { $exists: true, $ne: null } },
            { name: { $exists: true, $ne: null } },
          ],
        },
      },
      {
        $sort: {
          transactionCount: -1, // Most traded first
          symbol: 1,
        },
      },
      {
        $limit: searchLimit,
      },
    ])

    logger.info(`📊 Aggregation found ${transactions.length} unique tokens`)

    // Format suggestions
    const suggestions = transactions.map((token) => ({
      type: 'coin',
      label: token.symbol || token.name || token.address,
      sublabel: token.name && token.symbol ? token.name : token.address,
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      imageUrl: token.imageUrl,
      searchValue: token.address,
      transactionCount: token.transactionCount || 0,
    }))

    logger.info(
      `📦 Found ${suggestions.length} coin suggestions for "${searchQuery}"`,
    )

    res.json({ suggestions })
  } catch (error) {
    logger.error({ error }, '❌ Error fetching coin suggestions:')
    res.status(500).json({ error: 'Failed to fetch coin suggestions' })
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
      async (worker: Worker, index: number) => {
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
          await worker.close(true) // Force close if timeout
        }
      },
    )

    await Promise.all(workerClosePromises)
    console.log('✅ All workers closed')

    // 4. Obliterate queue (remove all jobs)
    console.log('🗑️  Obliterating queue (removing all jobs)...')
    try {
      await Promise.race([
        signatureQueue.obliterate({ force: true }),
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
    await signatureQueue.close()
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

setInterval(() => {
  const usage = process.memoryUsage()
  logger.info(
    {
      rss: `${Math.round(usage.rss / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)} MB`,
      external: `${Math.round(usage.external / 1024 / 1024)} MB`,
    },
    'Memory Usage:',
  )

  // Force garbage collection if available
  if (global.gc && usage.heapUsed / usage.heapTotal > 0.9) {
    logger.info('Running garbage collection...')
    global.gc()
  }
}, 300000)
