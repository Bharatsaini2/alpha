// Migration script to split old "both" type transactions into SELL + BUY
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'alpha-whale-tracker';

// Dry run by default - set to false to actually migrate
const DRY_RUN = process.argv.includes('--execute');

async function migrateSplitTransactions() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    if (DRY_RUN) {
      console.log('🔍 DRY RUN MODE - No changes will be made');
      console.log('   Run with --execute flag to actually migrate\n');
    } else {
      console.log('⚠️  EXECUTE MODE - Changes will be made to database!\n');
    }
    
    const db = client.db(DB_NAME);
    
    // Migrate whale transactions
    console.log('═'.repeat(80));
    console.log('MIGRATING WHALE TRANSACTIONS');
    console.log('═'.repeat(80));
    await migrateCollection(db, 'whalealltransactionv2', 'whale');
    
    // Migrate KOL transactions
    console.log('\n' + '═'.repeat(80));
    console.log('MIGRATING KOL TRANSACTIONS');
    console.log('═'.repeat(80));
    await migrateCollection(db, 'influencerwhaletransactionsv2', 'kol');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

async function migrateCollection(db, collectionName, type) {
  const collection = db.collection(collectionName);
  
  const coreTokens = ['SOL', 'WSOL', 'USDC', 'USDT', 'PYUSD', 'USDS', 'DAI', 'EURC', 'USDH', 'jupSOL', 'bSOL', 'mSOL', 'stSOL', 'jitoSOL', 'JLP', 'wBTC', 'wETH'];
  
  // Find "both" type transactions where both tokens are non-core
  const bothTypeTransactions = await collection.find({
    type: 'both',
    tokenInSymbol: { $nin: coreTokens },
    tokenOutSymbol: { $nin: coreTokens }
  }).toArray();
  
  console.log(`\n📊 Found ${bothTypeTransactions.length} "both" type non-core to non-core transactions\n`);
  
  if (bothTypeTransactions.length === 0) {
    console.log('✅ No transactions to migrate');
    return;
  }
  
  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const tx of bothTypeTransactions) {
    try {
      console.log(`\nProcessing: ${tx.signature.slice(0, 30)}...`);
      console.log(`  ${tx.tokenInSymbol} → ${tx.tokenOutSymbol}`);
      
      // Create SELL record
      const sellRecord = {
        ...tx,
        _id: new ObjectId(), // New ID
        type: 'sell',
        classification: 'v2_parser_split_sell_migrated',
        isBuy: false,
        isSell: true,
        migrated: true,
        migratedFrom: tx._id,
        migratedAt: new Date()
      };
      
      // Create BUY record
      const buyRecord = {
        ...tx,
        _id: new ObjectId(), // New ID
        type: 'buy',
        classification: 'v2_parser_split_buy_migrated',
        isBuy: true,
        isSell: false,
        migrated: true,
        migratedFrom: tx._id,
        migratedAt: new Date()
      };
      
      if (!DRY_RUN) {
        // Insert new records
        await collection.insertOne(sellRecord);
        await collection.insertOne(buyRecord);
        
        // Mark original as migrated (don't delete, keep for reference)
        await collection.updateOne(
          { _id: tx._id },
          { 
            $set: { 
              migrated: true,
              migratedTo: [sellRecord._id, buyRecord._id],
              migratedAt: new Date()
            }
          }
        );
        
        console.log(`  ✅ Created SELL + BUY records, marked original as migrated`);
      } else {
        console.log(`  [DRY RUN] Would create SELL + BUY records`);
      }
      
      migrated++;
      
    } catch (error) {
      console.error(`  ❌ Error migrating ${tx.signature}:`, error.message);
      errors++;
    }
  }
  
  console.log('\n' + '─'.repeat(80));
  console.log('SUMMARY');
  console.log('─'.repeat(80));
  console.log(`Total found: ${bothTypeTransactions.length}`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
  
  if (DRY_RUN) {
    console.log('\n💡 Run with --execute flag to actually perform migration');
  } else {
    console.log('\n✅ Migration complete!');
    console.log('\nNote: Original "both" type records are kept with migrated=true flag');
    console.log('      New SELL + BUY records have classification ending in "_migrated"');
  }
}

// Run migration
console.log('🔄 Starting Split Transaction Migration\n');
migrateSplitTransactions();
