/**
 * Manual Testing Script for Telegram Alert System
 * 
 * This script allows you to manually test the Telegram bot functionality
 * without needing the frontend. You can:
 * 1. Generate account linking tokens
 * 2. Create test alert subscriptions
 * 3. Simulate whale transactions to trigger alerts
 * 4. Test the complete end-to-end flow
 * 
 * Usage:
 * 1. Make sure your .env has TELEGRAM_BOT_TOKEN set
 * 2. Run: npx ts-node manual-test-telegram-bot.ts
 * 3. Follow the interactive prompts
 */

// IMPORTANT: Load environment variables FIRST before any other imports
import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import readline from 'readline'
import { User } from './src/models/user.model'
import { UserAlert } from './src/models/userAlert.model'
import { TelegramService } from './src/services/telegram.service'
import { AlertMatcherService } from './src/services/alertMatcher.service'
import { AlertType, Priority } from './src/types/alert.types'
import whaleAllTransactionModelV2 from './src/models/whaleAllTransactionsV2.model'
import { randomUUID } from 'crypto'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve)
  })
}

async function connectDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '')
    console.log('✅ Connected to MongoDB')
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error)
    process.exit(1)
  }
}

async function testAccountLinking() {
  console.log('\n📱 === ACCOUNT LINKING TEST ===\n')

  const email = await question('Enter test user email (or press Enter to create new): ')

  let user
  if (email) {
    user = await User.findOne({ email })
    if (!user) {
      console.log('❌ User not found. Creating new user...')
      user = await User.create({ email, password: 'test123' })
    }
  } else {
    const testEmail = `test-${Date.now()}@example.com`
    user = await User.create({ email: testEmail, password: 'test123' })
    console.log(`✅ Created test user: ${testEmail}`)
  }

  // Generate linking token
  const linkToken = randomUUID()
  const tokenExpiry = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

  user.telegramLinkToken = linkToken
  user.telegramLinkTokenExpiry = tokenExpiry
  await user.save()

  console.log('\n✅ Account linking token generated!')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📋 User ID: ${user._id}`)
  console.log(`📧 Email: ${user.email}`)
  console.log(`🔑 Link Token: ${linkToken}`)
  console.log(`⏰ Expires: ${tokenExpiry.toLocaleString()}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('\n📲 NEXT STEPS:')
  console.log('1. Open Telegram and search for your bot')
  console.log(`2. Send this command: /start ${linkToken}`)
  console.log('3. The bot should confirm your account is linked')
  console.log('4. Come back here and press Enter to continue...\n')

  await question('Press Enter after linking your Telegram account...')

  // Verify linking
  const updatedUser = await User.findById(user._id)
  if (updatedUser?.telegramChatId) {
    console.log(`✅ SUCCESS! Telegram linked to chat ID: ${updatedUser.telegramChatId}`)
    return updatedUser
  } else {
    console.log('❌ Account not linked yet. Make sure you sent the /start command.')
    return null
  }
}

async function createTestAlert(userId: string) {
  console.log('\n🔔 === CREATE TEST ALERT ===\n')

  console.log('Select alert type:')
  console.log('1. ALPHA_STREAM (Low priority - whale transactions)')
  console.log('2. WHALE_CLUSTER (High priority - coordinated activity)')
  console.log('3. KOL_ACTIVITY (Medium priority - influencer trades)')

  const typeChoice = await question('\nEnter choice (1-3): ')

  let alertType: AlertType
  let priority: Priority
  let config: any = {}

  switch (typeChoice) {
    case '1':
      alertType = AlertType.ALPHA_STREAM
      priority = Priority.LOW
      const minAmount = await question('Minimum USD amount (default 1000): ')
      config.minAmount = minAmount ? parseFloat(minAmount) : 1000
      break
    case '2':
      alertType = AlertType.WHALE_CLUSTER
      priority = Priority.HIGH
      const minCluster = await question('Minimum cluster size (default 3): ')
      config.minClusterSize = minCluster ? parseInt(minCluster) : 3
      break
    case '3':
      alertType = AlertType.KOL_ACTIVITY
      priority = Priority.MEDIUM
      break
    default:
      alertType = AlertType.ALPHA_STREAM
      priority = Priority.LOW
      config.minAmount = 1000
  }

  const tokenAddress = await question(
    'Token address to monitor (or press Enter for SOL): ',
  )
  if (tokenAddress) {
    config.tokens = [tokenAddress]
  } else {
    config.tokens = ['So11111111111111111111111111111111111111112'] // SOL
  }

  const alert = await UserAlert.create({
    userId,
    type: alertType,
    priority,
    enabled: true,
    config,
  })

  console.log('\n✅ Alert created successfully!')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📋 Alert ID: ${alert._id}`)
  console.log(`🔔 Type: ${alertType}`)
  console.log(`⚡ Priority: ${priority}`)
  console.log(`⚙️  Config: ${JSON.stringify(config, null, 2)}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  return alert
}

async function simulateWhaleTransaction(tokenAddress: string) {
  console.log('\n🐋 === SIMULATE WHALE TRANSACTION ===\n')

  const mockTransaction = {
    signature: `test-tx-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    whale: {
      address: 'TestWhaleAddress123456789',
    },
    transaction: {
      tokenOut: {
        address: tokenAddress,
        symbol: 'TEST',
        amount: '5000',
        usdAmount: '25000',
      },
      tokenIn: {
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        symbol: 'USDC',
        amount: '25000',
        usdAmount: '25000',
      },
    },
    type: 'buy' as const,
    timestamp: new Date(),
    tokenOutAddress: tokenAddress,
  }

  console.log('📊 Transaction Details:')
  console.log(`  Signature: ${mockTransaction.signature}`)
  console.log(`  Whale: ${mockTransaction.whale.address}`)
  console.log(`  Token: ${mockTransaction.transaction.tokenOut.symbol}`)
  console.log(`  Amount: $${mockTransaction.transaction.tokenOut.usdAmount}`)
  console.log(`  Type: ${mockTransaction.type.toUpperCase()}`)

  return mockTransaction
}

async function testAlertFlow() {
  console.log('\n🚀 === COMPLETE ALERT FLOW TEST ===\n')

  // Initialize services
  console.log('🔧 Initializing services...')
  const telegramService = new TelegramService()
  const alertMatcherService = new AlertMatcherService()

  try {
    await telegramService.initialize()
    console.log('✅ Telegram service initialized')

    await alertMatcherService.initialize()
    console.log('✅ Alert matcher service initialized')

    // Sync subscriptions
    console.log('🔄 Syncing alert subscriptions...')
    await alertMatcherService.syncSubscriptions()
    console.log('✅ Subscriptions synced')

    const stats = telegramService.getQueueStats()
    console.log(`📊 Queue stats: ${stats.queueSize} messages, ${stats.messagesProcessed} processed`)

    console.log('\n✅ Services are running!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('The bot is now listening for transactions.')
    console.log('You can now simulate transactions or wait for real ones.')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    return { telegramService, alertMatcherService }
  } catch (error) {
    console.error('❌ Failed to initialize services:', error)
    throw error
  }
}

async function sendTestAlert(
  telegramService: TelegramService,
  alertMatcherService: AlertMatcherService,
  tokenAddress: string,
) {
  console.log('\n📤 Sending test transaction through matcher...')

  const mockTx = await simulateWhaleTransaction(tokenAddress)

  // Process through matcher
  await alertMatcherService.processTransaction(mockTx as any)

  // Wait a bit for async processing
  await new Promise((resolve) => setTimeout(resolve, 2000))

  const stats = telegramService.getQueueStats()
  console.log(`\n📊 Queue stats after transaction:`)
  console.log(`  Queue size: ${stats.queueSize}`)
  console.log(`  Messages processed: ${stats.messagesProcessed}`)
  console.log(`  Messages dropped: ${stats.messagesDropped}`)

  if (stats.queueSize > 0) {
    console.log('\n✅ Alert queued! Check your Telegram for the message.')
  } else if (stats.messagesProcessed > 0) {
    console.log('\n✅ Alert sent! Check your Telegram for the message.')
  } else {
    console.log('\n⚠️  No alerts matched. Check your alert configuration.')
  }
}

async function viewUserAlerts(userId: string) {
  console.log('\n📋 === YOUR ACTIVE ALERTS ===\n')

  const alerts = await UserAlert.find({ userId, enabled: true }).lean()

  if (alerts.length === 0) {
    console.log('No active alerts found.')
    return
  }

  alerts.forEach((alert, index) => {
    console.log(`\n${index + 1}. Alert ID: ${alert._id}`)
    console.log(`   Type: ${alert.type}`)
    console.log(`   Priority: ${alert.priority}`)
    console.log(`   Config: ${JSON.stringify(alert.config, null, 2)}`)
  })

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║   TELEGRAM ALERT SYSTEM - MANUAL TESTING TOOL         ║')
  console.log('╚════════════════════════════════════════════════════════╝\n')

  // Check environment
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('❌ ERROR: TELEGRAM_BOT_TOKEN not found in .env file')
    console.error('Please add your bot token to the .env file and try again.')
    process.exit(1)
  }

  console.log('✅ Telegram bot token found')
  console.log(`🤖 Bot token: ${process.env.TELEGRAM_BOT_TOKEN.substring(0, 10)}...`)

  await connectDatabase()

  let user: any = null
  let services: any = null

  while (true) {
    console.log('\n╔════════════════════════════════════════════════════════╗')
    console.log('║                    MAIN MENU                           ║')
    console.log('╚════════════════════════════════════════════════════════╝')
    console.log('\n1. 📱 Link Telegram Account (Step 1)')
    console.log('2. 🔔 Create Alert Subscription (Step 2)')
    console.log('3. 📋 View My Alerts')
    console.log('4. 🚀 Start Alert Services (Step 3)')
    console.log('5. 🐋 Send Test Transaction (Step 4)')
    console.log('6. 📊 View Queue Statistics')
    console.log('7. 🔄 Sync Subscriptions')
    console.log('8. 🧪 Run Complete Test Flow (All Steps)')
    console.log('9. ❌ Exit\n')

    const choice = await question('Enter your choice (1-9): ')

    try {
      switch (choice) {
        case '1':
          user = await testAccountLinking()
          break

        case '2':
          if (!user) {
            console.log('❌ Please link your Telegram account first (option 1)')
            break
          }
          await createTestAlert(user._id.toString())
          break

        case '3':
          if (!user) {
            console.log('❌ Please link your Telegram account first (option 1)')
            break
          }
          await viewUserAlerts(user._id.toString())
          break

        case '4':
          services = await testAlertFlow()
          break

        case '5':
          if (!services) {
            console.log('❌ Please start alert services first (option 4)')
            break
          }
          const tokenAddr = await question(
            'Token address (or press Enter for SOL): ',
          )
          const token =
            tokenAddr || 'So11111111111111111111111111111111111111112'
          await sendTestAlert(services.telegramService, services.alertMatcherService, token)
          break

        case '6':
          if (!services) {
            console.log('❌ Please start alert services first (option 4)')
            break
          }
          const stats = services.telegramService.getQueueStats()
          console.log('\n📊 === QUEUE STATISTICS ===')
          console.log(`Queue size: ${stats.queueSize}`)
          console.log(`Messages processed: ${stats.messagesProcessed}`)
          console.log(`Messages dropped: ${stats.messagesDropped}`)
          console.log(`Dedup cache size: ${stats.dedupCacheSize}`)
          break

        case '7':
          if (!services) {
            console.log('❌ Please start alert services first (option 4)')
            break
          }
          console.log('🔄 Syncing subscriptions...')
          await services.alertMatcherService.syncSubscriptions()
          console.log('✅ Subscriptions synced!')
          break

        case '8':
          console.log('\n🧪 === RUNNING COMPLETE TEST FLOW ===\n')
          user = await testAccountLinking()
          if (user) {
            const alert = await createTestAlert(user._id.toString())
            services = await testAlertFlow()
            const tokenAddress =
              alert.config.tokens?.[0] ||
              'So11111111111111111111111111111111111111112'
            await sendTestAlert(
              services.telegramService,
              services.alertMatcherService,
              tokenAddress,
            )
            console.log('\n✅ Complete test flow finished!')
            console.log('Check your Telegram for the alert message.')
          }
          break

        case '9':
          console.log('\n👋 Shutting down...')
          if (services) {
            await services.alertMatcherService.shutdown()
            await services.telegramService.shutdown()
          }
          await mongoose.disconnect()
          rl.close()
          console.log('✅ Goodbye!')
          process.exit(0)

        default:
          console.log('❌ Invalid choice. Please enter 1-9.')
      }
    } catch (error) {
      console.error('❌ Error:', error)
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n👋 Received SIGINT, shutting down gracefully...')
  await mongoose.disconnect()
  rl.close()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n\n👋 Received SIGTERM, shutting down gracefully...')
  await mongoose.disconnect()
  rl.close()
  process.exit(0)
})

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
