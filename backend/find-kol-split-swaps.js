// Find KOL transactions that should be split swaps (non-core to non-core)
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

// Core tokens list
const CORE_TOKENS = ['SOL', 'WSOL', 'USDC', 'USDT', 'PYUSD', 'EURC'];

async function findKolSplitSwaps() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const Transaction = mongoose.model('Transaction', new mongoose.Schema({}, { strict: false, collection: 'transactions' }));
    const TransactionV2 = mongoose.model('TransactionV2', new mongoose.Schema({}, { strict: false, collection: 'transactionsv2' }));

    console.log('🔍 Searching for recent KOL transactions...\n');

    // Get recent transactions from last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentTxns = await Transaction.find({
      timestamp: { $gte: oneDayAgo },
      type: { $in: ['buy', 'sell', 'swap'] }
    }).sort({ timestamp: -1 }).limit(100).lean();

    const recentTxnsV2 = await TransactionV2.find({
      timestamp: { $gte: oneDayAgo },
      type: { $in: ['buy', 'sell', 'swap'] }
    }).sort({ timestamp: -1 }).limit(100).lean();

    const allTxns = [...recentTxns, ...recentTxnsV2];

    console.log(`📊 Found ${allTxns.length} recent KOL transactions\n`);

    // Find potential split swaps (non-core to non-core)
    const potentialSplitSwaps = [];
    const actualSplitSwaps = new Map(); // signature -> array of transactions

    for (const txn of allTxns) {
      // Check if both tokens are non-core
      const tokenInSymbol = txn.tokenInSymbol || txn.baseAsset?.symbol;
      const tokenOutSymbol = txn.tokenOutSymbol || txn.quoteAsset?.symbol;

      if (!tokenInSymbol || !tokenOutSymbol) continue;

      const tokenInIsCore = CORE_TOKENS.includes(tokenInSymbol.toUpperCase());
      const tokenOutIsCore = CORE_TOKENS.includes(tokenOutSymbol.toUpperCase());

      // If both are non-core, this should be a split swap
      if (!tokenInIsCore && !tokenOutIsCore) {
        potentialSplitSwaps.push(txn);

        // Group by signature to find pairs
        if (!actualSplitSwaps.has(txn.signature)) {
          actualSplitSwaps.set(txn.signature, []);
        }
        actualSplitSwaps.get(txn.signature).push(txn);
      }
    }

    console.log(`🔍 Found ${potentialSplitSwaps.length} non-core to non-core swaps\n`);

    // Check which ones are properly split (have 2 transactions with same signature)
    let properlySplit = 0;
    let notSplit = 0;

    console.log('═'.repeat(80));
    console.log('\n📋 SPLIT SWAP ANALYSIS:\n');

    for (const [signature, txns] of actualSplitSwaps.entries()) {
      if (txns.length === 2) {
        properlySplit++;
        const types = txns.map(t => t.type);
        
        console.log(`✅ Properly Split (${signature.slice(0, 16)}...)`);
        console.log(`   Transactions: ${txns.length}`);
        console.log(`   Types: ${types.join(', ')}`);
        console.log(`   Tokens: ${txns[0].tokenInSymbol || txns[0].baseAsset?.symbol} ↔ ${txns[0].tokenOutSymbol || txns[0].quoteAsset?.symbol}`);
        console.log(`   KOL: ${txns[0].walletAddress || txns[0].kolAddress || 'N/A'}`);
        console.log(`   Time: ${new Date(txns[0].timestamp).toISOString()}`);
        
        if (types.includes('buy') && types.includes('sell')) {
          console.log(`   ✅ Correct: One BUY and one SELL\n`);
        } else {
          console.log(`   ⚠️  Warning: Expected one BUY and one SELL, got ${types.join(', ')}\n`);
        }
      } else if (txns.length === 1) {
        notSplit++;
        const txn = txns[0];
        
        console.log(`❌ NOT Split (${signature.slice(0, 16)}...)`);
        console.log(`   Transactions: 1 (should be 2)`);
        console.log(`   Type: ${txn.type}`);
        console.log(`   Tokens: ${txn.tokenInSymbol || txn.baseAsset?.symbol} ↔ ${txn.tokenOutSymbol || txn.quoteAsset?.symbol}`);
        console.log(`   KOL: ${txn.walletAddress || txn.kolAddress || 'N/A'}`);
        console.log(`   Parser: ${txn.parserVersion || 'v1'}`);
        console.log(`   Time: ${new Date(txn.timestamp).toISOString()}\n`);
      }
    }

    console.log('═'.repeat(80));
    console.log('\n📈 SUMMARY:');
    console.log(`   Total non-core to non-core swaps: ${potentialSplitSwaps.length}`);
    console.log(`   Unique signatures: ${actualSplitSwaps.size}`);
    console.log(`   ✅ Properly split (2 txns): ${properlySplit}`);
    console.log(`   ❌ Not split (1 txn): ${notSplit}`);
    
    if (notSplit > 0) {
      console.log(`\n⚠️  WARNING: ${notSplit} non-core to non-core swaps are NOT being split!`);
      console.log(`   These should create 2 separate transactions (BUY + SELL)`);
    } else if (properlySplit > 0) {
      console.log(`\n✅ All non-core to non-core swaps are properly split!`);
    } else {
      console.log(`\n📝 No non-core to non-core swaps found in last 24 hours`);
    }

    console.log('\n═'.repeat(80));

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

findKolSplitSwaps();
