// Check what happened to old non-core to non-core transactions
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'alpha-whale-tracker';

async function checkOldTransactions() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    const collection = db.collection('whalealltransactionv2');
    
    const coreTokens = ['SOL', 'WSOL', 'USDC', 'USDT', 'PYUSD', 'USDS', 'DAI', 'EURC', 'USDH', 'jupSOL', 'bSOL', 'mSOL', 'stSOL', 'jitoSOL'];
    
    console.log('═'.repeat(80));
    console.log('CHECKING OLD NON-CORE TO NON-CORE TRANSACTIONS');
    console.log('═'.repeat(80));
    
    // Check transactions from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Find non-core to non-core transactions
    const nonCoreToNonCore = await collection.find({
      timestamp: { $gte: sevenDaysAgo },
      tokenInSymbol: { $nin: coreTokens },
      tokenOutSymbol: { $nin: coreTokens }
    }).sort({ timestamp: -1 }).limit(20).toArray();
    
    console.log(`\n📊 Found ${nonCoreToNonCore.length} non-core to non-core transactions (last 7 days):\n`);
    
    // Group by classification
    const byClassification = {};
    nonCoreToNonCore.forEach(tx => {
      const classification = tx.classification || 'undefined';
      if (!byClassification[classification]) {
        byClassification[classification] = [];
      }
      byClassification[classification].push(tx);
    });
    
    console.log('Breakdown by classification:');
    Object.entries(byClassification).forEach(([classification, txs]) => {
      console.log(`  ${classification}: ${txs.length} transactions`);
    });
    
    console.log('\n' + '─'.repeat(80));
    console.log('Sample transactions:\n');
    
    nonCoreToNonCore.slice(0, 5).forEach((tx, i) => {
      console.log(`${i + 1}. ${tx.tokenInSymbol} → ${tx.tokenOutSymbol}`);
      console.log(`   Signature: ${tx.signature.slice(0, 30)}...`);
      console.log(`   Type: ${tx.type}`);
      console.log(`   Classification: ${tx.classification || 'undefined'}`);
      console.log(`   Timestamp: ${tx.timestamp}`);
      console.log('');
    });
    
    // Check if any are marked as "both" type (old V1 behavior)
    const bothType = await collection.countDocuments({
      timestamp: { $gte: sevenDaysAgo },
      type: 'both',
      tokenInSymbol: { $nin: coreTokens },
      tokenOutSymbol: { $nin: coreTokens }
    });
    
    console.log('─'.repeat(80));
    console.log(`\n📋 Old "both" type transactions: ${bothType}`);
    console.log('   (These should have been split into SELL + BUY)\n');
    
    // Check for split transactions
    const splitTransactions = await collection.countDocuments({
      timestamp: { $gte: sevenDaysAgo },
      classification: { $in: ['v2_parser_split_sell', 'v2_parser_split_buy'] }
    });
    
    console.log(`📋 New split transactions: ${splitTransactions}`);
    console.log('   (These are correctly split)\n');
    
    console.log('═'.repeat(80));
    console.log('ANALYSIS');
    console.log('═'.repeat(80));
    
    if (bothType > 0 && splitTransactions === 0) {
      console.log('\n❌ OLD BEHAVIOR: Non-core to non-core saved as "both" type');
      console.log('   Problem: Single transaction instead of 2 separate ones');
      console.log('   Status: Split swap fix not working yet');
    } else if (splitTransactions > 0) {
      console.log('\n✅ NEW BEHAVIOR: Non-core to non-core split into SELL + BUY');
      console.log('   Status: Split swap fix is working!');
    } else {
      console.log('\n⚠️  NO DATA: No non-core to non-core transactions found');
      console.log('   Possible reasons:');
      console.log('   1. $200 threshold blocking them');
      console.log('   2. No such transactions in last 7 days');
      console.log('   3. Core token suppression filtering them out');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

checkOldTransactions();
