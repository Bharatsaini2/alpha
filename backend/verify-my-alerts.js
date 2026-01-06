const mongoose = require('mongoose');
require('dotenv').config();

const WALLET_ADDRESS = '4BBLd5aEoV9qbpKBzeTMFyfLpycmKRbSKQWAe4ZpPBUs';

async function verifyAlerts() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find user by wallet address
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
    const user = await User.findOne({ 
      $or: [
        { walletAddress: WALLET_ADDRESS.toLowerCase() },
        { walletAddressOriginal: WALLET_ADDRESS }
      ]
    });

    if (!user) {
      console.log('❌ User not found with wallet:', WALLET_ADDRESS);
      process.exit(1);
    }

    console.log('✅ Found user:', user._id);
    console.log('📧 Email:', user.email || 'N/A');
    console.log('💬 Telegram Chat ID:', user.telegramChatId || 'Not connected');
    console.log('');

    // Find all alerts for this user
    const UserAlert = mongoose.model('UserAlert', new mongoose.Schema({}, { strict: false }), 'useralerts');
    const alerts = await UserAlert.find({ userId: user._id, enabled: true });

    console.log(`📊 Found ${alerts.length} active alert(s)\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    alerts.forEach((alert, index) => {
      console.log(`\n🔔 Alert ${index + 1}:`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Alert ID:', alert._id);
      console.log('Type:', alert.type);
      console.log('Priority:', alert.priority);
      console.log('Enabled:', alert.enabled ? '✅ Yes' : '❌ No');
      console.log('Created:', alert.createdAt);
      console.log('Updated:', alert.updatedAt);
      
      if (alert.config) {
        console.log('\n📋 Configuration:');
        console.log(JSON.stringify(alert.config, null, 2));
      }
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n✅ Verification complete!');
    
    if (alerts.length === 0) {
      console.log('\n⚠️  No alerts found. Create one from the UI.');
    } else if (!user.telegramChatId) {
      console.log('\n⚠️  Telegram not connected. Connect Telegram to receive alerts.');
    } else {
      console.log('\n✅ Everything looks good! You should receive alerts on Telegram.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

verifyAlerts();
