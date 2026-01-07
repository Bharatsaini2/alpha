const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config({ path: './.env' });

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

async function getRecentChats() {
  try {
    console.log('🤖 Getting recent updates from dev bot...');
    console.log('📱 Bot username:', process.env.TELEGRAM_BOT_USERNAME);
    
    // Get recent updates
    const updates = await bot.getUpdates({ limit: 10 });
    
    console.log('\n📨 Recent messages:');
    
    if (updates.length === 0) {
      console.log('   No recent messages found.');
      console.log('   💡 Send a message to @alphabotdevbot first, then run this script again.');
      return;
    }
    
    updates.forEach((update, index) => {
      if (update.message) {
        const msg = update.message;
        console.log(`\n   Message #${index + 1}:`);
        console.log('   ├─ Chat ID:', msg.chat.id);
        console.log('   ├─ From:', msg.from.first_name, msg.from.last_name || '');
        console.log('   ├─ Username:', msg.from.username || 'No username');
        console.log('   ├─ Text:', msg.text || 'No text');
        console.log('   └─ Date:', new Date(msg.date * 1000).toLocaleString());
      }
    });
    
    console.log('\n💡 Use one of the Chat IDs above to update your user record.');
    
  } catch (error) {
    console.error('❌ Error getting updates:', error.message);
    
    if (error.message.includes('401')) {
      console.log('\n🔑 Bot token might be invalid. Current token:', process.env.TELEGRAM_BOT_TOKEN?.substring(0, 10) + '...');
    }
  }
}

getRecentChats();