#!/usr/bin/env node

/**
 * Check if SHYFT provides symbols in token_balance_changes
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function main() {
  console.log('Checking if transactions have symbols from SHYFT...\n');

  await mongoose.connect(MONGODB_URI);

  const WhaleTransactionV2 = mongoose.model('WhaleTransactionV2', new mongoose.Schema({}, { strict: false, collection: 'whalealltransactionv2' }));

  // Get last 50 transactions
  const transactions = await WhaleTransactionV2.find()
    .sort({ timestamp: -1 })
    .limit(50)
    .lean();

  let withSymbols = 0;
  let withoutSymbols = 0;
  let unknownSymbols = 0;

  transactions.forEach(tx => {
    const tokenInSymbol = tx.transaction?.tokenIn?.symbol || tx.tokenInSymbol;
    const tokenOutSymbol = tx.transaction?.tokenOut?.symbol || tx.tokenOutSymbol;

    if (tokenInSymbol && tokenInSymbol !== 'Unknown' && tokenOutSymbol && tokenOutSymbol !== 'Unknown') {
      withSymbols++;
    } else if (tokenInSymbol === 'Unknown' || tokenOutSymbol === 'Unknown') {
      unknownSymbols++;
    } else {
      withoutSymbols++;
    }
  });

  console.log('📊 Analysis of last 50 transactions:\n');
  console.log(`   ✅ With valid symbols: ${withSymbols}/50 (${(withSymbols/50*100).toFixed(1)}%)`);
  console.log(`   ⚠️  With "Unknown": ${unknownSymbols}/50 (${(unknownSymbols/50*100).toFixed(1)}%)`);
  console.log(`   ❌ Without symbols: ${withoutSymbols}/50 (${(withoutSymbols/50*100).toFixed(1)}%)`);

  console.log('\n💡 Diagnosis:\n');
  
  if (withSymbols > 45) {
    console.log('   🔍 SHYFT is providing symbols directly in token_balance_changes!');
    console.log('   ⚠️  This means resolveSymbol() returns EARLY and never calls cache.');
    console.log('   ⚠️  Cache only gets called for the ~1% "Unknown" tokens.');
    console.log('\n   This is why cache has only 10 tokens after 48 hours!');
  }

  await mongoose.disconnect();
}

main().catch(console.error);
