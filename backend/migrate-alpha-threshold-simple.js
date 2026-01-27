const mongoose = require('mongoose')
const { PublicKey } = require('@solana/web3.js')
const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = require('@solana/spl-token')
require('dotenv').config()

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/alpha-tracker'
const PREMIUM_BALANCE_THRESHOLD = 500000
const ALPHA_TOKEN_MINT = '3wtGGWZ8wLWW6BqtC5rxmkHdqvM62atUcGTH4cw3pump'

// Simple User schema
const userSchema = new mongoose.Schema({
  email: String,
  walletAddress: String,
  walletAddressOriginal: String,
  telegramChatId: String,
  telegramUsername: String,
  telegramFirstName: String,
  telegramLinkToken: String,
  telegramLinkTokenExpiry: Date,
})

// Simple UserAlert schema
const userAlertSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  type: String,
  enabled: Boolean,
})

const User = mongoose.model('User', userSchema)
const UserAlert = mongoose.model('UserAlert', userAlertSchema)

/**
 * Simple migration without Redis dependency
 */
async function migrateAlphaThreshold() {
  try {
    console.log('🚀 Starting ALPHA threshold migration (Simple Mode)...')
    console.log(`📊 New threshold: ${PREMIUM_BALANCE_THRESHOLD.toLocaleString()} ALPHA tokens`)

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    })
    console.log('✅ Connected to MongoDB')

    // Find all users with Telegram connections
    const usersWithTelegram = await User.find({
      telegramChatId: { $exists: true, $ne: null },
    }).lean()

    console.log(`\n📋 Found ${usersWithTelegram.length} users with Telegram connections`)

    let processedCount = 0
    let disconnectedCount = 0
    let errorCount = 0

    for (const user of usersWithTelegram) {
      try {
        processedCount++
        const walletForCheck = user.walletAddressOriginal || user.walletAddress

        if (!walletForCheck) {
          console.log(`⚠️  [${processedCount}/${usersWithTelegram.length}] User ${user._id} has no wallet address`)
          continue
        }

        console.log(
          `\n[${processedCount}/${usersWithTelegram.length}] User: ${user.telegramUsername || user.telegramFirstName || user._id}`,
        )
        console.log(`   Wallet: ${walletForCheck}`)

        // For now, just mark them as processed
        // In production, you would check actual balance here
        console.log(`   ✅ Processed (balance check would happen here)`)

      } catch (error) {
        errorCount++
        console.error(`   ❌ Error processing user: ${error.message}`)
      }
    }

    // Summary
    console.log(`\n${'='.repeat(60)}`)
    console.log(`📊 Migration Summary:`)
    console.log(`   Total users processed: ${processedCount}`)
    console.log(`   Users disconnected: ${disconnectedCount}`)
    console.log(`   Errors: ${errorCount}`)
    console.log(`${'='.repeat(60)}`)

    await mongoose.disconnect()
    console.log('\n✅ Migration complete!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    await mongoose.disconnect()
    process.exit(1)
  }
}

migrateAlphaThreshold()
