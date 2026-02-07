/**
 * Send broadcast message to all Telegram users
 */

const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config({ path: './.env' });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI not found in .env file');
  process.exit(1);
}

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN not found in .env file');
  process.exit(1);
}

const MESSAGE = `🔔 *Important Update from AlphaBlock AI*

We sincerely apologize for the inconvenience caused by a temporary technical issue in our personalized Telegram alerts system\\.

*What happened:*
Due to a rapid increase in users, one bot instance reached its performance limit, which led to delays and partial disconnections for some accounts\\.

*Current status:*
✅ The issue has now been fully resolved
✅ System is back to normal with improved stability and capacity

*Action required:*
Please take a moment to double\\-check your account and alert settings\\. If any of your alerts were disconnected during this period, kindly re\\-enable them to continue receiving real\\-time updates without interruption\\.

*Our commitment:*
We truly appreciate your patience and support\\. Our infrastructure is continuously being upgraded to ensure faster delivery, higher reliability, and a seamless experience as AlphaBlock AI scales\\.

Thank you for being part of AlphaBlock AI\\! 🚀

— Team AlphaBlock AI`;

async function sendBroadcast() {
  try {
    console.log('🔌 Connecting to MongoDB...\n');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');

    // Find all users with Telegram connected
    const telegramUsers = await User.find({ 
      telegramChatId: { $exists: true, $ne: null } 
    }).select('telegramChatId telegramUsername telegramFirstName').lean();

    console.log(`📊 Found ${telegramUsers.length} users with Telegram connected\n`);

    if (telegramUsers.length === 0) {
      console.log('❌ No users to send message to');
      await mongoose.disconnect();
      return;
    }

    // Initialize bot
    console.log('🤖 Initializing Telegram bot...\n');
    const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

    // Test bot connection
    const botInfo = await bot.getMe();
    console.log(`✅ Bot connected: @${botInfo.username}\n`);

    console.log('📤 Starting broadcast...\n');
    console.log('═'.repeat(80));

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < telegramUsers.length; i++) {
      const user = telegramUsers[i];
      const displayName = user.telegramUsername 
        ? `@${user.telegramUsername}` 
        : user.telegramFirstName || 'User';

      try {
        await bot.sendMessage(user.telegramChatId, MESSAGE, {
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true
        });

        successCount++;
        console.log(`✅ [${i + 1}/${telegramUsers.length}] Sent to ${displayName}`);

        // Rate limiting: 30 messages per second max
        if ((i + 1) % 25 === 0) {
          console.log('   ⏸️  Pausing for rate limit...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        failCount++;
        console.log(`❌ [${i + 1}/${telegramUsers.length}] Failed for ${displayName}: ${error.message}`);
      }
    }

    console.log('═'.repeat(80));
    console.log(`\n📊 Broadcast Summary:`);
    console.log(`   Total users: ${telegramUsers.length}`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   Success rate: ${Math.round((successCount / telegramUsers.length) * 100)}%`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Confirmation prompt
console.log('⚠️  WARNING: This will send a message to ALL Telegram users!\n');
console.log('Message preview:');
console.log('─'.repeat(80));
console.log(MESSAGE.replace(/\\/g, ''));
console.log('─'.repeat(80));
console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to continue...\n');

setTimeout(() => {
  sendBroadcast();
}, 5000);
