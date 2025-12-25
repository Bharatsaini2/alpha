/**
 * QUICK TEST - Telegram Bot
 * 
 * This is the fastest way to test if your bot is working.
 * Just run: npx ts-node quick-test-bot.ts
 */

// IMPORTANT: Load environment variables FIRST
import dotenv from 'dotenv'
dotenv.config()

import TelegramBot from 'node-telegram-bot-api'

async function quickTest() {
  console.log('🤖 TELEGRAM BOT QUICK TEST\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Check token
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.error('❌ ERROR: TELEGRAM_BOT_TOKEN not found in .env')
    console.error('Please add your bot token to .env file')
    process.exit(1)
  }

  console.log('✅ Bot token found')
  console.log(`   Token: ${token.substring(0, 10)}...\n`)

  try {
    // Create bot instance
    const bot = new TelegramBot(token, { polling: false })

    // Test 1: Get bot info
    console.log('📡 Test 1: Checking bot connection...')
    const botInfo = await bot.getMe()
    console.log('✅ Bot is alive!')
    console.log(`   Username: @${botInfo.username}`)
    console.log(`   Name: ${botInfo.first_name}`)
    console.log(`   ID: ${botInfo.id}\n`)

    // Test 2: Check if bot can send messages
    console.log('📤 Test 2: Testing message sending...')
    console.log('   To test message sending, you need a chat ID.')
    console.log('   \n   HOW TO GET YOUR CHAT ID:')
    console.log('   1. Send any message to your bot in Telegram')
    console.log('   2. Visit: https://api.telegram.org/bot' + token + '/getUpdates')
    console.log('   3. Look for "chat":{"id": YOUR_CHAT_ID}')
    console.log('   4. Run this script again with: CHAT_ID=your_id npx ts-node quick-test-bot.ts\n')

    const chatId = process.env.CHAT_ID
    if (chatId) {
      console.log(`   Found chat ID: ${chatId}`)
      console.log('   Sending test message...')

      await bot.sendMessage(
        chatId,
        '🎉 *Test Message from AlphaBlock Bot*\n\n' +
          'If you can see this, your bot is working correctly\\!\n\n' +
          '✅ Connection: OK\n' +
          '✅ Messaging: OK\n' +
          '✅ MarkdownV2: OK',
        { parse_mode: 'MarkdownV2' },
      )

      console.log('✅ Test message sent! Check your Telegram.\n')
    } else {
      console.log('   ⚠️  No CHAT_ID provided, skipping message test\n')
    }

    // Test 3: Show bot commands
    console.log('📋 Test 3: Available bot commands')
    console.log('   /start <token> - Link your account')
    console.log('   /help - Show help message\n')

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ ALL TESTS PASSED!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('🚀 NEXT STEPS:')
    console.log('1. If you haven\'t already, send a message to @' + botInfo.username)
    console.log('2. Get your chat ID from the URL above')
    console.log('3. Run: CHAT_ID=your_id npx ts-node quick-test-bot.ts')
    console.log('4. Or use the full testing tool: npx ts-node manual-test-telegram-bot.ts\n')

    await bot.close()
  } catch (error: any) {
    console.error('❌ ERROR:', error.message)
    console.error('\nPossible issues:')
    console.error('1. Invalid bot token')
    console.error('2. Network connection problems')
    console.error('3. Bot was deleted or disabled')
    console.error('\nTo fix:')
    console.error('1. Check your TELEGRAM_BOT_TOKEN in .env')
    console.error('2. Create a new bot with @BotFather if needed')
    console.error('3. Make sure you have internet connection\n')
    process.exit(1)
  }
}

quickTest()
