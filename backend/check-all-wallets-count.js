// Quick check of how many users have wallets
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function checkCounts() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));

    const totalUsers = await User.countDocuments();
    const withWalletAddress = await User.countDocuments({ walletAddress: { $exists: true, $ne: null } });
    const withWalletAddressOriginal = await User.countDocuments({ walletAddressOriginal: { $exists: true, $ne: null } });
    const withTelegram = await User.countDocuments({ telegramChatId: { $exists: true, $ne: null } });
    
    // Users with walletAddress but NOT walletAddressOriginal
    const onlyLowercase = await User.countDocuments({
      walletAddress: { $exists: true, $ne: null },
      $or: [
        { walletAddressOriginal: { $exists: false } },
        { walletAddressOriginal: null }
      ]
    });

    console.log('📊 USER WALLET STATISTICS:\n');
    console.log(`Total users: ${totalUsers}`);
    console.log(`Users with walletAddress: ${withWalletAddress}`);
    console.log(`Users with walletAddressOriginal: ${withWalletAddressOriginal}`);
    console.log(`Users with ONLY lowercase wallet: ${onlyLowercase}`);
    console.log(`Users with Telegram: ${withTelegram}`);
    
    console.log('\n📋 BREAKDOWN:');
    console.log(`✅ Can check balance (have walletAddressOriginal): ${withWalletAddressOriginal}`);
    console.log(`❌ Cannot check (only lowercase): ${onlyLowercase}`);
    console.log(`⚠️  Need to check: ${onlyLowercase} additional users`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkCounts();
