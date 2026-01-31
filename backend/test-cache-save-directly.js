#!/usr/bin/env node

/**
 * Test if we can save to cache directly
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

// Define the cache schema
const tokenMetadataCacheSchema = new mongoose.Schema({
  tokenAddress: String,
  symbol: String,
  name: String,
  source: String,
  lastUpdated: Date,
  createdAt: Date
}, { collection: 'tokenmetadatacache' });

async function main() {
  console.log('Testing direct cache save...\n');

  await mongoose.connect(MONGODB_URI);
  
  const TokenMetadataCacheModel = mongoose.model('TokenMetadataCache', tokenMetadataCacheSchema);

  // Try to save a test token
  const testToken = {
    tokenAddress: 'TEST123456789ABCDEF',
    symbol: 'TEST',
    name: 'Test Token',
    source: 'dexscreener',
    lastUpdated: new Date()
  };

  try {
    const saved = await TokenMetadataCacheModel.findOneAndUpdate(
      { tokenAddress: testToken.tokenAddress },
      { $set: testToken },
      { upsert: true, new: true }
    );
    
    console.log('✅ Successfully saved test token to cache!');
    console.log(`   Token: ${saved.symbol} (${saved.name})`);
    console.log(`   Address: ${saved.tokenAddress}`);
    
    // Verify it's there
    const found = await TokenMetadataCacheModel.findOne({ tokenAddress: testToken.tokenAddress });
    if (found) {
      console.log('\n✅ Verified: Token found in cache!');
    }
    
    // Clean up test token
    await TokenMetadataCacheModel.deleteOne({ tokenAddress: testToken.tokenAddress });
    console.log('\n🧹 Cleaned up test token');
    
  } catch (error) {
    console.error('❌ Failed to save to cache:', error.message);
  }

  // Now check the actual cache
  const count = await TokenMetadataCacheModel.countDocuments();
  console.log(`\n📊 Current cache size: ${count} tokens`);

  // Check if mongoose connection is working
  console.log(`\n🔍 MongoDB connection state: ${mongoose.connection.readyState}`);
  console.log('   (1 = connected, 0 = disconnected)');

  await mongoose.disconnect();
}

main().catch(console.error);
