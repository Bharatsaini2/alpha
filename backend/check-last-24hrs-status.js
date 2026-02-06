/**
 * Quick Check: Last 24 Hours Migration Status
 * 
 * Shows only transactions from the last 24 hours
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'alpha-whale-tracker';

const CORE_TOKENS = [
  'SOL', 'WSOL', 'USDC', 'USDT', 'PYUSD', 'USDS', 'DAI', 'EURC', 'USDH',
  'jupSOL', 'bSOL', 'mSOL', 'stSOL', 'jitoSOL', 'JLP', 'wBTC', 'wETH'
];

const TWENTY_FOUR_HOURS_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000);

async function checkLast24HoursStatus() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    
    console.log('═'.repeat(80));
    console.log('MIGRATION STATUS CHECK (LAST 24 HOURS)');
    console.log('═'.repeat(80));
    console.log(`\nTime filter: ${TWENTY_FOUR_HOURS_AGO.toISOString()} to now\n`);
    
    // Check whale transactions
    console.log('📊 WHALE TRANSACTIONS (Last 24 Hours):\n');
    const whaleCollection = db.collection('whalealltransactionv2');
    
    const totalBoth = await whaleCollection.countDocuments({ 
      type: 'both',
      timestamp: { $gte: TWENTY_FOUR_HOURS_AGO }
    });
    console.log(`Total "both" type transactions: ${totalBoth}`);
    
    const alreadyMigrated = await whaleCollection.countDocuments({ 
      type: 'both',
      migrated: true,
      timestamp: { $gte: TWENTY_FOUR_HOURS_AGO }
    });
    console.log(`Already migrated: ${alreadyMigrated}`);
    
    const needsMigration = await whaleCollection.countDocuments({
      type: 'both',
      tokenInSymbol: { $nin: CORE_TOKENS },
      tokenOutSymbol: { $nin: CORE_TOKENS },
      migrated: { $ne: true },
      timestamp: { $gte: TWENTY_FOUR_HOURS_AGO }
    });
    console.log(`Needs migration (non-core to non-core): ${needsMigration}`);
    
    const migratedSell = await whaleCollection.countDocuments({
      classification: { $in: ['migrated_split_sell_24hrs', 'migrated_split_sell'] },
      timestamp: { $gte: TWENTY_FOUR_HOURS_AGO }
    });
    const migratedBuy = await whaleCollection.countDocuments({
      classification: { $in: ['migrated_split_buy_24hrs', 'migrated_split_buy'] },
      timestamp: { $gte: TWENTY_FOUR_HOURS_AGO }
    });
    console.log(`Migrated SELL records: ${migratedSell}`);
    console.log(`Migrated BUY records: ${migratedBuy}`);
    
    // Check KOL transactions
    console.log('\n📊 KOL TRANSACTIONS (Last 24 Hours):\n');
    const kolCollection = db.collection('influencerwhaletransactionsv2');
    
    const totalBothKol = await kolCollection.countDocuments({ 
      type: 'both',
      timestamp: { $gte: TWENTY_FOUR_HOURS_AGO }
    });
    console.log(`Total "both" type transactions: ${totalBothKol}`);
    
    const alreadyMigratedKol = await kolCollection.countDocuments({ 
      type: 'both',
      migrated: true,
      timestamp: { $gte: TWENTY_FOUR_HOURS_AGO }
    });
    console.log(`Already migrated: ${alreadyMigratedKol}`);
    
    const needsMigrationKol = await kolCollection.countDocuments({
      type: 'both',
      tokenInSymbol: { $nin: CORE_TOKENS },
      tokenOutSymbol: { $nin: CORE_TOKENS },
      migrated: { $ne: true },
      timestamp: { $gte: TWENTY_FOUR_HOURS_AGO }
    });
    console.log(`Needs migration (non-core to non-core): ${needsMigrationKol}`);
    
    const migratedSellKol = await kolCollection.countDocuments({
      classification: { $in: ['migrated_split_sell_24hrs', 'migrated_split_sell'] },
      timestamp: { $gte: TWENTY_FOUR_HOURS_AGO }
    });
    const migratedBuyKol = await kolCollection.countDocuments({
      classification: { $in: ['migrated_split_buy_24hrs', 'migrated_split_buy'] },
      timestamp: { $gte: TWENTY_FOUR_HOURS_AGO }
    });
    console.log(`Migrated SELL records: ${migratedSellKol}`);
    console.log(`Migrated BUY records: ${migratedBuyKol}`);
    
    // Check for new split transactions (from V2 parser)
    console.log('\n📊 NEW SPLIT TRANSACTIONS (V2 Parser - Last 24 Hours):\n');
    
    const newSplitSell = await whaleCollection.countDocuments({
      classification: 'v2_parser_split_sell',
      timestamp: { $gte: TWENTY_FOUR_HOURS_AGO }
    });
    const newSplitBuy = await whaleCollection.countDocuments({
      classification: 'v2_parser_split_buy',
      timestamp: { $gte: TWENTY_FOUR_HOURS_AGO }
    });
    console.log(`Whale - New SELL records: ${newSplitSell}`);
    console.log(`Whale - New BUY records: ${newSplitBuy}`);
    
    const newSplitSellKol = await kolCollection.countDocuments({
      classification: 'v2_parser_split_sell',
      timestamp: { $gte: TWENTY_FOUR_HOURS_AGO }
    });
    const newSplitBuyKol = await kolCollection.countDocuments({
      classification: 'v2_parser_split_buy',
      timestamp: { $gte: TWENTY_FOUR_HOURS_AGO }
    });
    console.log(`KOL - New SELL records: ${newSplitSellKol}`);
    console.log(`KOL - New BUY records: ${newSplitBuyKol}`);
    
    // Sample some "both" type transactions
    if (needsMigration > 0) {
      console.log('\n📋 Sample "Both" Type Transactions (Need Migration):');
      const samples = await whaleCollection.find({
        type: 'both',
        tokenInSymbol: { $nin: CORE_TOKENS },
        tokenOutSymbol: { $nin: CORE_TOKENS },
        migrated: { $ne: true },
        timestamp: { $gte: TWENTY_FOUR_HOURS_AGO }
      })
      .limit(3)
      .toArray();
      
      for (const tx of samples) {
        const txDate = new Date(tx.timestamp);
        console.log(`\n  Signature: ${tx.signature.slice(0, 30)}...`);
        console.log(`  Date: ${txDate.toISOString()}`);
        console.log(`  Tokens: ${tx.tokenInSymbol} → ${tx.tokenOutSymbol}`);
        console.log(`  Sell Amount: $${tx.amount?.sellAmount?.toFixed(2) || 'N/A'}`);
        console.log(`  Buy Amount: $${tx.amount?.buyAmount?.toFixed(2) || 'N/A'}`);
      }
    }
    
    console.log('\n═'.repeat(80));
    console.log('SUMMARY (LAST 24 HOURS)');
    console.log('═'.repeat(80));
    
    console.log('\n📝 Whale Transactions:');
    console.log(`   - Total "both" type: ${totalBoth}`);
    console.log(`   - Already migrated: ${alreadyMigrated}`);
    console.log(`   - Needs migration: ${needsMigration}`);
    console.log(`   - New split transactions: ${newSplitSell + newSplitBuy}`);
    
    console.log('\n📝 KOL Transactions:');
    console.log(`   - Total "both" type: ${totalBothKol}`);
    console.log(`   - Already migrated: ${alreadyMigratedKol}`);
    console.log(`   - Needs migration: ${needsMigrationKol}`);
    console.log(`   - New split transactions: ${newSplitSellKol + newSplitBuyKol}`);
    
    const totalNeedsMigration = needsMigration + needsMigrationKol;
    
    if (totalNeedsMigration > 0) {
      console.log('\n⚠️  ACTION REQUIRED:');
      console.log(`   Run migration script to convert ${totalNeedsMigration} transactions from last 24 hours`);
      console.log('   Command: node migrate-last-24hrs-split-transactions.js');
    } else {
      console.log('\n✅ No migration needed for last 24 hours - all transactions are up to date!');
    }
    
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

console.log('\n🔍 Checking Migration Status (Last 24 Hours Only)\n');
checkLast24HoursStatus();
