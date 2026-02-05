el/**
 * Migration Script: Fix Old Transactions
 * 
 * This script fixes two bugs in existing transactions:
 * 1. Split Swap Bug - Converts "both" type to 2 separate transactions
 * 2. Inversion Bug - Flips incorrectly classified BUY/SELL transactions
 * 
 * IMPORTANT: Run this AFTER deploying the fixed code
 * IMPORTANT: Test on a small batch first before running on all data
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Configuration
const DRY_RUN = true; // Set to false to actually make changes
const BATCH_SIZE = 100; // Process in batches to avoid memory issues

async function migrateSplitSwaps() {
  console.log('\n📊 MIGRATION 1: Split Swap Bug Fix');
  console.log('Converting "both" type transactions to 2 separate records\n');

  const db = mongoose.connection.db;
  const whaleCollection = db.collection('whalealltransactionv2');
  const kolCollection = db.collection('influencerwhaletransactionsv2');

  // Find all "both" type transactions
  const bothWhaleTransactions = await whaleCollection.find({ type: 'both' }).toArray();
  const bothKolTransactions = await kolCollection.find({ type: 'both' }).toArray();

  console.log(`Found ${bothWhaleTransactions.length} whale "both" transactions`);
  console.log(`Found ${bothKolTransactions.length} KOL "both" transactions`);

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made');
    console.log('Sample whale transaction:');
    if (bothWhaleTransactions.length > 0) {
      const sample = bothWhaleTransactions[0];
      console.log(`  Signature: ${sample.signature}`);
      console.log(`  Type: ${sample.type}`);
      console.log(`  TokenIn: ${sample.tokenInSymbol}`);
      console.log(`  TokenOut: ${sample.tokenOutSymbol}`);
      console.log('\nWould create:');
      console.log(`  1. SELL record: ${sample.tokenInSymbol} → ${sample.tokenOutSymbol}`);
      console.log(`  2. BUY record: ${sample.tokenOutSymbol} → ${sample.tokenInSymbol}`);
    }
    return;
  }

  // Process whale transactions
  let whaleCreated = 0;
  let whaleDeleted = 0;
  for (const tx of bothWhaleTransactions) {
    try {
      // Create SELL record
      const sellRecord = {
        ...tx,
        _id: new mongoose.Types.ObjectId(),
        type: 'sell',
        // Keep tokenIn/tokenOut as is for SELL
      };
      delete sellRecord.__v;

      // Create BUY record
      const buyRecord = {
        ...tx,
        _id: new mongoose.Types.ObjectId(),
        type: 'buy',
        // Swap tokenIn/tokenOut for BUY
        tokenInSymbol: tx.tokenOutSymbol,
        tokenOutSymbol: tx.tokenInSymbol,
        tokenInAddress: tx.tokenOutAddress,
        tokenOutAddress: tx.tokenInAddress,
        inTokenURL: tx.outTokenURL,
        outTokenURL: tx.inTokenURL,
      };
      delete buyRecord.__v;

      // Insert new records
      await whaleCollection.insertOne(sellRecord);
      await whaleCollection.insertOne(buyRecord);
      whaleCreated += 2;

      // Delete old "both" record
      await whaleCollection.deleteOne({ _id: tx._id });
      whaleDeleted++;

      console.log(`✅ Migrated whale transaction: ${tx.signature}`);
    } catch (error) {
      console.error(`❌ Error migrating whale transaction ${tx.signature}:`, error.message);
    }
  }

  // Process KOL transactions (same logic)
  let kolCreated = 0;
  let kolDeleted = 0;
  for (const tx of bothKolTransactions) {
    try {
      const sellRecord = {
        ...tx,
        _id: new mongoose.Types.ObjectId(),
        type: 'sell',
      };
      delete sellRecord.__v;

      const buyRecord = {
        ...tx,
        _id: new mongoose.Types.ObjectId(),
        type: 'buy',
        tokenInSymbol: tx.tokenOutSymbol,
        tokenOutSymbol: tx.tokenInSymbol,
        tokenInAddress: tx.tokenOutAddress,
        tokenOutAddress: tx.tokenInAddress,
        inTokenURL: tx.outTokenURL,
        outTokenURL: tx.inTokenURL,
      };
      delete buyRecord.__v;

      await kolCollection.insertOne(sellRecord);
      await kolCollection.insertOne(buyRecord);
      kolCreated += 2;

      await kolCollection.deleteOne({ _id: tx._id });
      kolDeleted++;

      console.log(`✅ Migrated KOL transaction: ${tx.signature}`);
    } catch (error) {
      console.error(`❌ Error migrating KOL transaction ${tx.signature}:`, error.message);
    }
  }

  console.log('\n📊 Split Swap Migration Summary:');
  console.log(`Whale: Created ${whaleCreated} records, Deleted ${whaleDeleted} "both" records`);
  console.log(`KOL: Created ${kolCreated} records, Deleted ${kolDeleted} "both" records`);
}

async function migrateInvertedTransactions() {
  console.log('\n📊 MIGRATION 2: Inversion Bug Fix');
  console.log('This is more complex and requires manual verification\n');

  console.log('⚠️  WARNING: Automatically detecting inverted transactions is difficult');
  console.log('Recommended approach:');
  console.log('1. Identify specific signatures that are inverted');
  console.log('2. Manually verify each one');
  console.log('3. Run targeted fix for those signatures');
  console.log('\nSkipping automatic inversion fix for safety.');
  console.log('Use the manual fix script if needed.');
}

async function main() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected\n');

    console.log('═══════════════════════════════════════════════════════');
    console.log('  OLD TRANSACTION MIGRATION SCRIPT');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Mode: ${DRY_RUN ? '⚠️  DRY RUN (no changes)' : '🔥 LIVE (will make changes)'}`);
    console.log('═══════════════════════════════════════════════════════\n');

    // Migration 1: Split Swaps
    await migrateSplitSwaps();

    // Migration 2: Inverted Transactions (manual only)
    await migrateInvertedTransactions();

    console.log('\n✅ Migration complete!');

    if (DRY_RUN) {
      console.log('\n⚠️  This was a DRY RUN - no changes were made');
      console.log('To apply changes, set DRY_RUN = false in the script');
    }

  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

main();
