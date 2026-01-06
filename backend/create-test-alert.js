/**
 * Create a test whale alert subscription
 * Run: node create-test-alert.js <wallet-address>
 * Example: node create-test-alert.js 4BBLd5aEoV9qbpKBzeTMFyfLpycmKRbSKQWAe4ZpPBUs
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

async function createTestAlert(walletAddress) {
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

    // Check if user has Telegram connected
    if (!user.telegramChatId) {
      console.log('❌ User does not have Telegram connected');
      console.log('   Please connect Telegram first\n');
      process.exit(1);
    }

    console.log(`✅ Telegram connected: ${user.telegramChatId}\n`);

    // Check existing alerts
    const existingAlerts = await UserAlert.find({ userId: user._id });
    console.log(`📊 Existing alerts: ${existingAlerts.length}`);
    
    if (existingAlerts.length > 0) {
      console.log('\n📋 Current Alert Subscriptions:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      existingAlerts.forEach((alert, index) => {
        console.log(`${index + 1}. Type: ${alert.alertType}`);
        console.log(`   Active: ${alert.isActive ? '✅ Yes' : '❌ No'}`);
        console.log(`   Min Amount: $${alert.minAmountUSD || 0}`);
        console.log(`   Created: ${alert.createdAt}\n`);
      });
    }

    // Create test alert
    console.log('🔧 Creating test WHALE_ALERT subscription...\n');
    
    const testAlert = new UserAlert({
      userId: user._id,
      alertType: 'WHALE_ALERT',
      isActive: true,
      minAmountUSD: 10000, // $10k minimum
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await testAlert.save();

    console.log('✅ Test alert created successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Alert Details:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Alert ID: ${testAlert._id}`);
    console.log(`Type: ${testAlert.alertType}`);
    console.log(`Active: ${testAlert.isActive ? '✅ Yes' : '❌ No'}`);
    console.log(`Min Amount: $${testAlert.minAmountUSD}`);
    console.log(`User ID: ${testAlert.userId}`);
    console.log(`Telegram Chat ID: ${user.telegramChatId}\n`);

    console.log('✅ You should now receive whale alerts on Telegram!');
    console.log('   Alerts will be sent for transactions >= $10,000\n');

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
  console.log('\n❌ Usage: node create-test-alert.js <wallet-address>');
  console.log('   Example: node create-test-alert.js 4BBLd5aEoV9qbpKBzeTMFyfLpycmKRbSKQWAe4ZpPBUs\n');
  process.exit(1);
}

console.log('\n╔════════════════════════════════════════╗');
console.log('║  Create Test Alert Subscription       ║');
console.log('╚════════════════════════════════════════╝');

createTestAlert(walletAddress);
