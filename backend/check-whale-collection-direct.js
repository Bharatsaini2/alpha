/**
 * Check Whale Collection Directly
 * 
 * Connects directly to MongoDB and checks the whaleAllTransactionsV2 collection
 */

require('dotenv').config()
const mongoose = require('mongoose')

async function checkCollection() {
  try {
    console.log('🔍 Connecting to MongoDB...')
    console.log(`Connection string: ${process.env.MONGO_URI?.substring(0, 50)}...`)
    
    await mongoose.connect(process.env.MONGO_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    
    // List all collections
    console.log('📋 Available collections:')
    const collections = await db.listCollections().toArray()
    collections.forEach(col => {
      console.log(`   - ${col.name}`)
    })
    console.log('')

    // Check if whaleAllTransactionsV2 exists
    const collectionExists = collections.some(col => col.name === 'whaleAllTransactionsV2' || col.name === 'whalealltransactionsv2')
    
    if (!collectionExists) {
      console.log('⚠️  Collection "whaleAllTransactionsV2" does not exist yet')
      console.log('This means no transactions have been saved since the backend started')
      console.log('\nPossible reasons:')
      console.log('1. Backend is filtering out all transactions (they are invalid)')
      console.log('2. No whale transactions have occurred yet')
      console.log('3. All transactions have change_amount: 0 (not actual swaps)')
      return
    }

    // Get the collection
    const collection = db.collection('whaleAllTransactionsV2')
    
    // Count total documents
    const totalCount = await collection.countDocuments()
    console.log(`📊 Total documents in whaleAllTransactionsV2: ${totalCount}`)
    
    if (totalCount === 0) {
      console.log('\n⚠️  Collection exists but is empty')
      console.log('This means the backend has been running but no valid swaps have been detected')
      return
    }

    // Get the most recent transaction
    const mostRecent = await collection.findOne({}, { sort: { timestamp: -1 } })
    
    if (mostRecent) {
      console.log('\n📝 Most recent transaction:')
      console.log(`   Signature: ${mostRecent.signature}`)
      console.log(`   Time: ${mostRecent.timestamp}`)
      console.log(`   Type: ${mostRecent.type}`)
      console.log(`   Whale: ${mostRecent.whaleAddress?.substring(0, 8)}...`)
      
      if (mostRecent.type === 'buy' || mostRecent.type === 'both') {
        console.log(`   Token Out: ${mostRecent.tokenOutSymbol}`)
        console.log(`   Buy Amount: $${mostRecent.amount?.buyAmount?.toFixed(2) || 0}`)
      }
      if (mostRecent.type === 'sell' || mostRecent.type === 'both') {
        console.log(`   Token In: ${mostRecent.tokenInSymbol}`)
        console.log(`   Sell Amount: $${mostRecent.amount?.sellAmount?.toFixed(2) || 0}`)
      }
    }

    // Get transactions from last 24 hours
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentCount = await collection.countDocuments({
      timestamp: { $gte: last24Hours }
    })
    console.log(`\n📅 Transactions in last 24 hours: ${recentCount}`)

    // Get transactions from last hour
    const lastHour = new Date(Date.now() - 60 * 60 * 1000)
    const lastHourCount = await collection.countDocuments({
      timestamp: { $gte: lastHour }
    })
    console.log(`⏰ Transactions in last hour: ${lastHourCount}`)

    // Get buy/sell breakdown for last 24 hours
    const buys = await collection.countDocuments({
      timestamp: { $gte: last24Hours },
      $or: [{ type: 'buy' }, { type: 'both' }]
    })
    const sells = await collection.countDocuments({
      timestamp: { $gte: last24Hours },
      $or: [{ type: 'sell' }, { type: 'both' }]
    })
    console.log(`   Buys: ${buys}, Sells: ${sells}`)

    // Show last 5 transactions
    if (totalCount > 0) {
      console.log('\n📜 Last 5 transactions:')
      const last5 = await collection.find({}).sort({ timestamp: -1 }).limit(5).toArray()
      
      last5.forEach((tx, index) => {
        const timeAgo = Math.round((Date.now() - new Date(tx.timestamp).getTime()) / 1000 / 60)
        console.log(`\n${index + 1}. ${tx.signature?.substring(0, 8)}... (${timeAgo} mins ago)`)
        console.log(`   Type: ${tx.type}`)
        console.log(`   Whale: ${tx.whaleAddress?.substring(0, 8)}...`)
        
        if (tx.type === 'buy' || tx.type === 'both') {
          console.log(`   BUY: ${tx.tokenOutSymbol} - $${tx.amount?.buyAmount?.toFixed(2) || 0}`)
        }
        if (tx.type === 'sell' || tx.type === 'both') {
          console.log(`   SELL: ${tx.tokenInSymbol} - $${tx.amount?.sellAmount?.toFixed(2) || 0}`)
        }
      })
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

checkCollection()
