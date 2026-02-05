/**
 * Check what's stored in the database for the LASER transaction
 */

const mongoose = require('mongoose')
require('dotenv').config()

const signature = 'ZkD29a4wUftF4j2fqpyR9GoKrWvnk5iKHxUbr6vBDFoaNwHNadx51P4ECTHRMvWrwbgWkS6KfqAGxPv9mNZzsc8'

async function checkDatabase() {
  try {
    console.log('🔍 Connecting to MongoDB...')
    await mongoose.connect(process.env.MONGO_URI)
    console.log('✅ Connected to MongoDB\n')

    // Check whale transactions
    console.log('📊 Checking Whale Transactions Collection...')
    const WhaleTransaction = mongoose.model('whaleTransactions', new mongoose.Schema({}, { strict: false }))
    const whaleRecords = await WhaleTransaction.find({ signature }).lean()
    
    if (whaleRecords.length > 0) {
      console.log(`Found ${whaleRecords.length} whale transaction record(s):\n`)
      whaleRecords.forEach((record, idx) => {
        console.log(`Record ${idx + 1}:`)
        console.log('='.repeat(80))
        console.log('Type:', record.type)
        console.log('Timestamp:', record.timestamp)
        console.log('\n📥 INPUT (Token Spent):')
        console.log('  Symbol:', record.tokenInSymbol)
        console.log('  Address:', record.tokenInAddress)
        console.log('  Amount:', record.tokenInAmount)
        console.log('  Price:', record.tokenInPrice)
        console.log('  USD Amount:', record.tokenInUsdAmount)
        console.log('\n📤 OUTPUT (Token Received):')
        console.log('  Symbol:', record.tokenOutSymbol)
        console.log('  Address:', record.tokenOutAddress)
        console.log('  Amount:', record.tokenOutAmount)
        console.log('  Price:', record.tokenOutPrice)
        console.log('  USD Amount:', record.tokenOutUsdAmount)
        console.log('\n💰 Transaction Value:')
        console.log('  Gas Fee:', record.gasFee)
        console.log('  Platform:', record.platform)
        console.log('\n🔍 Classification:')
        console.log('  Source:', record.classificationSource)
        console.log('  Confidence:', record.confidence)
        console.log('\n' + '='.repeat(80) + '\n')
      })
    } else {
      console.log('❌ No whale transaction records found\n')
    }

    // Check KOL transactions
    console.log('📊 Checking KOL Transactions Collection...')
    const KolTransaction = mongoose.model('influencerWhaleTransactionsV2', new mongoose.Schema({}, { strict: false }))
    const kolRecords = await KolTransaction.find({ signature }).lean()
    
    if (kolRecords.length > 0) {
      console.log(`Found ${kolRecords.length} KOL transaction record(s):\n`)
      kolRecords.forEach((record, idx) => {
        console.log(`Record ${idx + 1}:`)
        console.log('='.repeat(80))
        console.log('Type:', record.type)
        console.log('Timestamp:', record.timestamp)
        console.log('\n📥 INPUT (Token Spent):')
        console.log('  Symbol:', record.tokenInSymbol)
        console.log('  Address:', record.tokenInAddress)
        console.log('  Amount:', record.tokenInAmount)
        console.log('  Price:', record.tokenInPrice)
        console.log('  USD Amount:', record.tokenInUsdAmount)
        console.log('\n📤 OUTPUT (Token Received):')
        console.log('  Symbol:', record.tokenOutSymbol)
        console.log('  Address:', record.tokenOutAddress)
        console.log('  Amount:', record.tokenOutAmount)
        console.log('  Price:', record.tokenOutPrice)
        console.log('  USD Amount:', record.tokenOutUsdAmount)
        console.log('\n💰 Transaction Value:')
        console.log('  Gas Fee:', record.gasFee)
        console.log('  Platform:', record.platform)
        console.log('\n🔍 Classification:')
        console.log('  Source:', record.classificationSource)
        console.log('  Confidence:', record.confidence)
        console.log('\n' + '='.repeat(80) + '\n')
      })
    } else {
      console.log('❌ No KOL transaction records found\n')
    }

    // Analysis
    console.log('🔍 ANALYSIS:')
    console.log('='.repeat(80))
    
    const allRecords = [...whaleRecords, ...kolRecords]
    if (allRecords.length === 0) {
      console.log('❌ Transaction not found in database!')
      console.log('   This could mean:')
      console.log('   1. Transaction was filtered out (below threshold)')
      console.log('   2. Transaction failed to process')
      console.log('   3. Transaction is still being processed')
    } else {
      const record = allRecords[0]
      
      console.log('\n✅ Expected (from SHYFT API):')
      console.log('  Direction: SELL')
      console.log('  Token In: LASER (3,552,844.976777)')
      console.log('  Token Out: SOL (2.50854525)')
      console.log('  USD Value: ~$250 (2.5 SOL * $100)')
      
      console.log('\n📊 Actual (from Database):')
      console.log('  Direction:', record.type?.toUpperCase())
      console.log('  Token In:', record.tokenInSymbol, `(${record.tokenInAmount})`)
      console.log('  Token Out:', record.tokenOutSymbol, `(${record.tokenOutAmount})`)
      console.log('  USD Value: $' + (record.tokenOutUsdAmount || record.tokenInUsdAmount || 0))
      
      console.log('\n⚠️  Issues Found:')
      
      if (record.type !== 'sell') {
        console.log('  ❌ Wrong type:', record.type, '(should be "sell")')
      }
      
      if (record.tokenInSymbol !== 'LASER') {
        console.log('  ❌ Wrong tokenInSymbol:', record.tokenInSymbol, '(should be "LASER")')
      }
      
      if (record.tokenOutSymbol !== 'SOL' && record.tokenOutSymbol !== 'WSOL') {
        console.log('  ❌ Wrong tokenOutSymbol:', record.tokenOutSymbol, '(should be "SOL")')
      }
      
      if (Math.abs(record.tokenInAmount - 3552844.976777) > 1) {
        console.log('  ❌ Wrong tokenInAmount:', record.tokenInAmount, '(should be 3552844.976777)')
      }
      
      if (Math.abs(record.tokenOutAmount - 2.50854525) > 0.01) {
        console.log('  ❌ Wrong tokenOutAmount:', record.tokenOutAmount, '(should be 2.50854525)')
      }
      
      const expectedUsd = 2.50854525 * 100 // Assuming $100 per SOL
      if (Math.abs((record.tokenOutUsdAmount || 0) - expectedUsd) > 10) {
        console.log('  ❌ Wrong USD amount:', record.tokenOutUsdAmount, `(should be ~$${expectedUsd})`)
        console.log('     Calculation: tokenOutAmount (${record.tokenOutAmount}) * tokenOutPrice ($${record.tokenOutPrice})')
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  }
}

checkDatabase()
