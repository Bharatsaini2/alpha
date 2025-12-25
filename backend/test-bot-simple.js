/**
 * SIMPLE BOT TEST - No TypeScript, No Complex Imports
 * Just run: node test-bot-simple.js
 */

require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')

console.log('\n🤖 SIMPLE TELEGRAM BOT TEST\n')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

const token = process.env.TELEGRAM_BOT_TOKEN

if (!token) {
  console.error('❌ ERROR: TELEGRAM_BOT_TOKEN not found in .env')
  process.exit(1)
}

console.log('✅ Bot token found:', token.substring(0, 10) + '...\n')

const bot = new TelegramBot(token, { polling: false })

async function test() {
  try {
    // Test 1: Get bot info
    console.log('📡 Test 1: Checking bot connection...')
    const botInfo = await bot.getMe()
    console.log('✅ Bot is ALIVE!')
    console.log(`   Username: @${botInfo.username}`)
    console.log(`   Name: ${botInfo.first_name}`)
    console.log(`   ID: ${botInfo.id}\n`)

    // Test 2: Check for chat ID
    const chatId = process.env.CHAT_ID
    if (chatId) {
      console.log('📤 Test 2: Sending test message...')
      console.log(`   Chat ID: ${chatId}`)
      
      await bot.sendMessage(
        chatId,
        '🎉 *Test Message from AlphaBlock Bot*\n\n' +
          'If you can see this, your bot is working correctly\\!\n\n' +
          '✅ Connection: OK\n' +
          '✅ Messaging: OK\n' +
          '✅ MarkdownV2: OK',
        { parse_mode: 'MarkdownV2' }
      )
      
      console.log('✅ Message sent! Check your Telegram.\n')
    } else {
      console.log('📤 Test 2: Get your chat ID')
      console.log('   1. Send any message to @' + botInfo.username)
      console.log('   2. Visit this URL in your browser:')
      console.log('      https://api.telegram.org/bot' + token + '/getUpdates')
      console.log('   3. Look for "chat":{"id": YOUR_CHAT_ID}')
      console.log('   4. Run: CHAT_ID=your_id node test-bot-simple.js\n')
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ BOT IS WORKING!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('🚀 NEXT STEPS:')
    console.log('1. Get your chat ID (see instructions above)')
    console.log('2. Test sending messages: CHAT_ID=your_id node test-bot-simple.js')
    console.log('3. Start your server: npm run dev')
    console.log('4. Test the full system with the API endpoints\n')

    await bot.close()
    process.exit(0)
  } catch (error) {
    console.error('❌ ERROR:', error.message)
    
    if (error.message.includes('429')) {
      console.error('\n⚠️  Rate limit hit. Your bot has been used a lot recently.')
      console.error('Wait a few minutes and try again.\n')
    } else {
      console.error('\nPossible issues:')
      console.error('1. Invalid bot token')
      console.error('2. Network connection problems')
      console.error('3. Bot was deleted or disabled\n')
    }
    
    process.exit(1)
  }
}

test()
