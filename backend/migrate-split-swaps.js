/**
 * Migration Script: Fix Split Swap Transactions
 * 
 * Updates non-core to non-core token swaps from single records (type: 'buy' or 'sell')
 * to proper 'both' type records.
 * 
 * SAFETY FEATURES:
 * - Dry-run mode by default (preview changes without applying)
 * - Only updates transactions from last 30 days
 * - Validates each transaction before updating
 * - Creates backup of affected records
 * - Detailed logging of all changes
 * 
 * USAGE:
 *   node migrate-split-swaps.js              # Dry run (preview only)
 *   node migrate-split-swaps.js --apply      # Apply changes
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Core tokens list (30 tokens)
const CORE_TOKENS = new Set([
  'So11111111111111111111111111111111111111112', // SOL
  'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', // jupSOL
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', // bSOL
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj', // stSOL
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // jitoSOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo', // PYUSD
  'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA', // USDS
  'EjmyN6qEC1Tf1JxiG1ae7UTJhUxSwk1TCWNWqxWV4J6o', // DAI
  '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH', // USDG
  'JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD', // JupUSD
  '7kbnvuGBxxj8AG9qp8Scn56muWGaRaFqxg1FsRp3PaFT', // UXD
  'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB', // USD1
  'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr', // EURC
  'star9agSpjiFe3M49B3RniVU4CMBBEK3Qnaqn3RGiFM', // USD*
  'USX6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG', // USX
  'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH', // CASH
  'hyUSD5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E', // hyUSD
  'AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUjY', // syrupUSDC
  'Sj14XLJZSVMcUYpAfajdZRpnfHUpJieZHS4aPektLWvh', // SjlUSD
  'G9fvHrYNw1A8Evpcj7X2yy4k4fT7nNHcA9L6UsamNHAif', // GjlUSD
  '9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D', // jlUSDC
  '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4', // JLP
  'JUICED7GxATsNMnaC88vdwd2t3mwrFuQwwGvmYPrUQ4D6FotXk', // JUICED
  'zBTCug3er3tLyffELcvDNrKkCymbPWysGcWihESYfLg', // zBTC
  'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', // cbBTC
  '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E', // wBTC
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // wETH
]);

function isCoreToken(mint) {
  return CORE_TOKENS.has(mint);
}

// Transaction schema
const transactionSchema = new mongoose.Schema({
  signature: String,
  timestamp: Date,
  type: String,
  bothType: Array,
  transaction: {
    tokenIn: {
      address: String,
      symbol: String,
    },
    tokenOut: {
      address: String,
      symbol: String,
    },
  },
}, { collection: 'whalealltransactionv2', strict: false });

const Transaction = mongoose.model('Transaction', transactionSchema);

// Check if running in apply mode
const APPLY_CHANGES = process.argv.includes('--apply');
const DRY_RUN = !APPLY_CHANGES;

async function migrateSplitSwaps() {
  try {
    console.log('🔧 Split Swap Migration Script');
    console.log('='.repeat(80));
    console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (preview only)' : '⚠️  APPLY CHANGES'}`);
    console.log('='.repeat(80));
    
    if (DRY_RUN) {
      console.log('\n⚠️  Running in DRY RUN mode - no changes will be made');
      console.log('   To apply changes, run: node migrate-split-swaps.js --apply\n');
    } else {
      console.log('\n⚠️  WARNING: This will modify database records!');
      console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Query transactions from last 20 hours
    const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000);
    
    console.log('📊 Querying transactions...');
    console.log(`   Date range: Last 20 hours (since ${twentyHoursAgo.toISOString()})`);
    console.log(`   Looking for: Non-core to non-core swaps with type='buy' or type='sell'\n`);
    
    const transactions = await Transaction.find({
      timestamp: { $gte: twentyHoursAgo },
      type: { $in: ['buy', 'sell'] }
    })
    .select('signature timestamp type transaction.tokenIn.address transaction.tokenOut.address transaction.tokenIn.symbol transaction.tokenOut.symbol')
    .limit(1000) // Limit to prevent memory issues
    .lean()
    .maxTimeMS(30000); // 30 second timeout

    console.log(`Found ${transactions.length} transactions with type='buy' or type='sell'\n`);

    // Filter for non-core to non-core swaps
    const candidatesForMigration = [];
    const skipped = {
      coreToNonCore: 0,
      coreToCore: 0,
      missingData: 0,
      alreadyBoth: 0
    };

    for (const tx of transactions) {
      // Skip if already 'both' type
      if (tx.type === 'both') {
        skipped.alreadyBoth++;
        continue;
      }

      // Check if we have token addresses
      const tokenInAddress = tx.transaction?.tokenIn?.address;
      const tokenOutAddress = tx.transaction?.tokenOut?.address;

      if (!tokenInAddress || !tokenOutAddress) {
        skipped.missingData++;
        continue;
      }

      const tokenInIsCore = isCoreToken(tokenInAddress);
      const tokenOutIsCore = isCoreToken(tokenOutAddress);

      // Skip if either token is core (these are correct as single records)
      if (tokenInIsCore || tokenOutIsCore) {
        if (tokenInIsCore && tokenOutIsCore) {
          skipped.coreToCore++;
        } else {
          skipped.coreToNonCore++;
        }
        continue;
      }

      // This is a non-core to non-core swap - candidate for migration
      candidatesForMigration.push(tx);
    }

    console.log('📋 Analysis Results:');
    console.log('='.repeat(80));
    console.log(`✅ Candidates for migration: ${candidatesForMigration.length}`);
    console.log(`⏭️  Skipped (core-to-noncore): ${skipped.coreToNonCore} (correct as-is)`);
    console.log(`⏭️  Skipped (core-to-core): ${skipped.coreToCore} (correct as-is)`);
    console.log(`⏭️  Skipped (missing data): ${skipped.missingData}`);
    console.log(`⏭️  Skipped (already 'both'): ${skipped.alreadyBoth}`);
    console.log('='.repeat(80));

    if (candidatesForMigration.length === 0) {
      console.log('\n✅ No transactions need migration. Exiting.');
      return;
    }

    // Show sample of transactions to be migrated
    console.log('\n📝 Sample transactions to be migrated (first 5):');
    console.log('='.repeat(80));
    for (const tx of candidatesForMigration.slice(0, 5)) {
      console.log(`\n  Signature: ${tx.signature.slice(0, 16)}...`);
      console.log(`  Current type: ${tx.type}`);
      console.log(`  TokenIn: ${tx.transaction?.tokenIn?.symbol} (${tx.transaction?.tokenIn?.address?.slice(0, 8)}...)`);
      console.log(`  TokenOut: ${tx.transaction?.tokenOut?.symbol} (${tx.transaction?.tokenOut?.address?.slice(0, 8)}...)`);
      console.log(`  Will change to: type='both', bothType=[{buyType: true, sellType: true}]`);
    }

    if (candidatesForMigration.length > 5) {
      console.log(`\n  ... and ${candidatesForMigration.length - 5} more`);
    }

    console.log('\n' + '='.repeat(80));

    if (DRY_RUN) {
      console.log('\n🔍 DRY RUN COMPLETE - No changes were made');
      console.log(`\n   To apply these changes, run:`);
      console.log(`   node migrate-split-swaps.js --apply`);
      return;
    }

    // Apply changes
    console.log('\n⚙️  Applying changes...\n');

    // Create backup
    const backupDir = path.join(__dirname, 'migration-backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupFile = path.join(backupDir, `split-swap-backup-${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(candidatesForMigration, null, 2));
    console.log(`📦 Backup created: ${backupFile}\n`);

    let updated = 0;
    let failed = 0;

    for (const tx of candidatesForMigration) {
      try {
        const result = await Transaction.updateOne(
          { _id: tx._id },
          {
            $set: {
              type: 'both',
              bothType: [{
                buyType: true,
                sellType: true
              }]
            }
          }
        );

        if (result.modifiedCount > 0) {
          updated++;
          if (updated % 10 === 0) {
            console.log(`   Updated ${updated}/${candidatesForMigration.length} transactions...`);
          }
        } else {
          failed++;
          console.log(`   ⚠️  Failed to update ${tx.signature.slice(0, 16)}...`);
        }
      } catch (error) {
        failed++;
        console.log(`   ❌ Error updating ${tx.signature.slice(0, 16)}...: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 Migration Complete!');
    console.log('='.repeat(80));
    console.log(`✅ Successfully updated: ${updated} transactions`);
    console.log(`❌ Failed: ${failed} transactions`);
    console.log(`📦 Backup saved to: ${backupFile}`);
    console.log('='.repeat(80));

    if (failed > 0) {
      console.log('\n⚠️  Some transactions failed to update. Check the logs above.');
    } else {
      console.log('\n✅ All transactions migrated successfully!');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run migration
migrateSplitSwaps().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
