/**
 * Test V2 Parser on Recent Database Transactions
 * 
 * This script:
 * 1. Fetches recent transactions from V1 database (last 10 minutes)
 * 2. Runs V2 parser on each transaction
 * 3. Compares results
 * 4. Shows what V2 accepts vs rejects
 */

const mongoose = require('mongoose')
const axios = require('axios')
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || ''
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || ''

// Import models
const WhaleAllTransactionsV2 = require('./src/models/whaleAllTransactionsV2.model').default

const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  white: (text) => `\x1b[37m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
}

const results = {
  total: 0,
  v2Accepted: 0,
  v2Rejected: 0,
  v2AcceptedList: [],
  v2RejectedList: [],
  byType: {
    BUY: { accepted: 0, rejected: 0 },
    SELL: { accepted: 0, rejected: 0 },
    UNKNOWN: { accepted: 0, rejected: 0 }
  },
  rejectionReasons: {}
}

async function fetchShyftTransaction(signature) {
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
        timeout: 10000
      }
    )

    return response.data?.result || null
  } catch (error) {
    if (error.response?.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      return fetchShyftTransaction(signature)
    }
    return null
  }
}

async function testTransaction(v1Tx, index, total) {
  const signature = v1Tx.transaction?.signature
  if (!signature) return

  process.stdout.write(`\r${colors.cyan(`Testing ${index}/${total}...`)}`)

  try {
    const shyftResponse = await fetchShyftTransaction(signature)
    if (!shyftResponse) {
      results.v2Rejected++
      results.v2RejectedList.push({
        signature,
        v1Type: v1Tx.type,
        reason: 'shyft_fetch_failed'
      })
      return
    }

    const v2Input = {
      signature: signature,
      timestamp: shyftResponse.timestamp ? new Date(shyftResponse.timestamp).getTime() : Date.now(),
      status: shyftResponse.status || 'Success',
      fee: shyftResponse.fee || 0,
      fee_payer: shyftResponse.fee_payer || '',
      signers: shyftResponse.signers || [],
      protocol: shyftResponse.protocol,
      token_balance_changes: shyftResponse.token_balance_changes || [],
      actions: shyftResponse.actions || []
    }

    const parseResult = parseShyftTransactionV2(v2Input)

    if (parseResult.success && parseResult.data) {
      results.v2Accepted++
      
      const swapData = parseResult.data
      const direction = 'sellRecord' in swapData ? swapData.sellRecord.direction : swapData.direction
      
      results.byType[direction || 'UNKNOWN'].accepted++
      
      results.v2AcceptedList.push({
        signature,
        v1Type: v1Tx.type,
        v2Direction: direction,
        v1InputToken: v1Tx.transaction?.tokenIn?.symbol,
        v1OutputToken: v1Tx.transaction?.tokenOut?.symbol,
        v2InputToken: 'sellRecord' in swapData ? swapData.sellRecord.quoteAsset.symbol : (direction === 'BUY' ? swapData.quoteAsset.symbol : swapData.baseAsset.symbol),
        v2OutputToken: 'sellRecord' in swapData ? swapData.sellRecord.baseAsset.symbol : (direction === 'BUY' ? swapData.baseAsset.symbol : swapData.quoteAsset.symbol),
        isSplit: 'sellRecord' in swapData
      })
    } else {
      results.v2Rejected++
      
      const reason = parseResult.erase?.reason || 'unknown'
      results.rejectionReasons[reason] = (results.rejectionReasons[reason] || 0) + 1
      
      results.byType[v1Tx.type || 'UNKNOWN'].rejected++
      
      results.v2RejectedList.push({
        signature,
        v1Type: v1Tx.type,
        v1InputToken: v1Tx.transaction?.tokenIn?.symbol,
        v1OutputToken: v1Tx.transaction?.tokenOut?.symbol,
        reason: reason
      })
    }
  } catch (error) {
    results.v2Rejected++
    results.v2RejectedList.push({
      signature,
      v1Type: v1Tx.type,
      reason: 'test_error: ' + error.message
    })
  }
}

async function main() {
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')))
  console.log(colors.cyan(colors.bold('║         V2 Parser Test on Recent V1 Database Transactions                 ║')))
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')))

  // Connect to MongoDB
  console.log(colors.cyan('📊 Connecting to MongoDB...'))
  await mongoose.connect(MONGO_URI)
  console.log(colors.green('✅ Connected to MongoDB\n'))

  // Fetch recent transactions (last 10 minutes)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
  console.log(colors.cyan(`📊 Fetching V1 transactions from last 10 minutes (since ${tenMinutesAgo.toISOString()})...\n`))

  const v1Transactions = await WhaleAllTransactionsV2.find({
    'transaction.timestamp': {
      $gte: tenMinutesAgo
    }
  }).limit(100).lean()

  console.log(colors.white(`Found ${v1Transactions.length} V1 transactions\n`))

  if (v1Transactions.length === 0) {
    console.log(colors.yellow('⚠️  No recent transactions found. Try increasing the time window.\n'))
    await mongoose.disconnect()
    process.exit(0)
  }

  results.total = v1Transactions.length

  console.log(colors.cyan('🔍 Testing each transaction with V2 parser...\n'))

  // Test each transaction
  for (let i = 0; i < v1Transactions.length; i++) {
    await testTransaction(v1Transactions[i], i + 1, v1Transactions.length)
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  console.log('\n\n' + colors.cyan('═'.repeat(80)))
  console.log(colors.cyan(colors.bold('RESULTS')))
  console.log(colors.cyan('═'.repeat(80)))

  console.log(colors.white(`\nTotal V1 Transactions Tested: ${results.total}`))
  console.log(colors.green(`✅ V2 Accepted: ${results.v2Accepted} (${(results.v2Accepted / results.total * 100).toFixed(1)}%)`))
  console.log(colors.red(`❌ V2 Rejected: ${results.v2Rejected} (${(results.v2Rejected / results.total * 100).toFixed(1)}%)`))

  console.log(colors.cyan('\n─'.repeat(80)))
  console.log(colors.cyan('By Transaction Type:'))
  console.log(colors.cyan('─'.repeat(80)))
  
  Object.entries(results.byType).forEach(([type, counts]) => {
    if (counts.accepted + counts.rejected > 0) {
      const total = counts.accepted + counts.rejected
      const acceptRate = (counts.accepted / total * 100).toFixed(1)
      console.log(colors.white(`\n${type}:`))
      console.log(colors.green(`  ✅ Accepted: ${counts.accepted} (${acceptRate}%)`))
      console.log(colors.red(`  ❌ Rejected: ${counts.rejected} (${(100 - acceptRate).toFixed(1)}%)`))
    }
  })

  if (Object.keys(results.rejectionReasons).length > 0) {
    console.log(colors.cyan('\n─'.repeat(80)))
    console.log(colors.cyan('Rejection Reasons:'))
    console.log(colors.cyan('─'.repeat(80)))
    
    Object.entries(results.rejectionReasons)
      .sort((a, b) => b[1] - a[1])
      .forEach(([reason, count]) => {
        console.log(colors.red(`  ${reason}: ${count} (${(count / results.v2Rejected * 100).toFixed(1)}%)`))
      })
  }

  // Show sample accepted transactions
  if (results.v2AcceptedList.length > 0) {
    console.log(colors.cyan('\n─'.repeat(80)))
    console.log(colors.green('Sample Accepted Transactions (first 10):'))
    console.log(colors.cyan('─'.repeat(80)))
    
    results.v2AcceptedList.slice(0, 10).forEach((tx, i) => {
      console.log(colors.green(`\n${i + 1}. ${tx.signature.substring(0, 20)}...`))
      console.log(colors.gray(`   V1: ${tx.v1Type} | ${tx.v1InputToken} → ${tx.v1OutputToken}`))
      console.log(colors.gray(`   V2: ${tx.v2Direction} | ${tx.v2InputToken} → ${tx.v2OutputToken}${tx.isSplit ? ' (SPLIT)' : ''}`))
    })
  }

  // Show sample rejected transactions
  if (results.v2RejectedList.length > 0) {
    console.log(colors.cyan('\n─'.repeat(80)))
    console.log(colors.red('Sample Rejected Transactions (first 10):'))
    console.log(colors.cyan('─'.repeat(80)))
    
    results.v2RejectedList.slice(0, 10).forEach((tx, i) => {
      console.log(colors.red(`\n${i + 1}. ${tx.signature.substring(0, 20)}...`))
      console.log(colors.gray(`   V1: ${tx.v1Type} | ${tx.v1InputToken} → ${tx.v1OutputToken}`))
      console.log(colors.gray(`   Reason: ${tx.reason}`))
    })
  }

  console.log(colors.cyan('\n' + '═'.repeat(80)))
  console.log(colors.cyan(colors.bold('VERDICT')))
  console.log(colors.cyan('═'.repeat(80)))

  const acceptRate = (results.v2Accepted / results.total * 100).toFixed(1)
  
  if (acceptRate >= 95) {
    console.log(colors.green(`\n✅ EXCELLENT! V2 accepts ${acceptRate}% of V1 transactions`))
  } else if (acceptRate >= 80) {
    console.log(colors.yellow(`\n⚠️  GOOD! V2 accepts ${acceptRate}% of V1 transactions`))
    console.log(colors.yellow(`   Some improvements needed for the ${(100 - acceptRate).toFixed(1)}% rejected`))
  } else {
    console.log(colors.red(`\n❌ NEEDS WORK! V2 only accepts ${acceptRate}% of V1 transactions`))
    console.log(colors.red(`   Significant improvements needed`))
  }

  console.log(colors.cyan('\n' + '═'.repeat(80) + '\n'))

  await mongoose.disconnect()
  console.log(colors.green('✅ Disconnected from MongoDB\n'))
}

main().catch(error => {
  console.error(colors.red('💥 Fatal Error:'), error)
  process.exit(1)
})
