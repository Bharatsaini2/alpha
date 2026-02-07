// Check if there are ANY KOL transactions in the database
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function checkKolTransactions() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const Transaction = mongoose.model('Transaction', new mongoose.Schema({}, { strict: false, collection: 'transactions' }));
    const TransactionV2 = mongoose.model('TransactionV2', new mongoose.Schema({}, { strict: false, collection: 'transactionsv2' }));

    console.log('🔍 Checking KOL transaction collections...\n');

    const countV1 = await Transaction.countDocuments();
    const countV2 = await TransactionV2.countDocuments();

    console.log(`📊 transactions collection: ${countV1} documents`);
    console.log(`📊 transactionsv2 collection: ${countV2} documents\n`);

    if (countV1 === 0 && countV2 === 0) {
      console.log('❌ No KOL transactions found in either collection');
      console.log('   KOL tracking might not be active or uses different collection names\n');
    } else {
      // Get a sample transaction
      const sampleV1 = await Transaction.findOne().sort({ timestamp: -1 }).lean();
      const sampleV2 = await TransactionV2.findOne().sort({ timestamp: -1 }).lean();

      if (sampleV1) {
        console.log('📄 Sample from transactions collection:');
        console.log(`   Signature: ${sampleV1.signature}`);
        console.log(`   Type: ${sampleV1.type}`);
        console.log(`   Timestamp: ${new Date(sampleV1.timestamp).toISOString()}`);
        console.log(`   Token In: ${sampleV1.tokenInSymbol || 'N/A'}`);
        console.log(`   Token Out: ${sampleV1.tokenOutSymbol || 'N/A'}\n`);
      }

      if (sampleV2) {
        console.log('📄 Sample from transactionsv2 collection:');
        console.log(`   Signature: ${sampleV2.signature}`);
        console.log(`   Type: ${sampleV2.type}`);
        console.log(`   Timestamp: ${new Date(sampleV2.timestamp).toISOString()}`);
        console.log(`   Base: ${sampleV2.baseAsset?.symbol || 'N/A'}`);
        console.log(`   Quote: ${sampleV2.quoteAsset?.symbol || 'N/A'}\n`);
      }
    }

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkKolTransactions();
