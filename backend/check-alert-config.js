// Check alert configuration from database
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/whale_tracker_db';

async function checkAlertConfig() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('\n=== Connected to MongoDB ===\n');

    const UserAlert = mongoose.model('UserAlert', new mongoose.Schema({}, { strict: false }), 'useralerts');
    
    const alerts = await UserAlert.find({ enabled: true }).lean();
    
    console.log(`Found ${alerts.length} enabled alerts:\n`);
    
    alerts.forEach((alert, index) => {
      console.log(`--- Alert ${index + 1} ---`);
      console.log(`Type: ${alert.type}`);
      console.log(`Priority: ${alert.priority}`);
      console.log(`Config:`);
      console.log(`  Hotness Score: ${alert.config?.hotnessScoreThreshold ?? 'Not set'}`);
      console.log(`  Min Buy Amount: $${alert.config?.minBuyAmountUSD ?? 'Not set'}`);
      console.log(`  Wallet Labels: ${alert.config?.walletLabels ? alert.config.walletLabels.join(', ') : 'Not set'}`);
      console.log(`  Tokens: ${alert.config?.tokens ? alert.config.tokens.length + ' tokens' : 'All tokens'}`);
      console.log('');
    });
    
    await mongoose.disconnect();
    console.log('=== Done ===\n');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkAlertConfig();
