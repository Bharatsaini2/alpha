const axios = require('axios');
require('dotenv').config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function testBot() {
  console.log('🤖 Testing Telegram Bot...\n');
  
  try {
    // 1. Get bot info
    console.log('1️⃣ Checking bot info...');
    const botInfo = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    console.log('✅ Bot Info:', botInfo.data.result);
    console.log(`   Bot Name: @${botInfo.data.result.username}\n`);
    
    // 2. Get updates (to find your chat ID)
    console.log('2️⃣ Getting recent messages...');
    const updates = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
    
    if (updates.data.result.length === 0) {
      console.log('⚠️  No messages found yet.');
      console.log('📱 ACTION REQUIRED:');
      console.log(`   1. Open Telegram`);
      console.log(`   2. Search for @${botInfo.data.result.username}`);
      console.log(`   3. Send /start to the bot`);
      console.log(`   4. Run this script again\n`);
      return;
    }
    
    console.log(`✅ Found ${updates.data.result.length} message(s)\n`);
    
    // Extract chat IDs
    const chatIds = new Set();
    updates.data.result.forEach(update => {
      if (update.message?.chat?.id) {
        chatIds.add(update.message.chat.id);
        console.log(`   Chat ID: ${update.message.chat.id}`);
        console.log(`   From: ${update.message.chat.first_name || 'Unknown'}`);
        console.log(`   Message: ${update.message.text || 'N/A'}\n`);
      }
    });
    
    // 3. Send test message to each chat
    if (chatIds.size > 0) {
      console.log('3️⃣ Sending test message...');
      for (const chatId of chatIds) {
        const testMessage = await axios.post(
          `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
          {
            chat_id: chatId,
            text: '🎉 *Bot Test Successful!*\n\nYour AlphaBlock AI bot is working correctly.\n\n✅ Connection established\n✅ Messages can be sent\n✅ Ready for alerts',
            parse_mode: 'Markdown'
          }
        );
        console.log(`✅ Test message sent to chat ${chatId}`);
      }
      
      console.log('\n🎊 SUCCESS! Your bot is fully functional.');
      console.log(`\n📝 Your Chat ID(s): ${Array.from(chatIds).join(', ')}`);
      console.log('💡 You can use this Chat ID for testing alerts.\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testBot();
