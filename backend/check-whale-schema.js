/**
 * Check Whale Transaction Schema
 * 
 * Inspect the structure of whale transactions to find the correct field for addresses
 */

require('dotenv').config()
const mongoose = require('mongoose')

async function checkSchema() {
  try {
    console.log('🔍 Connecting to MongoDB...')
    await mongoose.connect(process.env.MONGO_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    const collection = db.collection('whalealltransactionv2')
    
    // Get total count
    const count = await collection.countDocuments()
    console.log(`📊 Total transactions: ${count}\n`)
    
    if (count === 0) {
      console.log('⚠️  Collection is empty!')
      await mongoose.disconnect()
      return
    }
    
    // Get a sample transaction
    const sample = await collection.findOne({})
    
    console.log('📝 Sample Transaction Structure:')
    console.log(JSON.stringify(sample, null, 2))
    
    console.log('\n🔑 Available Fields:')
    console.log(Object.keys(sample).join(', '))
    
    // Try to find address-related fields
    console.log('\n🔍 Looking for address fields...')
    const addressFields = Object.keys(sample).filter(key => 
      key.toLowerCase().includes('address') || 
      key.toLowerCase().includes('wallet') ||
      key.toLowerCase().includes('swapper')
    )
    
    if (addressFields.length > 0) {
      console.log('✅ Found address-related fields:', addressFields.join(', '))
      addressFields.forEach(field => {
        console.log(`   ${field}: ${sample[field]}`)
      })
    } else {
      console.log('⚠️  No obvious address fields found')
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

checkSchema()
