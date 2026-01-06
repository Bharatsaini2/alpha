/**
 * Move Telegram connection from old account to new account
 * Run: node move-telegram-connection.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const OLD_USER_ID = '69433a09c66bd9e99c9c60dc';
const NEW_USER_ID = '695caab996612f706c3ad96b';

async function moveTelegramConnection() {
  try {
    console.log('\n🔍 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));

    // Get old user
    const oldUser = await User.findById(OLD_USER_ID);
    if (!oldUser) {
      console.log('❌ Old user not found\n');
      process.exit(1);
    }

    // Get new user
    const newUser = await User.findById(NEW_USER_ID);
    if (!newUser) {
      console.log('❌ New user not found\n');
      process.exit(1);
    }

    console.log('📋 Current State:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Old User (${OLD_USER_ID}):`);
    console.log(`  Wallet: ${oldUser.walletAddress}`);
    console.log(`  Telegram: ${oldUser.telegramChatId || 'Not connected'}\n`);
    console.log(`New User (${NEW_USER_ID}):`);
    console.log(`  Wallet: ${newUser.walletAddressOriginal || newUser.walletAddress}`);
    console.log(`  Telegram: ${newUser.telegramChatId || 'Not connected'}\n`);

    // Move Telegram connection
    console.log('🔧 Moving Telegram connection...\n');
    
    const telegramChatId = oldUser.telegramChatId;
    
    if (!telegramChatId) {
      console.log('❌ No Telegram connection to move\n');
      process.exit(1);
    }

    // Update new user with Telegram
    newUser.telegramChatId = telegramChatId;
    await newUser.save();

    // Remove Telegram from old user
    oldUser.telegramChatId = undefined;
    await oldUser.save();

    console.log('✅ Telegram connection moved successfully!\n');
    console.log('📋 New State:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Old User (${OLD_USER_ID}):`);
    console.log(`  Wallet: ${oldUser.walletAddress}`);
    console.log(`  Telegram: Not connected\n`);
    console.log(`New User (${NEW_USER_ID}):`);
    console.log(`  Wallet: ${newUser.walletAddressOriginal || newUser.walletAddress}`);
    console.log(`  Telegram: ${newUser.telegramChatId} ✅\n`);

    console.log('✅ Done! Your alerts will now be sent to Telegram.\n');

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

console.log('\n╔════════════════════════════════════════╗');
console.log('║  Move Telegram Connection             ║');
console.log('╚════════════════════════════════════════╝');

moveTelegramConnection();
