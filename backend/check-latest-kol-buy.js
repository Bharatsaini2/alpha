/**
 * Check the latest BUY transactions in KOL feed
 */

require('dotenv').config()
const mongoose = require('mongoose')

async function checkLatestBuyTransactions() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(process.env.MONGO_URI)
    console.log('Connected!\n')

    const db = mongoose.connection.db
    const collection = db.collection('influencerwhaletransactionsv2')

    // Get latest BUY transactions
    console.log('=== LATEST 20 BUY TRANSACTIONS ===\n')
    const buyTxs = await collection.find({
      type: 'buy'
    })
    .sort({ timestamp: -1 })
    .limit(20)
    .toArray()

    buyTxs.forEach((tx, idx) => {
      console.log(`${idx + 1}. Transaction:`)
      console.log(`   Signature: ${tx.signature.substring(0, 40)}...`)
      console.log(`   KOL: ${tx.influencerUsername || 'Unknown'}`)
      console.log(`   Type: ${tx.type}`)
      console.log(`   Token: ${tx.transaction?.tokenOut?.symbol || 'Unknown'} (${tx.transaction?.tokenOut?.name || 'Unknown'})`)
      console.log(`   Amount: $${tx.transaction?.tokenOut?.usdAmount || '0'}`)
      console.log(`   Hotness: ${tx.hotnessScore}/10`)
      console.log(`   Time: ${tx.timestamp}`)
      console.log(`   Age: ${Math.round((Date.now() - new Date(tx.timestamp).getTime()) / 1000 / 60)} minutes ago`)
      console.log('')
    })

    // Get latest BOTH transactions
    console.log('\n=== LATEST 10 BOTH TRANSACTIONS ===\n')
    const bothTxs = await collection.find({
      type: 'both'
    })
    .sort({ timestamp: -1 })
    .limit(10)
    .toArray()

    bothTxs.forEach((tx, idx) => {
      console.log(`${idx + 1}. Transaction:`)
      console.log(`   Signature: ${tx.signature.substring(0, 40)}...`)
      console.log(`   KOL: ${tx.influencerUsername || 'Unknown'}`)
      console.log(`   Type: ${tx.type}`)
      console.log(`   Token: ${tx.transaction?.tokenOut?.symbol || 'Unknown'} (${tx.transaction?.tokenOut?.name || 'Unknown'})`)
      console.log(`   Amount: $${tx.transaction?.tokenOut?.usdAmount || '0'}`)
      console.log(`   Hotness: ${tx.hotnessScore}/10`)
      console.log(`   Time: ${tx.timestamp}`)
      console.log(`   Age: ${Math.round((Date.now() - new Date(tx.timestamp).getTime()) / 1000 / 60)} minutes ago`)
      console.log('')
    })

    // Get latest SWAP transactions
    console.log('\n=== LATEST 5 SWAP TRANSACTIONS ===\n')
    const swapTxs = await collection.find({
      type: 'swap'
    })
    .sort({ timestamp: -1 })
    .limit(5)
    .toArray()

    if (swapTxs.length > 0) {
      swapTxs.forEach((tx, idx) => {
        console.log(`${idx + 1}. Transaction:`)
        console.log(`   Signature: ${tx.signature.substring(0, 40)}...`)
        console.log(`   KOL: ${tx.influencerUsername || 'Unknown'}`)
        console.log(`   Type: ${tx.type}`)
        console.log(`   Token: ${tx.transaction?.tokenOut?.symbol || 'Unknown'} (${tx.transaction?.tokenOut?.name || 'Unknown'})`)
        console.log(`   Amount: $${tx.transaction?.tokenOut?.usdAmount || '0'}`)
        console.log(`   Hotness: ${tx.hotnessScore}/10`)
        console.log(`   Time: ${tx.timestamp}`)
        console.log(`   Age: ${Math.round((Date.now() - new Date(tx.timestamp).getTime()) / 1000 / 60)} minutes ago`)
        console.log('')
      })
    } else {
      console.log('No SWAP transactions found')
    }

    // Statistics
    console.log('\n=== STATISTICS (Last 1 hour) ===')
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    
    const buyCount = await collection.countDocuments({
      type: 'buy',
      timestamp: { $gte: oneHourAgo }
    })
    
    const bothCount = await collection.countDocuments({
      type: 'both',
      timestamp: { $gte: oneHourAgo }
    })
    
    const swapCount = await collection.countDocuments({
      type: 'swap',
      timestamp: { $gte: oneHourAgo }
    })
    
    const sellCount = await collection.countDocuments({
      type: 'sell',
      timestamp: { $gte: oneHourAgo }
    })

    console.log(`BUY transactions: ${buyCount}`)
    console.log(`BOTH transactions: ${bothCount}`)
    console.log(`SWAP transactions: ${swapCount}`)
    console.log(`SELL transactions: ${sellCount}`)
    console.log(`Total: ${buyCount + bothCount + swapCount + sellCount}`)
    console.log(`Alert-worthy (buy+both+swap): ${buyCount + bothCount + swapCount} (${Math.round((buyCount + bothCount + swapCount) / (buyCount + bothCount + swapCount + sellCount) * 100)}%)`)

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await mongoose.connection.close()
    console.log('\nConnection closed')
  }
}

checkLatestBuyTransactions()
