/**
 * Live V1 vs V2 Parser Comparison
 * 
 * 1. Start tracking at a specific time
 * 2. Run V2 parser for 5 minutes
 * 3. Log all V2 detections
 * 4. Query DB for V1 transactions in the same time window
 * 5. Compare: Does V2 have all V1 transactions + extras?
 */

import * as dotenv from 'dotenv'
import axios from 'axios'
import mongoose from 'mongoose'
import { parseShyftTransaction } from './src/utils/shyftParser'
import whaleAllTransactionModelV2 from './src/models/whaleAllTransactionsV2.model'
import * as fs from 'fs'

dotenv.config()

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || ''
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || ''
const WSS_URL = process.env.WSS_URL || ''
const TEST_DURATION_MS = 5 * 60 * 1000 // 5 minutes

// Color helpers
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

interface V2Detection {
  signature: string
  timestamp: Date
  side: string
  inputToken: string
  outputToken: string
  inputMint: string
  outputMint: string
  inputAmount: number
  outputAmount: number
  inputAmountNormalized: string
  outputAmountNormalized: string
  whaleAddress: string
  confidence: string
  source: string
}

let startTime: Date
let endTime: Date
const v2Detections: V2Detection[] = []
let ws: any = null
let testTimeout: NodeJS.Timeout

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
      await new Promise(resolve => setTimeout(resolve, 1000))
      return fetchShyftTransaction(signature)
    }
    return null
  }
}

async function handleTransaction(tx: any) {
  const signature = tx.signature
  if (!signature) return

  try {
    const shyftResponse = await fetchShyftTransaction(signature)
    if (!shyftResponse) return

    const parseResult = parseShyftTransaction(shyftResponse)

    if (parseResult) {
      // Normalize amounts (divide by 10^decimals to get human-readable)
      const inputNormalized = parseResult.input.decimals 
        ? (parseResult.input.amount / Math.pow(10, parseResult.input.decimals)).toFixed(6)
        : parseResult.input.amount.toString()
      
      const outputNormalized = parseResult.output.decimals
        ? (parseResult.output.amount / Math.pow(10, parseResult.output.decimals)).toFixed(6)
        : parseResult.output.amount.toString()

      const detection: V2Detection = {
        signature,
        timestamp: new Date(),
        side: parseResult.side,
        inputToken: parseResult.input.symbol || 'UNKNOWN',
        outputToken: parseResult.output.symbol || 'UNKNOWN',
        inputMint: parseResult.input.mint,
        outputMint: parseResult.output.mint,
        inputAmount: parseResult.input.amount,
        outputAmount: parseResult.output.amount,
        inputAmountNormalized: inputNormalized,
        outputAmountNormalized: outputNormalized,
        whaleAddress: parseResult.swapper || 'UNKNOWN',
        confidence: parseResult.confidence,
        source: parseResult.classification_source
      }

      v2Detections.push(detection)

      console.log(colors.green(`\n✅ V2 DETECTED: ${parseResult.side}`))
      console.log(colors.gray(`   Signature: ${signature}`))
      console.log(colors.gray(`   Whale: ${detection.whaleAddress.substring(0, 8)}...`))
      console.log(colors.gray(`   ${detection.inputToken} (${inputNormalized}) → ${detection.outputToken} (${outputNormalized})`))
      console.log(colors.gray(`   Input Mint:  ${detection.inputMint.substring(0, 8)}...`))
      console.log(colors.gray(`   Output Mint: ${detection.outputMint.substring(0, 8)}...`))
      console.log(colors.gray(`   Confidence: ${detection.confidence} | Source: ${detection.source}`))
    }
  } catch (error: any) {
    // Silent errors to keep output clean
  }
}

function connectWebSocket(whaleAddresses: string[]) {
  const WebSocket = require('ws')
  
  ws = new WebSocket(WSS_URL)

  ws.on('open', () => {
    console.log(colors.green('\n✅ WebSocket connected!'))
    
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
    
    // Record start time
    startTime = new Date()
    console.log(colors.yellow(`\n⏱️  TEST STARTED at ${startTime.toISOString()}`))
    console.log(colors.yellow(`   Will run for 5 minutes until ${new Date(startTime.getTime() + TEST_DURATION_MS).toISOString()}`))
    console.log(colors.cyan('\n🔍 Monitoring for transactions...\n'))

    // Set timeout to end test after 5 minutes
    testTimeout = setTimeout(async () => {
      endTime = new Date()
      console.log(colors.yellow(`\n\n⏱️  TEST ENDED at ${endTime.toISOString()}`))
      ws.close()
      await compareResults()
    }, TEST_DURATION_MS)
  })

  ws.on('message', async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString())
      if (message.method === 'transactionNotification') {
        await handleTransaction(message.params.result)
      }
    } catch (error: any) {
      // Silent
    }
  })

  ws.on('error', (error: Error) => {
    console.error(colors.red('❌ WebSocket error:'), error.message)
  })

  ws.on('close', () => {
    console.log(colors.yellow('\n⚠️  WebSocket disconnected'))
  })
}

async function compareResults() {
  console.log(colors.cyan('\n\n' + '═'.repeat(80)))
  console.log(colors.cyan(colors.bold('COMPARISON: V1 (Database) vs V2 (Live Parser)')))
  console.log(colors.cyan('═'.repeat(80)))

  console.log(colors.white(`\nTime Window: ${startTime.toISOString()} to ${endTime.toISOString()}`))
  console.log(colors.white(`Duration: ${((endTime.getTime() - startTime.getTime()) / 1000 / 60).toFixed(1)} minutes\n`))

  // Query V1 transactions from database in the same time window
  console.log(colors.cyan('📊 Querying V1 transactions from database...\n'))
  
  const v1Transactions = await whaleAllTransactionModelV2.find({
    'transaction.timestamp': {
      $gte: startTime,
      $lte: endTime
    }
  }).lean()

  console.log(colors.white(`V1 (Database) found: ${v1Transactions.length} transactions`))
  console.log(colors.white(`V2 (Live Parser) found: ${v2Detections.length} transactions\n`))

  // Create signature sets for comparison
  const v1Signatures = new Set(v1Transactions.map((tx: any) => tx.transaction?.signature).filter(Boolean))
  const v2Signatures = new Set(v2Detections.map(d => d.signature))

  // Find matches and differences
  const v2HasAll = Array.from(v1Signatures).every(sig => v2Signatures.has(sig))
  const v2Extras = Array.from(v2Signatures).filter(sig => !v1Signatures.has(sig))
  const v1Extras = Array.from(v1Signatures).filter(sig => !v2Signatures.has(sig))
  const matches = Array.from(v1Signatures).filter(sig => v2Signatures.has(sig))

  console.log(colors.cyan('─'.repeat(80)))
  console.log(colors.green(`✅ Matches (Both V1 and V2): ${matches.length}`))
  console.log(colors.yellow(`🎯 V2 Extras (V2 found, V1 missed): ${v2Extras.length}`))
  console.log(colors.red(`❌ V1 Extras (V1 found, V2 missed): ${v1Extras.length}`))
  console.log(colors.cyan('─'.repeat(80)))

  // Detailed breakdown
  if (v2Extras.length > 0) {
    console.log(colors.yellow(`\n🎉 V2 FOUND ${v2Extras.length} ADDITIONAL TRANSACTIONS:\n`))
    v2Extras.slice(0, 20).forEach((sig, i) => {
      const detection = v2Detections.find(d => d.signature === sig)
      if (detection) {
        console.log(colors.yellow(`${i + 1}. ${sig}`))
        console.log(colors.gray(`   Whale: ${detection.whaleAddress.substring(0, 8)}...`))
        console.log(colors.gray(`   ${detection.side}: ${detection.inputToken} (${detection.inputAmountNormalized}) → ${detection.outputToken} (${detection.outputAmountNormalized})`))
        console.log(colors.gray(`   Input Mint:  ${detection.inputMint.substring(0, 8)}...`))
        console.log(colors.gray(`   Output Mint: ${detection.outputMint.substring(0, 8)}...`))
        console.log(colors.gray(`   Confidence: ${detection.confidence} | Source: ${detection.source}\n`))
      }
    })
    if (v2Extras.length > 20) {
      console.log(colors.gray(`   ... and ${v2Extras.length - 20} more\n`))
    }
  }

  if (v1Extras.length > 0) {
    console.log(colors.red(`\n⚠️  V1 FOUND ${v1Extras.length} TRANSACTIONS THAT V2 MISSED:\n`))
    v1Extras.forEach((sig, i) => {
      const v1Tx = v1Transactions.find((tx: any) => tx.transaction?.signature === sig)
      if (v1Tx) {
        console.log(colors.red(`${i + 1}. ${sig}`))
        console.log(colors.gray(`   Whale: ${v1Tx.whale?.address?.substring(0, 8) || v1Tx.whaleAddress?.substring(0, 8)}...`))
        console.log(colors.gray(`   Type: ${v1Tx.type}`))
        console.log(colors.gray(`   ${v1Tx.transaction?.tokenIn?.symbol} → ${v1Tx.transaction?.tokenOut?.symbol}`))
        console.log(colors.gray(`   Input Mint:  ${v1Tx.transaction?.tokenIn?.address?.substring(0, 8)}...`))
        console.log(colors.gray(`   Output Mint: ${v1Tx.transaction?.tokenOut?.address?.substring(0, 8)}...`))
        console.log(colors.gray(`   Input Amount:  ${v1Tx.transaction?.tokenIn?.amount}`))
        console.log(colors.gray(`   Output Amount: ${v1Tx.transaction?.tokenOut?.amount}\n`))
      }
    })
  }

  // Show matches details
  if (matches.length > 0) {
    console.log(colors.green(`\n✅ MATCHES (Both V1 and V2 detected): ${matches.length}\n`))
    matches.slice(0, 10).forEach((sig, i) => {
      const v1Tx = v1Transactions.find((tx: any) => tx.transaction?.signature === sig)
      const v2Tx = v2Detections.find(d => d.signature === sig)
      if (v1Tx && v2Tx) {
        console.log(colors.green(`${i + 1}. ${sig}`))
        console.log(colors.gray(`   Whale: ${v2Tx.whaleAddress.substring(0, 8)}...`))
        console.log(colors.gray(`   V1: ${v1Tx.type} | ${v1Tx.transaction?.tokenIn?.symbol} → ${v1Tx.transaction?.tokenOut?.symbol}`))
        console.log(colors.gray(`   V2: ${v2Tx.side} | ${v2Tx.inputToken} (${v2Tx.inputAmountNormalized}) → ${v2Tx.outputToken} (${v2Tx.outputAmountNormalized})`))
        console.log(colors.gray(`   Confidence: ${v2Tx.confidence}\n`))
      }
    })
    if (matches.length > 10) {
      console.log(colors.gray(`   ... and ${matches.length - 10} more matches\n`))
    }
  }

  // Final verdict
  console.log(colors.cyan('\n' + '═'.repeat(80)))
  console.log(colors.cyan(colors.bold('VERDICT')))
  console.log(colors.cyan('═'.repeat(80)))

  if (v2Extras.length > 0 && v1Extras.length === 0) {
    console.log(colors.green('\n✅ V2 PARSER IS BETTER!'))
    console.log(colors.green(`   V2 found ALL ${v1Transactions.length} V1 transactions`))
    console.log(colors.green(`   PLUS ${v2Extras.length} additional transactions that V1 missed`))
  } else if (v2Extras.length === 0 && v1Extras.length === 0) {
    console.log(colors.green('\n✅ V2 PARSER MATCHES V1 EXACTLY'))
    console.log(colors.white(`   Both found the same ${matches.length} transactions`))
  } else if (v1Extras.length > 0) {
    console.log(colors.yellow('\n⚠️  V2 PARSER NEEDS IMPROVEMENT'))
    console.log(colors.yellow(`   V2 found ${v2Detections.length} transactions`))
    console.log(colors.yellow(`   But missed ${v1Extras.length} that V1 detected`))
    if (v2Extras.length > 0) {
      console.log(colors.yellow(`   However, V2 found ${v2Extras.length} new ones that V1 missed`))
    }
  }

  console.log(colors.cyan('\n' + '═'.repeat(80) + '\n'))

  // Save detailed report
  const report = {
    testWindow: {
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      durationMinutes: (endTime.getTime() - startTime.getTime()) / 1000 / 60
    },
    v1: {
      total: v1Transactions.length,
      signatures: Array.from(v1Signatures)
    },
    v2: {
      total: v2Detections.length,
      signatures: Array.from(v2Signatures),
      detections: v2Detections
    },
    comparison: {
      matches: matches.length,
      v2Extras: v2Extras.length,
      v1Extras: v1Extras.length,
      v2ExtraSignatures: v2Extras,
      v1ExtraSignatures: v1Extras
    }
  }

  fs.writeFileSync('v1-v2-comparison-report.json', JSON.stringify(report, null, 2))
  console.log(colors.gray('📄 Detailed report saved to: v1-v2-comparison-report.json\n'))

  await mongoose.disconnect()
  console.log(colors.green('✅ Disconnected from MongoDB\n'))
  process.exit(0)
}

async function main() {
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')))
  console.log(colors.cyan(colors.bold('║         Live V1 vs V2 Parser Comparison (5 Minutes)                       ║')))
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')))

  // Connect to MongoDB
  console.log(colors.cyan('📊 Connecting to MongoDB...'))
  await mongoose.connect(MONGO_URI)
  console.log(colors.green('✅ Connected to MongoDB\n'))

  // Fetch whale addresses
  console.log(colors.cyan('📊 Fetching whale addresses...'))
  const whaleAddresses = await whaleAllTransactionModelV2.distinct('whale.address')
  console.log(colors.green(`✅ Found ${whaleAddresses.length} whale addresses\n`))

  // Connect WebSocket and start test
  connectWebSocket(whaleAddresses)

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log(colors.yellow('\n\n⚠️  Test interrupted by user'))
    if (testTimeout) clearTimeout(testTimeout)
    if (ws) ws.close()
    if (startTime) {
      endTime = new Date()
      await compareResults()
    } else {
      await mongoose.disconnect()
      process.exit(0)
    }
  })
}

main().catch((error) => {
  console.error(colors.red('💥 Fatal Error:'), error)
  process.exit(1)
})
