/**
 * Quick Deployment Verification
 * Run this to check if the fixes are working
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function verifyDeployment() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;
    const whaleCollection = db.collection('whalealltransactionv2');

    console.log('═══════════════════════════════════════════════════════');
    console.log('  DEPLOYMENT VERIFICATION');
    console.log('═══════════════════════════════════════════════════════\n');

    // Check 1: Recent transactions
    console.log('📊 CHECK 1: Recent Transactions (Last 10)');
    const recent = await whaleCollection
      .find()
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();

    if (recent.length === 0) {
      console.log('⚠️  No recent transactions found');
      console.log('   This might be normal if no whale activity recently');
    } else {
      recent.forEach((tx, i) => {
        const time = new Date(tx.timestamp);
        const age = Math.round((Date.now() - time.getTime()) / 1000 / 60); // minutes ago
        console.log(`\n${i + 1}. ${tx.signature.substring(0, 30)}...`);
        console.log(`   Type: ${tx.type}`);
        console.log(`   ${tx.tokenInSymbol} → ${tx.tokenOutSymbol}`);
        console.log(`   Time: ${age} minutes ago`);
      });
    }

    // Check 2: "both" type in recent data (should be 0)
    console.log('\n\n📊 CHECK 2: "both" Type Transactions (Last Hour)');
    const oneHourAgo = new Date(Date.now() - 3600000);
    const bothCount = await whaleCollection.countDocuments({
      timestamp: { $gte: oneHourAgo },
      type: 'both'
    });

    console.log(`Found: ${bothCount} "both" type transactions`);
    if (bothCount === 0) {
      console.log('✅ GOOD - No "both" types in last hour');
      console.log('   Split swap fix is working!');
    } else {
      console.log('❌ BAD - Still creating "both" types');
      console.log('   The fix might not be deployed correctly');
    }

    // Check 3: Split swaps (same signature, 2 records)
    console.log('\n\n📊 CHECK 3: Split Swaps (Last Hour)');
    const splitSwaps = await whaleCollection.aggregate([
      { $match: { timestamp: { $gte: oneHourAgo } } },
      { $group: { _id: "$signature", count: { $sum: 1 }, types: { $push: "$type" } } },
      { $match: { count: 2 } }
    ]).toArray();

    console.log(`Found: ${splitSwaps.length} split swaps`);
    if (splitSwaps.length > 0) {
      console.log('✅ GOOD - Split swaps are being created correctly');
      splitSwaps.slice(0, 3).forEach((swap, i) => {
        console.log(`\n  ${i + 1}. Signature: ${swap._id.substring(0, 30)}...`);
        console.log(`     Types: ${swap.types.join(', ')}`);
      });
    } else {
      console.log('ℹ️  No split swaps in last hour (might be normal)');
    }

    // Check 4: Old "both" type transactions (total)
    console.log('\n\n📊 CHECK 4: Old "both" Type Transactions (Total)');
    const totalBoth = await whaleCollection.countDocuments({ type: 'both' });
    console.log(`Total "both" type: ${totalBoth}`);
    if (totalBoth > 0) {
      console.log('ℹ️  These are old transactions from before the fix');
      console.log('   Run migrate-old-transactions.js to fix them');
    } else {
      console.log('✅ No "both" type transactions at all!');
    }

    // Check 5: Sample transaction verification
    console.log('\n\n📊 CHECK 5: Sample Transaction Verification');
    const sampleTx = await whaleCollection.findOne({
      timestamp: { $gte: oneHourAgo }
    });

    if (sampleTx) {
      console.log('Sample transaction:');
      console.log(`  Signature: ${sampleTx.signature}`);
      console.log(`  Whale: ${sampleTx.whaleAddress}`);
      console.log(`  Type: ${sampleTx.type}`);
      console.log(`  TokenIn: ${sampleTx.tokenInSymbol} (${sampleTx.transaction?.tokenIn?.amount || 'N/A'})`);
      console.log(`  TokenOut: ${sampleTx.tokenOutSymbol} (${sampleTx.transaction?.tokenOut?.amount || 'N/A'})`);
      console.log('\n  Verify on Solscan:');
      console.log(`  https://solscan.io/tx/${sampleTx.signature}`);
      console.log('\n  Check if direction matches whale\'s actual action');
    } else {
      console.log('No recent transactions to sample');
    }

    // Summary
    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');

    const checks = [
      { name: 'Recent transactions exist', pass: recent.length > 0 },
      { name: 'No new "both" types', pass: bothCount === 0 },
      { name: 'Old "both" types exist', pass: totalBoth > 0, warning: true },
    ];

    checks.forEach(check => {
      if (check.warning) {
        console.log(`⚠️  ${check.name}: ${check.pass ? 'YES' : 'NO'} (needs migration)`);
      } else {
        console.log(`${check.pass ? '✅' : '❌'} ${check.name}`);
      }
    });

    console.log('\n═══════════════════════════════════════════════════════\n');

    if (bothCount === 0 && recent.length > 0) {
      console.log('🎉 DEPLOYMENT SUCCESSFUL!');
      console.log('   The fixes are working correctly.');
      console.log('\nNext steps:');
      console.log('1. Monitor logs: pm2 logs backend --lines 100');
      console.log('2. Verify a few transactions manually on Solscan');
      console.log('3. Run migrate-old-transactions.js to fix old data (optional)');
    } else if (recent.length === 0) {
      console.log('⏳ WAITING FOR TRANSACTIONS');
      console.log('   No recent whale activity. Check back in a few minutes.');
    } else {
      console.log('⚠️  POTENTIAL ISSUES DETECTED');
      console.log('   Check the results above and verify deployment.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

verifyDeployment();
