// Check if KOL transactions are handling split swaps correctly
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';
const SIGNATURE = '39FVDvhmYftAkuZxxAN6uwNEyAhYmVUevvwfUdcsevKuHaBmPLxHr16vBsk2q4R2DyxoJnNydyquNZBvN8smX4A';

async function checkKolTransactions() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check all KOL transaction collections
    const KolTransaction = mongoose.model('KolTransaction', new mongoose.Schema({}, { strict: false, collection: 'transactions' }));
    const KolTransactionV2 = mongoose.model('KolTransactionV2', new mongoose.Schema({}, { strict: false, collection: 'transactionsv2' }));

    console.log('🔍 Searching for KOL transactions with this signature...\n');
    
    const kolTxns = await KolTransaction.find({ signature: SIGNATURE }).lean();
    const kolTxnsV2 = await KolTransactionV2.find({ signature: SIGNATURE }).lean();

    console.log(`Found ${kolTxns.length} transaction(s) in 'transactions' collection`);
    console.log(`Found ${kolTxnsV2.length} transaction(s) in 'transactionsv2' collection\n`);

    if (kolTxns.length === 0 && kolTxnsV2.length === 0) {
      console.log('❌ No KOL transactions found with this signature');
      console.log('   This might be a whale-only transaction\n');
      
      // Check if it's in whale collections
      const WhaleAllTransactionV2 = mongoose.model('WhaleAllTransactionV2', new mongoose.Schema({}, { strict: false, collection: 'whalealltransactionv2' }));
      const whaleTxn = await WhaleAllTransactionV2.findOne({ signature: SIGNATURE }).lean();
      
      if (whaleTxn) {
        console.log('✅ Found in whale collection (whalealltransactionv2)');
        console.log(`   Type: ${whaleTxn.type}`);
        console.log(`   Whale Address: ${whaleTxn.whaleAddress}`);
      }
    } else {
      console.log('═'.repeat(80));
      
      // Show all KOL transactions with this signature
      const allTxns = [...kolTxns, ...kolTxnsV2];
      
      console.log(`\n📊 Found ${allTxns.length} KOL transaction(s) with this signature:\n`);
      
      allTxns.forEach((txn, index) => {
        console.log(`\nTransaction ${index + 1}:`);
        console.log(`  Type: ${txn.type}`);
        console.log(`  KOL Address: ${txn.walletAddress || txn.kolAddress || 'N/A'}`);
        console.log(`  Token In: ${txn.tokenInSymbol || 'N/A'}`);
        console.log(`  Token Out: ${txn.tokenOutSymbol || 'N/A'}`);
        console.log(`  Parser Version: ${txn.parserVersion || 'v1'}`);
        console.log(`  Created: ${new Date(txn.createdAt).toISOString()}`);
        
        if (txn.baseAsset && txn.quoteAsset) {
          console.log(`\n  V2 Format:`);
          console.log(`    Base: ${txn.baseAsset.symbol} (${txn.baseAsset.mint})`);
          console.log(`    Quote: ${txn.quoteAsset.symbol} (${txn.quoteAsset.mint})`);
          console.log(`    Direction: ${txn.direction || 'N/A'}`);
        }
      });
      
      // Check if this is a split swap (should have 2 transactions)
      if (allTxns.length === 2) {
        console.log('\n✅ SPLIT SWAP DETECTED - 2 transactions found');
        const types = allTxns.map(t => t.type);
        console.log(`   Types: ${types.join(', ')}`);
        
        if (types.includes('buy') && types.includes('sell')) {
          console.log('   ✅ Correct: One BUY and one SELL transaction');
        } else {
          console.log('   ⚠️  Warning: Expected one BUY and one SELL');
        }
      } else if (allTxns.length === 1) {
        console.log('\n⚠️  Only 1 transaction found');
        console.log('   If this is a non-core to non-core swap, it should be split into 2');
      }
      
      console.log('\n═'.repeat(80));
      
      // Show full data for first transaction
      console.log('\n📄 Full data for first transaction:');
      console.log(JSON.stringify(allTxns[0], null, 2));
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkKolTransactions();
