#!/usr/bin/env node

/**
 * Script to clean up poisoned cache entries (LOCAL VERSION - MongoDB only)
 * Run this locally when Redis is not available
 */

require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/alpha-tracker';

// Token metadata cache model
const tokenMetadataCacheSchema = new mongoose.Schema({
  tokenAddress: { type: String, required: true, unique: true },
  symbol: { type: String, required: true },
  name: { type: String, required: true },
  source: { type: String, required: true },
  lastUpdated: { type: Date, default: Date.now },
}, { timestamps: true, collection: 'tokenmetadatacache' });

const TokenMetadataCacheModel = mongoose.model('TokenMetadataCache', tokenMetadataCacheSchema);

async function cleanupPoisonedCacheLocal() {
  console.log('🧹 Starting LOCAL cache cleanup for poisoned entries...');
  console.log('ℹ️ This version only cleans MongoDB (Redis cleanup skipped)');
  
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
    
    // ⚠️ Redis cleanup skipped (not available locally)
    console.log('⚠️ Redis cleanup skipped (run full script on server for Redis cleanup)');
    
    // ✅ Show remaining cache stats
    const remainingCount = await TokenMetadataCacheModel.countDocuments();
    console.log(`📊 Remaining valid cache entries: ${remainingCount}`);
    
    // ✅ Show sample of remaining entries
    const samples = await TokenMetadataCacheModel.find().limit(5).lean();
    console.log('\n📋 Sample remaining entries:');
    samples.forEach(entry => {
      console.log(`   ${entry.tokenAddress.slice(0, 8)}... → ${entry.symbol} [${entry.source}]`);
    });
    
    console.log('\n✅ LOCAL cache cleanup completed successfully!');
    console.log('ℹ️ Run the full cleanup script on the server to clean Redis as well');
    
  } catch (error) {
    console.error('❌ Error during cache cleanup:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run cleanup
cleanupPoisonedCacheLocal().then(() => {
  console.log('🎉 LOCAL cleanup script finished');
  process.exit(0);
}).catch(error => {
  console.error('💥 LOCAL cleanup script failed:', error);
  process.exit(1);
});