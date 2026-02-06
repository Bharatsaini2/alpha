/**
 * Diagnostic Script: Check Split Transactions and Threshold Issues
 * 
 * This script checks:
 * 1. Are split transactions being created in the database?
 * 2. Are transactions being blocked by the $200 threshold?
 * 3. What's the actual threshold value in the code?
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'alpha-whale-tracker';

async function diagnose() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    const whaleCollection = db.collection('whalealltransactionv2');
    const kolCollection = db.collection('influencerwhaletransactionsv2');
    
    console.log('═'.repeat(80));
    console.log('SPLIT TRANSACTION DIAGNOSIS');
    console.log('═'.repeat(80));
    
    // Check for recent split transactions
    const oneHourAgo = new Date(Date.now() - 3600000);
    
    console.log('\n📊 WHALE TRANSACTIONS (Last Hour):\n');
    
    // Count all transactions
    const totalWhale = await whaleCollection.countDocuments({
      timestamp: { $gte: oneHourAgo }
    });
    console.log(`Total transactions: ${totalWhale}`);
    
    // Count split transactions (from V2 parser)
    const splitWhale = await whaleCollection.countDocuments({
      timestamp: { $gte: oneHourAgo },
      classification: { $in: ['v2_parser_split_sell', 'v2_parser_split_buy'] }
    });
    console.log(`Split transactions (v2_parser_split_*): ${splitWhale}`);
    
    // Count old "both" type transactions
    const bothWhale = await whaleCollection.countDocuments({
      timestamp: { $gte: oneHourAgo },
      type: 'both'
    });
    console.log(`"Both" type transactions: ${bothWhale}`);
    
    // Check transaction value distribution
    console.log('\n💰 Transaction Value Distribution (Last Hour):');
    const valueRanges = [
      { label: '$0-$2', min: 0, max: 2 },
      { label: '$2-$10', min: 2, max: 10 },
      { label: '$10-$50', min: 10, max: 50 },
      { label: '$50-$200', min: 50, max: 200 },
      { label: '$200+', min: 200, max: Infinity }
    ];
    
    for (const range of valueRanges) {
      const count = await whaleCollection.countDocuments({
        timestamp: { $gte: oneHourAgo },
        $or: [
          { 'amount.buyAmount': { $gte: range.min, $lt: range.max } },
          { 'amount.sellAmount': { $gte: range.min, $lt: range.max } }
        ]
      });
      console.log(`  ${range.label}: ${count} transactions`);
    }
    
    // Check for non-core to non-core transactions
    const CORE_TOKENS = [
      'SOL', 'WSOL', 'USDC', 'USDT', 'PYUSD', 'USDS', 'DAI', 'EURC', 'USDH',
      'jupSOL', 'bSOL', 'mSOL', 'stSOL', 'jitoSOL', 'JLP', 'wBTC', 'wETH'
    ];
    
    console.log('\n🔄 Non-Core to Non-Core Transactions (Last Hour):');
    const nonCoreToNonCore = await whaleCollection.countDocuments({
      timestamp: { $gte: oneHourAgo },
      tokenInSymbol: { $nin: CORE_TOKENS },
      tokenOutSymbol: { $nin: CORE_TOKENS }
    });
    console.log(`Total: ${nonCoreToNonCore}`);
    
    // Sample a few recent transactions
    console.log('\n📋 Sample Recent Transactions:');
    const samples = await whaleCollection.find({
      timestamp: { $gte: oneHourAgo }
    })
    .sort({ timestamp: -1 })
    .limit(5)
    .toArray();
    
    for (const tx of samples) {
      console.log(`\n  Signature: ${tx.signature.slice(0, 30)}...`);
      console.log(`  Type: ${tx.type}`);
      console.log(`  Classification: ${tx.classification || 'N/A'}`);
      console.log(`  Tokens: ${tx.tokenInSymbol} → ${tx.tokenOutSymbol}`);
      const buyAmt = tx.amount?.buyAmount;
      const sellAmt = tx.amount?.sellAmount;
      console.log(`  Buy Amount: $${typeof buyAmt === 'number' ? buyAmt.toFixed(2) : 'N/A'}`);
      console.log(`  Sell Amount: $${typeof sellAmt === 'number' ? sellAmt.toFixed(2) : 'N/A'}`);
    }
    
    // Check for the specific transaction mentioned by user
    console.log('\n═'.repeat(80));
    console.log('CHECKING SPECIFIC TRANSACTION');
    console.log('═'.repeat(80));
    
    const specificSig = '4TPFQSVrhPtsrQHVH9L2zsr2diToZzWsNYkJeHJL4Yc2CLePQfdsnCvU6DTR2QyPYyTPpGEXSKrLfhU28J4LZBbT';
    const specificTx = await whaleCollection.find({
      signature: specificSig
    }).toArray();
    
    if (specificTx.length === 0) {
      console.log(`\n❌ Transaction ${specificSig.slice(0, 30)}... NOT FOUND in database`);
      console.log('   This confirms split transactions are being processed but NOT saved!');
    } else {
      console.log(`\n✅ Found ${specificTx.length} record(s) for ${specificSig.slice(0, 30)}...`);
      for (const tx of specificTx) {
        console.log(`\n  Type: ${tx.type}`);
        console.log(`  Classification: ${tx.classification || 'N/A'}`);
        console.log(`  Tokens: ${tx.tokenInSymbol} → ${tx.tokenOutSymbol}`);
        console.log(`  Buy Amount: $${tx.amount?.buyAmount?.toFixed(2) || 'N/A'}`);
        console.log(`  Sell Amount: $${tx.amount?.sellAmount?.toFixed(2) || 'N/A'}`);
      }
    }
    
    // Check KOL transactions too
    console.log('\n═'.repeat(80));
    console.log('KOL TRANSACTIONS (Last Hour)');
    console.log('═'.repeat(80));
    
    const totalKol = await kolCollection.countDocuments({
      timestamp: { $gte: oneHourAgo }
    });
    console.log(`\nTotal KOL transactions: ${totalKol}`);
    
    const splitKol = await kolCollection.countDocuments({
      timestamp: { $gte: oneHourAgo },
      classification: { $in: ['v2_parser_split_sell', 'v2_parser_split_buy'] }
    });
    console.log(`Split KOL transactions: ${splitKol}`);
    
    console.log('\n═'.repeat(80));
    console.log('DIAGNOSIS COMPLETE');
    console.log('═'.repeat(80));
    
    console.log('\n📝 SUMMARY:');
    console.log(`  - Whale transactions (last hour): ${totalWhale}`);
    console.log(`  - Split whale transactions: ${splitWhale}`);
    console.log(`  - "Both" type whale transactions: ${bothWhale}`);
    console.log(`  - Non-core to non-core: ${nonCoreToNonCore}`);
    console.log(`  - KOL transactions: ${totalKol}`);
    console.log(`  - Split KOL transactions: ${splitKol}`);
    
    if (splitWhale === 0 && bothWhale === 0 && nonCoreToNonCore === 0) {
      console.log('\n⚠️  WARNING: No split or non-core transactions found!');
      console.log('   This suggests transactions are being filtered out before saving.');
      console.log('   Most likely cause: $200 threshold blocking them.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

console.log('\n🔍 Starting Split Transaction & Threshold Diagnosis\n');
diagnose();
