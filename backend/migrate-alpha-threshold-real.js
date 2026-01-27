const mongoose = require('mongoose')
const { Connection, PublicKey } = require('@solana/web3.js')
const { getAssociatedTokenAddress } = require('@solana/spl-token')
require('dotenv').config()

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/alpha-tracker'
const PREMIUM_BALANCE_THRESHOLD = 500000
const ALPHA_TOKEN_MINT = '3wtGGWZ8wLWW6BqtC5rxmkHdqvM62atUcGTH4cw3pump'
const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com'

// Simple schemas
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

const userAlertSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  type: String,
  enabled: Boolean,
})

const User = mongoose.model('User', userSchema)
const UserAlert = mongoose.model('UserAlert', userAlertSchema)

/**
 * Check ALPHA balance for a wallet
 */
async function checkAlphaBalance(walletAddress) {
  try {
    const connection = new Connection(RPC_URL, 'confirmed')
    
    // Validate wallet address
    let publicKey
    try {
      publicKey = new PublicKey(walletAddress)
    } catch (error) {
      console.log(`   ⚠️  Invalid wallet address format`)
      return 0
    }

    // Get ALPHA token account
    const alphaTokenMint = new PublicKey(ALPHA_TOKEN_MINT)
    const tokenAccount = await getAssociatedTokenAddress(alphaTokenMint, publicKey)

    // Query balance
    try {
      const tokenAccountInfo = await connection.getTokenAccountBalance(tokenAccount)
      if (tokenAccountInfo.value) {
        const balance = parseFloat(tokenAccountInfo.value.amount) / Math.pow(10, tokenAccountInfo.value.decimals)
        return balance
      }
    } catch (error) {
      // Token account doesn't exist
      return 0
    }

    return 0
  } catch (error) {
    console.log(`   ⚠️  Error checking balance: ${error.message}`)
    return 0
  }
}

/**
 * Real migration with actual balance checks
 */
async function migrateAlphaThreshold() {
  try {
    console.log('🚀 Starting ALPHA threshold migration (REAL MODE)...')
    console.log(`📊 New threshold: ${PREMIUM_BALANCE_THRESHOLD.toLocaleString()} ALPHA tokens`)
    console.log(`🔗 RPC URL: ${RPC_URL}`)

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    })
    console.log('✅ Connected to MongoDB')

    // Find all users with Telegram connections
    const usersWithTelegram = await User.find({
      telegramChatId: { $exists: true, $ne: null },
    })

    console.log(`\n📋 Found ${usersWithTelegram.length} users with Telegram connections`)
    console.log(`⏳ Checking balances... (this may take a few minutes)\n`)

    let processedCount = 0
    let disconnectedCount = 0
    let errorCount = 0
    let aboveThresholdCount = 0

    for (const user of usersWithTelegram) {
      try {
        processedCount++
        const walletForCheck = user.walletAddressOriginal || user.walletAddress

        if (!walletForCheck) {
          console.log(`[${processedCount}/${usersWithTelegram.length}] ⚠️  No wallet address`)
          continue
        }

        // Check balance
        console.log(`[${processedCount}/${usersWithTelegram.length}] Checking: ${user.telegramUsername || user.telegramFirstName || user._id}`)
        const balance = await checkAlphaBalance(walletForCheck)
        console.log(`   Balance: ${balance.toLocaleString()} ALPHA`)

        if (balance < PREMIUM_BALANCE_THRESHOLD) {
          console.log(`   ❌ BELOW THRESHOLD - Disconnecting...`)

          // Disable all alerts
          const disabledAlerts = await UserAlert.updateMany(
            { userId: user._id },
            { enabled: false },
          )
          console.log(`   🔒 Disabled ${disabledAlerts.modifiedCount} alerts`)

          // Disconnect Telegram
          await User.findByIdAndUpdate(user._id, {
            $unset: {
              telegramChatId: 1,
              telegramUsername: 1,
              telegramFirstName: 1,
              telegramLinkToken: 1,
              telegramLinkTokenExpiry: 1,
            },
          })

          console.log(`   ✅ Telegram disconnected`)
          disconnectedCount++
        } else {
          console.log(`   ✅ Above threshold - no action`)
          aboveThresholdCount++
        }

      } catch (error) {
        errorCount++
        console.error(`   ❌ Error: ${error.message}`)
      }
    }

    // Summary
    console.log(`\n${'='.repeat(60)}`)
    console.log(`📊 Migration Summary:`)
    console.log(`   Total users processed: ${processedCount}`)
    console.log(`   Users above threshold: ${aboveThresholdCount}`)
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
