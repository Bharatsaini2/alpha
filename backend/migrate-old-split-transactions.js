/**
 * Migration Script: Convert old "both" type non-core to non-core transactions into split transactions
 * 
 * This script:
 * 1. Finds old "both" type transactions where both tokens are non-core
 * 2. Creates 2 new records (SELL + BUY) for each
 * 3. Marks the original as migrated (doesn't delete it)
 * 4. Creates backup before migration
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

async function migrateSplitTransactions() {
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
      console.log(`MIGRATING ${type.toUpperCase()} TRANSACTIONS`);
      console.log('═'.repeat(80));
      
      const collection = db.collection(collectionName);
      
      // Find old "both" type transactions with non-core tokens
      const query = {
        type: 'both',
        tokenInSymbol: { $nin: CORE_TOKENS },
        tokenOutSymbol: { $nin: CORE_TOKENS },
        migrated: { $ne: true } // Skip already migrated
      };
      
      const oldTransactions = await collection.find(query).toArray();
      
      console.log(`\n📊 Found ${oldTransactions.length} old "both" type transactions to migrate\n`);
      
      if (oldTransactions.length === 0) {
        console.log('✅ No transactions to migrate\n');
        continue;
      }
      
      // Create backup
      const backupFile = `migration-backups/split-migration-${type}-${Date.now()}.json`;
      if (!DRY_RUN) {
        fs.writeFileSync(backupFile, JSON.stringify(oldTransactions, null, 2));
        console.log(`📦 Backup created: ${backupFile}\n`);
      }
      
      let migratedCount = 0;
      let errorCount = 0;
      
      for (const oldTx of oldTransactions) {
        try {
          console.log(`\n🔄 Processing: ${oldTx.signature.slice(0, 30)}...`);
          console.log(`   ${oldTx.tokenInSymbol} → ${oldTx.tokenOutSymbol}`);
          
          // Extract amounts from bothType array
          const bothType = oldTx.bothType?.[0] || {};
          const sellAmount = oldTx.tokenAmount?.sellTokenAmount || oldTx.tokenInAmount || 0;
          const buyAmount = oldTx.tokenAmount?.buyTokenAmount || oldTx.tokenOutAmount || 0;
          const sellValue = oldTx.amount?.sellAmount || oldTx.tokenInUsdAmount || 0;
          const buyValue = oldTx.amount?.buyAmount || oldTx.tokenOutUsdAmount || 0;
          
          // Create SELL record
          const sellRecord = {
            ...oldTx,
            _id: undefined, // Let MongoDB generate new ID
            type: 'sell',
            classification: 'migrated_split_sell',
            originalId: oldTx._id,
            originalType: 'both',
            migratedAt: new Date(),
            tokenAmount: sellAmount,
            amount: sellValue,
            isBuy: false,
            isSell: true
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
            tokenAmount: buyAmount,
            amount: buyValue,
            isBuy: true,
            isSell: false
          };
          
          if (DRY_RUN) {
            console.log(`   [DRY RUN] Would create:`);
            console.log(`     - SELL: ${oldTx.tokenInSymbol} (${sellAmount} tokens, $${sellValue})`);
            console.log(`     - BUY: ${oldTx.tokenOutSymbol} (${buyAmount} tokens, $${buyValue})`);
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
                  migratedTo: 'split_transactions'
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
    console.log('MIGRATION COMPLETE');
    console.log('═'.repeat(80));
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await client.close();
  }
}

// Run migration
console.log('\n🚀 Starting Split Transaction Migration\n');
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will modify database)'}\n`);

migrateSplitTransactions();
