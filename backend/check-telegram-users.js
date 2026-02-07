/**
 * Check Telegram users in database
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI not found in .env file');
  process.exit(1);
}

async function checkTelegramUsers() {
  try {
    console.log('🔌 Connecting to MongoDB...\n');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');

    // Find all users with Telegram connected
    const telegramUsers = await User.find({ 
      telegramChatId: { $exists: true, $ne: null } 
    }).select('walletAddress telegramChatId telegramUsername telegramFirstName email displayName').lean();

    console.log(`📊 Found ${telegramUsers.length} users with Telegram connected\n`);
    console.log('═'.repeat(80));

    telegramUsers.forEach((user, index) => {
      console.log(`\n${index + 1}. User:`);
      console.log(`   Wallet: ${user.walletAddress || 'N/A'}`);
      console.log(`   Email: ${user.email || 'N/A'}`);
      console.log(`   Display Name: ${user.displayName || 'N/A'}`);
      console.log(`   Telegram Chat ID: ${user.telegramChatId}`);
      console.log(`   Telegram Username: ${user.telegramUsername ? '@' + user.telegramUsername : '❌ NOT SET'}`);
      console.log(`   Telegram First Name: ${user.telegramFirstName || '❌ NOT SET'}`);
    });

    console.log('\n' + '═'.repeat(80));
    console.log(`\n📈 Summary:`);
    console.log(`   Total Telegram users: ${telegramUsers.length}`);
    console.log(`   With username: ${telegramUsers.filter(u => u.telegramUsername).length}`);
    console.log(`   Without username: ${telegramUsers.filter(u => !u.telegramUsername).length}`);
    console.log(`   With first name: ${telegramUsers.filter(u => u.telegramFirstName).length}`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkTelegramUsers();
