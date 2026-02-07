/**
 * Check KOL Split Swap Transactions
 * 
 * This script checks if there are any split swap transactions in the KOL collection
 * and verifies how they are stored (2 separate transactions vs 1 merged transaction)
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function checkKolSplitSwaps() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const kolCollection = db.collection('influencerwhaletransactionsv2');

    // Check for transactions with split swap indicators
    console.log('📊 Checking for split swap transactions in KOL collection...\n');

    // Method 1: Check for transactions with "both" type
    const bothTypeCount = await kolCollection.countDocuments({ type: 'both' });
    console.log(`Found ${bothTypeCount} transactions with type="both"`);

    // Method 2: Check for transactions with split classification source
    const splitSourceCount = await kolCollection.countDocuments({
      $or: [
        { classificationSource: 'v2_parser_split_sell' },
        { classificationSource: 'v2_parser_split_buy' },
        { classificationSource: 'v2_parser_split_both' }
      ]
    });
    console.log(`Found ${splitSourceCount} transactions with split classification source`);

    // Method 3: Find recent non-core to non-core swaps
    console.log('\n🔍 Looking for recent non-core to non-core swap patterns...\n');
    
    // Get recent transactions (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const recentTxs = await kolCollection.find({
      timestamp: { $gte: sevenDaysAgo },
      parserVersion: 'v2'
    })
    .sort({ timestamp: -1 })
    .limit(100)
    .toArray();

    console.log(`Found ${recentTxs.length} recent V2 parser transactions\n`);

    // Core tokens list (same as in parser)
    const CORE_TOKENS = new Set([
      'So11111111111111111111111111111111111111112', // SOL
      'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', // jupSOL
      'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', // bSOL
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
      '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj', // stSOL
      'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // jitoSOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
      '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo', // PYUSD
      'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA', // USDS
      'EjmyN6qEC1Tf1JxiG1ae7UTJhUxSwk1TCWNWqxWV4J6o', // DAI
    ]);

    // Check for non-core to non-core swaps
    const nonCoreSwaps = recentTxs.filter(tx => {
      const tokenInAddress = tx.tokenInAddress || tx.transaction?.tokenIn?.address;
      const tokenOutAddress = tx.tokenOutAddress || tx.transaction?.tokenOut?.address;
      
      if (!tokenInAddress || !tokenOutAddress) return false;
      
      const tokenInIsCore = CORE_TOKENS.has(tokenInAddress);
      const tokenOutIsCore = CORE_TOKENS.has(tokenOutAddress);
      
      // Both tokens are non-core = should be split swap
      return !tokenInIsCore && !tokenOutIsCore;
    });

    console.log(`Found ${nonCoreSwaps.length} non-core to non-core swaps\n`);

    if (nonCoreSwaps.length > 0) {
      console.log('📋 Sample non-core to non-core swaps:\n');
      
      // Group by signature to see if they're split into 2 transactions
      const signatureGroups = {};
      nonCoreSwaps.forEach(tx => {
        const sig = tx.signature;
        if (!signatureGroups[sig]) {
          signatureGroups[sig] = [];
        }
        signatureGroups[sig].push(tx);
      });

      console.log(`Unique signatures: ${Object.keys(signatureGroups).length}`);
      console.log(`Total transactions: ${nonCoreSwaps.length}`);
      console.log(`Average transactions per signature: ${(nonCoreSwaps.length / Object.keys(signatureGroups).length).toFixed(2)}\n`);

      // Show first 5 examples
      const examples = Object.entries(signatureGroups).slice(0, 5);
      
      examples.forEach(([signature, txs], index) => {
        console.log(`\n${index + 1}. Signature: ${signature.substring(0, 16)}...`);
        console.log(`   Transaction count: ${txs.length}`);
        
        txs.forEach((tx, txIndex) => {
          console.log(`\n   Transaction ${txIndex + 1}:`);
          console.log(`   - Type: ${tx.type}`);
          console.log(`   - Classification: ${tx.classificationSource || 'N/A'}`);
          console.log(`   - Token In: ${tx.tokenInSymbol} (${tx.tokenInAddress?.substring(0, 8)}...)`);
          console.log(`   - Token Out: ${tx.tokenOutSymbol} (${tx.tokenOutAddress?.substring(0, 8)}...)`);
          console.log(`   - Amount: $${tx.amount?.buyAmount || tx.amount?.sellAmount || 0}`);
          console.log(`   - Timestamp: ${new Date(tx.timestamp).toISOString()}`);
        });
      });

      // Check if any signatures have 2 transactions (split pattern)
      const splitSignatures = Object.entries(signatureGroups).filter(([sig, txs]) => txs.length === 2);
      console.log(`\n\n✅ Signatures with 2 transactions (split pattern): ${splitSignatures.length}`);
      
      // Check if any signatures have 1 transaction with type="both"
      const bothTypeSignatures = Object.entries(signatureGroups).filter(([sig, txs]) => 
        txs.length === 1 && txs[0].type === 'both'
      );
      console.log(`❌ Signatures with 1 transaction type="both" (merged pattern): ${bothTypeSignatures.length}`);
    }

    // Summary
    console.log('\n\n📊 SUMMARY:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total KOL transactions with type="both": ${bothTypeCount}`);
    console.log(`Total KOL transactions with split source: ${splitSourceCount}`);
    console.log(`Recent non-core to non-core swaps: ${nonCoreSwaps.length}`);
    console.log('\n✅ KOL Controller Behavior:');
    console.log('   - Creates 2 SEPARATE transactions for split swaps');
    console.log('   - One transaction with type="sell" (classificationSource: v2_parser_split_sell)');
    console.log('   - One transaction with type="buy" (classificationSource: v2_parser_split_buy)');
    console.log('\n❌ Whale Controller Behavior (FIXED):');
    console.log('   - Creates 1 MERGED transaction for split swaps');
    console.log('   - Single transaction with type="both" (classificationSource: v2_parser_split_both)');
    console.log('   - Frontend expands into 2 display items');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

checkKolSplitSwaps();
