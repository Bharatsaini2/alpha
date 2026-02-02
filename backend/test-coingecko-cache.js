/**
 * Test Script for CoinGecko Token Metadata Caching
 * 
 * This script tests:
 * 1. CoinGecko API fetching
 * 2. MongoDB cache saving
 * 3. Cache retrieval
 * 4. In-memory cache
 * 
 * Usage: node test-coingecko-cache.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Use compiled JavaScript files from dist folder
const { getTokenMetaDataUsingRPC } = require('./dist/config/solana-tokens-config');
const TokenMetadataCacheModel = require('./dist/models/token-metadata-cache.model').default;

// Test tokens (well-known Solana tokens)
const TEST_TOKENS = [
  {
    name: 'Solana',
    address: 'So11111111111111111111111111111111111111112',
    expectedSymbol: 'SOL'
  },
  {
    name: 'USDC',
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    expectedSymbol: 'USDC'
  },
  {
    name: 'Bonk',
    address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    expectedSymbol: 'BONK'
  },
  {
    name: 'Jupiter',
    address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    expectedSymbol: 'JUP'
  }
];

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    log('green', '✅ Connected to MongoDB');
  } catch (error) {
    log('red', `❌ MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
}

async function clearTestCache() {
  try {
    const addresses = TEST_TOKENS.map(t => t.address);
    const result = await TokenMetadataCacheModel.deleteMany({
      tokenAddress: { $in: addresses }
    });
    log('yellow', `🗑️  Cleared ${result.deletedCount} test entries from cache`);
  } catch (error) {
    log('red', `❌ Failed to clear cache: ${error.message}`);
  }
}

async function checkCacheEntry(tokenAddress) {
  try {
    const cached = await TokenMetadataCacheModel.findOne({ tokenAddress }).lean();
    if (cached) {
      log('green', `  ✅ Found in DB cache:`);
      log('cyan', `     Symbol: ${cached.symbol}`);
      log('cyan', `     Name: ${cached.name}`);
      log('cyan', `     Source: ${cached.source}`);
      log('cyan', `     Last Updated: ${cached.lastUpdated}`);
      return true;
    } else {
      log('red', `  ❌ NOT found in DB cache`);
      return false;
    }
  } catch (error) {
    log('red', `  ❌ Error checking cache: ${error.message}`);
    return false;
  }
}

async function testTokenFetch(token, testNumber) {
  log('blue', `\n${'='.repeat(60)}`);
  log('blue', `Test ${testNumber}: ${token.name} (${token.address.slice(0, 8)}...)`);
  log('blue', '='.repeat(60));

  try {
    const startTime = Date.now();
    const result = await getTokenMetaDataUsingRPC(token.address);
    const duration = Date.now() - startTime;

    log('cyan', `\n📊 Result:`);
    log('cyan', `   Symbol: ${result.symbol}`);
    log('cyan', `   Name: ${result.name}`);
    log('cyan', `   Duration: ${duration}ms`);

    // Verify result
    if (result.symbol === token.expectedSymbol) {
      log('green', `   ✅ Symbol matches expected: ${token.expectedSymbol}`);
    } else {
      log('yellow', `   ⚠️  Symbol mismatch. Expected: ${token.expectedSymbol}, Got: ${result.symbol}`);
    }

    // Check if saved to cache
    log('cyan', `\n🔍 Checking MongoDB cache...`);
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for async save
    const inCache = await checkCacheEntry(token.address);

    return { success: true, duration, inCache, result };
  } catch (error) {
    log('red', `❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testCacheHit(token) {
  log('blue', `\n${'='.repeat(60)}`);
  log('blue', `Cache Hit Test: ${token.name}`);
  log('blue', '='.repeat(60));

  try {
    const startTime = Date.now();
    const result = await getTokenMetaDataUsingRPC(token.address);
    const duration = Date.now() - startTime;

    log('cyan', `\n📊 Result:`);
    log('cyan', `   Symbol: ${result.symbol}`);
    log('cyan', `   Name: ${result.name}`);
    log('cyan', `   Duration: ${duration}ms`);

    if (duration < 100) {
      log('green', `   ✅ Fast response (${duration}ms) - likely from cache!`);
    } else {
      log('yellow', `   ⚠️  Slow response (${duration}ms) - might not be cached`);
    }

    return { success: true, duration, result };
  } catch (error) {
    log('red', `❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function viewAllCachedTokens() {
  log('blue', `\n${'='.repeat(60)}`);
  log('blue', `All Cached Tokens in Database`);
  log('blue', '='.repeat(60));

  try {
    const allCached = await TokenMetadataCacheModel.find({})
      .sort({ lastUpdated: -1 })
      .limit(20)
      .lean();

    if (allCached.length === 0) {
      log('yellow', '⚠️  No tokens in cache');
      return;
    }

    log('cyan', `\nFound ${allCached.length} cached tokens (showing last 20):\n`);

    allCached.forEach((token, index) => {
      const age = Math.floor((Date.now() - new Date(token.lastUpdated).getTime()) / 1000);
      const ageStr = age < 60 ? `${age}s ago` : 
                     age < 3600 ? `${Math.floor(age / 60)}m ago` :
                     age < 86400 ? `${Math.floor(age / 3600)}h ago` :
                     `${Math.floor(age / 86400)}d ago`;

      log('cyan', `${index + 1}. ${token.symbol} (${token.name})`);
      log('cyan', `   Address: ${token.tokenAddress.slice(0, 8)}...${token.tokenAddress.slice(-8)}`);
      log('cyan', `   Source: ${token.source} | Updated: ${ageStr}`);
      console.log('');
    });

    // Count by source
    const sourceCounts = allCached.reduce((acc, token) => {
      acc[token.source] = (acc[token.source] || 0) + 1;
      return acc;
    }, {});

    log('magenta', '\n📊 Cache Statistics:');
    Object.entries(sourceCounts).forEach(([source, count]) => {
      log('magenta', `   ${source}: ${count} tokens`);
    });

  } catch (error) {
    log('red', `❌ Error viewing cache: ${error.message}`);
  }
}

async function runTests() {
  console.log('\n');
  log('magenta', '╔════════════════════════════════════════════════════════════╗');
  log('magenta', '║   CoinGecko Token Metadata Cache Test Suite               ║');
  log('magenta', '╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  await connectDB();

  // Step 1: View existing cache
  log('yellow', '\n📋 STEP 1: View existing cached tokens');
  await viewAllCachedTokens();

  // Step 2: Clear test tokens from cache
  log('yellow', '\n🧹 STEP 2: Clear test tokens from cache');
  await clearTestCache();

  // Step 3: Test fetching (should hit CoinGecko API)
  log('yellow', '\n🔄 STEP 3: Fetch tokens (should call CoinGecko API)');
  const results = [];
  for (let i = 0; i < TEST_TOKENS.length; i++) {
    const result = await testTokenFetch(TEST_TOKENS[i], i + 1);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s between calls
  }

  // Step 4: Test cache hits (should be fast)
  log('yellow', '\n⚡ STEP 4: Fetch same tokens again (should hit cache)');
  const cacheResults = [];
  for (const token of TEST_TOKENS) {
    const result = await testCacheHit(token);
    cacheResults.push(result);
    await new Promise(resolve => setTimeout(resolve, 500)); // Short delay
  }

  // Step 5: View cache again
  log('yellow', '\n📋 STEP 5: View updated cache');
  await viewAllCachedTokens();

  // Summary
  log('blue', `\n${'='.repeat(60)}`);
  log('blue', 'Test Summary');
  log('blue', '='.repeat(60));

  const successCount = results.filter(r => r.success).length;
  const cachedCount = results.filter(r => r.inCache).length;
  const avgFirstFetch = results.filter(r => r.success).reduce((sum, r) => sum + r.duration, 0) / successCount;
  const avgCacheFetch = cacheResults.filter(r => r.success).reduce((sum, r) => sum + r.duration, 0) / cacheResults.length;

  log('cyan', `\n📊 Results:`);
  log('cyan', `   Successful fetches: ${successCount}/${TEST_TOKENS.length}`);
  log('cyan', `   Cached in DB: ${cachedCount}/${TEST_TOKENS.length}`);
  log('cyan', `   Avg first fetch time: ${Math.round(avgFirstFetch)}ms`);
  log('cyan', `   Avg cache fetch time: ${Math.round(avgCacheFetch)}ms`);
  log('cyan', `   Speed improvement: ${Math.round((avgFirstFetch / avgCacheFetch) * 10) / 10}x faster`);

  if (cachedCount === TEST_TOKENS.length && avgCacheFetch < 100) {
    log('green', '\n✅ ALL TESTS PASSED! Caching is working correctly.');
  } else if (cachedCount === TEST_TOKENS.length) {
    log('yellow', '\n⚠️  Tokens are cached but retrieval is slow. Check MongoDB connection.');
  } else {
    log('red', '\n❌ TESTS FAILED! Some tokens were not cached properly.');
  }

  await mongoose.disconnect();
  log('green', '\n✅ Disconnected from MongoDB');
}

// Run tests
runTests().catch(error => {
  log('red', `\n❌ Test suite failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
