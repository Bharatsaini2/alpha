/**
 * Remove Bot Wallet from Tracking
 * Wallet: 6kntKawNmZNKZqUHvRVGKMwp8LQU5upyhht7w1PL7dde
 */

const { MongoClient } = require('mongodb')

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker'
const DB_NAME = 'alpha-whale-tracker'
const WALLET_TO_REMOVE = '9m5oyKCbccxTGphZkdymU5MEpWZfhrm3YVmCJmni9Kfy'

async function removeWallet() {
  const client = new MongoClient(MONGO_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db(DB_NAME)
    const collection = db.collection('whalesaddresses')
    
    console.log('═══════════════════════════════════════════════════════')
    console.log('🗑️  REMOVING BOT WALLET FROM TRACKING')
    console.log('═══════════════════════════════════════════════════════\n')
    
    console.log(`Wallet: ${WALLET_TO_REMOVE}\n`)
    
    // Search all groups for this wallet
    const allGroups = await collection.find({
      whalesAddress: WALLET_TO_REMOVE
    }).toArray()
    
    if (allGroups.length === 0) {
      console.log(`❌ Wallet not found in any group`)
      return
    }
    
    console.log(`✅ Found wallet in ${allGroups.length} group(s):\n`)
    
    for (const foundGroup of allGroups) {
      console.log(`Removing from: ${foundGroup.name}`)
      console.log(`   Current addresses: ${foundGroup.whalesAddress?.length || 0}`)
      
      const result = await collection.updateOne(
        { _id: foundGroup._id },
        { $pull: { whalesAddress: WALLET_TO_REMOVE } }
      )
      
      if (result.modifiedCount > 0) {
        const updated = await collection.findOne({ _id: foundGroup._id })
        console.log(`   ✅ Removed! New count: ${updated.whalesAddress?.length || 0}\n`)
      }
    }
    
    console.log('✅ Bot wallet removed from all groups')
    console.log('')
    console.log('⚠️  IMPORTANT: Restart backend on server to apply changes:')
    console.log('   ssh root@147.79.76.63 "pm2 restart whale-tracker"')
    console.log('')
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.close()
    console.log('✅ Connection closed')
  }
}

removeWallet().catch(console.error)
