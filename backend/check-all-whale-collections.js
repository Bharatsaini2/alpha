/**
 * Check All Whale Transaction Collections
 * 
 * There are multiple variations of the collection name in the database.
 * This script checks all of them to find where transactions are actually being saved.
 */

require('dotenv').config()
const mongoose = require('mongoose')

async function checkAllCollections() {
  try {
    console.log('🔍 Connecting to MongoDB...')
    await mongoose.connect(process.env.MONGO_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    
    // All possible whale transaction collection names found in the database
    const collectionNames = [
      'whalealltransactionv2',      // lowercase, no 's'
      'whalealltransactionsv2',     // lowercase, with 's'
      'whaleAllTransactionsV2',     // camelCase
      'whalealltransactions',       // old collection
      'whaletransactions',          // even older
    ]

    console.log('📊 Checking all whale transaction collections:\n')

    for (const collectionName of collectionNames) {
      try {
        const collection = db.collection(collectionName)
        const count = await collection.countDocuments()
        
        if (count > 0) {
          console.log(`✅ ${collectionName}: ${count} documents`)
          
          // Get the most recent transaction
          const mostRecent = await collection.findOne({}, { sort: { timestamp: -1 } })
          
          if (mostRecent) {
            const timeAgo = Math.round((Date.now() - new Date(mostRecent.timestamp).getTime()) / 1000 / 60)
            console.log(`   Most recent: ${mostRecent.signature?.substring(0, 8)}... (${timeAgo} mins ago)`)
            console.log(`   Type: ${mostRecent.type}`)
            
            // Get last hour count
            const lastHour = new Date(Date.now() - 60 * 60 * 1000)
            const lastHourCount = await collection.countDocuments({
              timestamp: { $gte: lastHour }
            })
            console.log(`   Last hour: ${lastHourCount} transactions`)
          }
          console.log('')
        } else {
          console.log(`⚪ ${collectionName}: 0 documents (empty)`)
        }
      } catch (error) {
        console.log(`❌ ${collectionName}: Collection does not exist`)
      }
    }

    // Check what the model is configured to use
    console.log('\n📝 Model Configuration:')
    console.log('   Model name: whaleAllTransactionV2')
    console.log('   MongoDB will convert to: whalealltransactionv2 (lowercase)')
    console.log('')
    console.log('⚠️  If transactions are in a different collection, there is a mismatch!')

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

checkAllCollections()
