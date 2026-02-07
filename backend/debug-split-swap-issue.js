// Debug why this swap transaction didn't get split
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';
const SIGNATURE = '4WPFXYqhpf9AhJv3TXHGwzSY7xf7dvkpmeJxaT8RKxVGGzZu6vBUtuXjMYgU5hQgr6m7NhSGikTwsBEFDVfiRdqA';

async function debugTransaction() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const Transaction = mongoose.model('Transaction', new mongoose.Schema({}, { strict: false, collection: 'transactions' }));

    // Find the transaction
    const txn = await Transaction.findOne({ signature: SIGNATURE }).lean();

    if (!txn) {
      console.log('❌ Transaction not found in database');
      await mongoose.disconnect();
      return;
    }

    console.log('🔍 TRANSACTION FOUND:\n');
    console.log('═'.repeat(80));
    console.log(`Signature: ${txn.signature}`);
    console.log(`Type: ${txn.type}`);
    console.log(`Timestamp: ${new Date(txn.timestamp).toISOString()}`);
    console.log(`Wallet: ${txn.walletAddress}`);
    console.log(`Parser Version: ${txn.parserVersion || 'v1'}`);
    console.log('═'.repeat(80));

    // Check if it's a swap
    if (txn.type === 'SWAP') {
      console.log('\n💱 SWAP DETAILS:');
      console.log(`Token In: ${txn.tokenInSymbol || 'Unknown'} (${txn.tokenInMint})`);
      console.log(`Amount In: ${txn.tokenInAmount}`);
      console.log(`Token Out: ${txn.tokenOutSymbol || 'Unknown'} (${txn.tokenOutMint})`);
      console.log(`Amount Out: ${txn.tokenOutAmount}`);
      console.log(`USD Value: $${txn.usdValue || 0}`);

      // Check if it's a split swap
      console.log('\n🔍 SPLIT SWAP CHECK:');
      console.log(`isSplitSwap: ${txn.isSplitSwap}`);
      console.log(`splitSwapPairId: ${txn.splitSwapPairId || 'N/A'}`);
      console.log(`splitSwapType: ${txn.splitSwapType || 'N/A'}`);

      // Check core token status
      const CORE_TOKENS = ['SOL', 'WSOL', 'USDC', 'USDT'];
      const tokenInIsCore = CORE_TOKENS.includes(txn.tokenInSymbol);
      const tokenOutIsCore = CORE_TOKENS.includes(txn.tokenOutSymbol);

      console.log('\n🎯 CORE TOKEN ANALYSIS:');
      console.log(`Token In "${txn.tokenInSymbol}" is core: ${tokenInIsCore}`);
      console.log(`Token Out "${txn.tokenOutSymbol}" is core: ${tokenOutIsCore}`);
      console.log(`Should be split: ${tokenInIsCore !== tokenOutIsCore ? 'YES ⚠️' : 'NO'}`);

      if (tokenInIsCore !== tokenOutIsCore && !txn.isSplitSwap) {
        console.log('\n🔴 ISSUE FOUND:');
        console.log('   This is a core↔non-core swap but was NOT split!');
        console.log('   Expected: 2 transactions (BUY + SELL)');
        console.log('   Actual: 1 transaction (SWAP)');

        // Check if there's a paired transaction
        const pairedTxn = await Transaction.findOne({
          signature: SIGNATURE,
          _id: { $ne: txn._id }
        }).lean();

        if (pairedTxn) {
          console.log('\n   ✅ Found paired transaction in DB');
          console.log(`   Paired Type: ${pairedTxn.type}`);
          console.log(`   Paired splitSwapType: ${pairedTxn.splitSwapType}`);
        } else {
          console.log('\n   ❌ No paired transaction found - this is the bug!');
        }

        // Check parser version
        console.log('\n📊 PARSER INFO:');
        console.log(`   Parser Version: ${txn.parserVersion || 'v1 (legacy)'}`);
        console.log(`   Created At: ${new Date(txn.createdAt).toISOString()}`);
        
        if (!txn.parserVersion || txn.parserVersion === 'v1') {
          console.log('   ⚠️  This was parsed with v1 parser (before split swap fix)');
        }
      } else if (txn.isSplitSwap) {
        console.log('\n✅ Transaction is correctly marked as split swap');
        console.log(`   Split Type: ${txn.splitSwapType}`);
        console.log(`   Pair ID: ${txn.splitSwapPairId}`);

        // Find the paired transaction
        const pairedTxn = await Transaction.findOne({
          splitSwapPairId: txn.splitSwapPairId,
          _id: { $ne: txn._id }
        }).lean();

        if (pairedTxn) {
          console.log(`\n   ✅ Found paired transaction:`);
          console.log(`   Paired Type: ${pairedTxn.type}`);
          console.log(`   Paired splitSwapType: ${pairedTxn.splitSwapType}`);
        } else {
          console.log('\n   ⚠️  Paired transaction not found!');
        }
      }
    } else {
      console.log(`\n⚠️  Transaction type is ${txn.type}, not SWAP`);
    }

    // Show full transaction object
    console.log('\n📄 FULL TRANSACTION DATA:');
    console.log(JSON.stringify(txn, null, 2));

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debugTransaction();
