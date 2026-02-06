/**
 * Check last non-core to non-core transaction
 * Verify if it's properly split into 2 records
 */

const mongoose = require('mongoose');
require('dotenv').config();

// List of core tokens
const CORE_TOKENS = [
  'SOL', 'WSOL', 'USDC', 'USDT', 'PYUSD', 'USDS', 'DAI', 'USDG', 
  'JUPUSD', 'UXD', 'USD1', 'EURC', 'USD*', 'USX', 'CASH', 'HYUSD',
  'SYRUPUSDC', 'SJLUSD', 'GJLUSD', 'JLUSDC', 'JLP', 'JUICED',
  'ZBTC', 'CBBTC', 'WBTC', 'WETH',
  'JUPSOL', 'BSOL', 'MSOL', 'STSOL', 'JITOSOL'
];

function isCoreToken(symbol) {
  return CORE_TOKENS.includes(symbol?.toUpperCase());
}

async function checkLastNonCoreSwap() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;
    const whaleCollection = db.collection('whalealltransactionv2');

    console.log('📊 Looking for last non-core to non-core transaction...\n');

    // Get recent transactions
    const recentTransactions = await whaleCollection
      .find({})
      .sort({ timestamp: -1 })
      .limit(500)
      .toArray();

    console.log(`Checking ${recentTransactions.length} recent transactions...\n`);

    // Find non-core to non-core transactions
    const nonCoreSwaps = recentTransactions.filter(tx => {
      const tokenInIsCore = isCoreToken(tx.tokenInSymbol);
      const tokenOutIsCore = isCoreToken(tx.tokenOutSymbol);
      return !tokenInIsCore && !tokenOutIsCore;
    });

    console.log(`Found ${nonCoreSwaps.length} non-core to non-core transactions\n`);

    if (nonCoreSwaps.length === 0) {
      console.log('❌ No non-core to non-core transactions found in last 500 transactions');
      console.log('This suggests they might be getting suppressed or filtered out.\n');
      
      // Show what types of transactions we DO have
      const typeCounts = {};
      recentTransactions.forEach(tx => {
        const tokenInIsCore = isCoreToken(tx.tokenInSymbol);
        const tokenOutIsCore = isCoreToken(tx.tokenOutSymbol);
        let category;
        if (tokenInIsCore && tokenOutIsCore) {
          category = 'Core-to-Core';
        } else if (tokenInIsCore || tokenOutIsCore) {
          category = 'Core-to-NonCore';
        } else {
          category = 'NonCore-to-NonCore';
        }
        typeCounts[category] = (typeCounts[category] || 0) + 1;
      });
      
      console.log('Transaction breakdown:');
      Object.entries(typeCounts).forEach(([category, count]) => {
        console.log(`  ${category}: ${count}`);
      });
      
      return;
    }

    // Check the most recent non-core to non-core swap
    const lastSwap = nonCoreSwaps[0];
    console.log('═══════════════════════════════════════════════════════');
    console.log('LAST NON-CORE TO NON-CORE TRANSACTION');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Signature: ${lastSwap.signature}`);
    console.log(`Timestamp: ${new Date(lastSwap.timestamp).toISOString()}`);
    console.log(`Type: ${lastSwap.type}`);
    console.log(`TokenIn: ${lastSwap.tokenInSymbol} (${isCoreToken(lastSwap.tokenInSymbol) ? 'CORE' : 'NON-CORE'})`);
    console.log(`TokenOut: ${lastSwap.tokenOutSymbol} (${isCoreToken(lastSwap.tokenOutSymbol) ? 'CORE' : 'NON-CORE'})`);
    console.log(`Classification Source: ${lastSwap.classificationSource || 'N/A'}`);

    // Check if there are 2 records with the same signature
    const sameSignature = await whaleCollection.find({ 
      signature: lastSwap.signature 
    }).toArray();

    console.log(`\n📊 SPLIT CHECK:`);
    console.log(`Records with this signature: ${sameSignature.length}`);
    
    if (sameSignature.length === 2) {
      console.log('✅ CORRECTLY SPLIT into 2 records\n');
      
      sameSignature.forEach((record, i) => {
        console.log(`Record ${i + 1}:`);
        console.log(`  Type: ${record.type}`);
        console.log(`  TokenIn: ${record.tokenInSymbol}`);
        console.log(`  TokenOut: ${record.tokenOutSymbol}`);
        console.log(`  Classification: ${record.classificationSource || 'N/A'}`);
      });
      
      // Verify they are SELL + BUY
      const types = sameSignature.map(r => r.type).sort();
      if (types[0] === 'buy' && types[1] === 'sell') {
        console.log('\n✅ Has both BUY and SELL records - CORRECT!');
      } else {
        console.log(`\n❌ Types are: ${types.join(', ')} - Should be [buy, sell]`);
      }
      
    } else if (sameSignature.length === 1) {
      console.log('❌ NOT SPLIT - Only 1 record found');
      console.log('Expected: 2 records (SELL + BUY)');
      console.log('Actual: 1 record');
      
      if (lastSwap.type === 'both') {
        console.log('\n⚠️  Type is "both" - This is the OLD bug!');
        console.log('The fix might not have been deployed yet.');
      }
    } else {
      console.log(`⚠️  Unexpected: ${sameSignature.length} records found`);
    }

    // Show more recent non-core swaps
    console.log('\n\n📋 RECENT NON-CORE TO NON-CORE TRANSACTIONS:');
    console.log('═══════════════════════════════════════════════════════\n');
    
    for (let i = 0; i < Math.min(5, nonCoreSwaps.length); i++) {
      const tx = nonCoreSwaps[i];
      const sameCount = await whaleCollection.countDocuments({ signature: tx.signature });
      
      console.log(`${i + 1}. ${tx.signature.substring(0, 20)}...`);
      console.log(`   Time: ${new Date(tx.timestamp).toISOString()}`);
      console.log(`   ${tx.tokenInSymbol} → ${tx.tokenOutSymbol}`);
      console.log(`   Type: ${tx.type}`);
      console.log(`   Records: ${sameCount} ${sameCount === 2 ? '✅' : '❌'}`);
      console.log(`   Source: ${tx.classificationSource || 'N/A'}\n`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

checkLastNonCoreSwap();
