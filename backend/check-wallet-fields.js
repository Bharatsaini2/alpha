const mongoose = require('mongoose');
require('dotenv').config();

const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));

async function checkWalletFields() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Get sample users to see field structure
    const sampleUsers = await User.find({}).limit(10).lean();
    
    console.log('\n📋 Sample User Fields:');
    console.log('═══════════════════════════════════════');
    
    sampleUsers.forEach((user, idx) => {
      console.log(`\nUser ${idx + 1}:`);
      console.log(`  _id: ${user._id}`);
      console.log(`  walletAddress: ${user.walletAddress || 'N/A'}`);
      console.log(`  walletOriginal: ${user.walletOriginal || 'N/A'}`);
      console.log(`  email: ${user.email || 'N/A'}`);
      console.log(`  telegramChatId: ${user.telegramChatId || 'N/A'}`);
    });

    // Count all variations
    const allUsers = await User.find({}).lean();
    
    const withWalletAddress = allUsers.filter(u => u.walletAddress && u.walletAddress.trim() !== '').length;
    const withWalletOriginal = allUsers.filter(u => u.walletOriginal && u.walletOriginal.trim() !== '').length;
    const withBothWalletFields = allUsers.filter(u => 
      (u.walletAddress && u.walletAddress.trim() !== '') && 
      (u.walletOriginal && u.walletOriginal.trim() !== '')
    ).length;
    const withOnlyWalletAddress = allUsers.filter(u => 
      (u.walletAddress && u.walletAddress.trim() !== '') && 
      (!u.walletOriginal || u.walletOriginal.trim() === '')
    ).length;
    const withOnlyWalletOriginal = allUsers.filter(u => 
      (!u.walletAddress || u.walletAddress.trim() === '') && 
      (u.walletOriginal && u.walletOriginal.trim() !== '')
    ).length;

    console.log('\n\n📊 Wallet Field Statistics:');
    console.log('═══════════════════════════════════════');
    console.log(`Total Users: ${allUsers.length}`);
    console.log(`Users with walletAddress: ${withWalletAddress}`);
    console.log(`Users with walletOriginal: ${withWalletOriginal}`);
    console.log(`Users with BOTH fields: ${withBothWalletFields}`);
    console.log(`Users with ONLY walletAddress: ${withOnlyWalletAddress}`);
    console.log(`Users with ONLY walletOriginal: ${withOnlyWalletOriginal}`);

    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkWalletFields();
