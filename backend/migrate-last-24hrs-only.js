/**
 * Migration Script: Convert "both" type transactions from LAST 24 HOURS ONLY
 * 
 * This script:
 * 1. Finds "both" type transactions from last 24 hours where both tokens are non-core
 * 2. Creates 2 new records (SELL + BUY) for each
 * 3. Marks the original as migrated (doesn't delete it)
 * 4. Creates automatic backup
 */

const { MongoClient } = require('mongodb');
const fs = require('fs');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'alpha-whale-tracker';

const CORE_TOKENS = [
  'SOL', 'WSOL', 'USDC', 'USDT', 'PYUSD', 'USDS', 'DAI', 'EURC', 'USDH',
  'jupSOL', 'bSOL', 'mSOL', 'stSOL', 'jitoSOL', 'JLP', 'wBTC', 'wETH'
];

// Dry run mode - set to false to actually perform migration
const DRY_RUN = true;

// Time range: Last 24 hours
const TWENTY_FOUR_HOURS_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000);

async function migrateLast24Hours() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    
    // Process both whale and KOL transactions
    const collections = [
      { name: 'whalealltransactionv2', type: 'whale' },
      { name: 'influencerwhaletransactionsv2', type: 'kol' }
    ];
    
    for (const { name: collectionName, type } of collections) {
      console.log('═'.repeat(80));
      console.log(`MIGRATING ${type.toUpperCase()} TRANSACTIONS (LAST 24 HOURS)`);
      console.log('═'.repeat(80));
      
      const collection = db.collection(collectionName);
      
      // Find old "both" type transactions from last 24 hours with non-core tokens
      const query = {
        type: 'both',
        tokenInSymbol: { $nin: CORE_TOKENS },
        tokenOutSymbol: { $nin: CORE_TOKENS },
        migrated: { $ne: true },
        timestamp: { $gte: TWENTY_FOUR_HOURS_AGO } // ✅ Only last 24 hours
      };
      
      const oldTransactions = await collection.find(query).toArray();
      
      console.log(`\n📊 Found ${oldTransactions.length} "both" type transactions from last 24 hours to migrate`);
      console.log(`   Time range: ${TWENTY_FOUR_HOURS_AGO.toISOString()} to now\n`);
      
      if (oldTransactions.length === 0) {
        console.log('✅ No transactions to migrate\n');
        continue;
      }
      
      // Create backup
      const backupFile = `migration-backups/split-migration-24hrs-${type}-${Date.now()}.json`;
      if (!DRY_RUN) {
        if (!fs.existsSync('migration-backups')) {
          fs.mkdirSync('migration-backups');
        }
        fs.writeFileSync(backupFile, JSON.stringify(oldTransactions, null, 2));
        console.log(`📦 Backup created: ${backupFile}\n`);
      }
      
      let migratedCount = 0;
      let errorCount = 0;
      
      for (const oldTx of oldTransactions) {
        try {
          const txDate = new Date(oldTx.timestamp);
          console.log(`\n🔄 Processing: ${oldTx.signature.slice(0, 30)}...`);
          console.log(`   Date: ${txDate.toISOString()}`);
          console.log(`   ${oldTx.tokenInSymbol} → ${oldTx.tokenOutSymbol}`);
          
          // Extract amounts - handle different data structures
          const sellAmount = oldTx.tokenAmount?.sellTokenAmount || 0;
          const buyAmount = oldTx.tokenAmount?.buyTokenAmount || 0;
          
          // Handle amount object which might be a number or object
          let sellValue = 0;
          let buyValue = 0;
          
          if (typeof oldTx.amount === 'object' && oldTx.amount !== null) {
            sellValue = oldTx.amount.sellAmount || 0;
            buyValue = oldTx.amount.buyAmount || 0;
          } else if (typeof oldTx.amount === 'number') {
            // If amount is a single number, use it for both
            sellValue = oldTx.amount;
            buyValue = oldTx.amount;
          }
          
          // Create SELL record
          const sellRecord = {
            ...oldTx,
            _id: undefined, // Let MongoDB generate new ID
            type: 'sell',
            classification: 'migrated_split_sell',
            originalId: oldTx._id,
            originalType: 'both',
            migratedAt: new Date(),
            migratedFrom24HrWindow: true,
            // Keep only sell-related data
            amount: {
              buyAmount: 0,
              sellAmount: sellValue
            },
            tokenAmount: {
              buyTokenAmount: 0,
              sellTokenAmount: sellAmount
            }
          };
          
          // Create BUY record
          const buyRecord = {
            ...oldTx,
            _id: undefined, // Let MongoDB generate new ID
            type: 'buy',
            classification: 'migrated_split_buy',
            originalId: oldTx._id,
            originalType: 'both',
            migratedAt: new Date(),
            migratedFrom24HrWindow: true,
            // Keep only buy-related data
            amount: {
              buyAmount: buyValue,
              sellAmount: 0
            },
            tokenAmount: {
              buyTokenAmount: buyAmount,
              sellTokenAmount: 0
            }
          };
          
          if (DRY_RUN) {
            console.log(`   [DRY RUN] Would create:`);
            console.log(`     - SELL: ${oldTx.tokenInSymbol} (${sellAmount} tokens, $${Number(sellValue).toFixed(2)})`);
            console.log(`     - BUY: ${oldTx.tokenOutSymbol} (${buyAmount} tokens, $${Number(buyValue).toFixed(2)})`);
          } else {
            // Insert new records
            await collection.insertOne(sellRecord);
            await collection.insertOne(buyRecord);
            
            // Mark original as migrated (don't delete it)
            await collection.updateOne(
              { _id: oldTx._id },
              { 
                $set: { 
                  migrated: true,
                  migratedAt: new Date(),
                  migratedTo: 'split_transactions',
                  migratedFrom24HrWindow: true
                }
              }
            );
            
            console.log(`   ✅ Created SELL and BUY records`);
            console.log(`   ✅ Marked original as migrated`);
          }
          
          migratedCount++;
          
        } catch (error) {
          console.error(`   ❌ Error migrating ${oldTx.signature}:`, error.message);
          errorCount++;
        }
      }
      
      console.log('\n' + '─'.repeat(80));
      console.log(`\n📊 Migration Summary for ${type}:`);
      console.log(`   Time range: Last 24 hours`);
      console.log(`   Total found: ${oldTransactions.length}`);
      console.log(`   Successfully migrated: ${migratedCount}`);
      console.log(`   Errors: ${errorCount}`);
      
      if (DRY_RUN) {
        console.log(`\n⚠️  DRY RUN MODE - No changes made to database`);
        console.log(`   Set DRY_RUN = false to perform actual migration`);
      } else {
        console.log(`\n✅ Migration complete!`);
        console.log(`   Backup saved to: ${backupFile}`);
      }
      
      console.log('');
    }
    
    console.log('═'.repeat(80));
    console.log('MIGRATION COMPLETE (LAST 24 HOURS ONLY)');
    console.log('═'.repeat(80));
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await client.close();
  }
}

// Run migration
console.log('\n🚀 Starting Split Transaction Migration (Last 24 Hours Only)\n');
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will modify database)'}`);
console.log(`Time range: ${TWENTY_FOUR_HOURS_AGO.toISOString()} to now\n`);

migrateLast24Hours();
