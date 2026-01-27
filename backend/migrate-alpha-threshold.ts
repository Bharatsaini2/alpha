import mongoose from 'mongoose'
import { User } from './src/models/user.model'
import { UserAlert } from './src/models/userAlert.model'
import { validateSOLBalance, PREMIUM_BALANCE_THRESHOLD } from './src/middlewares/premiumGate.middleware'
import { TelegramService } from './src/services/telegram.service'
import logger from './src/utils/logger'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/alpha-tracker'
const telegramService = new TelegramService()

/**
 * Migration script to handle users below the new ALPHA threshold (500,000)
 * - Disconnects their Telegram
 * - Disables their alerts
 * - Sends them a notification message
 */
async function migrateAlphaThreshold() {
  try {
    console.log('🚀 Starting ALPHA threshold migration...')
    console.log(`📊 New threshold: ${PREMIUM_BALANCE_THRESHOLD.toLocaleString()} ALPHA tokens`)

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Find all users with Telegram connections
    const usersWithTelegram = await User.find({
      telegramChatId: { $exists: true, $ne: null },
    })

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

        // Check ALPHA balance
        const balanceResult = await validateSOLBalance(walletForCheck, true) // bypass cache for accuracy

        console.log(
          `\n[${processedCount}/${usersWithTelegram.length}] User: ${user.telegramUsername || user.telegramFirstName || user._id}`,
        )
        console.log(`   Wallet: ${walletForCheck}`)
        console.log(`   ALPHA Balance: ${balanceResult.currentBalance.toLocaleString()}`)
        console.log(`   Required: ${PREMIUM_BALANCE_THRESHOLD.toLocaleString()}`)

        // If balance is below threshold, disconnect Telegram and disable alerts
        if (!balanceResult.hasAccess) {
          console.log(`   ❌ Below threshold - disconnecting Telegram...`)

          // Send notification message to user
          try {
            const message = `⚠️ *ALPHA Threshold Update*\n\nThe minimum ALPHA token requirement for alerts has been updated to *${PREMIUM_BALANCE_THRESHOLD.toLocaleString()} ALPHA tokens* (5 lakh).\n\n*Your current balance:* ${balanceResult.currentBalance.toLocaleString()} ALPHA\n*Required:* ${PREMIUM_BALANCE_THRESHOLD.toLocaleString()} ALPHA\n\nYour Telegram alerts have been disconnected. Once you reach the required amount, you can reconnect and re-enable your alerts.\n\nThank you for your understanding! 🙏`

            await telegramService.sendMessage(user.telegramChatId!, message)
            console.log(`   📨 Notification sent to Telegram`)
          } catch (telegramError) {
            console.log(`   ⚠️  Failed to send Telegram message: ${telegramError instanceof Error ? telegramError.message : 'Unknown error'}`)
          }

          // Disable all alerts for this user
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
          console.log(`   ✅ Above threshold - no action needed`)
        }
      } catch (error) {
        errorCount++
        console.error(
          `   ❌ Error processing user: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
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
    console.error('❌ Migration failed:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

// Run migration
migrateAlphaThreshold()
