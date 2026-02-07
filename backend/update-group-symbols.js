/**
 * Update Token Symbols for Groups
 * 
 * Updates the tokenSymbol field for Penguin, Whitewhale, and PUMP groups
 */

const { MongoClient } = require('mongodb')

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker'
const DB_NAME = 'alpha-whale-tracker'

// Groups to update
const UPDATES = [
  {
    groupName: 'Penguin Holders',
    tokenSymbol: 'PENGUIN'
  },
  {
    groupName: 'Whitewhale Holders',
    tokenSymbol: 'WHITEWHALE'
  },
  {
    groupName: 'PUMP Holders',
    tokenSymbol: 'PUMP'
  }
]

async function updateSymbols() {
  const client = new MongoClient(MONGO_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db(DB_NAME)
    const collection = db.collection('whalesaddresses')
    
    console.log('═══════════════════════════════════════════════════════')
    console.log('✏️  UPDATING TOKEN SYMBOLS')
    console.log('═══════════════════════════════════════════════════════\n')
    
    let successCount = 0
    let failCount = 0
    
    for (const update of UPDATES) {
      console.log(`Processing: ${update.groupName}`)
      
      // Find the group
      const group = await collection.findOne({ name: update.groupName })
      
      if (!group) {
        console.log(`   ❌ Group not found`)
        failCount++
        console.log('')
        continue
      }
      
      console.log(`   Current symbol: ${group.tokenSymbol || 'N/A'}`)
      console.log(`   New symbol: ${update.tokenSymbol}`)
      
      // Update the symbol
      const result = await collection.updateOne(
        { name: update.groupName },
        { 
          $set: { 
            tokenSymbol: update.tokenSymbol,
            lastUpdated: new Date()
          }
        }
      )
      
      if (result.modifiedCount > 0) {
        console.log(`   ✅ Updated successfully`)
        successCount++
      } else {
        console.log(`   ⚠️  No changes made (might already be set)`)
      }
      
      console.log('')
    }
    
    console.log('═══════════════════════════════════════════════════════')
    console.log('📊 SUMMARY')
    console.log('═══════════════════════════════════════════════════════')
    console.log(`✅ Successfully updated: ${successCount}`)
    console.log(`❌ Failed: ${failCount}`)
    console.log('')
    
    // Verify the updates
    console.log('═══════════════════════════════════════════════════════')
    console.log('🔍 VERIFICATION')
    console.log('═══════════════════════════════════════════════════════\n')
    
    for (const update of UPDATES) {
      const group = await collection.findOne({ name: update.groupName })
      if (group) {
        console.log(`${update.groupName}:`)
        console.log(`   Token Symbol: ${group.tokenSymbol || 'N/A'}`)
        console.log(`   Token Address: ${group.tokenAddress}`)
        console.log(`   Addresses: ${group.whalesAddress?.length || 0}`)
        console.log('')
      }
    }
    
    console.log('✅ All updates complete!')
    console.log('')
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.close()
    console.log('✅ Connection closed')
  }
}

updateSymbols().catch(console.error)
