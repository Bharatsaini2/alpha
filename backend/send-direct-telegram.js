const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config({ path: './.env' });

async function sendDirectAlert() {
  try {
    console.log('🤖 Sending direct Telegram alert...');
    console.log('📱 Bot username:', process.env.TELEGRAM_BOT_USERNAME);
    console.log('🆔 Your chat ID: 8519526605');
    
    // Create bot instance without polling (to avoid conflict)
    const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
    
    // Create a test whale alert message
    const alertMessage = `🐋 WHALE ALERT 🚨

🔥 Hotness Score: 6/10
💰 Buy Amount: $8,489.12
🏷️ Token: TEST
📊 Wallet: Smart Money Whale
🔗 Signature: 47WtvWZN...eCRi

⏰ ${new Date().toLocaleString()}

✅ Your whale alert system is now working!
This alert was triggered by our test.`;

    const result = await bot.sendMessage('8519526605', alertMessage);
    
    console.log('✅ Alert sent successfully!');
    console.log('📨 Message ID:', result.message_id);
    console.log('💬 Chat ID confirmed:', result.chat.id);
    
    console.log('\n🎉 SUCCESS: Check your Telegram for the whale alert!');
    
  } catch (error) {
    console.error('❌ Error sending alert:', error.message);
    
    if (error.message.includes('chat not found')) {
      console.log('\n💡 Chat ID not found in dev bot.');
      console.log('   You may need to send /start to @alphabotdevbot first.');
    } else if (error.message.includes('bot was blocked')) {
      console.log('\n🚫 Bot was blocked by user.');
      console.log('   Please unblock @alphabotdevbot and try again.');
    }
  }
}

sendDirectAlert();