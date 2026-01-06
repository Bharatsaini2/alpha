/**
 * Check alerts by user ID
 * Run: node check-alerts-by-userid.js <user-id>
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

async function checkAlertsByUserId(userId) {
  try {
    console.log('\n🔍 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find user by ID
    console.log(`🔍 Searching for user ID: ${userId}`);
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));
    const user = await User.findById(userId);

    if (!user) {
      console.log('❌ User not found\n');
      process.exit(1);
    }

    console.log(`✅ Found user: ${user._id}`);
    console.log(`   Wallet: ${user.walletAddressOriginal || user.walletAddress || 'Not set'}`);
    console.log(`   Telegram: ${user.telegramChatId || 'Not connected'}\n`);

    // Find all alerts for this user
    const AlertModel = mongoose.model('useralerts', new mongoose.Schema({}, { strict: false, collection: 'useralerts' }));
    const alerts = await AlertModel.find({ userId: new mongoose.Types.ObjectId(userId) });
    
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📢 Alert Subscriptions:`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    if (alerts.length === 0) {
      console.log('❌ No alerts found\n');
    } else {
      console.log(`Total: ${alerts.length}\n`);
      
      alerts.forEach((alert, index) => {
        console.log(`${index + 1}. Alert ID: ${alert._id}`);
        console.log(`   Type: ${alert.type || alert.alertType || 'Unknown'}`);
        console.log(`   Active: ${alert.enabled || alert.isActive ? '✅ Yes' : '❌ No'}`);
        console.log(`   Priority: ${alert.priority || 'Not set'}`);
        console.log(`   Config:`);
        console.log(`   ${JSON.stringify(alert.config || {}, null, 6)}`);
        console.log(`   Created: ${alert.createdAt}`);
        console.log(`   Updated: ${alert.updatedAt}\n`);
      });
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

const userId = process.argv[2];

if (!userId) {
  console.log('\n❌ Usage: node check-alerts-by-userid.js <user-id>');
  console.log('   Example: node check-alerts-by-userid.js 695caab996612f706c3ad96b\n');
  process.exit(1);
}

console.log('\n╔════════════════════════════════════════╗');
console.log('║  Check Alerts by User ID              ║');
console.log('╚════════════════════════════════════════╝');

checkAlertsByUserId(userId);
