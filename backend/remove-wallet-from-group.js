/**
 * Remove Wallet Address from Group
 * 
 * Removes a specific wallet address from a whale group
 */

const { MongoClient } = require('mongodb')

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker'
const DB_NAME = 'alpha-whale-tracker'

// Configuration
const GROUP_NAME = 'Penguin Holders'
const WALLET_TO_REMOVE = '4GQeEya6ZTwvXre4Br6ZfDyfe2WQMkcDz2QbkJZazVqS'

async function removeWallet() {
  const client = new MongoClient(MONGO_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db(DB_NAME)
    const collection = db.collection('whalesaddresses')
    
    console.log('═══════════════════════════════════════════════════════')
    console.log('🗑️  REMOVING WALLET FROM GROUP')
    console.log('═══════════════════════════════════════════════════════\n')
    
    console.log(`Group: ${GROUP_NAME}`)
    console.log(`Wallet: ${WALLET_TO_REMOVE}\n`)
    
    // Find the group first
    const group = await collection.findOne({ name: GROUP_NAME })
    
    if (!group) {
      console.log(`❌ Group "${GROUP_NAME}" not found`)
      return
    }
    
    console.log(`✅ Found group: ${GROUP_NAME}`)
    console.log(`   ID: ${group._id}`)
    console.log(`   Current addresses: ${group.whalesAddress?.length || 0}`)
    
    // Check if wallet exists in the group
    const hasWallet = group.whalesAddress?.includes(WALLET_TO_REMOVE)
    
    if (!hasWallet) {
      console.log(`\n⚠️  Wallet ${WALLET_TO_REMOVE} not found in this group`)
      console.log(`   Nothing to remove`)
      return
    }
    
    console.log(`\n✅ Wallet found in group - proceeding with removal...\n`)
    
    // Remove the wallet
    const result = await collection.updateOne(
      { name: GROUP_NAME },
      { 
        $pull: { 
          whalesAddress: WALLET_TO_REMOVE 
        }
      }
    )
    
    if (result.modifiedCount > 0) {
      console.log(`✅ Successfully removed wallet from ${GROUP_NAME}`)
      
      // Get updated count
      const updatedGroup = await collection.findOne({ name: GROUP_NAME })
      console.log(`   New address count: ${updatedGroup.whalesAddress?.length || 0}`)
      console.log(`   Removed: 1 address`)
    } else {
      console.log(`❌ Failed to remove wallet`)
    }
    
    console.log('')
    console.log('⚠️  IMPORTANT: Restart backend to apply changes:')
    console.log('   pm2 restart backend')
    console.log('')
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.close()
    console.log('✅ Connection closed')
  }
}

removeWallet().catch(console.error)
