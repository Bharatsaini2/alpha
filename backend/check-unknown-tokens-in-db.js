#!/usr/bin/env node

/**
 * Check for Unknown tokens in recent transactions
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function main() {
  console.log('Checking for Unknown tokens in database...\n');

  await mongoose.connect(MONGODB_URI);

  const WhaleTransactionV2 = mongoose.model('WhaleTransactionV2', new mongoose.Schema({}, { strict: false, collection: 'whalealltransactionv2' }));

  // Find transactions with "Unknown" in the last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const unknownTransactions = await WhaleTransactionV2.find({
    timestamp: { $gte: oneDayAgo },
    $or: [
      { 'transaction.tokenIn.symbol': 'Unknown' },
      { 'transaction.tokenOut.symbol': 'Unknown' },
      { tokenInSymbol: 'Unknown' },
      { tokenOutSymbol: 'Unknown' }
    ]
  })
    .sort({ timestamp: -1 })
    .limit(10)
    .lean();

  console.log(`Found ${unknownTransactions.length} transactions with "Unknown" tokens in last 24 hours\n`);

  if (unknownTransactions.length === 0) {
    console.log('✅ NO "Unknown" tokens found in last 24 hours!');
    console.log('\nThis means the cache is working perfectly!');
    console.log('All tokens are being resolved correctly.');
  } else {
    console.log('═'.repeat(80));
    unknownTransactions.forEach((tx, i) => {
      console.log(`\n${i + 1}. Transaction: ${tx.signature?.substring(0, 16)}...`);
      console.log(`   Type: ${tx.type}`);
      console.log(`   Timestamp: ${tx.timestamp}`);
      console.log(`   TokenIn: ${tx.transaction?.tokenIn?.symbol || tx.tokenInSymbol} (${tx.transaction?.tokenIn?.address?.substring(0, 8) || tx.tokenInAddress?.substring(0, 8)}...)`);
      console.log(`   TokenOut: ${tx.transaction?.tokenOut?.symbol || tx.tokenOutSymbol} (${tx.transaction?.tokenOut?.address?.substring(0, 8) || tx.tokenOutAddress?.substring(0, 8)}...)`);
    });
  }

  // Also check total count in last 24 hours
  const totalCount = await WhaleTransactionV2.countDocuments({
    timestamp: { $gte: oneDayAgo }
  });

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`\n📊 Statistics (last 24 hours):\n`);
  console.log(`   Total transactions: ${totalCount}`);
  console.log(`   Transactions with "Unknown": ${unknownTransactions.length}`);
  console.log(`   Success rate: ${((totalCount - unknownTransactions.length) / totalCount * 100).toFixed(2)}%`);

  await mongoose.disconnect();
}

main().catch(console.error);
