/**
 * Check V1 Database for Transactions in Test Window
 * 
 * Query the database to see what V1 transactions exist in the comparison window
 * and why signatures weren't captured properly.
 */

const mongoose = require('mongoose')
const WhaleAllTransactionsV2 = require('./src/models/whaleAllTransactionsV2.model').default

require('dotenv').config()

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || ''

// Test window from the comparison report
const START_TIME = new Date('2026-02-02T22:20:45.640Z')
const END_TIME = new Date('2026-02-02T22:25:45.665Z')

async function checkV1Database() {
  console.log('🔍 CHECKING V1 DATABASE FOR TEST WINDOW')
  console.log('=' .repeat(60))
  console.log(`Start: ${START_TIME.toISOString()}`)
  console.log(`End: ${END_TIME.toISOString()}`)
  console.log('')

  // Connect to MongoDB
  console.log('📊 Connecting to MongoDB...')
  await mongoose.connect(MONGO_URI)
  console.log('✅ Connected to MongoDB\n')

  // Query V1 transactions in the test window
  console.log('📊 Querying V1 transactions...')
  const v1Transactions = await WhaleAllTransactionsV2.find({
    'transaction.timestamp': {
      $gte: START_TIME,
      $lte: END_TIME
    }
  }).lean()

  console.log(`Found ${v1Transactions.length} V1 transactions in the window\n`)

  if (v1Transactions.length === 0) {
    console.log('❌ No V1 transactions found in the test window')
    console.log('   This explains why V1 signatures array was empty')
    console.log('   Possible reasons:')
    console.log('   1. V1 parser was not running during the test')
    console.log('   2. V1 transactions were saved with different timestamps')
    console.log('   3. Database connection issues during the test')
  } else {
    console.log('📋 V1 Transactions Details:')
    console.log('=' .repeat(40))
    
    v1Transactions.forEach((tx, i) => {
      console.log(`${i + 1}. Signature: ${tx.transaction?.signature || 'MISSING'}`)
      console.log(`   Timestamp: ${tx.transaction?.timestamp}`)
      console.log(`   Type: ${tx.type}`)
      console.log(`   Whale: ${tx.whale?.address?.substring(0, 8) || tx.whaleAddress?.substring(0, 8)}...`)
      console.log(`   ${tx.transaction?.tokenIn?.symbol} → ${tx.transaction?.tokenOut?.symbol}`)
      console.log(`   Input Amount: ${tx.transaction?.tokenIn?.amount}`)
      console.log(`   Output Amount: ${tx.transaction?.tokenOut?.amount}`)
      console.log('')
    })

    // Check for missing signatures
    const missingSignatures = v1Transactions.filter(tx => !tx.transaction?.signature)
    if (missingSignatures.length > 0) {
      console.log(`⚠️  ${missingSignatures.length} transactions have missing signatures`)
    }

    // Extract signatures
    const signatures = v1Transactions
      .map(tx => tx.transaction?.signature)
      .filter(Boolean)
    
    console.log(`✅ Valid signatures found: ${signatures.length}`)
    
    if (signatures.length > 0) {
      console.log('\n📋 V1 Signatures:')
      signatures.forEach((sig, i) => {
        console.log(`${i + 1}. ${sig}`)
      })
    }
  }

  // Also check for transactions around the test window
  console.log('\n🔍 Checking for transactions around the test window...')
  const beforeWindow = new Date(START_TIME.getTime() - 10 * 60 * 1000) // 10 minutes before
  const afterWindow = new Date(END_TIME.getTime() + 10 * 60 * 1000)   // 10 minutes after

  const nearbyTransactions = await WhaleAllTransactionsV2.find({
    'transaction.timestamp': {
      $gte: beforeWindow,
      $lte: afterWindow
    }
  }).lean()

  console.log(`Found ${nearbyTransactions.length} transactions in extended window (±10 minutes)`)

  if (nearbyTransactions.length > v1Transactions.length) {
    console.log(`\n⚠️  There are ${nearbyTransactions.length - v1Transactions.length} additional transactions outside the exact test window`)
    console.log('   This suggests V1 was running but with timing differences')
    
    // Show transactions just outside the window
    const outsideWindow = nearbyTransactions.filter(tx => {
      const timestamp = new Date(tx.transaction?.timestamp)
      return timestamp < START_TIME || timestamp > END_TIME
    })
    
    console.log('\n📋 Transactions outside test window:')
    outsideWindow.slice(0, 5).forEach((tx, i) => {
      const timestamp = new Date(tx.transaction?.timestamp)
      const timeDiff = timestamp < START_TIME 
        ? `${Math.round((START_TIME - timestamp) / 1000)}s before start`
        : `${Math.round((timestamp - END_TIME) / 1000)}s after end`
      
      console.log(`${i + 1}. ${tx.transaction?.signature || 'NO_SIG'}`)
      console.log(`   Time: ${timestamp.toISOString()} (${timeDiff})`)
      console.log(`   Type: ${tx.type}`)
      console.log('')
    })
  }

  await mongoose.disconnect()
  console.log('\n✅ Disconnected from MongoDB')
}

checkV1Database().catch(console.error)