/**
 * Fix wallet address case in database
 * Run: node fix-wallet-case.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const CORRECT_WALLET = '4BBLd5aEoV9qbpKBzeTMFyfLpycmKRbSKQWAe4ZpPBUs';
const LOWERCASE_WALLET = '4bbld5aeov9qbpkbzetmfyflpycmkrbskqwae4zppbus';

// User schema (simplified)
const userSchema = new mongoose.Schema({
  walletAddress: String,
  email: String,
  telegramChatId: String,
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);

async function fixWalletCase() {
  try {
    console.log('\n🔍 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find user with lowercase wallet
    console.log(`🔍 Searching for user with lowercase wallet: ${LOWERCASE_WALLET}`);
    const user = await User.findOne({
      walletAddress: LOWERCASE_WALLET
    });

    if (!user) {
      console.log('❌ User not found with lowercase wallet\n');
      console.log('Checking if user already has correct case...');
      
      const correctUser = await User.findOne({
        walletAddress: CORRECT_WALLET
      });
      
      if (correctUser) {
        console.log('✅ User already has correct wallet address case!');
        console.log(`   Wallet: ${correctUser.walletAddress}\n`);
      } else {
        console.log('❌ User not found with either case\n');
      }
      
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log(`✅ Found user: ${user._id}\n`);
    console.log('📋 Current Details:');
    console.log(`   Wallet: ${user.walletAddress}`);
    console.log(`   Email: ${user.email || 'Not set'}`);
    console.log(`   Telegram: ${user.telegramChatId || 'Not connected'}\n`);

    // Update wallet address to correct case
    console.log('🔧 Updating wallet address to correct case...\n');
    
    user.walletAddress = CORRECT_WALLET;
    await user.save();

    console.log('✅ Wallet address updated successfully!\n');
    console.log('📋 New Details:');
    console.log(`   Wallet: ${user.walletAddress}`);
    console.log(`   Email: ${user.email || 'Not set'}`);
    console.log(`   Telegram: ${user.telegramChatId || 'Not connected'}\n`);

    console.log('✅ Fix complete! You can now use premium features.\n');

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
console.log('║  Fix Wallet Address Case              ║');
console.log('╚════════════════════════════════════════╝');

fixWalletCase();
