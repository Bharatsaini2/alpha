#!/usr/bin/env node

/**
 * Check what symbols are in recent transactions
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function main() {
  console.log('Checking recent transaction symbols...\n');

  await mongoose.connect(MONGODB_URI);

  const WhaleTransactionV2 = mongoose.model('WhaleTransactionV2', new mongoose.Schema({}, { strict: false, collection: 'whalealltransactionv2' }));

  // Get last 20 transactions
  const transactions = await WhaleTransactionV2.find()
    .sort({ timestamp: -1 })
    .limit(20)
    .lean();

  console.log(`Found ${transactions.length} recent transactions\n`);
  console.log('─'.repeat(80));

  transactions.forEach((tx, i) => {
    console.log(`\n${i + 1}. Transaction: ${tx.signature?.substring(0, 16)}...`);
    console.log(`   Type: ${tx.type}`);
    console.log(`   TokenIn: ${tx.tokenIn?.symbol || 'N/A'} (${tx.tokenIn?.token_address?.substring(0, 8)}...)`);
    console.log(`   TokenOut: ${tx.tokenOut?.symbol || 'N/A'} (${tx.tokenOut?.token_address?.substring(0, 8)}...)`);
    console.log(`   Timestamp: ${tx.timestamp}`);
  });

  console.log('\n' + '─'.repeat(80));
  console.log('\n🔍 Analysis:\n');

  const unknownCount = transactions.filter(tx => 
    (tx.tokenIn?.symbol === 'Unknown' || tx.tokenOut?.symbol === 'Unknown')
  ).length;

  const emptyCount = transactions.filter(tx => 
    (!tx.tokenIn?.symbol || !tx.tokenOut?.symbol)
  ).length;

  console.log(`   Transactions with "Unknown": ${unknownCount}/${transactions.length}`);
  console.log(`   Transactions with empty symbol: ${emptyCount}/${transactions.length}`);
  console.log(`   Transactions that should trigger cache: ${unknownCount + emptyCount}/${transactions.length}`);

  await mongoose.disconnect();
}

main().catch(console.error);
