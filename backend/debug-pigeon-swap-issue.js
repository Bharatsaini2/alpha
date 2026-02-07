// Debug the Pigeon swap transaction - check split swap and direction issues
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';
const SIGNATURE = '39FVDvhmYftAkuZxxAN6uwNEyAhYmVUevvwfUdcsevKuHaBmPLxHr16vBsk2q4R2DyxoJnNydyquNZBvN8smX4A';

async function debugTransaction() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check all collections including whalealltransactionv2 (singular!)
    const Transaction = mongoose.model('Transaction', new mongoose.Schema({}, { strict: false, collection: 'transactions' }));
    const WhaleTransaction = mongoose.model('WhaleTransaction', new mongoose.Schema({}, { strict: false, collection: 'whaletransactions' }));
    const WhaleTransactionV2 = mongoose.model('WhaleTransactionV2', new mongoose.Schema({}, { strict: false, collection: 'whaletransactionsv2' }));
    const WhaleAllTransaction = mongoose.model('WhaleAllTransaction', new mongoose.Schema({}, { strict: false, collection: 'whalealltransactions' }));
    const WhaleAllTransactionV2 = mongoose.model('WhaleAllTransactionV2', new mongoose.Schema({}, { strict: false, collection: 'whalealltransactionv2' }));

    console.log('🔍 Searching in transactions collection...');
    const txn = await Transaction.findOne({ signature: SIGNATURE }).lean();
    
    console.log('🔍 Searching in whaletransactions collection...');
    const whaleTxn = await WhaleTransaction.findOne({ signature: SIGNATURE }).lean();
    
    console.log('🔍 Searching in whaletransactionsv2 collection...');
    const whaleTxnV2 = await WhaleTransactionV2.findOne({ signature: SIGNATURE }).lean();
    
    console.log('🔍 Searching in whalealltransactions collection...');
    const whaleAllTxn = await WhaleAllTransaction.findOne({ signature: SIGNATURE }).lean();
    
    console.log('🔍 Searching in whalealltransactionv2 collection...');
    const whaleAllTxnV2 = await WhaleAllTransactionV2.findOne({ signature: SIGNATURE }).lean();

    if (!txn && !whaleTxn && !whaleTxnV2 && !whaleAllTxn && !whaleAllTxnV2) {
      console.log('❌ Transaction not found in any collection');
      await mongoose.disconnect();
      return;
    }

    const foundTxn = whaleAllTxnV2 || whaleAllTxn || whaleTxnV2 || whaleTxn || txn;
    const collection = whaleAllTxnV2 ? 'whalealltransactionv2' : (whaleAllTxn ? 'whalealltransactions' : (whaleTxnV2 ? 'whaletransactionsv2' : (whaleTxn ? 'whaletransactions' : 'transactions')));

    console.log(`\n✅ Found in: ${collection}\n`);
    console.log('═'.repeat(80));
    console.log(`Signature: ${foundTxn.signature}`);
    console.log(`Type: ${foundTxn.type}`);
    console.log(`Timestamp: ${new Date(foundTxn.timestamp).toISOString()}`);
    console.log(`Wallet: ${foundTxn.walletAddress}`);
    console.log(`Parser Version: ${foundTxn.parserVersion || 'v1'}`);
    console.log('═'.repeat(80));

    // Check if it's a swap
    if (foundTxn.type === 'SWAP' || foundTxn.type === 'BUY' || foundTxn.type === 'SELL') {
      console.log(`\n💱 ${foundTxn.type} DETAILS:`);
      
      // V2 parser format (baseAsset/quoteAsset)
      if (foundTxn.baseAsset && foundTxn.quoteAsset) {
        console.log('\n📊 V2 Parser Format:');
        console.log(`Base Asset: ${foundTxn.baseAsset.symbol} (${foundTxn.baseAsset.mint})`);
        console.log(`Base Amount: ${foundTxn.amounts?.base || 'N/A'}`);
        console.log(`Quote Asset: ${foundTxn.quoteAsset.symbol} (${foundTxn.quoteAsset.mint})`);
        console.log(`Quote Amount: ${foundTxn.amounts?.quote || 'N/A'}`);
        console.log(`Direction: ${foundTxn.direction || 'N/A'}`);
        console.log(`USD Value: $${foundTxn.amounts?.usd || 0}`);

        // Check if Pigeon was bought
        const pigeonMint = 'piGeonfUn1xhFVvCAjDqFPQfKKvvvfSa1gALCGy6pump';
        const isPigeonBase = foundTxn.baseAsset.mint === pigeonMint;
        const isPigeonQuote = foundTxn.quoteAsset.mint === pigeonMint;

        console.log('\n🐦 PIGEON TOKEN CHECK:');
        console.log(`Pigeon is Base: ${isPigeonBase}`);
        console.log(`Pigeon is Quote: ${isPigeonQuote}`);
        
        if (isPigeonBase || isPigeonQuote) {
          console.log(`\n🎯 TRANSACTION INTERPRETATION:`);
          if (foundTxn.direction === 'BUY') {
            console.log(`   Direction says: BUY`);
            console.log(`   This means: Buying ${foundTxn.baseAsset.symbol} with ${foundTxn.quoteAsset.symbol}`);
            if (isPigeonBase) {
              console.log(`   ✅ CORRECT: Pigeon is base, direction is BUY = Buying Pigeon`);
            } else {
              console.log(`   ❌ WRONG: Pigeon is quote, but direction is BUY = Should be SELL`);
            }
          } else if (foundTxn.direction === 'SELL') {
            console.log(`   Direction says: SELL`);
            console.log(`   This means: Selling ${foundTxn.baseAsset.symbol} for ${foundTxn.quoteAsset.symbol}`);
            if (isPigeonBase) {
              console.log(`   ❌ WRONG: Pigeon is base, but direction is SELL = Should be BUY`);
            } else {
              console.log(`   ✅ CORRECT: Pigeon is quote, direction is SELL = Selling for Pigeon`);
            }
          }
        }
      } 
      // V1 parser format (tokenIn/tokenOut)
      else if (foundTxn.tokenInMint && foundTxn.tokenOutMint) {
        console.log('\n📊 V1 Parser Format:');
        console.log(`Token In: ${foundTxn.tokenInSymbol || 'Unknown'} (${foundTxn.tokenInMint})`);
        console.log(`Amount In: ${foundTxn.tokenInAmount}`);
        console.log(`Token Out: ${foundTxn.tokenOutSymbol || 'Unknown'} (${foundTxn.tokenOutMint})`);
        console.log(`Amount Out: ${foundTxn.tokenOutAmount}`);
        console.log(`USD Value: $${foundTxn.usdValue || 0}`);
      }

      // Check split swap status
      console.log('\n🔍 SPLIT SWAP CHECK:');
      console.log(`isSplitSwap: ${foundTxn.isSplitSwap || false}`);
      console.log(`splitSwapPairId: ${foundTxn.splitSwapPairId || 'N/A'}`);
      console.log(`splitSwapType: ${foundTxn.splitSwapType || 'N/A'}`);

      // Check core token status
      const CORE_TOKENS = ['SOL', 'WSOL', 'USDC', 'USDT'];
      let tokenInIsCore, tokenOutIsCore;
      
      if (foundTxn.baseAsset && foundTxn.quoteAsset) {
        tokenInIsCore = CORE_TOKENS.includes(foundTxn.quoteAsset.symbol); // Quote is what you pay
        tokenOutIsCore = CORE_TOKENS.includes(foundTxn.baseAsset.symbol); // Base is what you get
      } else {
        tokenInIsCore = CORE_TOKENS.includes(foundTxn.tokenInSymbol);
        tokenOutIsCore = CORE_TOKENS.includes(foundTxn.tokenOutSymbol);
      }

      console.log('\n🎯 CORE TOKEN ANALYSIS:');
      console.log(`Token In is core: ${tokenInIsCore}`);
      console.log(`Token Out is core: ${tokenOutIsCore}`);
      console.log(`Should be split: ${tokenInIsCore !== tokenOutIsCore ? 'YES ⚠️' : 'NO'}`);

      if (tokenInIsCore !== tokenOutIsCore && !foundTxn.isSplitSwap) {
        console.log('\n🔴 SPLIT SWAP BUG CONFIRMED:');
        console.log('   This is a core↔non-core swap but was NOT split!');
        console.log('   Expected: 2 transactions (BUY + SELL)');
        console.log('   Actual: 1 transaction');

        // Check if there's a paired transaction in all collections
        let pairedTxn = await WhaleAllTransactionV2.findOne({
          signature: SIGNATURE,
          _id: { $ne: foundTxn._id }
        }).lean();

        if (!pairedTxn) {
          pairedTxn = await WhaleAllTransaction.findOne({
            signature: SIGNATURE,
            _id: { $ne: foundTxn._id }
          }).lean();
        }

        if (!pairedTxn) {
          pairedTxn = await WhaleTransactionV2.findOne({
            signature: SIGNATURE,
            _id: { $ne: foundTxn._id }
          }).lean();
        }

        if (!pairedTxn) {
          pairedTxn = await WhaleTransaction.findOne({
            signature: SIGNATURE,
            _id: { $ne: foundTxn._id }
          }).lean();
        }
          
        if (pairedTxn) {
          console.log('\n   ✅ Found paired transaction');
          console.log(`   Paired Type: ${pairedTxn.type}`);
          console.log(`   Paired splitSwapType: ${pairedTxn.splitSwapType || 'N/A'}`);
        } else {
          console.log('\n   ❌ No paired transaction found');
        }
      }
    }

    // Show full transaction
    console.log('\n📄 FULL TRANSACTION DATA:');
    console.log(JSON.stringify(foundTxn, null, 2));

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debugTransaction();
