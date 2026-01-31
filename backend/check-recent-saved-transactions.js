/**
 * Check Recent Saved Transactions
 * 
 * This script checks the database for recently saved whale transactions
 * to verify that the backend is successfully processing and saving valid swaps.
 * 
 * Run from backend directory: node check-recent-saved-transactions.js
 */

require('dotenv').config()
const mongoose = require('mongoose')

// Define the schema inline to avoid import issues
const whaleAllTransactionSchemaV2 = new mongoose.Schema({
  signature: String,
  whaleAddress: String,
  tokenInSymbol: String,
  tokenOutSymbol: String,
  type: String,
  amount: Object,
  timestamp: Date,
}, { collection: 'whaleAllTransactionsV2' })

const whaleAllTransactionModelV2 = mongoose.model('WhaleAllTransactionV2', whaleAllTransactionSchemaV2)

async function checkRecentTransactions() {
  try {
    console.log('🔍 Connecting to MongoDB...')
    await mongoose.connect(process.env.MONGO_URI)
    console.log('✅ Connected to MongoDB\n')

    // Get transactions from the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    
    console.log(`📊 Checking for transactions since: ${oneHourAgo.toISOString()}\n`)

    const recentTransactions = await whaleAllTransactionModelV2
      .find({
        timestamp: { $gte: oneHourAgo }
      })
      .sort({ timestamp: -1 })
      .limit(20)
      .lean()

    if (recentTransactions.length === 0) {
      console.log('⚠️  No transactions found in the last hour')
      console.log('\nThis could mean:')
      console.log('1. No valid swaps have occurred (most transactions are being correctly filtered)')
      console.log('2. SHYFT API is providing incomplete balance change data')
      console.log('3. All recent transactions had change_amount: 0 (not actual swaps)')
      
      // Check for any transactions today
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      
      const todayCount = await whaleAllTransactionModelV2.countDocuments({
        timestamp: { $gte: startOfDay }
      })
      
      console.log(`\n📅 Transactions saved today: ${todayCount}`)
      
      if (todayCount > 0) {
        console.log('\n✅ Backend IS saving transactions - just not in the last hour')
        console.log('This is normal - the new parser filters out invalid swaps')
        
        // Show the most recent transaction
        const mostRecent = await whaleAllTransactionModelV2
          .findOne()
          .sort({ timestamp: -1 })
          .lean()
        
        if (mostRecent) {
          console.log('\n📝 Most recent transaction:')
          console.log(`   Signature: ${mostRecent.signature}`)
          console.log(`   Time: ${mostRecent.timestamp}`)
          console.log(`   Type: ${mostRecent.type}`)
          console.log(`   Whale: ${mostRecent.whaleAddress}`)
          if (mostRecent.type === 'buy' || mostRecent.type === 'both') {
            console.log(`   Token Out: ${mostRecent.tokenOutSymbol}`)
            console.log(`   Amount: $${mostRecent.amount?.buyAmount?.toFixed(2) || 0}`)
          }
          if (mostRecent.type === 'sell' || mostRecent.type === 'both') {
            console.log(`   Token In: ${mostRecent.tokenInSymbol}`)
            console.log(`   Amount: $${mostRecent.amount?.sellAmount?.toFixed(2) || 0}`)
          }
        }
      }
    } else {
      console.log(`✅ Found ${recentTransactions.length} transactions in the last hour!\n`)
      
      recentTransactions.forEach((tx, index) => {
        console.log(`${index + 1}. Transaction ${tx.signature?.substring(0, 8)}...`)
        console.log(`   Time: ${tx.timestamp}`)
        console.log(`   Type: ${tx.type}`)
        console.log(`   Whale: ${tx.whaleAddress?.substring(0, 8)}...`)
        
        if (tx.type === 'buy' || tx.type === 'both') {
          console.log(`   BUY: ${tx.tokenOutSymbol} - $${tx.amount?.buyAmount?.toFixed(2) || 0}`)
        }
        if (tx.type === 'sell' || tx.type === 'both') {
          console.log(`   SELL: ${tx.tokenInSymbol} - $${tx.amount?.sellAmount?.toFixed(2) || 0}`)
        }
        console.log('')
      })
      
      console.log('✅ Backend is successfully processing and saving valid swaps!')
    }

    // Get statistics
    console.log('\n📊 Database Statistics:')
    const totalCount = await whaleAllTransactionModelV2.countDocuments()
    console.log(`   Total transactions: ${totalCount}`)
    
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const last24HoursCount = await whaleAllTransactionModelV2.countDocuments({
      timestamp: { $gte: last24Hours }
    })
    console.log(`   Last 24 hours: ${last24HoursCount}`)
    
    const buyCount = await whaleAllTransactionModelV2.countDocuments({
      timestamp: { $gte: last24Hours },
      $or: [{ type: 'buy' }, { type: 'both' }]
    })
    const sellCount = await whaleAllTransactionModelV2.countDocuments({
      timestamp: { $gte: last24Hours },
      $or: [{ type: 'sell' }, { type: 'both' }]
    })
    console.log(`   Buys: ${buyCount}, Sells: ${sellCount}`)

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

checkRecentTransactions()
