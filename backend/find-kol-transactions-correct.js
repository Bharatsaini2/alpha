// Find KOL transactions in the correct collections
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

// Core tokens list
const CORE_TOKENS = ['SOL', 'WSOL', 'USDC', 'USDT', 'PYUSD', 'EURC'];

async function findKolTransactions() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // First, get list of KOL addresses
    const InfluencerWallet = mongoose.model('InfluencerWallet', new mongoose.Schema({}, { strict: false, collection: 'influencerwhalesaddressv2' }));
    
    const kols = await InfluencerWallet.find().lean();
    console.log(`📊 Found ${kols.length} KOL addresses in influencerwhalesaddressv2\n`);

    if (kols.length === 0) {
      console.log('❌ No KOL addresses found');
      await mongoose.disconnect();
      return;
    }

    // Show sample KOL
    console.log('Sample KOL:');
    console.log(`  Address: ${kols[0].address || kols[0].walletAddress || 'N/A'}`);
    console.log(`  Username: ${kols[0].username || kols[0].twitterUsername || 'N/A'}\n`);

    // Now check whale transactions for these KOL addresses
    const WhaleAllTransactionV2 = mongoose.model('WhaleAllTransactionV2', new mongoose.Schema({}, { strict: false, collection: 'whalealltransactionv2' }));

    // Get KOL addresses
    const kolAddresses = kols.map(k => k.address || k.walletAddress).filter(Boolean);
    
    console.log(`🔍 Searching for transactions from ${kolAddresses.length} KOL addresses...\n`);

    // Find recent transactions from KOLs
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const kolTxns = await WhaleAllTransactionV2.find({
      whaleAddress: { $in: kolAddresses },
      timestamp: { $gte: oneDayAgo }
    }).sort({ timestamp: -1 }).limit(50).lean();

    console.log(`📊 Found ${kolTxns.length} KOL transactions in last 24 hours\n`);

    if (kolTxns.length === 0) {
      console.log('❌ No recent KOL transactions found');
      console.log('   Trying to find ANY KOL transactions (all time)...\n');
      
      const anyKolTxns = await WhaleAllTransactionV2.find({
        whaleAddress: { $in: kolAddresses }
      }).sort({ timestamp: -1 }).limit(10).lean();
      
      console.log(`📊 Found ${anyKolTxns.length} total KOL transactions\n`);
      
      if (anyKolTxns.length > 0) {
        console.log('Sample KOL transaction:');
        const sample = anyKolTxns[0];
        console.log(`  Signature: ${sample.signature}`);
        console.log(`  Type: ${sample.type}`);
        console.log(`  KOL: ${sample.whaleAddress}`);
        console.log(`  Time: ${new Date(sample.timestamp).toISOString()}\n`);
      }
      
      await mongoose.disconnect();
      return;
    }

    // Find potential split swaps (non-core to non-core)
    const potentialSplitSwaps = [];
    const splitSwapsBySignature = new Map();

    for (const txn of kolTxns) {
      const tokenInSymbol = txn.tokenInSymbol;
      const tokenOutSymbol = txn.tokenOutSymbol;

      if (!tokenInSymbol || !tokenOutSymbol) continue;

      const tokenInIsCore = CORE_TOKENS.includes(tokenInSymbol.toUpperCase().trim());
      const tokenOutIsCore = CORE_TOKENS.includes(tokenOutSymbol.toUpperCase().trim());

      // If both are non-core, this should be a split swap
      if (!tokenInIsCore && !tokenOutIsCore) {
        potentialSplitSwaps.push(txn);

        if (!splitSwapsBySignature.has(txn.signature)) {
          splitSwapsBySignature.set(txn.signature, []);
        }
        splitSwapsBySignature.get(txn.signature).push(txn);
      }
    }

    console.log(`🔍 Found ${potentialSplitSwaps.length} non-core to non-core swaps\n`);

    if (potentialSplitSwaps.length === 0) {
      console.log('📝 No non-core to non-core swaps found in recent KOL transactions');
      await mongoose.disconnect();
      return;
    }

    console.log('═'.repeat(80));
    console.log('\n📋 SPLIT SWAP ANALYSIS:\n');

    let properlySplit = 0;
    let notSplit = 0;

    for (const [signature, txns] of splitSwapsBySignature.entries()) {
      if (txns.length === 2) {
        properlySplit++;
        const types = txns.map(t => t.type);
        
        console.log(`✅ Properly Split (${signature.slice(0, 16)}...)`);
        console.log(`   Transactions: ${txns.length}`);
        console.log(`   Types: ${types.join(', ')}`);
        console.log(`   Tokens: ${txns[0].tokenInSymbol} ↔ ${txns[0].tokenOutSymbol}`);
        console.log(`   KOL: ${txns[0].whaleAddress}`);
        console.log(`   Time: ${new Date(txns[0].timestamp).toISOString()}`);
        
        if (types.includes('buy') && types.includes('sell')) {
          console.log(`   ✅ Correct: One BUY and one SELL\n`);
        } else if (types.includes('both')) {
          console.log(`   ⚠️  Has 'both' type - should be 2 separate BUY/SELL\n`);
        } else {
          console.log(`   ⚠️  Warning: Expected one BUY and one SELL, got ${types.join(', ')}\n`);
        }
      } else if (txns.length === 1) {
        notSplit++;
        const txn = txns[0];
        
        console.log(`❌ NOT Split (${signature.slice(0, 16)}...)`);
        console.log(`   Transactions: 1 (should be 2)`);
        console.log(`   Type: ${txn.type}`);
        console.log(`   Tokens: ${txn.tokenInSymbol} ↔ ${txn.tokenOutSymbol}`);
        console.log(`   KOL: ${txn.whaleAddress}`);
        console.log(`   Parser: ${txn.parserVersion || 'v1'}`);
        console.log(`   Time: ${new Date(txn.timestamp).toISOString()}`);
        
        // Show full transaction for debugging
        console.log(`\n   Full transaction:`);
        console.log(JSON.stringify(txn, null, 2));
        console.log('\n');
      }
    }

    console.log('═'.repeat(80));
    console.log('\n📈 SUMMARY:');
    console.log(`   Total KOL transactions checked: ${kolTxns.length}`);
    console.log(`   Non-core to non-core swaps: ${potentialSplitSwaps.length}`);
    console.log(`   Unique signatures: ${splitSwapsBySignature.size}`);
    console.log(`   ✅ Properly split (2 txns): ${properlySplit}`);
    console.log(`   ❌ Not split (1 txn): ${notSplit}`);
    
    if (notSplit > 0) {
      console.log(`\n⚠️  WARNING: ${notSplit} non-core to non-core swaps are NOT being split!`);
      console.log(`   These should create 2 separate transactions (BUY + SELL)`);
      console.log(`   But they're showing as single transactions with type="${potentialSplitSwaps[0].type}"`);
    } else if (properlySplit > 0) {
      console.log(`\n✅ All non-core to non-core swaps are properly split!`);
    }

    console.log('\n═'.repeat(80));

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

findKolTransactions();
