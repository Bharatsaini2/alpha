/**
 * Diagnostic Script: Check split transactions and amount issues
 * 
 * This script checks:
 * 1. How many "both" type transactions exist (should be split)
 * 2. How many transactions have wrong amounts
 * 3. How many transactions have Infinity values
 * 4. Recent split transactions from V2 parser
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'alpha-whale-tracker';

const CORE_TOKENS = [
  'SOL', 'WSOL', 'USDC', 'USDT', 'PYUSD', 'USDS', 'DAI', 'EURC', 'USDH',
  'jupSOL', 'bSOL', 'mSOL', 'stSOL', 'jitoSOL', 'JLP', 'wBTC', 'wETH'
];

async function diagnose() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    const whaleCollection = db.collection('whalealltransactionv2');
    
    console.log('═'.repeat(80));
    console.log('DIAGNOSTIC REPORT');
    console.log('═'.repeat(80));
    
    // 1. Check "both" type transactions (should be split)
    console.log('\n📊 1. OLD "BOTH" TYPE TRANSACTIONS (Need Migration)');
    console.log('─'.repeat(80));
    
    const bothTypeQuery = {
      type: 'both',
      tokenInSymbol: { $nin: CORE_TOKENS },
      tokenOutSymbol: { $nin: CORE_TOKENS },
      migrated: { $ne: true }
    };
    
    const bothTypeCount = await whaleCollection.countDocuments(bothTypeQuery);
    console.log(`Total "both" type non-core to non-core: ${bothTypeCount}`);
    
    if (bothTypeCount > 0) {
      const samples = await whaleCollection.find(bothTypeQuery).limit(3).toArray();
      console.log('\nSample transactions:');
      samples.forEach((tx, i) => {
        console.log(`  ${i + 1}. ${tx.signature.slice(0, 30)}...`);
        console.log(`     ${tx.tokenInSymbol} → ${tx.tokenOutSymbol}`);
        console.log(`     Timestamp: ${tx.timestamp}`);
      });
    }
    
    // 2. Check recent split transactions from V2 parser
    console.log('\n\n📊 2. NEW SPLIT TRANSACTIONS (From V2 Parser)');
    console.log('─'.repeat(80));
    
    const splitQuery = {
      classification: { $in: ['v2_parser_split_sell', 'v2_parser_split_buy'] },
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    };
    
    const splitCount = await whaleCollection.countDocuments(splitQuery);
    console.log(`Split transactions in last 24 hours: ${splitCount}`);
    
    if (splitCount > 0) {
      const splitSamples = await whaleCollection.find(splitQuery).sort({ timestamp: -1 }).limit(5).toArray();
      console.log('\nRecent split transactions:');
      splitSamples.forEach((tx, i) => {
        console.log(`  ${i + 1}. ${tx.signature.slice(0, 30)}...`);
        console.log(`     Type: ${tx.type} | Classification: ${tx.classification}`);
        console.log(`     ${tx.tokenInSymbol} → ${tx.tokenOutSymbol}`);
        console.log(`     Amount: $${tx.amount?.toFixed(2) || 'N/A'}`);
      });
    } else {
      console.log('⚠️  No split transactions found in last 24 hours');
      console.log('   This means the split swap fix is NOT working on production');
    }
    
    // 3. Check Infinity values
    console.log('\n\n📊 3. INFINITY BUG CHECK');
    console.log('─'.repeat(80));
    
    const infinityQuery = {
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      $or: [
        { 'solAmount.buySolAmount': Infinity },
        { 'solAmount.sellSolAmount': Infinity },
        { 'solAmount.buySolAmount': 'Infinity' },
        { 'solAmount.sellSolAmount': 'Infinity' }
      ]
    };
    
    const infinityCount = await whaleCollection.countDocuments(infinityQuery);
    console.log(`Transactions with Infinity values (last 24h): ${infinityCount}`);
    
    if (infinityCount > 0) {
      const infinitySamples = await whaleCollection.find(infinityQuery).limit(3).toArray();
      console.log('\nSample transactions with Infinity:');
      infinitySamples.forEach((tx, i) => {
        console.log(`  ${i + 1}. ${tx.signature.slice(0, 30)}...`);
        console.log(`     Buy SOL: ${tx.solAmount?.buySolAmount}`);
        console.log(`     Sell SOL: ${tx.solAmount?.sellSolAmount}`);
      });
    }
    
    // 4. Check specific transaction from user
    console.log('\n\n📊 4. SPECIFIC TRANSACTION CHECK');
    console.log('─'.repeat(80));
    
    const specificSig = '3oo9ddd75eW7uMDWGVmLcgPZhvU5PtbcfCw4eTBogBDTpEgHCEgFaJKfNrhyL34VJ5bBoJxQM1Tjx41YTyvpVUfr';
    const specificTx = await whaleCollection.findOne({ signature: specificSig });
    
    if (specificTx) {
      console.log(`Found transaction: ${specificSig.slice(0, 30)}...`);
      console.log(`Type: ${specificTx.type}`);
      console.log(`Classification: ${specificTx.classification || 'N/A'}`);
      console.log(`${specificTx.tokenInSymbol} → ${specificTx.tokenOutSymbol}`);
      console.log(`Token In Amount: ${specificTx.tokenInAmount}`);
      console.log(`Token Out Amount: ${specificTx.tokenOutAmount}`);
      console.log(`Token In USD: $${specificTx.tokenInUsdAmount?.toFixed(2) || 'N/A'}`);
      console.log(`Token Out USD: $${specificTx.tokenOutUsdAmount?.toFixed(2) || 'N/A'}`);
      console.log(`Amount field: $${specificTx.amount?.toFixed(2) || 'N/A'}`);
      
      // Check if this should be split
      const shouldBeSplit = 
        !CORE_TOKENS.includes(specificTx.tokenInSymbol) &&
        !CORE_TOKENS.includes(specificTx.tokenOutSymbol);
      
      if (shouldBeSplit && specificTx.type !== 'sell' && specificTx.type !== 'buy') {
        console.log('\n⚠️  This transaction should be split into SELL + BUY!');
      }
    } else {
      console.log(`Transaction not found: ${specificSig.slice(0, 30)}...`);
    }
    
    // 5. Check threshold issue
    console.log('\n\n📊 5. THRESHOLD CHECK ($2-$200 range)');
    console.log('─'.repeat(80));
    
    const thresholdQuery = {
      timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
      $or: [
        { tokenInUsdAmount: { $gte: 2, $lt: 200 } },
        { tokenOutUsdAmount: { $gte: 2, $lt: 200 } },
        { amount: { $gte: 2, $lt: 200 } }
      ]
    };
    
    const thresholdCount = await whaleCollection.countDocuments(thresholdQuery);
    console.log(`Transactions in $2-$200 range (last hour): ${thresholdCount}`);
    
    if (thresholdCount === 0) {
      console.log('⚠️  No transactions in $2-$200 range!');
      console.log('   This means the $200 threshold bug is STILL ACTIVE on production');
    } else {
      console.log('✅ Threshold fix is working!');
    }
    
    // Summary
    console.log('\n\n═'.repeat(80));
    console.log('SUMMARY');
    console.log('═'.repeat(80));
    console.log(`\n1. Old "both" type transactions to migrate: ${bothTypeCount}`);
    console.log(`2. New split transactions (last 24h): ${splitCount}`);
    console.log(`3. Infinity values (last 24h): ${infinityCount}`);
    console.log(`4. Transactions in $2-$200 range (last hour): ${thresholdCount}`);
    
    console.log('\n\n🔍 RECOMMENDATIONS:');
    if (bothTypeCount > 0) {
      console.log('   ⚠️  Run migration script to convert old "both" type transactions');
    }
    if (splitCount === 0) {
      console.log('   ⚠️  Deploy split swap fix to production');
    }
    if (infinityCount > 0) {
      console.log('   ⚠️  Deploy Infinity bug fix to production');
    }
    if (thresholdCount === 0) {
      console.log('   ⚠️  Deploy $2 threshold fix to production');
    }
    if (bothTypeCount === 0 && splitCount > 0 && infinityCount === 0 && thresholdCount > 0) {
      console.log('   ✅ All fixes are working correctly!');
    }
    
    console.log('\n');
    
  } catch (error) {
    console.error('❌ Diagnostic error:', error);
  } finally {
    await client.close();
  }
}

// Run diagnostic
console.log('\n🔍 Starting Diagnostic...\n');
diagnose();
