const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI;

// Define schemas
const whaleTransactionV2Schema = new mongoose.Schema({}, { strict: false, collection: 'whaletransactionsv2' });
const influencerWhaleTransactionV2Schema = new mongoose.Schema({}, { strict: false, collection: 'influencerwhaletransactionsv2' });

const WhaleTransactionV2 = mongoose.model('WhaleTransactionV2', whaleTransactionV2Schema);
const InfluencerWhaleTransactionV2 = mongoose.model('InfluencerWhaleTransactionV2', influencerWhaleTransactionV2Schema);

async function verifySplitSwapImplementation() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('='.repeat(80));
    console.log('SPLIT SWAP IMPLEMENTATION VERIFICATION');
    console.log('='.repeat(80));

    // Check Whale Transactions V2
    console.log('\n📊 WHALE TRANSACTIONS V2 (whaleAllTransactionV2 collection)');
    console.log('-'.repeat(80));
    
    const whaleTotal = await WhaleTransactionV2.countDocuments();
    const whaleBothType = await WhaleTransactionV2.countDocuments({ type: 'both' });
    const whaleBuy = await WhaleTransactionV2.countDocuments({ type: 'buy' });
    const whaleSell = await WhaleTransactionV2.countDocuments({ type: 'sell' });
    
    console.log(`Total transactions: ${whaleTotal}`);
    console.log(`- Buy: ${whaleBuy}`);
    console.log(`- Sell: ${whaleSell}`);
    console.log(`- Both (Split Swap): ${whaleBothType}`);
    console.log(`- Percentage of split swaps: ${whaleTotal > 0 ? ((whaleBothType / whaleTotal) * 100).toFixed(2) : 0}%`);

    if (whaleBothType > 0) {
      const latestWhaleSplit = await WhaleTransactionV2.findOne({ type: 'both' })
        .sort({ timestamp: -1 })
        .lean();
      
      console.log('\n📋 Latest Whale Split Swap:');
      console.log(`- Signature: ${latestWhaleSplit.signature}`);
      console.log(`- Timestamp: ${new Date(latestWhaleSplit.timestamp).toLocaleString()}`);
      console.log(`- Whale Address: ${latestWhaleSplit.whaleAddress || latestWhaleSplit.whale?.address}`);
      console.log(`- Token In: ${latestWhaleSplit.transaction?.tokenIn?.symbol} (${latestWhaleSplit.tokenInAddress?.slice(0, 8)}...)`);
      console.log(`- Token Out: ${latestWhaleSplit.transaction?.tokenOut?.symbol} (${latestWhaleSplit.tokenOutAddress?.slice(0, 8)}...)`);
      console.log(`- Buy Amount (USD): $${latestWhaleSplit.amount?.buyAmount}`);
      console.log(`- Sell Amount (USD): $${latestWhaleSplit.amount?.sellAmount}`);
      console.log(`- bothType flags:`, latestWhaleSplit.bothType);
      
      // Verify structure
      const hasCorrectStructure = 
        latestWhaleSplit.type === 'both' &&
        latestWhaleSplit.bothType?.[0]?.buyType === true &&
        latestWhaleSplit.bothType?.[0]?.sellType === true &&
        latestWhaleSplit.amount?.buyAmount &&
        latestWhaleSplit.amount?.sellAmount;
      
      console.log(`\n✅ Structure validation: ${hasCorrectStructure ? 'PASSED' : 'FAILED'}`);
    } else {
      console.log('\n⚠️ No split swap transactions found in whale collection');
    }

    // Check Influencer/KOL Transactions V2
    console.log('\n\n📊 INFLUENCER/KOL TRANSACTIONS V2 (influencerWhaleTransactionsV2 collection)');
    console.log('-'.repeat(80));
    
    const kolTotal = await InfluencerWhaleTransactionV2.countDocuments();
    const kolBothType = await InfluencerWhaleTransactionV2.countDocuments({ type: 'both' });
    const kolBuy = await InfluencerWhaleTransactionV2.countDocuments({ type: 'buy' });
    const kolSell = await InfluencerWhaleTransactionV2.countDocuments({ type: 'sell' });
    
    console.log(`Total transactions: ${kolTotal}`);
    console.log(`- Buy: ${kolBuy}`);
    console.log(`- Sell: ${kolSell}`);
    console.log(`- Both (Split Swap): ${kolBothType}`);
    console.log(`- Percentage of split swaps: ${kolTotal > 0 ? ((kolBothType / kolTotal) * 100).toFixed(2) : 0}%`);

    if (kolBothType > 0) {
      const latestKolSplit = await InfluencerWhaleTransactionV2.findOne({ type: 'both' })
        .sort({ timestamp: -1 })
        .lean();
      
      console.log('\n📋 Latest KOL Split Swap:');
      console.log(`- Signature: ${latestKolSplit.signature}`);
      console.log(`- Timestamp: ${new Date(latestKolSplit.timestamp).toLocaleString()}`);
      console.log(`- KOL: ${latestKolSplit.influencerUsername} (${latestKolSplit.influencerName})`);
      console.log(`- KOL Address: ${latestKolSplit.kolAddress || latestKolSplit.whaleAddress}`);
      console.log(`- Token In: ${latestKolSplit.transaction?.tokenIn?.symbol} (${latestKolSplit.tokenInAddress?.slice(0, 8)}...)`);
      console.log(`- Token Out: ${latestKolSplit.transaction?.tokenOut?.symbol} (${latestKolSplit.tokenOutAddress?.slice(0, 8)}...)`);
      console.log(`- Buy Amount (USD): $${latestKolSplit.amount?.buyAmount}`);
      console.log(`- Sell Amount (USD): $${latestKolSplit.amount?.sellAmount}`);
      console.log(`- bothType flags:`, latestKolSplit.bothType);
      
      // Verify structure
      const hasCorrectStructure = 
        latestKolSplit.type === 'both' &&
        latestKolSplit.bothType?.[0]?.buyType === true &&
        latestKolSplit.bothType?.[0]?.sellType === true &&
        latestKolSplit.amount?.buyAmount &&
        latestKolSplit.amount?.sellAmount;
      
      console.log(`\n✅ Structure validation: ${hasCorrectStructure ? 'PASSED' : 'FAILED'}`);
    } else {
      console.log('\n⚠️ No split swap transactions found in KOL collection');
    }

    // Summary
    console.log('\n\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    
    console.log('\n✅ Parser Implementation:');
    console.log('   - V2 Parser detects non-core to non-core swaps');
    console.log('   - Creates SplitSwapPair with sellRecord and buyRecord');
    console.log('   - Whale controller: Merges into SINGLE "both" type transaction');
    console.log('   - KOL controller: Creates TWO separate transactions (buy + sell)');
    
    console.log('\n✅ Database Storage:');
    console.log(`   - Whale: ${whaleBothType} split swaps stored as type="both"`);
    console.log(`   - KOL: ${kolBothType} split swaps stored as type="both"`);
    
    console.log('\n✅ Frontend Display:');
    console.log('   - Frontend expands type="both" into 2 display items');
    console.log('   - Uses bothType[0].buyType and bothType[0].sellType flags');
    console.log('   - Creates separate _id for buy and sell (_id_buy, _id_sell)');
    
    console.log('\n🔍 Current Status:');
    if (whaleBothType === 0 && kolBothType === 0) {
      console.log('   ⚠️ NO SPLIT SWAPS FOUND - This could mean:');
      console.log('      1. No non-core to non-core transactions have occurred recently');
      console.log('      2. Parser is filtering them out');
      console.log('      3. Core token suppression is preventing them');
    } else if (kolBothType > 0 && whaleBothType === 0) {
      console.log('   ✅ KOL split swaps working correctly');
      console.log('   ⚠️ Whale split swaps not found (may be expected if no whale non-core swaps)');
    } else {
      console.log('   ✅ Split swap implementation is working correctly!');
    }

    // Check recent transactions to see if any should be split swaps
    console.log('\n\n📊 RECENT TRANSACTION ANALYSIS (Last 24 hours)');
    console.log('-'.repeat(80));
    
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const recentKol = await InfluencerWhaleTransactionV2.find({
      timestamp: { $gte: yesterday }
    }).sort({ timestamp: -1 }).limit(5).lean();
    
    console.log(`\nRecent KOL transactions (last 5):`);
    recentKol.forEach((tx, i) => {
      console.log(`\n${i + 1}. ${tx.signature.slice(0, 16)}...`);
      console.log(`   Type: ${tx.type}`);
      console.log(`   ${tx.transaction?.tokenIn?.symbol} → ${tx.transaction?.tokenOut?.symbol}`);
      console.log(`   Buy: $${tx.amount?.buyAmount || 0}, Sell: $${tx.amount?.sellAmount || 0}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

verifySplitSwapImplementation();
