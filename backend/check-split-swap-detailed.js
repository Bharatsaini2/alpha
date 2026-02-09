const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI;

// Define schemas for all transaction collections
const whaleTransactionSchema = new mongoose.Schema({}, { strict: false, collection: 'whaletransactions' });
const kolTransactionSchema = new mongoose.Schema({}, { strict: false, collection: 'koltransactions' });
const whaleTransactionV2Schema = new mongoose.Schema({}, { strict: false, collection: 'whaletransactionsv2' });
const influencerWhaleTransactionV2Schema = new mongoose.Schema({}, { strict: false, collection: 'influencerwhaletransactionsv2' });

const WhaleTransaction = mongoose.model('WhaleTransaction', whaleTransactionSchema);
const KolTransaction = mongoose.model('KolTransaction', kolTransactionSchema);
const WhaleTransactionV2 = mongoose.model('WhaleTransactionV2', whaleTransactionV2Schema);
const InfluencerWhaleTransactionV2 = mongoose.model('InfluencerWhaleTransactionV2', influencerWhaleTransactionV2Schema);

async function checkSplitSwapDetailed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check all collections for transaction types
    const collections = [
      { name: 'whaletransactions', model: WhaleTransaction },
      { name: 'koltransactions', model: KolTransaction },
      { name: 'whaletransactionsv2', model: WhaleTransactionV2 },
      { name: 'influencerwhaletransactionsv2', model: InfluencerWhaleTransactionV2 }
    ];

    for (const collection of collections) {
      console.log(`\n=== ${collection.name.toUpperCase()} ===\n`);
      
      // Get distinct types
      const types = await collection.model.distinct('type');
      console.log('Transaction types found:', types);
      
      // Count each type
      for (const type of types) {
        const count = await collection.model.countDocuments({ type });
        console.log(`- ${type}: ${count} transactions`);
      }
      
      // Check for 'both' type specifically
      const bothCount = await collection.model.countDocuments({ type: 'both' });
      console.log(`\nSplit swap (type: 'both'): ${bothCount}`);
      
      if (bothCount > 0) {
        const latest = await collection.model.findOne({ type: 'both' })
          .sort({ timestamp: -1 })
          .lean();
        
        console.log('\n📋 Latest split swap transaction:');
        console.log('- Signature:', latest.signature);
        console.log('- Timestamp:', new Date(latest.timestamp));
        console.log('- Wallet:', latest.walletAddress);
        console.log('- Token In:', latest.transaction?.tokenIn?.symbol || 'N/A');
        console.log('- Token Out:', latest.transaction?.tokenOut?.symbol || 'N/A');
        console.log('- Buy Amount:', latest.amount?.buyAmount || 'N/A');
        console.log('- Sell Amount:', latest.amount?.sellAmount || 'N/A');
        
        // Check if it has both buy and sell amounts
        const hasBothAmounts = latest.amount?.buyAmount && latest.amount?.sellAmount;
        console.log('- Has both amounts:', hasBothAmounts);
        
        console.log('\n📄 Full document:');
        console.log(JSON.stringify(latest, null, 2));
      }
      
      // Also check for transactions with both buyAmount and sellAmount
      const bothAmountsCount = await collection.model.countDocuments({
        'amount.buyAmount': { $exists: true, $ne: null },
        'amount.sellAmount': { $exists: true, $ne: null }
      });
      console.log(`\nTransactions with both buyAmount and sellAmount: ${bothAmountsCount}`);
      
      if (bothAmountsCount > 0) {
        const latestBothAmounts = await collection.model.findOne({
          'amount.buyAmount': { $exists: true, $ne: null },
          'amount.sellAmount': { $exists: true, $ne: null }
        })
          .sort({ timestamp: -1 })
          .lean();
        
        console.log('\n📋 Latest transaction with both amounts:');
        console.log('- Signature:', latestBothAmounts.signature);
        console.log('- Type:', latestBothAmounts.type);
        console.log('- Timestamp:', new Date(latestBothAmounts.timestamp));
        console.log('- Buy Amount:', latestBothAmounts.amount?.buyAmount);
        console.log('- Sell Amount:', latestBothAmounts.amount?.sellAmount);
      }
      
      console.log('\n' + '='.repeat(60));
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkSplitSwapDetailed();
