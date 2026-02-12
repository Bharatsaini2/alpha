/**
 * Broadcast Message to All Telegram Users
 * 
 * This script sends a message to all users who have connected their Telegram accounts.
 * 
 * Usage:
 *   node broadcast-telegram-message.js --dry-run    (Preview without sending)
 *   node broadcast-telegram-message.js              (Actually send messages)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');

// Message to send
const MESSAGE = `Dear Alpha Commune Members,

Our personalized Telegram alerts are currently under maintenance. Over the past few days we received valuable feedback regarding performance and some errors, and we take that seriously.

A major optimization update is now being deployed. This includes backend performance improvements and new advanced filters such as market cap based segmentation, allowing alerts to be more refined, relevant, and aligned with your individual trading strategy.

The goal is simple: faster alerts, smarter filtering, and higher signal quality.

We sincerely apologize for the temporary inconvenience and truly appreciate your patience while we enhance the system. The upgraded version will deliver a more precise and efficient experience for everyone.

Thank you for being part of Alpha.

Regards,
Bashir
Founder, AlphaBlock AI`;

// Check if dry run mode
const isDryRun = process.argv.includes('--dry-run');

// User Schema (simplified for this script)
const userSchema = new mongoose.Schema({
  walletAddress: String,
  telegramChatId: String,
  telegramUsername: String,
  telegramFirstName: String,
  isActive: Boolean,
});

const User = mongoose.model('User', userSchema);

async function broadcastMessage() {
  try {
    console.log('🚀 Starting Telegram Broadcast Script');
    console.log('=====================================\n');
    
    if (isDryRun) {
      console.log('⚠️  DRY RUN MODE - No messages will be sent\n');
    } else {
      console.log('✅ LIVE MODE - Messages will be sent\n');
    }

    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Initialize Telegram Bot
    const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
    console.log('✅ Telegram Bot initialized\n');

    // Fetch all users with Telegram chat IDs
    console.log('🔍 Fetching users with Telegram accounts...');
    const users = await User.find({
      telegramChatId: { $exists: true, $ne: null },
      isActive: true
    }).select('telegramChatId telegramUsername telegramFirstName walletAddress');

    console.log(`📊 Found ${users.length} users with active Telegram accounts\n`);

    if (users.length === 0) {
      console.log('⚠️  No users found with Telegram accounts. Exiting.');
      return;
    }

    // Display message preview
    console.log('📝 Message Preview:');
    console.log('─'.repeat(60));
    console.log(MESSAGE);
    console.log('─'.repeat(60));
    console.log(`\nMessage length: ${MESSAGE.length} characters\n`);

    // Display user list
    console.log('👥 Target Users:');
    console.log('─'.repeat(80));
    users.forEach((user, index) => {
      const displayName = user.telegramUsername 
        ? `@${user.telegramUsername}` 
        : user.telegramFirstName || 'Unknown';
      const wallet = user.walletAddress 
        ? `${user.walletAddress.substring(0, 6)}...${user.walletAddress.substring(user.walletAddress.length - 4)}`
        : 'No wallet';
      console.log(`${(index + 1).toString().padStart(3)}. ${displayName.padEnd(20)} | Chat ID: ${user.telegramChatId.padEnd(15)} | ${wallet}`);
    });
    console.log('─'.repeat(80));
    console.log();

    if (isDryRun) {
      console.log('✅ DRY RUN COMPLETE');
      console.log(`\n📊 Summary:`);
      console.log(`   - Total recipients: ${users.length}`);
      console.log(`   - Message length: ${MESSAGE.length} characters`);
      console.log(`\n💡 To send messages for real, run without --dry-run flag:`);
      console.log(`   node broadcast-telegram-message.js\n`);
      return;
    }

    // Confirm before sending
    console.log('⚠️  READY TO SEND MESSAGES');
    console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
    await sleep(5000);

    // Send messages
    console.log('📤 Sending messages...\n');
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const displayName = user.telegramUsername 
        ? `@${user.telegramUsername}` 
        : user.telegramFirstName || 'Unknown';

      try {
        await bot.sendMessage(user.telegramChatId, MESSAGE, {
          parse_mode: 'HTML',
          disable_web_page_preview: true
        });
        successCount++;
        console.log(`✅ [${i + 1}/${users.length}] Sent to ${displayName} (${user.telegramChatId})`);
        
        // Rate limiting: wait 100ms between messages to avoid hitting Telegram limits
        if (i < users.length - 1) {
          await sleep(100);
        }
      } catch (error) {
        failCount++;
        const errorMsg = error.message || 'Unknown error';
        errors.push({ user: displayName, chatId: user.telegramChatId, error: errorMsg });
        console.log(`❌ [${i + 1}/${users.length}] Failed to send to ${displayName}: ${errorMsg}`);
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 BROADCAST COMPLETE');
    console.log('='.repeat(80));
    console.log(`✅ Successfully sent: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`📈 Success rate: ${((successCount / users.length) * 100).toFixed(1)}%`);

    if (errors.length > 0) {
      console.log('\n❌ Failed Messages:');
      errors.forEach((err, idx) => {
        console.log(`   ${idx + 1}. ${err.user} (${err.chatId}): ${err.error}`);
      });
    }

    console.log('\n✅ Broadcast script completed successfully\n');

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the script
broadcastMessage()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
