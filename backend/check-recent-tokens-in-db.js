#!/usr/bin/env node

/**
 * Check recent transactions in the CORRECT collection (whalealltransactionv2)
 * and see what token symbols are stored
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function checkRecentTokens() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              Recent Tokens in Database (whalealltransactionv2)                 ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  // Use the CORRECT collection name (without 's')
  const coll = mongoose.connection.db.collection('whalealltransactionv2');
  
  const total = await coll.countDocuments();
  console.log(`📊 Total transactions: ${total}\n`);

  // Get last 20 transactions
  const recent = await coll.find({}).sort({ createdAt: -1 }).limit(20).toArray();
  
  console.log('📝 Last 20 Transactions:\n');
  
  recent.forEach((tx, i) => {
    const age = tx.createdAt ? (Date.now() - new Date(tx.createdAt).getTime()) / 1000 / 60 : null;
    
    console.log(`${i + 1}. ${tx.signature?.substring(0, 20)}...`);
    console.log(`   Type: ${tx.type}`);
    console.log(`   Token In: ${tx.tokenInSymbol || tx.transaction?.tokenIn?.symbol || 'N/A'}`);
    console.log(`   Token Out: ${tx.tokenOutSymbol || tx.transaction?.tokenOut?.symbol || 'N/A'}`);
    
    if (age !== null) {
      console.log(`   Age: ${age.toFixed(1)} minutes ago`);
    }
    console.log('');
  });

  // Count Unknown tokens
  const unknownCount = await coll.countDocuments({
    $or: [
      { tokenInSymbol: 'Unknown' },
      { tokenOutSymbol: 'Unknown' },
      { 'transaction.tokenIn.symbol': 'Unknown' },
      { 'transaction.tokenOut.symbol': 'Unknown' }
    ]
  });

  console.log('─'.repeat(80));
  console.log(`\n⚠️  Transactions with "Unknown" tokens: ${unknownCount} / ${total}`);
  console.log(`   That's ${((unknownCount / total) * 100).toFixed(1)}% of all transactions\n`);

  // Check for specific test tokens
  console.log('─'.repeat(80));
  console.log('\n🔍 Checking Test Tokens:\n');

  const testTokens = [
    { address: 'GB8KtQfMChhYrCYtd5PoAB42kAdkHnuyAincSSmFpump', expected: 'PIGEON' },
    { address: 'kMKX8hBaj3BTRBbeYix9c16EieBP5dih8DTSSwCpump', expected: 'afk' },
    { address: '8Jx8AAHj86wbQgUTjGuj6GTTL5Ps3cqxKRTvpaJApump', expected: 'PENGUIN' },
  ];

  for (const test of testTokens) {
    const found = await coll.findOne({
      $or: [
        { tokenInAddress: test.address },
        { tokenOutAddress: test.address },
        { 'transaction.tokenIn.address': test.address },
        { 'transaction.tokenOut.address': test.address }
      ]
    });

    console.log(`Token: ${test.address.substring(0, 8)}... (expected: ${test.expected})`);
    
    if (found) {
      const actualSymbol = 
        (found.tokenInAddress === test.address ? found.tokenInSymbol : null) ||
        (found.tokenOutAddress === test.address ? found.tokenOutSymbol : null) ||
        (found.transaction?.tokenIn?.address === test.address ? found.transaction.tokenIn.symbol : null) ||
        (found.transaction?.tokenOut?.address === test.address ? found.transaction.tokenOut.symbol : null);
      
      console.log(`   ${actualSymbol === test.expected ? '✅' : '❌'} Found in DB: ${actualSymbol}`);
      console.log(`   Transaction: ${found.signature?.substring(0, 20)}...`);
      console.log(`   Created: ${found.createdAt}`);
    } else {
      console.log(`   ❌ Not found in database`);
    }
    console.log('');
  }

  // Check if tokenmetadatacache exists
  console.log('─'.repeat(80));
  console.log('\n🔍 Checking Cache Collection:\n');

  const collections = await mongoose.connection.db.listCollections().toArray();
  const hasCache = collections.some(c => c.name === 'tokenmetadatacache');

  if (hasCache) {
    console.log('✅ tokenmetadatacache collection EXISTS');
    
    const cacheColl = mongoose.connection.db.collection('tokenmetadatacache');
    const cacheCount = await cacheColl.countDocuments();
    console.log(`   Cached tokens: ${cacheCount}`);
    
    if (cacheCount > 0) {
      const recentCache = await cacheColl.find({}).sort({ createdAt: -1 }).limit(5).toArray();
      console.log('\n   Recent cache entries:');
      recentCache.forEach((token, i) => {
        console.log(`      ${i + 1}. ${token.symbol} (${token.name}) - source: ${token.source}`);
      });
    }
  } else {
    console.log('❌ tokenmetadatacache collection DOES NOT EXIST');
    console.log('   This means the new code is NOT deployed or NOT running');
  }

  console.log('\n✅ Check complete!\n');
  await mongoose.disconnect();
}

checkRecentTokens().catch(console.error);
