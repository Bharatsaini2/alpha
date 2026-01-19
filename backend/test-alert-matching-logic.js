const mongoose = require('mongoose');
require('dotenv').config();

const whaleSchema = new mongoose.Schema({}, { strict: false, collection: 'whaleAllTransactionsV2' });
const WhaleTransaction = mongoose.model('WhaleTransaction', whaleSchema);

const alertSchema = new mongoose.Schema({}, { strict: false, collection: 'useralerts' });
const UserAlert = mongoose.model('UserAlert', alertSchema);

const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const User = mongoose.model('User', userSchema);

async function testMatching() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('🔗 Connected to MongoDB\n');

    // Get the latest transaction
    const latestTx = await WhaleTransaction.findOne().sort({ timestamp: -1 });
    
    if (!latestTx) {
      console.log('❌ No transactions found');
      process.exit(1);
    }

    console.log('📊 LATEST TRANSACTION:');
    console.log('Signature:', latestTx.signature);
    console.log('Timestamp:', latestTx.timestamp);
    console.log('Hotness Score:', latestTx.hotnessScore);
    console.log('USD Amount:', latestTx.transaction?.tokenOut?.usdAmount || 'N/A');
    console.log('Whale Address:', latestTx.whale?.address || latestTx.whaleAddress);
    console.log('Whale Labels:', latestTx.whaleLabel || []);
    console.log('Type:', latestTx.type);

    // Get all enabled ALPHA_STREAM alerts
    const alerts = await UserAlert.find({ 
      type: 'ALPHA_STREAM',
      enabled: true 
    }).populate('userId', 'telegramChatId walletAddress');

    console.log('\n📋 FOUND', alerts.length, 'ALPHA_STREAM ALERTS\n');

    for (const alert of alerts) {
      const user = alert.userId;
      
      console.log('---');
      console.log('Alert ID:', alert._id.toString());
      console.log('User ID:', user?._id?.toString() || 'N/A');
      console.log('Wallet:', user?.walletAddress || 'N/A');
      console.log('Telegram Chat ID:', user?.telegramChatId || 'NOT SET');
      console.log('Config:', JSON.stringify(alert.config, null, 2));

      // Test matching logic
      let matches = true;
      const reasons = [];

      // Check hotness score
      if (alert.config.hotnessScoreThreshold !== undefined) {
        if (latestTx.hotnessScore < alert.config.hotnessScoreThreshold) {
          matches = false;
          reasons.push(`Hotness ${latestTx.hotnessScore} < ${alert.config.hotnessScoreThreshold}`);
        }
      }

      // Check minimum buy amount
      if (alert.config.minBuyAmountUSD !== undefined && alert.config.minBuyAmountUSD > 0) {
        const usdAmount = parseFloat(latestTx.transaction?.tokenOut?.usdAmount || '0');
        if (usdAmount < alert.config.minBuyAmountUSD) {
          matches = false;
          reasons.push(`USD ${usdAmount} < ${alert.config.minBuyAmountUSD}`);
        }
      }

      // Check wallet labels
      if (alert.config.walletLabels && alert.config.walletLabels.length > 0) {
        const txLabels = latestTx.whaleLabel || [];
        const hasMatchingLabel = txLabels.some(label => 
          alert.config.walletLabels.includes(label)
        );
        if (!hasMatchingLabel) {
          matches = false;
          reasons.push(`No matching labels. TX has: [${txLabels.join(', ')}], Alert wants: [${alert.config.walletLabels.join(', ')}]`);
        }
      }

      if (matches) {
        console.log('✅ MATCHES - Alert should be sent!');
        if (!user?.telegramChatId) {
          console.log('⚠️  BUT: User has no Telegram Chat ID linked!');
        }
      } else {
        console.log('❌ NO MATCH');
        console.log('Reasons:', reasons.join(', '));
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testMatching();
