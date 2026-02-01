/**
 * V2 Parser Live Simulation
 * 
 * Simulates the production whale tracking environment:
 * - Connects to WebSocket for ALL whale addresses
 * - Processes transactions with V2 parser in real-time
 * - Shows what would be detected/saved (but doesn't save to DB)
 * - Provides live statistics and comparison
 */

import * as dotenv from 'dotenv'
import axios from 'axios'
import mongoose from 'mongoose'
import { parseShyftTransaction } from './src/utils/shyftParser'

dotenv.config()

// ============================================================================
// CONFIGURATION
// ============================================================================

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || ''
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || ''
const WSS_URL = process.env.WSS_URL || ''

// ============================================================================
// COLOR HELPERS
// ============================================================================

const colors = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  gray: (text: string) => `\x1b[90m${text}\x1b[0m`,
  white: (text: string) => `\x1b[37m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
}

// ============================================================================
// DATABASE MODELS
// ============================================================================

import whaleAllTransactionModelV2 from './src/models/whaleAllTransactionsV2.model'

// ============================================================================
// STATISTICS TRACKING
// ============================================================================

interface Stats {
  totalTransactions: number
  validSwaps: number
  erased: number
  errors: number
  buyCount: number
  sellCount: number
  uniqueTokens: Set<string>
  startTime: number
}

const stats: Stats = {
  totalTransactions: 0,
  validSwaps: 0,
  erased: 0,
  errors: 0,
  buyCount: 0,
  sellCount: 0,
  uniqueTokens: new Set(),
  startTime: Date.now(),
}

// ============================================================================
// WEBSOCKET SIMULATION
// ============================================================================

interface WebSocketMessage {
  type: string
  data?: any
}

let ws: any = null
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 5

function connectWebSocket(whaleAddresses: string[]) {
  try {
    const WebSocket = require('ws')
    
    console.log(colors.cyan('\n🔌 Connecting to Shyft WebSocket...'))
    console.log(colors.gray(`   URL: ${WSS_URL}`))
    console.log(colors.gray(`   Tracking: ${whaleAddresses.length} whale addresses\n`))

    ws = new WebSocket(WSS_URL)

    ws.on('open', () => {
      console.log(colors.green('✅ WebSocket connected!'))
      reconnectAttempts = 0

      // Subscribe to all whale addresses
      const subscribeMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'transactionSubscribe',
        params: [
          {
            accountInclude: whaleAddresses,
          },
          {
            commitment: 'confirmed',
            encoding: 'jsonParsed',
            transactionDetails: 'full',
            showRewards: false,
            maxSupportedTransactionVersion: 0,
          },
        ],
      }

      ws.send(JSON.stringify(subscribeMessage))
      console.log(colors.cyan(`📡 Subscribed to ${whaleAddresses.length} whale addresses`))
      console.log(colors.yellow('\n⏳ Waiting for transactions...\n'))
      
      // Start stats display
      startStatsDisplay()
    })

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())
        
        if (message.method === 'transactionNotification') {
          await handleTransaction(message.params.result)
        }
      } catch (error: any) {
        console.error(colors.red('❌ Error processing message:'), error.message)
        stats.errors++
      }
    })

    ws.on('error', (error: Error) => {
      console.error(colors.red('❌ WebSocket error:'), error.message)
    })

    ws.on('close', () => {
      console.log(colors.yellow('\n⚠️  WebSocket disconnected'))
      
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++
        console.log(colors.cyan(`🔄 Reconnecting... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`))
        setTimeout(() => connectWebSocket(whaleAddresses), 5000)
      } else {
        console.log(colors.red('❌ Max reconnection attempts reached. Exiting...'))
        printFinalStats()
        process.exit(1)
      }
    })

  } catch (error: any) {
    console.error(colors.red('❌ Failed to connect WebSocket:'), error.message)
    process.exit(1)
  }
}

// ============================================================================
// TRANSACTION HANDLING
// ============================================================================

async function handleTransaction(tx: any) {
  stats.totalTransactions++
  
  const signature = tx.signature
  if (!signature) {
    console.log(colors.gray('⏭️  Skipped: No signature'))
    return
  }

  try {
    // Fetch full transaction details from Shyft API
    const shyftResponse = await fetchShyftTransaction(signature)
    
    if (!shyftResponse) {
      console.log(colors.gray(`⏭️  Skipped: ${signature.substring(0, 20)}... (no Shyft data)`))
      return
    }

    // Parse with V2 parser
    const parseResult = parseShyftTransaction(shyftResponse)

    if (parseResult) {
      stats.validSwaps++
      
      const side = parseResult.side
      const inputToken = parseResult.input.symbol || 'UNKNOWN'
      const outputToken = parseResult.output.symbol || 'UNKNOWN'
      const inputAmount = parseResult.input.amount
      const outputAmount = parseResult.output.amount
      const confidence = parseResult.confidence
      
      if (side === 'BUY') stats.buyCount++
      if (side === 'SELL') stats.sellCount++
      
      // Track unique tokens
      stats.uniqueTokens.add(parseResult.input.mint)
      stats.uniqueTokens.add(parseResult.output.mint)

      console.log(colors.green(`✅ ${side} ${outputToken}`))
      console.log(colors.gray(`   Signature: ${signature.substring(0, 40)}...`))
      console.log(colors.gray(`   ${inputToken} (${inputAmount.toFixed(2)}) → ${outputToken} (${outputAmount.toFixed(2)})`))
      console.log(colors.gray(`   Confidence: ${confidence} | Source: ${parseResult.classification_source}`))
      console.log('')

    } else {
      stats.erased++
      console.log(colors.yellow(`⏭️  ERASED: Parser returned null`))
      console.log(colors.gray(`   Signature: ${signature.substring(0, 40)}...`))
      console.log('')
    }

  } catch (error: any) {
    stats.errors++
    console.error(colors.red(`❌ Error processing ${signature.substring(0, 20)}...`), error.message)
  }
}

async function fetchShyftTransaction(signature: string): Promise<any> {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed`,
      {
        params: {
          network: 'mainnet-beta',
          txn_signature: signature,
        },
        headers: {
          'x-api-key': SHYFT_API_KEY,
        },
      }
    )

    return response.data?.result || null
  } catch (error: any) {
    if (error.response?.status === 429) {
      console.log(colors.yellow('⚠️  Rate limited, waiting...'))
      await new Promise(resolve => setTimeout(resolve, 1000))
      return fetchShyftTransaction(signature)
    }
    return null
  }
}

// ============================================================================
// STATISTICS DISPLAY
// ============================================================================

function startStatsDisplay() {
  setInterval(() => {
    printLiveStats()
  }, 10000) // Every 10 seconds
}

function printLiveStats() {
  const runtime = Math.floor((Date.now() - stats.startTime) / 1000)
  const minutes = Math.floor(runtime / 60)
  const seconds = runtime % 60
  
  console.log(colors.cyan('\n' + '═'.repeat(80)))
  console.log(colors.cyan(colors.bold('📊 LIVE STATISTICS')))
  console.log(colors.cyan('═'.repeat(80)))
  console.log(colors.white(`Runtime: ${minutes}m ${seconds}s`))
  console.log(colors.white(`Total Transactions: ${stats.totalTransactions}`))
  console.log(colors.green(`✅ Valid Swaps: ${stats.validSwaps} (${stats.totalTransactions > 0 ? ((stats.validSwaps / stats.totalTransactions) * 100).toFixed(1) : 0}%)`))
  console.log(colors.blue(`   - Buys: ${stats.buyCount}`))
  console.log(colors.magenta(`   - Sells: ${stats.sellCount}`))
  console.log(colors.yellow(`⏭️  Erased: ${stats.erased}`))
  console.log(colors.red(`❌ Errors: ${stats.errors}`))
  console.log(colors.cyan(`🪙 Unique Tokens: ${stats.uniqueTokens.size}`))
  console.log(colors.cyan('═'.repeat(80) + '\n'))
}

function printFinalStats() {
  const runtime = Math.floor((Date.now() - stats.startTime) / 1000)
  const minutes = Math.floor(runtime / 60)
  const seconds = runtime % 60
  
  console.log(colors.cyan('\n' + '═'.repeat(80)))
  console.log(colors.cyan(colors.bold('📊 FINAL STATISTICS')))
  console.log(colors.cyan('═'.repeat(80)))
  console.log(colors.white(`Total Runtime: ${minutes}m ${seconds}s`))
  console.log(colors.white(`Total Transactions Processed: ${stats.totalTransactions}`))
  console.log(colors.green(`✅ Valid Swaps Detected: ${stats.validSwaps} (${stats.totalTransactions > 0 ? ((stats.validSwaps / stats.totalTransactions) * 100).toFixed(1) : 0}%)`))
  console.log(colors.blue(`   - Buy Transactions: ${stats.buyCount}`))
  console.log(colors.magenta(`   - Sell Transactions: ${stats.sellCount}`))
  console.log(colors.yellow(`⏭️  Erased Transactions: ${stats.erased} (${stats.totalTransactions > 0 ? ((stats.erased / stats.totalTransactions) * 100).toFixed(1) : 0}%)`))
  console.log(colors.red(`❌ Errors: ${stats.errors}`))
  console.log(colors.cyan(`🪙 Unique Tokens Traded: ${stats.uniqueTokens.size}`))
  console.log(colors.cyan('═'.repeat(80) + '\n'))
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')))
  console.log(colors.cyan(colors.bold('║         V2 Parser Live Simulation - Production Environment                ║')))
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')))

  console.log(colors.yellow('⚠️  This simulates the production environment WITHOUT saving to database'))
  console.log(colors.gray('   Press Ctrl+C to stop\n'))

  // Connect to MongoDB
  console.log(colors.cyan('📊 Connecting to MongoDB...'))
  await mongoose.connect(MONGO_URI)
  console.log(colors.green('✅ Connected to MongoDB\n'))

  // Fetch all whale addresses
  console.log(colors.cyan('📊 Fetching whale addresses from transactions...'))
  const whaleAddresses = await whaleAllTransactionModelV2.distinct('whale.address')
  
  console.log(colors.green(`✅ Found ${whaleAddresses.length} unique whale addresses to track\n`))

  if (whaleAddresses.length === 0) {
    console.log(colors.red('❌ No whale addresses found in database'))
    process.exit(1)
  }

  // Connect WebSocket
  connectWebSocket(whaleAddresses)

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log(colors.yellow('\n\n⚠️  Shutting down...'))
    if (ws) {
      ws.close()
    }
    printFinalStats()
    await mongoose.disconnect()
    console.log(colors.green('✅ Disconnected from MongoDB'))
    process.exit(0)
  })
}

main().catch((error) => {
  console.error(colors.red('💥 Fatal Error:'), error)
  process.exit(1)
})
