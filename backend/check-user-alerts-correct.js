/**
 * Check alerts in the CORRECT collection: user_alerts
 * Run: node check-user-alerts-correct.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

async function checkUserAlerts() {
  try {
    console.log('\n🔍 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 ALERTS IN user_alerts COLLECTION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const alerts = await db.collection('user_alerts').find({}).toArray();
    
    console.log(`Total alerts: ${alerts.length}\n`);
    
    if (alerts.length > 0) {
      alerts.forEach((alert, index) => {
        console.log(`${index + 1}. Alert ID: ${alert._id}`);
        console.log(`   User ID: ${alert.userId}`);
        console.log(`   Telegram Chat ID: ${alert.telegramChatId || 'N/A'}`);
        console.log(`   Type: ${alert.type}`);
        console.log(`   Enabled: ${alert.enabled ? '✅ Yes' : '❌ No'}`);
        console.log(`   Config: ${JSON.stringify(alert.config, null, 2)}`);
        console.log(`   Created: ${alert.createdAt}`);
        console.log('');
      });
      
      console.log('✅ YOUR ALERTS ARE SAFE! They are in the user_alerts collection.\n');
    } else {
      console.log('⚠️  No alerts found in user_alerts collection.\n');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

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
console.log('║   Check user_alerts Collection         ║');
console.log('╚════════════════════════════════════════╝');

checkUserAlerts();
