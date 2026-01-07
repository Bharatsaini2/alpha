const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config({ path: './.env' });

async function testDirectMessage() {
  try {
    console.log('🤖 Testing direct message to your chat ID...');
    console.log('📱 Bot username:', process.env.TELEGRAM_BOT_USERNAME);
    console.log('🆔 Your current chat ID: 8519526605');
    
    // Create bot instance without polling (to avoid conflict)
    const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
    
    // Try to send a test message to your current chat ID
    const testMessage = `🧪 TEST MESSAGE from ${process.env.TELEGRAM_BOT_USERNAME}
    
This is a test to see if the dev bot can reach your chat.
Time: ${new Date().toLocaleString()}

If you receive this message, the dev bot is working with your current chat ID!`;

    const result = await bot.sendMessage('8519526605', testMessage);
    
    console.log('✅ Message sent successfully!');
    console.log('📨 Message ID:', result.message_id);
    console.log('💬 Chat ID confirmed:', result.chat.id);
    
    console.log('\n🎉 SUCCESS: Your current chat ID (8519526605) works with the dev bot!');
    console.log('   No need to change anything - alerts should work now.');
    
  } catch (error) {
    console.error('❌ Error sending message:', error.message);
    
    if (error.message.includes('chat not found')) {
      console.log('\n💡 Chat ID 8519526605 not found in dev bot.');
      console.log('   You need to:');
      console.log('   1. Go to @alphabotdevbot in Telegram');
      console.log('   2. Send /start or any message');
      console.log('   3. Get your new chat ID');
    } else if (error.message.includes('bot was blocked')) {
      console.log('\n🚫 Bot was blocked by user.');
      console.log('   Please unblock @alphabotdevbot and try again.');
    }
  }
}

testDirectMessage();