/**
 * Broadcast Maintenance Message to All Telegram Users
 * 
 * This script sends a maintenance announcement to all users with linked Telegram accounts.
 * Use --dry-run flag to preview without actually sending messages.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/alpha-tracker';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Check if dry run mode
const isDryRun = process.argv.includes('--dry-run');

// The maintenance message
const MAINTENANCE_MESSAGE = `🔧 *Important Update from Alpha Commune*

Dear Alpha Commune Members,

Our personalized Telegram alerts are currently under maintenance. Over the past few days we received valuable feedback regarding performance and some errors, and we take that seriously.

✨ *A major optimization update is now being deployed*

This includes:
• Backend performance improvements
• New advanced filters such as market cap based segmentation
• More refined, relevant alerts aligned with your individual trading strategy

🎯 *The goal is simple:*
• Faster alerts
• Smarter filtering
• Higher signal quality

We sincerely apologize for the temporary inconvenience and truly appreciate your patience while we enhance the system. The upgraded version will deliver a more precise and efficient experience for everyone.

Thank you for being part of Alpha.

Regards,
*Bashir*
Founder, AlphaBlock AI`;

async function broadcastMessage() {
  let bot;
  
  try {
    console.log('='.repeat(60));
    console.log('TELEGRAM BROADCAST - MAINTENANCE ANNOUNCEMENT');
    console.log('='.repeat(60));
    console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (No messages will be sent)' : '📤 LIVE (Messages will be sent)'}`);
    console.log('='.repeat(60));
    console.log();

    // Connect to MongoDB
    console.log('📊 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get User model
    const User = mongoose.model('User');

    // Find all users with Telegram chat IDs
    console.log('🔍 Fetching users with linked Telegram accounts...');
    const users = await User.find({ 
      telegramChatId: { $exists: true, $ne: null } 
    }).select('telegramChatId telegramUsername telegramFirstName email walletAddress');

    console.log(`✅ Found ${users.length} users with Telegram linked\n`);

    if (users.length === 0) {
      console.log('⚠️  No users found with Telegram accounts. Exiting.');
      return;
    }

    // Display message preview
    console.log('📝 MESSAGE PREVIEW:');
    console.log('-'.repeat(60));
    console.log(MAINTENANCE_MESSAGE);
    console.log('-'.repeat(60));
    console.log();

    if (isDryRun) {
      console.log('🔍 DRY RUN - User List:');
      console.log('='.repeat(60));
      users.forEach((user, index) => {
        console.log(`${index + 1}. Chat ID: ${user.telegramChatId}`);
        console.log(`   Username: ${user.telegramUsername || 'N/A'}`);
        console.log(`   Name: ${user.telegramFirstName || 'N/A'}`);
        console.log(`   Email: ${user.email || 'N/A'}`);
        console.log(`   Wallet: ${user.walletAddress ? user.walletAddress.substring(0, 8) + '...' : 'N/A'}`);
        console.log();
      });
      console.log('='.repeat(60));
      console.log(`\n✅ DRY RUN COMPLETE - ${users.length} users would receive this message`);
      console.log('\n💡 To send messages for real, run: node broadcast-maintenance-message.js');
      return;
    }

    // Initialize Telegram bot for live sending
    if (!TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN not found in environment variables');
    }

    console.log('🤖 Initializing Telegram bot...');
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
    console.log('✅ Telegram bot initialized\n');

    // Send messages with rate limiting
    console.log('📤 Starting message broadcast...\n');
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const progress = `[${i + 1}/${users.length}]`;
      
      try {
        await bot.sendMessage(user.telegramChatId, MAINTENANCE_MESSAGE, {
          parse_mode: 'Markdown'
        });
        
        results.success++;
        console.log(`${progress} ✅ Sent to ${user.telegramUsername || user.telegramChatId}`);
        
        // Rate limiting: 30 messages per second max (Telegram limit)
        // Adding 50ms delay to be safe
        if (i < users.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          chatId: user.telegramChatId,
          username: user.telegramUsername,
          error: error.message
        });
        console.log(`${progress} ❌ Failed to send to ${user.telegramUsername || user.telegramChatId}: ${error.message}`);
      }
    }

    // Display results
    console.log('\n' + '='.repeat(60));
    console.log('📊 BROADCAST RESULTS');
    console.log('='.repeat(60));
    console.log(`✅ Successfully sent: ${results.success}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📈 Success rate: ${((results.success / users.length) * 100).toFixed(2)}%`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ Failed deliveries:');
      results.errors.forEach((err, index) => {
        console.log(`${index + 1}. ${err.username || err.chatId}: ${err.error}`);
      });
    }
    
    console.log('='.repeat(60));
    console.log('\n✅ Broadcast complete!');

  } catch (error) {
    console.error('\n❌ Error during broadcast:', error);
    throw error;
  } finally {
    // Cleanup
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('\n📊 MongoDB connection closed');
    }
    if (bot) {
      await bot.close();
      console.log('🤖 Telegram bot closed');
    }
  }
}

// Run the broadcast
broadcastMessage()
  .then(() => {
    console.log('\n✨ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
