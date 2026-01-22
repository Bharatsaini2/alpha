const mongoose = require('mongoose');

const MONGODB_URI = "mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker";
const signature = '3cpuauNRc9Ry5mgSc6zqY7VWKHtXCBtT4XwSRwLp6zRuNAhD9nmGxqtHHJKJdRvEY5t4hQ5J3TzR341pVEnhkzib';

async function checkTransaction() {
  try {
    console.log('🔍 Connecting to MongoDB...\n');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');
    
    const KOLTransactions = mongoose.model('InfluencerWhaleTransactionsV2', 
      new mongoose.Schema({}, { strict: false, collection: 'influencerwhaletransactionsv2' })
    );

    const WhaleTransactions = mongoose.model('WhaleAllTransactionsV2', 
      new mongoose.Schema({}, { strict: false, collection: 'whalealltransactionsv2' })
    );

    console.log(`🔍 Checking transaction: ${signature.substring(0, 20)}...\n`);
    
    // Check KOL collection
    let tx = await KOLTransactions.findOne({ signature }).lean();
    let collection = 'KOL';
    
    if (!tx) {
      // Check Whale collection
      tx = await WhaleTransactions.findOne({ signature }).lean();
      collection = 'WHALE';
    }
    
    if (!tx) {
      console.log('❌ Transaction not found in database\n');
      console.log('This could mean:');
      console.log('1. Transaction is too new and not yet processed');
      console.log('2. Transaction type is not supported (INITIATEFLASHFILL)');
      console.log('3. Transaction was filtered out during processing\n');
    } else {
      console.log(`✅ Found in ${collection} collection\n`);
      console.log('📊 Transaction Data:');
      console.log(`   Type: ${tx.type}`);
      console.log(`   Timestamp: ${new Date(tx.timestamp).toLocaleString()}`);
      console.log(`   tokenInSymbol: ${tx.tokenInSymbol || 'N/A'}`);
      console.log(`   tokenInAddress: ${tx.tokenInAddress || 'N/A'}`);
      console.log(`   tokenOutSymbol: ${tx.tokenOutSymbol || 'N/A'}`);
      console.log(`   tokenOutAddress: ${tx.tokenOutAddress || 'N/A'}`);
      
      if (tx.transaction) {
        console.log(`\n   transaction.tokenIn.symbol: ${tx.transaction.tokenIn?.symbol || 'N/A'}`);
        console.log(`   transaction.tokenIn.name: ${tx.transaction.tokenIn?.name || 'N/A'}`);
        console.log(`   transaction.tokenOut.symbol: ${tx.transaction.tokenOut?.symbol || 'N/A'}`);
        console.log(`   transaction.tokenOut.name: ${tx.transaction.tokenOut?.name || 'N/A'}`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Check complete\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkTransaction();
