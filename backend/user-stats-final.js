const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();

const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));

async function generateFinalStats() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const allUsers = await User.find({}).lean();
    const totalUsers = allUsers.length;

    // Count users with walletAddress (legacy, lowercase)
    const withWalletAddress = allUsers.filter(u => u.walletAddress && u.walletAddress.trim() !== '').length;

    // Count users with walletAddressOriginal (new, proper case)
    const withWalletAddressOriginal = allUsers.filter(u => u.walletAddressOriginal && u.walletAddressOriginal.trim() !== '').length;

    // Count users with legacy auth (email)
    const withEmail = allUsers.filter(u => u.email && u.email.trim() !== '').length;

    // Count users with Telegram
    const withTelegram = allUsers.filter(u => u.telegramChatId && u.telegramChatId.trim() !== '').length;

    // Count users with alerts (check alertSubscriptions field)
    const withAlerts = allUsers.filter(u => 
      u.alertSubscriptions && 
      Array.isArray(u.alertSubscriptions) && 
      u.alertSubscriptions.length > 0
    ).length;

    // Sample users with walletAddressOriginal
    const sampleWithOriginal = allUsers
      .filter(u => u.walletAddressOriginal && u.walletAddressOriginal.trim() !== '')
      .slice(0, 5);

    console.log('\n📋 Sample Users with walletAddressOriginal:');
    console.log('═══════════════════════════════════════');
    sampleWithOriginal.forEach((user, idx) => {
      console.log(`\nUser ${idx + 1}:`);
      console.log(`  walletAddress: ${user.walletAddress || 'N/A'}`);
      console.log(`  walletAddressOriginal: ${user.walletAddressOriginal || 'N/A'}`);
    });

    // Create CSV
    const csvContent = [
      'Metric,Count',
      `Total Users,${totalUsers}`,
      `Users with walletAddress (Legacy Lowercase),${withWalletAddress}`,
      `Users with walletAddressOriginal (Proper Case),${withWalletAddressOriginal}`,
      `Users with Email (Legacy Auth),${withEmail}`,
      `Users with Telegram Connected,${withTelegram}`,
      `Users with Alert Subscriptions,${withAlerts}`,
    ].join('\n');

    const filename = `user-stats-final-${Date.now()}.csv`;
    fs.writeFileSync(filename, csvContent);

    console.log('\n\n📊 Final User Statistics:');
    console.log('═══════════════════════════════════════');
    console.log(`Total Users: ${totalUsers}`);
    console.log(`Users with walletAddress (Legacy): ${withWalletAddress}`);
    console.log(`Users with walletAddressOriginal (Proper): ${withWalletAddressOriginal}`);
    console.log(`Users with Email (Legacy Auth): ${withEmail}`);
    console.log(`Users with Telegram: ${withTelegram}`);
    console.log(`Users with Alerts: ${withAlerts}`);
    console.log('═══════════════════════════════════════');
    console.log(`\n✅ CSV saved: ${filename}`);

    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

generateFinalStats();
