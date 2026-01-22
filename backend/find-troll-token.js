const mongoose = require('mongoose');

const MONGODB_URI = "mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker";

async function findTrollToken() {
  try {
    console.log('🔍 Connecting to MongoDB...\n');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');
    
    const KOLTransactions = mongoose.model('InfluencerWhaleTransactionsV2', 
      new mongoose.Schema({}, { strict: false, collection: 'influencerwhaletransactionsv2' })
    );

    console.log('🔍 Searching for "troll" token in recent transactions...\n');
    
    const transactions = await KOLTransactions.find({
      $or: [
        { tokenInSymbol: /troll/i },
        { tokenOutSymbol: /troll/i },
        { 'transaction.tokenIn.symbol': /troll/i },
        { 'transaction.tokenOut.symbol': /troll/i },
        { 'transaction.tokenIn.name': /troll/i },
        { 'transaction.tokenOut.name': /troll/i }
      ]
    }).sort({ timestamp: -1 }).limit(5).lean();

    if (transactions.length === 0) {
      console.log('❌ No transactions found with "troll" token\n');
    } else {
      console.log(`✅ Found ${transactions.length} transactions with "troll" token\n`);
      console.log('='.repeat(80));
      
      transactions.forEach((tx, i) => {
        console.log(`\n${i + 1}. Transaction:`);
        console.log(`   Signature: ${tx.signature}`);
        console.log(`   Type: ${tx.type}`);
        console.log(`   Timestamp: ${new Date(tx.timestamp).toLocaleString()}`);
        console.log(`   tokenInSymbol: ${tx.tokenInSymbol || 'N/A'}`);
        console.log(`   tokenOutSymbol: ${tx.tokenOutSymbol || 'N/A'}`);
        
        if (tx.transaction) {
          console.log(`   transaction.tokenIn.symbol: ${tx.transaction.tokenIn?.symbol || 'N/A'}`);
          console.log(`   transaction.tokenIn.name: ${tx.transaction.tokenIn?.name || 'N/A'}`);
          console.log(`   transaction.tokenOut.symbol: ${tx.transaction.tokenOut?.symbol || 'N/A'}`);
          console.log(`   transaction.tokenOut.name: ${tx.transaction.tokenOut?.name || 'N/A'}`);
        }
      });
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Search complete\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

findTrollToken();
