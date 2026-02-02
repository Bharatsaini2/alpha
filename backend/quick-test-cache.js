/**
 * Quick Cache Test - Single Token
 * 
 * Usage: node quick-test-cache.js [token_address]
 * Example: node quick-test-cache.js DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Use compiled JavaScript files from dist folder
const { getTokenMetaDataUsingRPC } = require('./dist/config/solana-tokens-config');
const TokenMetadataCacheModel = require('./dist/models/token-metadata-cache.model').default;

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

// Get token address from command line or use default (BONK)
const tokenAddress = process.argv[2] || 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

async function quickTest() {
  console.log('\n🔍 Quick Cache Test\n');
  console.log(`Token Address: ${tokenAddress}\n`);

  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check if already in cache
    console.log('📋 Checking cache...');
    const cached = await TokenMetadataCacheModel.findOne({ tokenAddress }).lean();
    
    if (cached) {
      console.log('✅ Found in cache:');
      console.log(`   Symbol: ${cached.symbol}`);
      console.log(`   Name: ${cached.name}`);
      console.log(`   Source: ${cached.source}`);
      console.log(`   Last Updated: ${cached.lastUpdated}\n`);
    } else {
      console.log('❌ Not in cache\n');
    }

    // Fetch token metadata
    console.log('🔄 Fetching token metadata...');
    const startTime = Date.now();
    const result = await getTokenMetaDataUsingRPC(tokenAddress);
    const duration = Date.now() - startTime;

    console.log('\n📊 Result:');
    console.log(`   Symbol: ${result.symbol}`);
    console.log(`   Name: ${result.name}`);
    console.log(`   Duration: ${duration}ms`);

    if (duration < 100) {
      console.log('   ⚡ Fast! (likely from cache)');
    } else {
      console.log('   🌐 Slow (likely from API)');
    }

    // Check cache again
    console.log('\n🔍 Checking cache again...');
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for async save
    const cachedAfter = await TokenMetadataCacheModel.findOne({ tokenAddress }).lean();
    
    if (cachedAfter) {
      console.log('✅ Now in cache:');
      console.log(`   Symbol: ${cachedAfter.symbol}`);
      console.log(`   Name: ${cachedAfter.name}`);
      console.log(`   Source: ${cachedAfter.source}`);
      console.log(`   Last Updated: ${cachedAfter.lastUpdated}`);
    } else {
      console.log('❌ Still not in cache (this is a problem!)');
    }

    await mongoose.disconnect();
    console.log('\n✅ Test complete\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

quickTest();
