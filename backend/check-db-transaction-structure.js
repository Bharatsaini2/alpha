/**
 * Check what fields are actually in the database transactions
 */

const mongoose = require('mongoose')

const MONGODB_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker'

async function checkDBStructure() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected\n')

    const db = mongoose.connection.db
    const collection = db.collection('whalealltransactionv2')

    console.log('📊 Fetching 1 transaction to inspect structure...\n')
    const tx = await collection.findOne({})

    if (!tx) {
      console.log('❌ No transactions found')
      return
    }

    console.log('🔍 Transaction fields:')
    console.log(JSON.stringify(Object.keys(tx), null, 2))
    
    console.log('\n📝 Sample transaction:')
    console.log(JSON.stringify(tx, null, 2))

    await mongoose.connection.close()
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

checkDBStructure()
