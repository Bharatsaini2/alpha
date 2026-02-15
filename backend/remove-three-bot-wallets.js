/**
 * Remove Three Bot Wallets from Tracking
 * 
 * Removes the specified bot wallets from ALL whale groups in the database
 * Run with DRY_RUN=true first to see what would be removed
 */

const { MongoClient } = require('mongodb')

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker'
const DB_NAME = 'alpha-whale-tracker'

// Three bot wallets to remove
const BOT_WALLETS = [
  '3ACp4T3ptTdayzWryEhT65NKZSKLjwXviBjWEy54aFdW',
  'CcM9FGcjo7hS1ZoiCXxM6cUVfiGrDV3qMDYGCbdmmSWj',
  'FE2MHWLTSmndBUWbbtmnfUfoKrn9NKtDCDGxCPG2h9Dy'
]

// Set to true for dry run (no actual changes)
const DRY_RUN = process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run')

async function removeThreeBotWallets() {
  const client = new MongoClient(MONGO_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db(DB_NAME)
    const collection = db.collection('whalesaddresses')
    
    console.log('═══════════════════════════════════════════════════════')
    if (DRY_RUN) {
      console.log('🔍 DRY RUN MODE - NO CHANGES WILL BE MADE')
    } else {
      console.log('🤖 REMOVING BOT WALLETS FROM ALL GROUPS')
    }
    console.log('═══════════════════════════════════════════════════════\n')
    
    console.log('Bot Wallets to remove:')
    BOT_WALLETS.forEach((wallet, index) => {
      console.log(`  ${index + 1}. ${wallet}`)
    })
    console.log('')
    
    let totalGroupsAffected = 0
    let totalWalletsRemoved = 0
    const affectedGroups = []
    
    // Check each bot wallet
    for (const botWallet of BOT_WALLETS) {
      console.log(`\n${'─'.repeat(60)}`)
      console.log(`Checking wallet: ${botWallet}`)
      console.log('─'.repeat(60))
      
      // Find all groups that contain this wallet
      const groupsWithWallet = await collection.find({
        whalesAddress: botWallet
      }).toArray()
      
      if (groupsWithWallet.length === 0) {
        console.log('  ✅ Not found in any groups\n')
        continue
      }
      
      console.log(`  ⚠️  Found in ${groupsWithWallet.length} group(s):\n`)
      
      for (const group of groupsWithWallet) {
        console.log(`    📁 ${group.name}`)
        console.log(`       ID: ${group._id}`)
        console.log(`       Current addresses: ${group.whalesAddress?.length || 0}`)
        
        // Track affected groups
        if (!affectedGroups.find(g => g._id.toString() === group._id.toString())) {
          affectedGroups.push(group)
        }
      }
      
      if (!DRY_RUN) {
        console.log(`\n  🗑️  Removing from ${groupsWithWallet.length} group(s)...`)
        
        // Remove the wallet from ALL groups
        const result = await collection.updateMany(
          { whalesAddress: botWallet },
          { 
            $pull: { 
              whalesAddress: botWallet 
            }
          }
        )
        
        if (result.modifiedCount > 0) {
          console.log(`  ✅ Removed from ${result.modifiedCount} group(s)`)
          totalGroupsAffected += result.modifiedCount
          totalWalletsRemoved++
        } else {
          console.log(`  ❌ Failed to remove`)
        }
      } else {
        console.log(`\n  📋 Would remove from ${groupsWithWallet.length} group(s)`)
        totalGroupsAffected += groupsWithWallet.length
        totalWalletsRemoved++
      }
    }
    
    // Summary
    console.log('\n\n═══════════════════════════════════════════════════════')
    console.log('SUMMARY')
    console.log('═══════════════════════════════════════════════════════\n')
    
    if (DRY_RUN) {
      console.log(`📊 Dry Run Results:`)
      console.log(`   Bot wallets found: ${totalWalletsRemoved}/${BOT_WALLETS.length}`)
      console.log(`   Groups affected: ${totalGroupsAffected}`)
      console.log(`   Unique groups: ${affectedGroups.length}`)
      
      if (affectedGroups.length > 0) {
        console.log(`\n   Affected groups:`)
        affectedGroups.forEach(group => {
          console.log(`     • ${group.name} (${group.whalesAddress?.length || 0} addresses)`)
        })
      }
      
      console.log('\n⚠️  To actually remove these wallets, run:')
      console.log('   node remove-three-bot-wallets.js')
      console.log('   OR')
      console.log('   DRY_RUN=false node remove-three-bot-wallets.js')
    } else {
      console.log(`✅ Removal Complete:`)
      console.log(`   Bot wallets removed: ${totalWalletsRemoved}/${BOT_WALLETS.length}`)
      console.log(`   Groups updated: ${totalGroupsAffected}`)
      
      // Show updated counts
      if (affectedGroups.length > 0) {
        console.log(`\n   Updated groups:`)
        for (const group of affectedGroups) {
          const updatedGroup = await collection.findOne({ _id: group._id })
          const oldCount = group.whalesAddress?.length || 0
          const newCount = updatedGroup.whalesAddress?.length || 0
          const removed = oldCount - newCount
          console.log(`     • ${updatedGroup.name}`)
          console.log(`       Before: ${oldCount} addresses`)
          console.log(`       After: ${newCount} addresses`)
          console.log(`       Removed: ${removed} bot wallet(s)`)
        }
      }
      
      console.log('\n═══════════════════════════════════════════════════════')
      console.log('⚠️  IMPORTANT: Restart backend to apply changes:')
      console.log('   pm2 restart backend')
      console.log('═══════════════════════════════════════════════════════')
    }
    
    console.log('')
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.close()
    console.log('✅ Connection closed\n')
  }
}

removeThreeBotWallets().catch(console.error)
