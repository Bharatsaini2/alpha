/**
 * Verify Fix is Working
 * 
 * Check recent transactions to see if the fix is working correctly
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function verifyFix() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;
    const whaleCollection = db.collection('whalealltransactionv2');

    // Get transactions from the last 10 minutes (after deployment)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    console.log('📊 Checking transactions after deployment...');
    console.log(`Looking for transactions after: ${tenMinutesAgo.toISOString()}\n`);

    const recentTransactions = await whaleCollection
      .find({ 
        timestamp: { $gte: tenMinutesAgo }
      })
      .sort({ timestamp: -1 })
      .limit(20)
      .toArray();

    console.log(`Found ${recentTransactions.length} recent transactions\n`);

    if (recentTransactions.length === 0) {
      console.log('⚠️  No new transactions yet. Wait for new whale activity.');
      console.log('The fix will apply to all new transactions automatically.\n');
      return;
    }

    // Check for split swaps
    const splitSwaps = recentTransactions.filter(tx => 
      tx.classificationSource?.includes('split')
    );
    console.log(`✅ Split swaps: ${splitSwaps.length}`);
    if (splitSwaps.length > 0) {
      console.log('   Sample split swap signatures:');
      splitSwaps.slice(0, 3).forEach(tx => {
        console.log(`   - ${tx.signature} (${tx.type})`);
      });
    }

    // Check for "both" type (should be 0 after fix)
    const bothType = recentTransactions.filter(tx => tx.type === 'both');
    console.log(`${bothType.length === 0 ? '✅' : '❌'} "both" type transactions: ${bothType.length} (should be 0)`);

    // Show sample transactions
    console.log('\n📋 Sample recent transactions:');
    recentTransactions.slice(0, 5).forEach((tx, i) => {
      console.log(`\n${i + 1}. Signature: ${tx.signature.substring(0, 20)}...`);
      console.log(`   Type: ${tx.type}`);
      console.log(`   Whale: ${tx.whaleAddress?.substring(0, 20)}...`);
      console.log(`   TokenIn: ${tx.tokenInSymbol}`);
      console.log(`   TokenOut: ${tx.tokenOutSymbol}`);
      console.log(`   Time: ${new Date(tx.timestamp).toISOString()}`);
      if (tx.classificationSource) {
        console.log(`   Source: ${tx.classificationSource}`);
      }
    });

    console.log('\n✅ Fix verification complete!');
    console.log('\nWhat to look for:');
    console.log('1. No "both" type transactions (should be split into 2)');
    console.log('2. Directions match whale\'s actual actions');
    console.log('3. classificationSource shows v2_parser or v2_parser_split');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

verifyFix();
