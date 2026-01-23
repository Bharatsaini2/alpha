const mongoose = require('mongoose');

const MONGODB_URI = "mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker";

async function findUnknownTokens() {
  try {
    console.log('🔍 Finding transactions with Unknown tokens\n');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const KOLTransactions = mongoose.model('InfluencerWhaleTransactionsV2', 
      new mongoose.Schema({}, { strict: false, collection: 'influencerwhaletransactionsv2' })
    );

    const WhaleTransactions = mongoose.model('WhaleAllTransactionsV2', 
      new mongoose.Schema({}, { strict: false, collection: 'whalealltransactionsv2' })
    );

    console.log('📊 Searching KOL transactions...');
    const kolUnknown = await KOLTransactions.find({
      $or: [
        { 'transaction.tokenIn.symbol': 'Unknown' },
        { 'transaction.tokenOut.symbol': 'Unknown' },
        { tokenInSymbol: 'Unknown' },
        { tokenOutSymbol: 'Unknown' }
      ]
    }).limit(5).lean();
    
    console.log(`   Found ${kolUnknown.length} KOL transactions with Unknown tokens\n`);
    
    console.log('📊 Searching Whale transactions...');
    const whaleUnknown = await WhaleTransactions.find({
      $or: [
        { 'transaction.tokenIn.symbol': 'Unknown' },
        { 'transaction.tokenOut.symbol': 'Unknown' },
        { tokenInSymbol: 'Unknown' },
        { tokenOutSymbol: 'Unknown' }
      ]
    }).limit(5).lean();
    
    console.log(`   Found ${whaleUnknown.length} Whale transactions with Unknown tokens\n`);
    
    console.log('='.repeat(80));
    console.log('\n📋 Sample KOL Transactions:\n');
    
    kolUnknown.forEach((tx, i) => {
      console.log(`${i + 1}. Signature: ${tx.signature}`);
      console.log(`   Type: ${tx.type}`);
      console.log(`   TokenIn: ${tx.transaction?.tokenIn?.symbol || tx.tokenInSymbol} (${tx.transaction?.tokenIn?.address || tx.tokenInAddress})`);
      console.log(`   TokenOut: ${tx.transaction?.tokenOut?.symbol || tx.tokenOutSymbol} (${tx.transaction?.tokenOut?.address || tx.tokenOutAddress})`);
      console.log(`   Timestamp: ${new Date(tx.timestamp).toLocaleString()}`);
      console.log('');
    });
    
    console.log('='.repeat(80));
    console.log('\n📋 Sample Whale Transactions:\n');
    
    whaleUnknown.forEach((tx, i) => {
      console.log(`${i + 1}. Signature: ${tx.signature}`);
      console.log(`   Type: ${tx.type}`);
      console.log(`   TokenIn: ${tx.transaction?.tokenIn?.symbol || tx.tokenInSymbol} (${tx.transaction?.tokenIn?.address || tx.tokenInAddress})`);
      console.log(`   TokenOut: ${tx.transaction?.tokenOut?.symbol || tx.tokenOutSymbol} (${tx.transaction?.tokenOut?.address || tx.tokenOutAddress})`);
      console.log(`   Timestamp: ${new Date(tx.timestamp).toLocaleString()}`);
      console.log('');
    });
    
    console.log('='.repeat(80));
    console.log('\n✅ Search complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

findUnknownTokens();
