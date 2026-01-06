/**
 * List all alert subscriptions for a user
 * Run: node list-alerts.js <wallet-address>
 * Example: node list-alerts.js 4BBLd5aEoV9qbpKBzeTMFyfLpycmKRbSKQWAe4ZpPBUs
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

// User schema (simplified)
const userSchema = new mongoose.Schema({
  walletAddress: String,
  email: String,
  telegramChatId: String,
}, { collection: 'users' });

// UserAlert schema (simplified)
const userAlertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  alertType: String,
  isActive: Boolean,
  minAmountUSD: Number,
  createdAt: Date,
  updatedAt: Date,
}, { collection: 'useralerts' });

const User = mongoose.model('User', userSchema);
const UserAlert = mongoose.model('UserAlert', userAlertSchema);

async function listAlerts(walletAddress) {
  try {
    console.log('\n🔍 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find user
    console.log(`🔍 Searching for user: ${walletAddress}`);
    const user = await User.findOne({
      walletAddress: { $regex: new RegExp(`^${walletAddress}$`, 'i') }
    });

    if (!user) {
      console.log('❌ User not found\n');
      process.exit(1);
    }

    console.log(`✅ Found user: ${user._id}\n`);

    // User details
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👤 User Details:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`User ID: ${user._id}`);
    console.log(`Wallet: ${user.walletAddress || 'Not set'}`);
    console.log(`Email: ${user.email || 'Not set'}`);
    console.log(`Telegram: ${user.telegramChatId ? `✅ Connected (${user.telegramChatId})` : '❌ Not connected'}\n`);

    // Get all alerts
    const alerts = await UserAlert.find({ userId: user._id }).sort({ createdAt: -1 });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📢 Alert Subscriptions:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (alerts.length === 0) {
      console.log('❌ No alert subscriptions found');
      console.log('\n💡 To create a test alert, run:');
      console.log(`   node create-test-alert.js ${walletAddress}\n`);
    } else {
      console.log(`Total Alerts: ${alerts.length}\n`);
      
      alerts.forEach((alert, index) => {
        const status = alert.isActive ? '✅ ACTIVE' : '❌ INACTIVE';
        console.log(`${index + 1}. ${alert.alertType} - ${status}`);
        console.log(`   Alert ID: ${alert._id}`);
        console.log(`   Min Amount: $${alert.minAmountUSD || 0}`);
        console.log(`   Created: ${alert.createdAt.toLocaleString()}`);
        console.log(`   Updated: ${alert.updatedAt.toLocaleString()}\n`);
      });

      // Summary
      const activeCount = alerts.filter(a => a.isActive).length;
      const inactiveCount = alerts.length - activeCount;
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📊 Summary:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log(`Total: ${alerts.length}`);
      console.log(`Active: ${activeCount}`);
      console.log(`Inactive: ${inactiveCount}\n`);

      if (activeCount > 0 && user.telegramChatId) {
        console.log('✅ You should receive alerts on Telegram!\n');
      } else if (activeCount > 0 && !user.telegramChatId) {
        console.log('⚠️  You have active alerts but Telegram is not connected!');
        console.log('   Connect Telegram to receive alerts.\n');
      } else {
        console.log('⚠️  All alerts are inactive. Activate them to receive notifications.\n');
      }
    }

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Get wallet address from command line
const walletAddress = process.argv[2];

if (!walletAddress) {
  console.log('\n❌ Usage: node list-alerts.js <wallet-address>');
  console.log('   Example: node list-alerts.js 4BBLd5aEoV9qbpKBzeTMFyfLpycmKRbSKQWAe4ZpPBUs\n');
  process.exit(1);
}

console.log('\n╔════════════════════════════════════════╗');
console.log('║  List Alert Subscriptions             ║');
console.log('╚════════════════════════════════════════╝');

listAlerts(walletAddress);
