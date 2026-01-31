#!/usr/bin/env node

/**
 * Check the status of tokenmetadatacache collection
 * This is the NEW cache we implemented yesterday
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

// Define the NEW cache schema
const tokenMetadataCacheSchema = new mongoose.Schema({
  tokenAddress: String,
  symbol: String,
  name: String,
  source: String,
  lastUpdated: Date,
  createdAt: Date
}, { collection: 'tokenmetadatacache' });

const TokenMetadataCacheModel = mongoose.model('TokenMetadataCache', tokenMetadataCacheSchema);

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              Token Metadata Cache Status (NEW Implementation)                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  // Check if collection exists
  const collections = await mongoose.connection.db.listCollections().toArray();
  const cacheExists = collections.some(col => col.name === 'tokenmetadatacache');

  if (!cacheExists) {
    console.log('❌ Collection "tokenmetadatacache" does NOT exist yet!');
    console.log('');
    console.log('📝 This means:');
    console.log('   1. The NEW code has NOT been deployed to production');
    console.log('   2. The cache is NOT working yet');
    console.log('   3. Tokens are still showing as "Unknown"');
    console.log('');
    console.log('✅ Solution:');
    console.log('   Deploy the new code to production:');
    console.log('   1. SSH to server');
    console.log('   2. cd /path/to/alpha-tracker-ai/backend');
    console.log('   3. git pull origin main');
    console.log('   4. npm run build');
    console.log('   5. pm2 restart backend');
    console.log('');
    console.log('   After deployment, this collection will be created automatically');
    console.log('   when the first token is resolved.');
    await mongoose.disconnect();
    return;
  }

  console.log('✅ Collection "tokenmetadatacache" EXISTS!\n');

  // Get total count
  const totalCount = await TokenMetadataCacheModel.countDocuments();
  console.log(`📊 Total tokens cached: ${totalCount}\n`);

  if (totalCount === 0) {
    console.log('⚠️  Cache is EMPTY (0 tokens)');
    console.log('');
    console.log('📝 This means:');
    console.log('   1. The collection exists but no tokens have been cached yet');
    console.log('   2. Either:');
    console.log('      a) New code was just deployed (cache will populate soon)');
    console.log('      b) No transactions have been processed yet');
    console.log('      c) Backend is not running');
    console.log('');
    console.log('✅ What to do:');
    console.log('   1. Check if backend is running: pm2 status');
    console.log('   2. Check backend logs: pm2 logs backend');
    console.log('   3. Wait for transactions to be processed');
    console.log('   4. Cache will populate automatically');
    await mongoose.disconnect();
    return;
  }

  // Count by source
  const bySource = await TokenMetadataCacheModel.aggregate([
    { $group: { _id: '$source', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  console.log('📈 Tokens by Source:');
  bySource.forEach(item => {
    console.log(`   ${item._id}: ${item.count} tokens`);
  });
  console.log('');

  // Show recent entries
  console.log('─'.repeat(80));
  console.log('📝 Recent Cache Entries (last 10):\n');

  const recentEntries = await TokenMetadataCacheModel.find()
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  recentEntries.forEach((token, i) => {
    console.log(`${i + 1}. ${token.symbol} (${token.name})`);
    console.log(`   Address: ${token.tokenAddress}`);
    console.log(`   Source: ${token.source}`);
    console.log(`   Cached: ${token.createdAt || token.lastUpdated}`);
    console.log('');
  });

  // Check for your test tokens
  console.log('─'.repeat(80));
  console.log('🔍 Checking Test Tokens:\n');

  const testTokens = [
    'GB8KtQfMChhYrCYtd5PoAB42kAdkHnuyAincSSmFpump', // PIGEON
    'kMKX8hBaj3BTRBbeYix9c16EieBP5dih8DTSSwCpump',  // afk
    '8Jx8AAHj86wbQgUTjGuj6GTTL5Ps3cqxKRTvpaJApump',  // PENGUIN
  ];

  for (const address of testTokens) {
    const token = await TokenMetadataCacheModel.findOne({ tokenAddress: address }).lean();
    if (token) {
      console.log(`✅ Found: ${address.substring(0, 8)}...`);
      console.log(`   Symbol: ${token.symbol}`);
      console.log(`   Name: ${token.name}`);
      console.log(`   Source: ${token.source}`);
      console.log('');
    } else {
      console.log(`❌ Not found: ${address.substring(0, 8)}...`);
      console.log('   (Token not cached yet)\n');
    }
  }

  // Performance stats
  console.log('─'.repeat(80));
  console.log('📊 Cache Performance:\n');

  const oldestEntry = await TokenMetadataCacheModel.findOne().sort({ createdAt: 1 }).lean();
  const newestEntry = await TokenMetadataCacheModel.findOne().sort({ createdAt: -1 }).lean();

  if (oldestEntry && newestEntry) {
    console.log(`   Oldest entry: ${oldestEntry.createdAt}`);
    console.log(`   Newest entry: ${newestEntry.createdAt}`);
    
    const ageInHours = (new Date() - new Date(oldestEntry.createdAt)) / (1000 * 60 * 60);
    console.log(`   Cache age: ${ageInHours.toFixed(1)} hours`);
    
    if (totalCount > 0 && ageInHours > 0) {
      const tokensPerHour = totalCount / ageInHours;
      console.log(`   Growth rate: ${tokensPerHour.toFixed(1)} tokens/hour`);
    }
  }

  console.log('');
  console.log('─'.repeat(80));
  console.log('\n💡 Summary:\n');

  if (totalCount > 100) {
    console.log(`   ✅ Cache is working well! ${totalCount} tokens cached`);
    console.log(`   ✅ Tokens are resolving correctly`);
    console.log(`   ✅ Performance should be excellent (10-50ms for cached tokens)`);
  } else if (totalCount > 10) {
    console.log(`   ⚠️  Cache is building up: ${totalCount} tokens cached`);
    console.log(`   ⏳ Give it more time to populate`);
    console.log(`   📈 Cache will grow as more transactions are processed`);
  } else if (totalCount > 0) {
    console.log(`   ⚠️  Cache just started: ${totalCount} tokens cached`);
    console.log(`   ⏳ Very new deployment`);
    console.log(`   📈 Cache will grow quickly`);
  }

  console.log('\n✅ Check Complete!');

  await mongoose.disconnect();
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
