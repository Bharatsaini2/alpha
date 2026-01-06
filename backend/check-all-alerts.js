/**
 * Check ALL alerts in the database for a user
 * Run: node check-all-alerts.js <wallet-address>
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

async function checkAllAlerts(walletAddress) {
  try {
    console.log('\n🔍 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find user
    console.log(`🔍 Searching for user: ${walletAddress}`);
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));
    const user = await User.findOne({
      $or: [
        { walletAddress: { $regex: new RegExp(`^${walletAddress}$`, 'i') } },
        { walletAddressOriginal: walletAddress }
      ]
    });

    if (!user) {
      console.log('❌ User not found\n');
      process.exit(1);
    }

    console.log(`✅ Found user: ${user._id}\n`);

    // Check ALL collections that might have alerts
    const collections = ['useralerts', 'UserAlerts', 'alerts'];
    
    for (const collectionName of collections) {
      try {
        const AlertModel = mongoose.model(collectionName, new mongoose.Schema({}, { strict: false, collection: collectionName }));
        const alerts = await AlertModel.find({ userId: user._id });
        
        if (alerts.length > 0) {
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(`📢 Alerts in '${collectionName}' collection:`);
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
          console.log(`Total: ${alerts.length}\n`);
          
          alerts.forEach((alert, index) => {
            console.log(`${index + 1}. Alert ID: ${alert._id}`);
            console.log(`   Type: ${alert.type || alert.alertType || 'Unknown'}`);
            console.log(`   Active: ${alert.enabled || alert.isActive ? '✅ Yes' : '❌ No'}`);
            console.log(`   Config: ${JSON.stringify(alert.config || {}, null, 2)}`);
            console.log(`   Created: ${alert.createdAt}`);
            console.log(`   Updated: ${alert.updatedAt}\n`);
          });
        }
      } catch (err) {
        // Collection doesn't exist, skip
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

const walletAddress = process.argv[2];

if (!walletAddress) {
  console.log('\n❌ Usage: node check-all-alerts.js <wallet-address>');
  console.log('   Example: node check-all-alerts.js 4BBLd5aEoV9qbpKBzeTMFyfLpycmKRbSKQWAe4ZpPBUs\n');
  process.exit(1);
}

console.log('\n╔════════════════════════════════════════╗');
console.log('║  Check All Alerts (All Collections)   ║');
console.log('╚════════════════════════════════════════╝');

checkAllAlerts(walletAddress);
