#!/usr/bin/env node

/**
 * Check if backend is processing transactions correctly
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function main() {
  console.log('Checking backend transaction processing...\n');

  await mongoose.connect(MONGODB_URI);

  const WhaleTransactionV2 = mongoose.model('WhaleTransactionV2', new mongoose.Schema({}, { strict: false, collection: 'whalealltransactionv2' }));

  // Get last 5 transactions with FULL data
  const transactions = await WhaleTransactionV2.find()
    .sort({ timestamp: -1 })
    .limit(5)
    .lean();

  console.log(`Found ${transactions.length} recent transactions\n`);
  console.log('═'.repeat(80));

  transactions.forEach((tx, i) => {
    console.log(`\n${i + 1}. Transaction: ${tx.signature}`);
    console.log(`   Type: ${tx.type}`);
    console.log(`   Timestamp: ${tx.timestamp}`);
    console.log(`   WhaleAddress: ${tx.whaleAddress}`);
    console.log(`\n   📦 Full transaction object structure:`);
    console.log(`   - Has 'transaction' field: ${!!tx.transaction}`);
    console.log(`   - Has 'transaction.tokenIn': ${!!tx.transaction?.tokenIn}`);
    console.log(`   - Has 'transaction.tokenOut': ${!!tx.transaction?.tokenOut}`);
    
    if (tx.transaction) {
      console.log(`\n   🔍 transaction.tokenIn:`);
      console.log(`      ${JSON.stringify(tx.transaction.tokenIn, null, 6)}`);
      console.log(`\n   🔍 transaction.tokenOut:`);
      console.log(`      ${JSON.stringify(tx.transaction.tokenOut, null, 6)}`);
    }
    
    console.log(`\n   📝 Legacy fields (for comparison):`);
    console.log(`   - tokenInSymbol: ${tx.tokenInSymbol}`);
    console.log(`   - tokenOutSymbol: ${tx.tokenOutSymbol}`);
    console.log(`   - tokenInAddress: ${tx.tokenInAddress}`);
    console.log(`   - tokenOutAddress: ${tx.tokenOutAddress}`);
  });

  console.log('\n' + '═'.repeat(80));
  console.log('\n🔍 Diagnosis:\n');

  const withTokenData = transactions.filter(tx => tx.transaction?.tokenIn && tx.transaction?.tokenOut).length;
  const withLegacyData = transactions.filter(tx => tx.tokenInSymbol && tx.tokenOutSymbol).length;

  console.log(`   Transactions with transaction.tokenIn/tokenOut: ${withTokenData}/${transactions.length}`);
  console.log(`   Transactions with legacy tokenInSymbol/tokenOutSymbol: ${withLegacyData}/${transactions.length}`);
  
  if (withTokenData === 0 && withLegacyData > 0) {
    console.log(`\n   ⚠️  PROBLEM: Transactions have legacy fields but NOT new 'transaction' structure!`);
    console.log(`   This means the backend code is NOT matching the deployed version.`);
  } else if (withTokenData === 0 && withLegacyData === 0) {
    console.log(`\n   ❌ CRITICAL: Transactions have NO token data at all!`);
    console.log(`   The backend is saving transactions but failing to extract token info.`);
  } else {
    console.log(`\n   ✅ Transactions have proper token data structure.`);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
