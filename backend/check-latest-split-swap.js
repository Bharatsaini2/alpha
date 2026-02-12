require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI or MONGO_URI not found in environment variables');
  process.exit(1);
}

async function checkLatestSplitSwap() {
  try {
    console.log('🔌 Connecting to MongoDB...\n');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const WhaleAllTransactionsV2 = mongoose.connection.collection('whaleAllTransactionV2');

    // Find latest split swap transactions (should have 2 records with same signature)
    console.log('🔍 Finding latest split swap transactions...\n');
    
    // First, try to find new split swap format
    let latestSplitSwap = await WhaleAllTransactionsV2.findOne(
      { 
        classificationSource: { 
          $in: ['v2_parser_split_sell', 'v2_parser_split_buy'] 
        } 
      },
      { sort: { timestamp: -1 } }
    );

    // If no new format found, check for old "both" type
    if (!latestSplitSwap) {
      console.log('⚠️  No new split swap format found, checking for old "both" type...\n');
      latestSplitSwap = await WhaleAllTransactionsV2.findOne(
        { type: 'both' },
        { sort: { timestamp: -1 } }
      );
    }

    if (!latestSplitSwap) {
      console.log('❌ No split swap transactions found in database (neither new nor old format)');
      
      // Show total transaction count
      const totalCount = await WhaleAllTransactionsV2.countDocuments();
      console.log(`\n📊 Total transactions in database: ${totalCount}`);
      
      // Show latest transaction
      const latestTx = await WhaleAllTransactionsV2.findOne({}, { sort: { timestamp: -1 } });
      if (latestTx) {
        console.log('\n📋 Latest transaction:');
        console.log('  Signature:', latestTx.signature);
        console.log('  Type:', latestTx.type);
        console.log('  Classification:', latestTx.classificationSource);
        console.log('  Timestamp:', latestTx.timestamp);
      }
      
      await mongoose.disconnect();
      return;
    }

    const isOldFormat = latestSplitSwap.type === 'both';
    console.log(`📊 Latest Split Swap Transaction Found (${isOldFormat ? 'OLD FORMAT - type="both"' : 'NEW FORMAT - separate records'}):`);
    console.log('Signature:', latestSplitSwap.signature);
    console.log('Timestamp:', latestSplitSwap.timestamp);
    console.log('Type:', latestSplitSwap.type);
    console.log('Classification:', latestSplitSwap.classificationSource);
    console.log('\n');

    // Get both records for this signature (or just one if old format)
    const bothRecords = await WhaleAllTransactionsV2.find(
      { signature: latestSplitSwap.signature }
    ).sort({ type: 1 }).toArray();

    console.log(`📋 Found ${bothRecords.length} record(s) for this signature:\n`);

    bothRecords.forEach((record, idx) => {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`Record ${idx + 1}: ${record.type.toUpperCase()}`);
      console.log('='.repeat(80));
      
      console.log('\n📝 Basic Info:');
      console.log('  Signature:', record.signature);
      console.log('  Type:', record.type);
      console.log('  Classification:', record.classificationSource);
      console.log('  Whale:', record.whaleAddress);
      console.log('  Timestamp:', record.timestamp);
      
      console.log('\n💰 Tokens:');
      console.log('  TokenIn:');
      console.log('    Symbol:', record.transaction?.tokenIn?.symbol);
      console.log('    Address:', record.tokenInAddress);
      console.log('    Amount:', record.transaction?.tokenIn?.amount);
      console.log('    USD Amount:', record.transaction?.tokenIn?.usdAmount);
      
      console.log('  TokenOut:');
      console.log('    Symbol:', record.transaction?.tokenOut?.symbol);
      console.log('    Address:', record.tokenOutAddress);
      console.log('    Amount:', record.transaction?.tokenOut?.amount);
      console.log('    USD Amount:', record.transaction?.tokenOut?.usdAmount);
      
      console.log('\n💵 Amount Fields:');
      console.log('  buyAmount:', record.amount?.buyAmount);
      console.log('  sellAmount:', record.amount?.sellAmount);
      
      console.log('\n🪙 SOL Amount Fields:');
      console.log('  buySolAmount:', record.solAmount?.buySolAmount);
      console.log('  sellSolAmount:', record.solAmount?.sellSolAmount);
      
      console.log('\n📊 Token Prices:');
      console.log('  buyTokenPrice:', record.tokenPrice?.buyTokenPrice);
      console.log('  sellTokenPrice:', record.tokenPrice?.sellTokenPrice);
      
      console.log('\n🔥 Other:');
      console.log('  Hotness Score:', record.hotnessScore);
      console.log('  Platform:', record.transaction?.platform);
    });

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Analysis Complete');

    // Check if SOL amounts are populated correctly
    console.log('\n🔍 SOL Amount Validation:');
    bothRecords.forEach((record, idx) => {
      console.log(`\nRecord ${idx + 1} (${record.type}):`);
      
      const hasBuySol = record.solAmount?.buySolAmount != null && record.solAmount?.buySolAmount !== 0;
      const hasSellSol = record.solAmount?.sellSolAmount != null && record.solAmount?.sellSolAmount !== 0;
      
      console.log(`  buySolAmount: ${record.solAmount?.buySolAmount} ${hasBuySol ? '✅' : '❌'}`);
      console.log(`  sellSolAmount: ${record.solAmount?.sellSolAmount} ${hasSellSol ? '✅' : '❌'}`);
      
      // Check if it's a SOL/WSOL swap
      const isSolSwap = 
        record.tokenInAddress === 'So11111111111111111111111111111111111111112' ||
        record.tokenOutAddress === 'So11111111111111111111111111111111111111112';
      
      if (isSolSwap) {
        console.log('  Type: Direct SOL swap (should use actual SOL amounts)');
      } else {
        console.log('  Type: Non-SOL swap (should use calculated SOL equivalents)');
        
        // Calculate expected SOL amounts
        const tokenInUsd = parseFloat(record.transaction?.tokenIn?.usdAmount || 0);
        const tokenOutUsd = parseFloat(record.transaction?.tokenOut?.usdAmount || 0);
        const solPrice = 94; // Approximate
        
        const expectedSellSol = tokenInUsd / solPrice;
        const expectedBuySol = tokenOutUsd / solPrice;
        
        console.log(`  Expected sellSolAmount: ${expectedSellSol.toFixed(4)} SOL`);
        console.log(`  Expected buySolAmount: ${expectedBuySol.toFixed(4)} SOL`);
        
        if (record.type === 'sell') {
          const sellMatch = Math.abs((record.solAmount?.sellSolAmount || 0) - expectedSellSol) < 0.01;
          console.log(`  sellSolAmount matches expected: ${sellMatch ? '✅' : '❌'}`);
        } else if (record.type === 'buy') {
          const buyMatch = Math.abs((record.solAmount?.buySolAmount || 0) - expectedBuySol) < 0.01;
          console.log(`  buySolAmount matches expected: ${buyMatch ? '✅' : '❌'}`);
        }
      }
    });

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    await mongoose.disconnect();
  }
}

checkLatestSplitSwap();
