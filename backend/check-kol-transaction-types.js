/**
 * Check all unique transaction types in KOL transactions
 * This will show us ALL possible transaction types, not just buy/sell/both
 */

require('dotenv').config()
const mongoose = require('mongoose')

async function checkTransactionTypes() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(process.env.MONGO_URI)
    console.log('Connected!\n')

    const db = mongoose.connection.db
    const collection = db.collection('influencerwhaletransactionsv2')

    // Get all unique transaction types
    console.log('=== ALL UNIQUE TRANSACTION TYPES ===')
    const types = await collection.distinct('type')
    console.log('Unique types found:', types)
    console.log('')

    // Count transactions by type
    console.log('=== TRANSACTION COUNT BY TYPE ===')
    const typeCounts = await collection.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray()
    
    typeCounts.forEach(item => {
      console.log(`Type: "${item._id}" - Count: ${item.count}`)
    })
    console.log('')

    // Get sample transactions for each type
    console.log('=== SAMPLE TRANSACTIONS FOR EACH TYPE ===')
    for (const type of types) {
      console.log(`\n--- Type: "${type}" ---`)
      const samples = await collection.find(
        { type: type },
        { 
          projection: {
            signature: 1,
            type: 1,
            influencerUsername: 1,
            'transaction.tokenIn.symbol': 1,
            'transaction.tokenOut.symbol': 1,
            'transaction.tokenOut.usdAmount': 1,
            hotnessScore: 1,
            timestamp: 1,
            bothType: 1
          }
        }
      ).sort({ timestamp: -1 }).limit(3).toArray()

      samples.forEach((tx, idx) => {
        console.log(`\nSample ${idx + 1}:`)
        console.log(`  Signature: ${tx.signature.substring(0, 20)}...`)
        console.log(`  KOL: ${tx.influencerUsername}`)
        console.log(`  Type: ${tx.type}`)
        console.log(`  TokenIn: ${tx.transaction?.tokenIn?.symbol || 'N/A'}`)
        console.log(`  TokenOut: ${tx.transaction?.tokenOut?.symbol || 'N/A'}`)
        console.log(`  Amount: $${tx.transaction?.tokenOut?.usdAmount || 'N/A'}`)
        console.log(`  Hotness: ${tx.hotnessScore}`)
        console.log(`  BothType: ${JSON.stringify(tx.bothType)}`)
        console.log(`  Time: ${tx.timestamp}`)
      })
    }

    // Check for null or undefined types
    console.log('\n=== CHECKING FOR NULL/UNDEFINED TYPES ===')
    const nullTypes = await collection.countDocuments({ 
      $or: [
        { type: null },
        { type: { $exists: false } },
        { type: '' }
      ]
    })
    console.log(`Transactions with null/undefined/empty type: ${nullTypes}`)

    // Get recent transactions (last 100) and their types
    console.log('\n=== RECENT 100 TRANSACTIONS TYPE DISTRIBUTION ===')
    const recentTypes = await collection.aggregate([
      { $sort: { timestamp: -1 } },
      { $limit: 100 },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray()
    
    recentTypes.forEach(item => {
      const percentage = ((item.count / 100) * 100).toFixed(1)
      console.log(`Type: "${item._id}" - ${item.count}/100 (${percentage}%)`)
    })

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await mongoose.connection.close()
    console.log('\nConnection closed')
  }
}

checkTransactionTypes()
