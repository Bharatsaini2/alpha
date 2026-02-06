/**
 * Diagnose why split swap is not working
 * Check if parser is returning SplitSwapPair
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function diagnoseSplitSwap() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;
    const whaleCollection = db.collection('whalealltransactionv2');

    // Get recent non-core to non-core transactions
    const recentTx = await whaleCollection
      .find({})
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();

    const CORE_TOKENS = ['SOL', 'WSOL', 'USDC', 'USDT', 'PYUSD', 'USDS', 'DAI'];
    
    const nonCoreSwaps = recentTx.filter(tx => {
      const inCore = CORE_TOKENS.includes(tx.tokenInSymbol?.toUpperCase());
      const outCore = CORE_TOKENS.includes(tx.tokenOutSymbol?.toUpperCase());
      return !inCore && !outCore;
    });

    console.log(`Found ${nonCoreSwaps.length} non-core to non-core transactions\n`);

    if (nonCoreSwaps.length === 0) {
      console.log('❌ No non-core to non-core transactions found');
      return;
    }

    // Check classification sources
    console.log('📊 Classification Sources:\n');
    const sources = {};
    nonCoreSwaps.forEach(tx => {
      const source = tx.classificationSource || 'N/A';
      sources[source] = (sources[source] || 0) + 1;
    });

    Object.entries(sources).forEach(([source, count]) => {
      console.log(`  ${source}: ${count}`);
    });

    // Check for split indicators
    const hasSplitSource = nonCoreSwaps.some(tx => 
      tx.classificationSource?.includes('split')
    );

    console.log(`\n🔍 Has split classification: ${hasSplitSource ? '✅ YES' : '❌ NO'}`);

    if (!hasSplitSource) {
      console.log('\n❌ ISSUE: No transactions have split classification!');
      console.log('This means the parser is NOT returning SplitSwapPair.\n');
      console.log('Possible causes:');
      console.log('1. Parser is suppressing these transactions (core-to-core check)');
      console.log('2. Parser is returning ERASE for these transactions');
      console.log('3. Parser logic for detecting split swaps is not working');
      console.log('4. Transactions are below minimum value threshold');
    }

    // Check a specific transaction
    const sampleTx = nonCoreSwaps[0];
    console.log('\n📋 Sample Transaction:');
    console.log(`Signature: ${sampleTx.signature}`);
    console.log(`TokenIn: ${sampleTx.tokenInSymbol}`);
    console.log(`TokenOut: ${sampleTx.tokenOutSymbol}`);
    console.log(`Type: ${sampleTx.type}`);
    console.log(`Classification: ${sampleTx.classificationSource || 'N/A'}`);
    console.log(`Timestamp: ${new Date(sampleTx.timestamp).toISOString()}`);

    // Check if there are duplicate signatures (would indicate split is working)
    const signatureCounts = {};
    nonCoreSwaps.forEach(tx => {
      signatureCounts[tx.signature] = (signatureCounts[tx.signature] || 0) + 1;
    });

    const duplicates = Object.entries(signatureCounts).filter(([sig, count]) => count > 1);
    
    console.log(`\n🔍 Duplicate signatures (split swaps): ${duplicates.length}`);
    
    if (duplicates.length > 0) {
      console.log('✅ Some transactions ARE being split!');
      duplicates.slice(0, 3).forEach(([sig, count]) => {
        console.log(`  ${sig.substring(0, 20)}... (${count} records)`);
      });
    } else {
      console.log('❌ NO transactions are being split!');
    }

    // Check server logs recommendation
    console.log('\n\n📝 NEXT STEPS:');
    console.log('1. Check server logs for ERASE reasons:');
    console.log('   pm2 logs backend --lines 200 | grep -i "erase"');
    console.log('\n2. Check for split swap detection:');
    console.log('   pm2 logs backend --lines 200 | grep -i "split"');
    console.log('\n3. Check for core token suppression:');
    console.log('   pm2 logs backend --lines 200 | grep -i "suppress"');
    console.log('\n4. Check parser output:');
    console.log('   pm2 logs backend --lines 200 | grep -i "v2 parser"');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

diagnoseSplitSwap();
