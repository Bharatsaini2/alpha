/**
 * Quick check: Count all alerts in database
 * Run: node check-alerts-count.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

async function checkAlertsCount() {
  try {
    console.log('\n🔍 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check all possible alert collections
    const collections = ['useralerts', 'UserAlerts', 'alerts', 'userAlerts'];
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 ALERT COUNTS BY COLLECTION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    let totalAlerts = 0;
    
    for (const collectionName of collections) {
      try {
        const AlertModel = mongoose.model(
          `Alert_${collectionName}`, 
          new mongoose.Schema({}, { strict: false, collection: collectionName })
        );
        
        const count = await AlertModel.countDocuments();
        
        if (count > 0) {
          console.log(`✅ Collection '${collectionName}': ${count} alerts`);
          totalAlerts += count;
          
          // Show sample alert
          const sample = await AlertModel.findOne();
          console.log(`   Sample alert ID: ${sample._id}`);
          console.log(`   User ID: ${sample.userId}`);
          console.log(`   Type: ${sample.type || sample.alertType || 'Unknown'}`);
          console.log(`   Active: ${sample.enabled || sample.isActive ? 'Yes' : 'No'}\n`);
        } else {
          console.log(`⚠️  Collection '${collectionName}': 0 alerts (empty or doesn't exist)\n`);
        }
      } catch (err) {
        console.log(`❌ Collection '${collectionName}': Error - ${err.message}\n`);
      }
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 TOTAL ALERTS ACROSS ALL COLLECTIONS: ${totalAlerts}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Also check users count
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));
    const userCount = await User.countDocuments();
    console.log(`👥 Total users in database: ${userCount}\n`);

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

console.log('\n╔════════════════════════════════════════╗');
console.log('║     Quick Alert Count Check            ║');
console.log('╚════════════════════════════════════════╝');

checkAlertsCount();
