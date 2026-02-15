/**
 * Check for User Changes - Find Missing Telegram Users
 * 
 * Checks for users who may have disconnected or been removed
 */

const { MongoClient } = require('mongodb')

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker'
const DB_NAME = 'alpha-whale-tracker'

async function checkUserChanges() {
  const client = new MongoClient(MONGO_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db(DB_NAME)
    const usersCollection = db.collection('users')
    
    console.log('═══════════════════════════════════════════════════════')
    console.log('📊 USER STATISTICS')
    console.log('═══════════════════════════════════════════════════════\n')
    
    // Total users
    const totalUsers = await usersCollection.countDocuments({})
    console.log(`Total users in database: ${totalUsers}`)
    
    // Users with Telegram connected
    const withTelegram = await usersCollection.countDocuments({
      telegramChatId: { $exists: true, $ne: null }
    })
    console.log(`Users with Telegram connected: ${withTelegram}`)
    
    // Users with wallet
    const withWallet = await usersCollection.countDocuments({
      walletAddress: { $exists: true, $ne: null }
    })
    console.log(`Users with wallet: ${withWallet}`)
    
    // Users with both
    const withBoth = await usersCollection.countDocuments({
      walletAddress: { $exists: true, $ne: null },
      telegramChatId: { $exists: true, $ne: null }
    })
    console.log(`Users with both wallet AND Telegram: ${withBoth}`)
    
    // Users with wallet but NO Telegram
    const walletNoTelegram = await usersCollection.countDocuments({
      walletAddress: { $exists: true, $ne: null },
      $or: [
        { telegramChatId: { $exists: false } },
        { telegramChatId: null }
      ]
    })
    console.log(`Users with wallet but NO Telegram: ${walletNoTelegram}`)
    
    console.log('\n═══════════════════════════════════════════════════════')
    console.log('🔍 RECENTLY MODIFIED USERS (Last 7 days)')
    console.log('═══════════════════════════════════════════════════════\n')
    
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const recentlyModified = await usersCollection.find({
      updatedAt: { $gte: sevenDaysAgo }
    }).sort({ updatedAt: -1 }).limit(20).toArray()
    
    if (recentlyModified.length > 0) {
      console.log(`Found ${recentlyModified.length} recently modified users:\n`)
      
      recentlyModified.forEach((user, index) => {
        console.log(`${index + 1}. Updated: ${user.updatedAt?.toISOString() || 'N/A'}`)
        console.log(`   Wallet: ${user.walletAddress || 'N/A'}`)
        console.log(`   Telegram: ${user.telegramChatId ? '✅ Connected' : '❌ Not connected'}`)
        console.log(`   Email: ${user.email || 'N/A'}`)
        console.log('')
      })
    } else {
      console.log('No users modified in the last 7 days\n')
    }
    
    console.log('═══════════════════════════════════════════════════════')
    console.log('🔍 USERS WHO DISCONNECTED TELEGRAM')
    console.log('═══════════════════════════════════════════════════════\n')
    
    // Check for users with wallet but no telegram (potential disconnects)
    const potentialDisconnects = await usersCollection.find({
      walletAddress: { $exists: true, $ne: null },
      $or: [
        { telegramChatId: { $exists: false } },
        { telegramChatId: null }
      ]
    }).sort({ updatedAt: -1 }).limit(10).toArray()
    
    if (potentialDisconnects.length > 0) {
      console.log(`Found ${potentialDisconnects.length} users with wallet but no Telegram:\n`)
      
      potentialDisconnects.forEach((user, index) => {
        console.log(`${index + 1}. Wallet: ${user.walletAddress}`)
        console.log(`   Email: ${user.email || 'N/A'}`)
        console.log(`   Last updated: ${user.updatedAt?.toISOString() || 'N/A'}`)
        console.log(`   Created: ${user.createdAt?.toISOString() || 'N/A'}`)
        console.log('')
      })
    } else {
      console.log('No users found with wallet but no Telegram\n')
    }
    
    console.log('═══════════════════════════════════════════════════════')
    console.log('📈 SUMMARY')
    console.log('═══════════════════════════════════════════════════════\n')
    console.log(`Expected Telegram users: 45`)
    console.log(`Current Telegram users: ${withTelegram}`)
    console.log(`Difference: ${45 - withTelegram} users`)
    
    if (withTelegram < 45) {
      console.log(`\n⚠️  Missing ${45 - withTelegram} users!`)
      console.log(`   Possible reasons:`)
      console.log(`   1. Users disconnected their Telegram`)
      console.log(`   2. Users were deleted from database`)
      console.log(`   3. Previous count was incorrect`)
    } else if (withTelegram > 45) {
      console.log(`\n✅ Gained ${withTelegram - 45} new users!`)
    } else {
      console.log(`\n✅ User count matches expected (45)`)
    }
    
    console.log('')
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.close()
    console.log('✅ Connection closed\n')
  }
}

checkUserChanges().catch(console.error)
