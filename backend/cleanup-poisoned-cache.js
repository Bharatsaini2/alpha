#!/usr/bin/env node

/**
 * Script to clean up poisoned cache entries
 * Run this once after deploying the fixes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Redis = require('ioredis');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/alpha-tracker';

// Redis connection
const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryStrategy: () => null, // Don't retry, fail fast
  lazyConnect: true,
});

// Handle Redis connection errors gracefully
redisClient.on('error', (err) => {
  console.log('⚠️ Redis connection failed:', err.message);
});

// Token metadata cache model
const tokenMetadataCacheSchema = new mongoose.Schema({
  tokenAddress: { type: String, required: true, unique: true },
  symbol: { type: String, required: true },
  name: { type: String, required: true },
  source: { type: String, required: true },
  lastUpdated: { type: Date, default: Date.now },
}, { timestamps: true, collection: 'tokenmetadatacache' });

const TokenMetadataCacheModel = mongoose.model('TokenMetadataCache', tokenMetadataCacheSchema);

async function cleanupPoisonedCache() {
  console.log('🧹 Starting cache cleanup for poisoned entries...');
  
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // ✅ Remove shortened addresses and garbage symbols from MongoDB cache
    const result = await TokenMetadataCacheModel.deleteMany({
      $or: [
        { symbol: { $regex: /^[A-Za-z0-9]{3,4}\.\.\.[A-Za-z0-9]{3,4}$/ } },
        { symbol: 'Unknown' }, { symbol: 'unknown' }, { symbol: 'UNKNOWN' },
        { symbol: 'Token' }, { symbol: 'token' }, { symbol: 'TOKEN' },
        { symbol: 'localhost' }, { symbol: 'LOCALHOST' },
        { symbol: 'pump' }, { symbol: 'PUMP' },
        { symbol: 'unknown token' }, { symbol: 'UNKNOWN TOKEN' },
        { symbol: 'test' }, { symbol: 'TEST' },
        { symbol: 'null' }, { symbol: 'NULL' },
        { symbol: 'undefined' }, { symbol: 'UNDEFINED' },
        { symbol: 'N/A' }, { symbol: 'n/a' },
        { symbol: 'TBD' }, { symbol: 'tbd' },
        { symbol: '???' }, { symbol: '...' },
        { symbol: 'TEMP' }, { symbol: 'temp' },
        { symbol: 'PLACEHOLDER' }, { symbol: 'placeholder' },
        { symbol: { $regex: /^[A-Fa-f0-9]{40,50}$/ } }, // Addresses
        { symbol: { $regex: /^0x[a-fA-F0-9]+$/ } }, // Ethereum addresses
        { symbol: { $regex: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ } }, // Solana addresses
        { symbol: '' }, // Empty symbols
        { symbol: null }, // Null symbols
      ]
    });
    
    console.log(`🗑️ Removed ${result.deletedCount} poisoned cache entries from MongoDB`);
    
    // ✅ Clear Redis failed resolution keys (if Redis is available)
    try {
      const keys = await redisClient.keys('failed_resolution:*');
      if (keys.length > 0) {
        await redisClient.del(...keys);
        console.log(`🗑️ Cleared ${keys.length} failed resolution entries from Redis`);
      } else {
        console.log('ℹ️ No failed resolution entries found in Redis');
      }
    } catch (error) {
      console.log('⚠️ Redis not available, skipping Redis cleanup:', error.message);
    }
    
    // ✅ Clear Redis token image cache (optional - will be rebuilt)
    const imageKeys = await redisClient.keys('token:image:*');
    if (imageKeys.length > 0) {
      console.log(`Found ${imageKeys.length} image cache entries (keeping them)`);
    }
    
    // ✅ Show remaining cache stats
    const remainingCount = await TokenMetadataCacheModel.countDocuments();
    console.log(`📊 Remaining valid cache entries: ${remainingCount}`);
    
    // ✅ Show sample of remaining entries
    const samples = await TokenMetadataCacheModel.find().limit(5).lean();
    console.log('\n📋 Sample remaining entries:');
    samples.forEach(entry => {
      console.log(`   ${entry.tokenAddress.slice(0, 8)}... → ${entry.symbol} [${entry.source}]`);
    });
    
    console.log('\n✅ Cache cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during cache cleanup:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    await redisClient.quit();
    console.log('🔌 Disconnected from databases');
  }
}

// Run cleanup
cleanupPoisonedCache().then(() => {
  console.log('🎉 Cleanup script finished');
  process.exit(0);
}).catch(error => {
  console.error('💥 Cleanup script failed:', error);
  process.exit(1);
});