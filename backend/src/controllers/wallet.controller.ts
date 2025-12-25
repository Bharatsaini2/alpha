import { PublicKey } from '@solana/web3.js'
import { Request, Response } from 'express'
import pc from 'picocolors'
import { getParsedTransactions } from '../config/getParsedTransaction'
import { redisClient } from '../config/redis'
import { solConnection } from '../config/solana-config'
import {
  getTokenData,
  getTokenMetaDataUsingRPC,
  getTokenPrice,
} from '../config/solana-tokens-config'
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors'
import WalletTradeModel from '../models/WalletTrade.model'
import WalletPositionModel from '../models/WalletPosition.model'
import { postBuyAlert, postSellAlert } from '../services/wallet-alert.service'
import logger from '../utils/logger'
import dotenv from 'dotenv'
import WebSocket from 'ws'
import { Queue, Worker } from 'bullmq'

dotenv.config()

// ============ CONFIGURATION ============
const HELIUS_WS_URL =
  process.env.WSS_URL ||
  'wss://atlas-mainnet.helius-rpc.com/?api-key=ba7496c3-65bf-4a12-a4a2-fb6c20cd4e96'

let ws: WebSocket | null = null
let reconnectTimeout: NodeJS.Timeout | null = null
let isMonitoringStarted = false
let monitoredWallet: string | null = null

// ============ BULLMQ QUEUE SETUP ============
const walletSignatureQueue = new Queue('wallet-signature-processing', {
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

const NUM_WORKERS = Number(process.env.NUM_WORKERS_WALLET) || 1
const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY_WALLET) || 4
const limiter = Number(process.env.RATE_LIMIT_MAX_WALLET) || 20
const TIME_IN_SECONDS_WALLET =
  Number(process.env.TIME_IN_SECONDS_WALLET) || 5000
let workers: Worker[] = []

// ============ WEB SOCKET SETUP ============
function connectWalletStream(walletAddress: string) {
  if (ws) {
    logger.info(pc.yellow('Closing old WebSocket before reconnecting...'))
    ws.close()
  }

  ws = new WebSocket(HELIUS_WS_URL)

  ws.on('open', () => {
    ws!.send(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'ping' }))
    logger.info(
      pc.green('✅ Connected to Helius WebSocket for wallet tracking'),
    )
    subscribeWallet(walletAddress)
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
          pc.magenta(`💼 Wallet Tx Notification received for ${tx.signature}`),
        )
        handleTransactionEvent(tx, walletAddress)
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
      () => connectWalletStream(walletAddress),
      5000,
    )
  })
}

function subscribeWallet(walletAddress: string) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    logger.error('WebSocket is not connected.')
    return
  }

  logger.info(`Subscribing to wallet address: ${walletAddress}`)

  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'transactionSubscribe',
    params: [
      {
        accountInclude: [walletAddress],
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
  logger.info(pc.cyan(`📡 Subscribed to wallet address: ${walletAddress}`))
}

function startPing(ws: WebSocket) {
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'ping' }))
      logger.info(pc.gray('↪️ Ping sent'))
    }
  }, 30000)
}

// ============ TRANSACTION HANDLER ============
async function handleTransactionEvent(tx: any, walletAddress: string) {
  try {
    const signature = tx?.signature
    const transactionData = tx?.transaction

    if (!transactionData || !signature) {
      logger.warn(
        '⚠️ Malformed transaction notification: missing signature or transaction data',
      )
      return
    }

    const message = transactionData.transaction.message

    if (!message || !message.accountKeys) {
      logger.warn('⚠️ No message or accountKeys found in transaction payload')
      return
    }

    const accounts = message.accountKeys.map((a: any) => a.pubkey)

    if (accounts.length === 0 || !accounts.includes(walletAddress)) {
      return
    }

    const signatureData = JSON.stringify({ signature, walletAddress })
    const exists = await redisClient.sismember(
      'wallet_signatures',
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

    await redisClient.sadd('wallet_signatures', signatureData)

    await walletSignatureQueue.add(
      'process-wallet-signature',
      {
        signature,
        walletAddress,
        transactionData: tx,
      },
      {
        priority: 1,
        removeOnComplete: true,
        removeOnFail: false,
      },
    )

    logger.info(pc.magenta(`💼 New Wallet Tx Detected: ${signature}`))
  } catch (err) {
    logger.error({ err }, pc.red('Error handling transaction:'))
  }
}

// ============ WORKER SETUP ============
console.log(pc.cyan(`\n🚀 Initializing ${NUM_WORKERS} wallet workers...`))
console.log(`Redis Connection Status: ${redisClient.status}`)
console.log(`Queue Name: wallet-signature-processing`)
console.log(`Concurrency per worker: ${WORKER_CONCURRENCY}\n`)

for (let i = 0; i < NUM_WORKERS; i++) {
  try {
    console.log(pc.yellow(`Creating wallet worker ${i}...`))

    const workerConnection = redisClient.duplicate()

    const worker = new Worker(
      'wallet-signature-processing',
      async (job) => {
        if (!job.data) {
          console.error(pc.red(`[Worker ${i}] ❌ Job data is null/undefined`))
          return
        }

        const { signature, walletAddress, transactionData } = job.data

        if (!signature || !walletAddress) {
          console.error(
            pc.red(
              `[Worker ${i}] ❌ Invalid job data - missing signature or walletAddress:`,
            ),
            { signature, walletAddress },
          )
          return
        }

        console.log(
          pc.green(
            `[Worker ${i}] Processing signature: ${signature} for wallet: ${walletAddress}`,
          ),
        )

        try {
          const signatureData = {
            signature,
            walletAddress,
            transactionData: transactionData || null,
          }

          await processWalletSignature(JSON.stringify(signatureData))
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
          duration: TIME_IN_SECONDS_WALLET,
        },
        autorun: true,
      },
    )

    worker.on('ready', () => {
      console.log(pc.green(`✅ Wallet Worker ${i} is READY`))
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

    workers.push(worker)
    console.log(pc.green(`✅ Wallet Worker ${i} created and ready\n`))
  } catch (error) {
    console.error(pc.red(`❌ Failed to create wallet worker ${i}:`), error)
    throw error
  }
}

console.log(
  pc.green(`🎉 All ${NUM_WORKERS} wallet workers started successfully`),
)
console.log(
  `Total capacity: ${NUM_WORKERS * WORKER_CONCURRENCY} concurrent jobs\n`,
)

// ============ PNL CALCULATION ============
/**
 * Calculate PNL using Average Cost Basis method
 * This handles multiple buys of the same token correctly
 */
// ============ PNL CALCULATION (defensive) ============
async function calculatePNL(
  walletAddress: string,
  tokenAddress: string,
  sellQuantityRaw: any,
  sellPriceRaw: any,
  sellTimestamp: Date,
): Promise<{
  profit: number
  profitSol: number
  costBasis: number
  remainingBalance: number
  avgEntryPrice: number
}> {
  try {
    // --- input validation & coercion ---
    const sellQuantity = Number(sellQuantityRaw)
    const sellPrice = Number(sellPriceRaw)

    if (!walletAddress || !tokenAddress) {
      throw new Error('Missing walletAddress or tokenAddress')
    }
    if (!Number.isFinite(sellQuantity) || sellQuantity <= 0) {
      throw new Error(`Invalid sellQuantity: ${String(sellQuantityRaw)}`)
    }
    if (!Number.isFinite(sellPrice) || sellPrice < 0) {
      throw new Error(`Invalid sellPrice: ${String(sellPriceRaw)}`)
    }

    // Get or find the position for this token
    let position = await WalletPositionModel.findOne({
      walletAddress,
      tokenAddress,
    }).lean() // use lean for safe inspection

    // If no position exists, calculate from all buy transactions
    if (!position) {
      const buyTransactions = await WalletTradeModel.find({
        walletAddress,
        tokenAddress,
        tradeEvent: 'BUY',
      })
        .sort({ timestamp: 1 })
        .lean()

      if (!buyTransactions || buyTransactions.length === 0) {
        const currentBalance = await getCurrentTokenBalance(
          walletAddress,
          tokenAddress,
        )

        if (currentBalance > 0) {
          // Create a usable position doc (not saved) with initialBalance
          position = {
            walletAddress,
            tokenAddress,
            tokenSymbol: await getTokenSymbol(tokenAddress),
            totalTokensBought: 0,
            totalCostBasis: 0,
            avgEntryPrice: 0,
            totalTokensSold: 0,
            remainingBalance: currentBalance,
            initialBalance: currentBalance,
            initialCostBasis: 0,
            lastUpdated: new Date(),
            createdAt: new Date(),
          } as any
        } else {
          // No buy transaction and no initial balance - still track the sell
          // Create position with 0 values (token may have been airdropped, transferred, or bought before monitoring)
          const tokenSymbol = await getTokenSymbol(tokenAddress)
          position = {
            walletAddress,
            tokenAddress,
            tokenSymbol,
            totalTokensBought: 0,
            totalCostBasis: 0,
            avgEntryPrice: 0,
            totalTokensSold: 0,
            remainingBalance: 0,
            initialBalance: 0,
            initialCostBasis: 0,
            lastUpdated: new Date(),
            createdAt: new Date(),
          } as any
          logger.warn(
            `No buy transaction or initial balance found for ${tokenAddress}. Tracking sell with 0 cost basis.`,
          )
        }
      } else {
        const totalTokensBought = buyTransactions.reduce(
          (sum: number, tx: any) => sum + Number(tx.tokenAmount || 0),
          0,
        )
        const totalCostBasis = buyTransactions.reduce(
          (sum: number, tx: any) => sum + Number(tx.quantityUsd || 0),
          0,
        )
        const avgEntryPrice =
          totalTokensBought > 0 ? totalCostBasis / totalTokensBought : 0

        position = {
          walletAddress,
          tokenAddress,
          tokenSymbol: buyTransactions[0].tokenSymbol || 'Unknown',
          totalTokensBought,
          totalCostBasis,
          avgEntryPrice,
          totalTokensSold: 0,
          remainingBalance: totalTokensBought,
          initialBalance: 0,
          initialCostBasis: 0,
          lastUpdated: new Date(),
          createdAt: new Date(),
        } as any
      }
    }

    // Ensure position is defined (TypeScript guard)
    if (!position) {
      throw new Error(`Failed to create or find position for ${tokenAddress}`)
    }

    // ensure numeric fields
    position.totalTokensBought = Number(position.totalTokensBought || 0)
    position.totalCostBasis = Number(position.totalCostBasis || 0)
    position.avgEntryPrice = Number(position.avgEntryPrice || 0)
    position.totalTokensSold = Number(position.totalTokensSold || 0)
    position.remainingBalance = Number(position.remainingBalance || 0)
    position.initialBalance = Number(position.initialBalance || 0)

    // If position has no tracked buys but has initial balance, handle fallback
    if (position.totalTokensBought === 0 && position.initialBalance) {
      const costBasis = Number(position.initialCostBasis || 0)
      const sellValueUsd = sellQuantity * sellPrice
      const profitUsd = sellValueUsd - costBasis

      let solPrice = 1
      try {
        solPrice = await getTokenPrice(
          'So11111111111111111111111111111111111111112',
        )
      } catch (e) {
        // If SOL price fails, default to 1 to avoid crash and still return numbers
        logger.warn(
          { e },
          'Failed to fetch SOL price for PNL conversion; defaulting to 1',
        )
      }
      const profitSol = profitUsd / (solPrice || 1)

      // Persist updated position safely (ensure no NaN)
      try {
        await WalletPositionModel.updateOne(
          { walletAddress, tokenAddress },
          {
            $inc: { totalTokensSold: sellQuantity },
            $set: {
              remainingBalance: Math.max(
                0,
                (position.initialBalance || 0) -
                  (position.totalTokensSold + sellQuantity),
              ),
              lastUpdated: new Date(),
            },
          },
          { upsert: true },
        )
      } catch (saveErr) {
        // Do not hide the error — wrap with context
        throw new Error(
          `Failed saving position (initial-balance path): ${String(saveErr)}`,
        )
      }

      return {
        profit: profitUsd,
        profitSol,
        costBasis,
        remainingBalance: Math.max(
          0,
          (position.initialBalance || 0) -
            (position.totalTokensSold + sellQuantity),
        ),
        avgEntryPrice: 0,
      }
    }

    // If position has no tracked buys and no initial balance, handle with 0 cost basis
    // (token may have been airdropped, transferred, or bought before monitoring started)
    if (position.totalTokensBought === 0 && !position.initialBalance) {
      const costBasis = 0
      const sellValueUsd = sellQuantity * sellPrice
      const profitUsd = sellValueUsd - costBasis // Profit = sell value when cost basis is 0

      let solPrice = 1
      try {
        solPrice = await getTokenPrice(
          'So11111111111111111111111111111111111111112',
        )
      } catch (e) {
        logger.warn(
          { e },
          'Failed to fetch SOL price for PNL conversion; defaulting to 1',
        )
      }
      const profitSol = profitUsd / (solPrice || 1)

      // Persist updated position safely
      try {
        const updatedTotalSold = (position.totalTokensSold || 0) + sellQuantity
        await WalletPositionModel.updateOne(
          { walletAddress, tokenAddress },
          {
            $set: {
              walletAddress,
              tokenAddress,
              tokenSymbol: position.tokenSymbol || 'Unknown',
              totalTokensBought: 0,
              totalCostBasis: 0,
              avgEntryPrice: 0,
              totalTokensSold: updatedTotalSold,
              remainingBalance: 0,
              initialBalance: 0,
              initialCostBasis: 0,
              lastUpdated: new Date(),
            },
          },
          { upsert: true },
        )
      } catch (saveErr) {
        throw new Error(
          `Failed saving position (no-buy-no-balance path): ${String(saveErr)}`,
        )
      }

      return {
        profit: profitUsd,
        profitSol,
        costBasis,
        remainingBalance: 0,
        avgEntryPrice: 0,
      }
    }

    // Calculate cost basis using average entry price
    const costBasis = position.avgEntryPrice * sellQuantity

    // Calculate profit
    const sellValueUsd = sellQuantity * sellPrice
    const profitUsd = sellValueUsd - costBasis

    // Convert to SOL for display
    let solPrice = 1
    try {
      solPrice = await getTokenPrice(
        'So11111111111111111111111111111111111111112',
      )
    } catch (e) {
      logger.warn(
        { e },
        'Failed to fetch SOL price for PNL conversion; defaulting to 1',
      )
    }
    const profitSol = profitUsd / (solPrice || 1)

    // Safely update position in DB: use numeric updates, avoid NaN
    try {
      const updatedTotalSold = (position.totalTokensSold || 0) + sellQuantity
      const updatedRemaining =
        (position.totalTokensBought || 0) - updatedTotalSold

      // Ensure finite numbers
      if (
        !Number.isFinite(updatedTotalSold) ||
        !Number.isFinite(updatedRemaining)
      ) {
        throw new Error('Computed invalid position numbers (NaN/Infinite)')
      }

      await WalletPositionModel.updateOne(
        { walletAddress, tokenAddress },
        {
          $set: {
            totalTokensSold: updatedTotalSold,
            remainingBalance: updatedRemaining,
            lastUpdated: new Date(),
          },
        },
        { upsert: true },
      )

      return {
        profit: profitUsd,
        profitSol,
        costBasis,
        remainingBalance: updatedRemaining,
        avgEntryPrice: position.avgEntryPrice || 0,
      }
    } catch (saveErr) {
      throw new Error(`Failed saving position (main path): ${String(saveErr)}`)
    }
  } catch (err: any) {
    // Add helpful message and rethrow so caller gets useful info
    const msg = `calculatePNL failed: ${err?.message ?? String(err)}`
    const wrapped = new Error(msg)
    // attach original stack if available
    if (err && err.stack) (wrapped as any).originalStack = err.stack
    throw wrapped
  }
}

// Helper function to get current token balance
async function getCurrentTokenBalance(
  walletAddress: string,
  tokenAddress: string,
): Promise<number> {
  try {
    const walletPubkey = new PublicKey(walletAddress)
    const tokenMint = new PublicKey(tokenAddress)

    const accounts = await solConnection.getTokenAccountsByOwner(walletPubkey, {
      mint: tokenMint,
    })

    if (accounts.value.length > 0) {
      const balance = await solConnection.getTokenAccountBalance(
        accounts.value[0].pubkey,
      )
      return parseFloat(balance.value.uiAmountString || '0')
    }
    return 0
  } catch (error) {
    logger.error({ error }, 'Error getting token balance:')
    return 0
  }
}

// Helper function to get token symbol
async function getTokenSymbol(tokenAddress: string): Promise<string> {
  try {
    const metadata = await getTokenMetaDataUsingRPC(tokenAddress)
    return metadata?.symbol || 'Unknown'
  } catch (error) {
    logger.error({ error }, 'Error getting token symbol:')
    return 'Unknown'
  }
}

// ============ PROCESS SIGNATURE ============
export const processWalletSignature = async (
  signatureJson: any,
): Promise<void> => {
  if (!signatureJson) {
    logger.error('❌ processWalletSignature called with null/undefined')
    return
  }

  let parsedData
  try {
    parsedData = JSON.parse(signatureJson)
  } catch (error) {
    logger.error({ error, signatureJson }, '❌ Failed to parse signatureJson')
    return
  }

  const { signature, walletAddress, transactionData } = parsedData

  if (!signature || !walletAddress) {
    logger.error({ parsedData }, '❌ Missing required fields')
    return
  }

  try {
    // ✅ Add Redis-based duplicate check for race condition prevention
    const duplicateKey = `processing_wallet_signature:${signature}`
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
      await WalletTradeModel.findOne({ signature }).select('signature').lean()
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
        await redisClient.del(duplicateKey)
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
            await redisClient.del(duplicateKey)
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
            await redisClient.del(duplicateKey)
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
            await redisClient.del(duplicateKey)
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
    const parsedTxData = await Promise.race([
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

    if (!parsedTxData) {
      await redisClient.del(duplicateKey)
      return
    }

    const parsedTx = JSON.parse(parsedTxData)

    logger.info(`TX Type Wallet: ${parsedTx.result?.type}`)

    const txType: any = parsedTx?.result?.type
    if (!parsedTx.success || (txType !== 'SWAP' && txType !== 'SWAP2')) {
      logger.info(
        `Wallet [Filter] Skipping ${signature}: Not a successful SWAP or SWAP2 transaction according to Shyft.`,
      )
      await redisClient.del(duplicateKey)
      return
    }

    const actions = parsedTx?.result?.actions

    if (!actions || actions.length === 0) {
      logger.info(`Wallet [Filter] Skipping ${signature}: No actions found.`)
      await redisClient.del(duplicateKey)
      return
    }

    const protocolName = parsedTx.result.protocol?.name || 'Unknown'
    const gasFee = parsedTx.result.fee
    const swapper = parsedTx.result.signers[0] || walletAddress

    let tokenIn: any = null
    let tokenOut: any = null
    let swapSource:
      | 'tokens_swapped'
      | 'token_balance'
      | 'token_transfer'
      | 'spl_to_sol_swap'
      | 'sol_to_spl_swap' = 'tokens_swapped'

    const actionInfo = actions[0]?.info

    if (actionInfo?.tokens_swapped) {
      tokenIn = actionInfo.tokens_swapped.in
      tokenOut = actionInfo.tokens_swapped.out
      swapSource = 'tokens_swapped'
      logger.info(`✅ Swap data extracted from: tokens_swapped`)
    } else if (
      parsedTx.result?.token_balance_changes &&
      parsedTx.result.token_balance_changes.length > 0 &&
      txType === 'SWAP'
    ) {
      logger.info(
        `⚠️ tokens_swapped not found. Checking token_balance_changes...`,
      )

      const balanceChanges = parsedTx.result.token_balance_changes.filter(
        (change: any) => change.owner === swapper && change.change_amount !== 0,
      )
      console.log(balanceChanges)

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
          symbol: 'Unknown',
          name: 'Unknown',
        }

        tokenOut = {
          token_address: tokenReceivedChange.mint,
          amount:
            tokenReceivedChange.change_amount /
            Math.pow(10, tokenReceivedChange.decimals),
          symbol: 'Unknown',
          name: 'Unknown',
        }
        swapSource = 'token_balance'
        logger.info(`✅ Swap data extracted from: token_balance_changes`)
      }
    } else {
      logger.info(
        `⚠️ tokens_swapped and token_balance_changes not found. Using TOKEN_TRANSFER fallback...`,
      )
      let solOut = actions.find(
        (a: { type: string; info: { sender: string } }) =>
          a.type === 'SOL_TRANSFER' && a.info.sender === swapper,
      )

      let solIn = actions.find(
        (a: { type: string; info: { receiver: string } }) =>
          a.type === 'SOL_TRANSFER' && a.info.receiver === swapper,
      )

      let splOut = actions.find(
        (a: { type: string; info: { sender: string } }) =>
          a.type === 'TOKEN_TRANSFER' && a.info.sender === swapper,
      )

      let splIn = actions.find(
        (a: { type: string; info: { receiver: string } }) =>
          a.type === 'TOKEN_TRANSFER' && a.info.receiver === swapper,
      )

      if (solOut && splIn) {
        tokenIn = {
          token_address: 'So11111111111111111111111111111111111111112',
          amount: solOut.info.amount,
          symbol: 'SOL',
          name: 'SOL',
        }

        tokenOut = {
          token_address: splIn.info.token_address,
          amount: splIn.info.amount,
          symbol: 'Unknown',
          name: 'Unknown',
        }
        swapSource = 'token_transfer'
        logger.info(`✅ Swap data extracted from: TOKEN_TRANSFER (SOL → SPL)`)
      } else if (splOut && solIn) {
        tokenIn = {
          token_address: splOut.info.token_address,
          amount: splOut.info.amount,
          symbol: 'Unknown',
          name: 'Unknown',
        }

        tokenOut = {
          token_address: 'So11111111111111111111111111111111111111112',
          amount: solIn.info.amount,
          symbol: 'SOL',
          name: 'SOL',
        }

        swapSource = 'token_transfer'
        logger.info(`✅ Swap data extracted from: TOKEN_TRANSFER (SPL → SOL)`)
      } else if (splOut && splIn) {
        tokenIn = {
          token_address: splOut.info.token_address,
          amount: splOut.info.amount,
          symbol: 'Unknown',
          name: 'Unknown',
        }

        tokenOut = {
          token_address: splIn.info.token_address,
          amount: splIn.info.amount,
          symbol: 'Unknown',
          name: 'Unknown',
        }

        swapSource = 'token_transfer'
        logger.info(`✅ Swap data extracted from: TOKEN_TRANSFER (SPL → SPL)`)
      }
    }

    if (!tokenIn || !tokenOut) {
      logger.info(
        `Wallet [Filter] Skipping ${signature}: Unable to extract swap data from any source.`,
      )
      await redisClient.del(duplicateKey)
      return
    }

    logger.info(
      pc.blue(
        `Swap Source: ${swapSource} | ${tokenIn.symbol || tokenIn.token_address} -> ${tokenOut.symbol || tokenOut.token_address}`,
      ),
    )

    // Resolve symbols
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

    if (tokenIn.symbol === 'Unknown') {
      tokenIn.symbol = inSymbolData.symbol
    }
    if (tokenOut.symbol === 'Unknown') {
      tokenOut.symbol = outSymbolData.symbol
    }

    const excludedTokens = ['SOL', 'WSOL', 'USDT', 'USDC', 'USD1']
    const excludedAddresses = [
      'So11111111111111111111111111111111111111112', // SOL/WSOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    ]

    const inputExcluded =
      excludedTokens.includes(tokenIn.symbol) ||
      excludedAddresses.includes(tokenIn.token_address)
    const outputExcluded =
      excludedTokens.includes(tokenOut.symbol) ||
      excludedAddresses.includes(tokenOut.token_address)
    const bothNonExcluded = !inputExcluded && !outputExcluded

    // 2) Now classify
    // Buy: receiving non-excluded token (or both non-excluded)
    // Sell: selling non-excluded token for excluded token (or both non-excluded)
    const isBuy = bothNonExcluded || (!outputExcluded && inputExcluded)
    const isSell = bothNonExcluded || (outputExcluded && !inputExcluded)

    if (!isBuy && !isSell) {
      await redisClient.del(duplicateKey)
      return
    }

    logger.info(pc.blue(`Valid swap: ${tokenIn.symbol} -> ${tokenOut.symbol}`))

    // Get token data and prices
    const solPrice = await getTokenPrice(
      'So11111111111111111111111111111111111111112',
    )

    let outTokenData: any = {}
    let inTokenData: any = {}

    try {
      const [out, inT] = await Promise.all([
        getTokenData(tokenOut.token_address),
        getTokenData(tokenIn.token_address),
      ])
      outTokenData = out
      inTokenData = inT
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

    // Calculate SOL and USD amounts
    const tokenInSolAmount =
      (tokenIn.amount * (inTokenData?.price || 0)) / solPrice
    const tokenOutSolAmount =
      (tokenOut.amount * (outTokenData?.price || 0)) / solPrice
    const tokenInUsdAmount = tokenIn.amount * (inTokenData?.price || 0)
    const tokenOutUsdAmount = tokenOut.amount * (outTokenData?.price || 0)

    // Get wallet SOL balance
    let walletBalance = 0
    try {
      const balance = await solConnection.getBalance(
        new PublicKey(walletAddress),
      )
      walletBalance = balance / 1e9 // Convert lamports to SOL
    } catch (error) {
      logger.error({ error }, 'Error getting wallet balance:')
    }

    // Process buy transaction
    if (isBuy) {
      const tokenAddress = tokenOut.token_address
      const tokenSymbol = outSymbolData.symbol
      const quantity = tokenOutSolAmount
      const quantityUsd = tokenOutUsdAmount
      const tokenAmount = tokenOut.amount

      // Store buy transaction
      const buyTrade = await WalletTradeModel.create({
        signature,
        walletAddress,
        tradeEvent: 'BUY',
        tokenAddress,
        tokenSymbol,
        quantity,
        quantityUsd,
        tokenAmount,
        contract: tokenAddress,
        walletBalance,
        status: 'confirmed',
        timestamp: new Date(),
      })

      // Update position - accumulate buys (for multiple buys of same token)
      const existingPosition = await WalletPositionModel.findOne({
        walletAddress,
        tokenAddress,
      })

      let positionWasCreated = false
      let previousPositionState: any = null

      if (existingPosition) {
        // Store previous state for rollback
        previousPositionState = {
          totalTokensBought: existingPosition.totalTokensBought,
          totalCostBasis: existingPosition.totalCostBasis,
          avgEntryPrice: existingPosition.avgEntryPrice,
          remainingBalance: existingPosition.remainingBalance,
        }
        // Update existing position: add to totals
        existingPosition.totalTokensBought += tokenAmount
        existingPosition.totalCostBasis += quantityUsd
        existingPosition.avgEntryPrice =
          existingPosition.totalTokensBought > 0
            ? existingPosition.totalCostBasis /
              existingPosition.totalTokensBought
            : 0
        existingPosition.remainingBalance =
          existingPosition.totalTokensBought - existingPosition.totalTokensSold
        existingPosition.lastUpdated = new Date()
        await existingPosition.save()
      } else {
        // Create new position
        positionWasCreated = true
        await WalletPositionModel.create({
          walletAddress,
          tokenAddress,
          tokenSymbol,
          totalTokensBought: tokenAmount,
          totalCostBasis: quantityUsd,
          avgEntryPrice: quantityUsd / tokenAmount,
          totalTokensSold: 0,
          remainingBalance: tokenAmount,
          initialBalance: 0,
          initialCostBasis: 0,
        })
      }

      // Post buy alert
      const alertResult = await postBuyAlert({
        tokenSymbol,
        quantity,
        contract: tokenAddress,
        walletBalance,
        signature,
      })

      // Rollback if Twitter posting failed with duplicate content error
      if (!alertResult.success && alertResult.isDuplicate) {
        logger.warn(
          `Twitter duplicate content error for buy ${signature}. Rolling back database changes.`,
        )
        try {
          // Delete the trade
          await WalletTradeModel.deleteOne({ signature })
          logger.info(`Rolled back buy trade: ${signature}`)

          // Revert position changes
          if (positionWasCreated) {
            // Delete the position we just created
            await WalletPositionModel.deleteOne({
              walletAddress,
              tokenAddress,
            })
            logger.info(`Rolled back position creation for ${tokenAddress}`)
          } else if (previousPositionState && existingPosition) {
            // Restore previous position state
            existingPosition.totalTokensBought =
              previousPositionState.totalTokensBought
            existingPosition.totalCostBasis =
              previousPositionState.totalCostBasis
            existingPosition.avgEntryPrice = previousPositionState.avgEntryPrice
            existingPosition.remainingBalance =
              previousPositionState.remainingBalance
            await existingPosition.save()
            logger.info(`Rolled back position update for ${tokenAddress}`)
          }
        } catch (rollbackError) {
          logger.error(
            { rollbackError },
            `Error during rollback for buy ${signature}:`,
          )
        }
        await redisClient.del(duplicateKey)
        return
      }

      logger.info(pc.green(`✅ Buy transaction stored: ${signature}`))
    }

    // Process sell transaction
    if (isSell) {
      const tokenAddress = tokenIn.token_address
      const tokenSymbol = inSymbolData.symbol
      const quantity = tokenInSolAmount
      const quantityUsd = tokenInUsdAmount
      const tokenAmount = tokenIn.amount
      const sellPrice = inTokenData?.price || 0

      // Store position state before PNL calculation for potential rollback
      const positionBeforePNL = await WalletPositionModel.findOne({
        walletAddress,
        tokenAddress,
      }).lean()
      const positionExistedBefore = !!positionBeforePNL
      const previousPositionState = positionBeforePNL
        ? {
            totalTokensBought: positionBeforePNL.totalTokensBought,
            totalCostBasis: positionBeforePNL.totalCostBasis,
            avgEntryPrice: positionBeforePNL.avgEntryPrice,
            totalTokensSold: positionBeforePNL.totalTokensSold,
            remainingBalance: positionBeforePNL.remainingBalance,
            initialBalance: positionBeforePNL.initialBalance,
            initialCostBasis: positionBeforePNL.initialCostBasis,
          }
        : null

      // Calculate PNL
      let pnlResult
      let positionWasCreatedInPNL = false
      try {
        pnlResult = await calculatePNL(
          walletAddress,
          tokenAddress,
          tokenAmount,
          sellPrice,
          new Date(),
        )
        // Check if position was created during PNL calculation
        if (!positionExistedBefore) {
          const positionAfterPNL = await WalletPositionModel.findOne({
            walletAddress,
            tokenAddress,
          })
          positionWasCreatedInPNL = !!positionAfterPNL
        }
      } catch (error) {
        logger.error({ error }, 'Error calculating PNL:')
        // Still track the sell transaction with fallback values
        // This handles cases where there's no buy transaction or initial balance
        logger.warn(
          `Tracking sell transaction ${signature} with fallback PNL values (0 cost basis)`,
        )

        // Use fallback values: profit = sell value (since cost basis is 0)
        let solPrice = 1
        try {
          solPrice = await getTokenPrice(
            'So11111111111111111111111111111111111111112',
          )
        } catch (e) {
          logger.warn(
            { e },
            'Failed to fetch SOL price for PNL conversion; defaulting to 1',
          )
        }

        pnlResult = {
          profit: quantityUsd, // Profit = sell value when cost basis is 0
          profitSol: quantity, // Profit in SOL = sell quantity in SOL
          costBasis: 0,
          remainingBalance: 0,
          avgEntryPrice: 0,
        }

        // Update position to track the sell even without proper cost basis
        try {
          const positionAfterFallback = await WalletPositionModel.findOne({
            walletAddress,
            tokenAddress,
          })
          if (!positionAfterFallback) {
            positionWasCreatedInPNL = true
          }
          await WalletPositionModel.updateOne(
            { walletAddress, tokenAddress },
            {
              $inc: { totalTokensSold: tokenAmount },
              $set: {
                remainingBalance: 0,
                lastUpdated: new Date(),
              },
            },
            { upsert: true },
          )
        } catch (posErr) {
          logger.error({ posErr }, 'Error updating position for fallback sell:')
        }
      }

      // Store sell transaction
      const sellTrade = await WalletTradeModel.create({
        signature,
        walletAddress,
        tradeEvent: 'SELL',
        tokenAddress,
        tokenSymbol,
        quantity,
        quantityUsd,
        tokenAmount,
        contract: tokenAddress,
        walletBalance,
        profit: pnlResult.profitSol,
        profitUsd: pnlResult.profit,
        status: 'confirmed',
        timestamp: new Date(),
        costBasis: pnlResult.costBasis,
        remainingBalance: pnlResult.remainingBalance,
        entryPrice: pnlResult.avgEntryPrice,
      })

      // Post sell alert
      const alertResult = await postSellAlert({
        tokenSymbol,
        quantity,
        profit: pnlResult.profitSol,
        contract: tokenAddress,
        walletBalance,
        signature,
      })

      // Rollback if Twitter posting failed with duplicate content error
      if (!alertResult.success && alertResult.isDuplicate) {
        logger.warn(
          `Twitter duplicate content error for sell ${signature}. Rolling back database changes.`,
        )
        try {
          // Delete the trade
          await WalletTradeModel.deleteOne({ signature })
          logger.info(`Rolled back sell trade: ${signature}`)

          // Revert position changes
          if (positionWasCreatedInPNL) {
            // Delete the position that was created
            await WalletPositionModel.deleteOne({
              walletAddress,
              tokenAddress,
            })
            logger.info(`Rolled back position creation for ${tokenAddress}`)
          } else if (previousPositionState) {
            // Restore previous position state
            await WalletPositionModel.updateOne(
              { walletAddress, tokenAddress },
              {
                $set: {
                  totalTokensBought: previousPositionState.totalTokensBought,
                  totalCostBasis: previousPositionState.totalCostBasis,
                  avgEntryPrice: previousPositionState.avgEntryPrice,
                  totalTokensSold: previousPositionState.totalTokensSold,
                  remainingBalance: previousPositionState.remainingBalance,
                  initialBalance: previousPositionState.initialBalance,
                  initialCostBasis: previousPositionState.initialCostBasis,
                  lastUpdated: new Date(),
                },
              },
            )
            logger.info(`Rolled back position update for ${tokenAddress}`)
          }
        } catch (rollbackError) {
          logger.error(
            { rollbackError },
            `Error during rollback for sell ${signature}:`,
          )
        }
        await redisClient.del(duplicateKey)
        return
      }

      logger.info(pc.green(`✅ Sell transaction stored: ${signature}`))
    }
  } catch (err) {
    logger.error({ err }, `Error processing signature ${signature}:`)
  } finally {
    try {
      // ✅ Clean up Redis processing key
      const duplicateKey = `processing_wallet_signature:${signature}`
      await redisClient.del(duplicateKey)

      await redisClient.srem(
        'wallet_signatures',
        JSON.stringify({ signature, walletAddress }),
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

// Helper to resolve symbol
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

// ============ API ENDPOINTS ============
export const startWalletMonitoring = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const { walletAddress } = req.query as { walletAddress: string }

    if (!walletAddress) {
      return res.status(400).json({
        status: 'error',
        message: 'walletAddress is required',
      })
    }

    if (isMonitoringStarted && monitoredWallet === walletAddress) {
      return res.status(200).json({
        status: 'active',
        message: 'Wallet monitoring is already active for this address.',
      })
    }

    isMonitoringStarted = true
    monitoredWallet = walletAddress

    res.status(202).json({
      status: 'initializing',
      message: 'Starting wallet transaction monitoring service.',
    })

    // Start monitoring in background
    ;(async () => {
      try {
        logger.info(`🚀 Starting wallet monitoring for: ${walletAddress}`)
        connectWalletStream(walletAddress)
      } catch (err: any) {
        logger.error(`Error while starting wallet monitoring: ${err}`)
        isMonitoringStarted = false
        monitoredWallet = null
      }
    })()
  },
)

export const stopWalletMonitoring = catchAsyncErrors(
  async (req: Request, res: Response) => {
    if (ws) {
      ws.close()
      ws = null
    }
    isMonitoringStarted = false
    monitoredWallet = null

    res.status(200).json({
      status: 'stopped',
      message: 'Wallet monitoring stopped successfully.',
    })
  },
)

export const getWalletTrades = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const { walletAddress } = req.params
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 50
    const skip = (page - 1) * limit

    const trades = await WalletTradeModel.find({ walletAddress })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    const total = await WalletTradeModel.countDocuments({ walletAddress })

    res.status(200).json({
      trades,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  },
)

export const getWalletPositions = catchAsyncErrors(
  async (req: Request, res: Response) => {
    const { walletAddress } = req.params

    const positions = await WalletPositionModel.find({ walletAddress }).lean()

    res.status(200).json({
      positions,
    })
  },
)

export const getMonitoringStatus = catchAsyncErrors(
  async (req: Request, res: Response) => {
    res.status(200).json({
      isMonitoring: isMonitoringStarted,
      monitoredWallet,
    })
  },
)
