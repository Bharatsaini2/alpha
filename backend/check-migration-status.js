/**
 * Quick Check: Migration Status
 * 
 * Run this to see:
 * 1. How many "both" type transactions exist
 * 2. How many have already been migrated
 * 3. How many need migration
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'alpha-whale-tracker';

const CORE_TOKENS = [
  'SOL', 'WSOL', 'USDC', 'USDT', 'PYUSD', 'USDS', 'DAI', 'EURC', 'USDH',
  'jupSOL', 'bSOL', 'mSOL', 'stSOL', 'jitoSOL', 'JLP', 'wBTC', 'wETH'
];

async function checkStatus() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    
    console.log('═'.repeat(80));
    console.log('MIGRATION STATUS CHECK');
    console.log('═'.repeat(80));
    
    // Check whale transactions
    console.log('\n📊 WHALE TRANSACTIONS:\n');
    const whaleCollection = db.collection('whalealltransactionv2');
    
    const totalBoth = await whaleCollection.countDocuments({ type: 'both' });
    console.log(`Total "both" type transactions: ${totalBoth}`);
    
    const alreadyMigrated = await whaleCollection.countDocuments({ 
      type: 'both',
      migrated: true 
    });
    console.log(`Already migrated: ${alreadyMigrated}`);
    
    const needsMigration = await whaleCollection.countDocuments({
      type: 'both',
      tokenInSymbol: { $nin: CORE_TOKENS },
      tokenOutSymbol: { $nin: CORE_TOKENS },
      migrated: { $ne: true }
    });
    console.log(`Needs migration (non-core to non-core): ${needsMigration}`);
    
    const migratedSell = await whaleCollection.countDocuments({
      classification: 'migrated_split_sell'
    });
    const migratedBuy = await whaleCollection.countDocuments({
      classification: 'migrated_split_buy'
    });
    console.log(`Migrated SELL records: ${migratedSell}`);
    console.log(`Migrated BUY records: ${migratedBuy}`);
    
    // Check KOL transactions
    console.log('\n📊 KOL TRANSACTIONS:\n');
    const kolCollection = db.collection('influencerwhaletransactionsv2');
    
    const totalBothKol = await kolCollection.countDocuments({ type: 'both' });
    console.log(`Total "both" type transactions: ${totalBothKol}`);
    
    const alreadyMigratedKol = await kolCollection.countDocuments({ 
      type: 'both',
      migrated: true 
    });
    console.log(`Already migrated: ${alreadyMigratedKol}`);
    
    const needsMigrationKol = await kolCollection.countDocuments({
      type: 'both',
      tokenInSymbol: { $nin: CORE_TOKENS },
      tokenOutSymbol: { $nin: CORE_TOKENS },
      migrated: { $ne: true }
    });
    console.log(`Needs migration (non-core to non-core): ${needsMigrationKol}`);
    
    const migratedSellKol = await kolCollection.countDocuments({
      classification: 'migrated_split_sell'
    });
    const migratedBuyKol = await kolCollection.countDocuments({
      classification: 'migrated_split_buy'
    });
    console.log(`Migrated SELL records: ${migratedSellKol}`);
    console.log(`Migrated BUY records: ${migratedBuyKol}`);
    
    // Check for new split transactions (from V2 parser)
    console.log('\n📊 NEW SPLIT TRANSACTIONS (V2 Parser):\n');
    
    const newSplitSell = await whaleCollection.countDocuments({
      classification: 'v2_parser_split_sell'
    });
    const newSplitBuy = await whaleCollection.countDocuments({
      classification: 'v2_parser_split_buy'
    });
    console.log(`Whale - New SELL records: ${newSplitSell}`);
    console.log(`Whale - New BUY records: ${newSplitBuy}`);
    
    const newSplitSellKol = await kolCollection.countDocuments({
      classification: 'v2_parser_split_sell'
    });
    const newSplitBuyKol = await kolCollection.countDocuments({
      classification: 'v2_parser_split_buy'
    });
    console.log(`KOL - New SELL records: ${newSplitSellKol}`);
    console.log(`KOL - New BUY records: ${newSplitBuyKol}`);
    
    console.log('\n═'.repeat(80));
    console.log('SUMMARY');
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
    
    if (needsMigration > 0 || needsMigrationKol > 0) {
      console.log('\n⚠️  ACTION REQUIRED:');
      console.log(`   Run migration script to convert ${needsMigration + needsMigrationKol} transactions`);
      console.log('   Command: node migrate-old-split-transactions.js');
    } else {
      console.log('\n✅ No migration needed - all transactions are up to date!');
    }
    
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

console.log('\n🔍 Checking Migration Status\n');
checkStatus();
