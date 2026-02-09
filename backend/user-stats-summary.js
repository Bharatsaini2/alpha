const mongoose = require('mongoose');
require('dotenv').config();

const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));

async function generateUserStats() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const allUsers = await User.find({}).lean();
    const totalUsers = allUsers.length;

    // Count users with wallet addresses (current method)
    const usersWithWallet = allUsers.filter(u => u.walletAddress && u.walletAddress.trim() !== '').length;

    // Count users with legacy login methods (email, Google, Twitter)
    const usersWithEmail = allUsers.filter(u => u.email && u.email.trim() !== '').length;
    const usersWithGoogle = allUsers.filter(u => u.googleId && u.googleId.trim() !== '').length;
    const usersWithTwitter = allUsers.filter(u => u.twitterId && u.twitterId.trim() !== '').length;
    const usersWithLegacyAuth = allUsers.filter(u => 
      (u.email && u.email.trim() !== '') || 
      (u.googleId && u.googleId.trim() !== '') || 
      (u.twitterId && u.twitterId.trim() !== '')
    ).length;

    // Count users with Telegram connected
    const usersWithTelegram = allUsers.filter(u => u.telegramChatId && u.telegramChatId.trim() !== '').length;

    // Count users with alerts
    const usersWithAlerts = allUsers.filter(u => 
      u.alertSubscriptions && 
      Array.isArray(u.alertSubscriptions) && 
      u.alertSubscriptions.length > 0
    ).length;

    // Create CSV content
    const csvContent = [
      'Metric,Count',
      `Total Users,${totalUsers}`,
      `Users with Wallet (Current Method),${usersWithWallet}`,
      `Users with Email,${usersWithEmail}`,
      `Users with Google Login,${usersWithGoogle}`,
      `Users with Twitter Login,${usersWithTwitter}`,
      `Users with Legacy Auth (Email/Google/Twitter),${usersWithLegacyAuth}`,
      `Users with Telegram Connected,${usersWithTelegram}`,
      `Users with Alert Subscriptions,${usersWithAlerts}`,
    ].join('\n');

    // Write to file
    const fs = require('fs');
    const filename = `user-stats-summary-${Date.now()}.csv`;
    fs.writeFileSync(filename, csvContent);

    console.log('\n✅ Stats Summary Generated!');
    console.log(`📄 File: ${filename}`);
    console.log('\n📊 User Statistics:');
    console.log(`Total Users: ${totalUsers}`);
    console.log(`Users with Wallet (Current): ${usersWithWallet}`);
    console.log(`Users with Email: ${usersWithEmail}`);
    console.log(`Users with Google: ${usersWithGoogle}`);
    console.log(`Users with Twitter: ${usersWithTwitter}`);
    console.log(`Users with Legacy Auth: ${usersWithLegacyAuth}`);
    console.log(`Users with Telegram: ${usersWithTelegram}`);
    console.log(`Users with Alerts: ${usersWithAlerts}`);

    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

generateUserStats();
