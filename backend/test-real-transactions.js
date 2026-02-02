/**
 * Test Real Transactions from Database
 * 
 * This script:
 * 1. Reads real transactions from your database
 * 2. Finds transactions with "Unknown" token symbols
 * 3. Tests the SHYFT fallback logic on them
 * 4. Shows how CoinGecko would resolve them
 * 
 * Usage: node test-real-transactions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

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

// Import the actual resolveSymbol logic
async function resolveSymbol(token, getTokenMetaDataUsingRPC) {
  try {
    // ✅ STEP 1: Check if SHYFT already provided valid symbol (FASTEST - no API call!)
    if (token.symbol && 
        token.symbol !== 'Unknown' && 
        token.symbol !== 'Token' && 
        token.symbol.trim() !== '' && 
        !token.symbol.includes('...')) {
      
      log('green', `  ✅ Using SHYFT symbol: ${token.symbol} (no API call needed)`);
      return { 
        symbol: token.symbol, 
        name: token.name || token.symbol,
        source: 'shyft',
        apiCalled: false
      };
    }
    
    log('yellow', `  ⚠️ SHYFT symbol is "${token.symbol}" - checking cache/API...`);
    
    // ✅ STEP 2: SHYFT doesn't have it - check cache/API (fallback)
    const startTime = Date.now();
    const metadata = await getTokenMetaDataUsingRPC(token.token_address);
    const duration = Date.now() - startTime;
    
    // If cache/API returned valid metadata, use it
    if (metadata && metadata.symbol && metadata.symbol !== 'Unknown' && metadata.symbol.trim() !== '' && !metadata.symbol.includes('...')) {
      const source = duration < 100 ? 'cache' : 'api';
      log('cyan', `  📡 Got from ${source}: ${metadata.symbol} (${duration}ms)`);
      return {
        ...metadata,
        source,
        apiCalled: duration >= 100,
        duration
      };
    }
    
    // ✅ STEP 3: Last resort - use shortened contract address
    const shortAddress = `${token.token_address.slice(0, 4)}...${token.token_address.slice(-4)}`;
    log('red', `  ⚠️ All sources failed, using fallback: ${shortAddress}`);
    return { 
      symbol: shortAddress,
      name: token.token_address,
      source: 'fallback',
      apiCalled: false
    };
  } catch (error) {
    log('red', `  ❌ Error: ${error.message}`);
    
    // On error, try SHYFT symbol first
    if (token.symbol && token.symbol !== 'Unknown' && token.symbol !== 'Token' && token.symbol.trim() !== '') {
      return { 
        symbol: token.symbol, 
        name: token.name || token.symbol, 
        source: 'shyft-error',
        apiCalled: false
      };
    }
    
    // Last resort: use contract address
    const shortAddress = `${token.token_address.slice(0, 4)}...${token.token_address.slice(-4)}`;
    return { 
      symbol: shortAddress,
      name: token.token_address,
      source: 'fallback-error',
      apiCalled: false
    };
  }
}

async function testRealTransactions() {
  console.log('\n');
  log('magenta', '╔════════════════════════════════════════════════════════════════════╗');
  log('magenta', '║   Test Real Transactions from Database                            ║');
  log('magenta', '╚════════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    log('green', '✅ Connected to MongoDB\n');

    // Import after connection
    const { getTokenMetaDataUsingRPC } = require('./dist/config/solana-tokens-config');
    const whaleAllTransactionModelV2 = require('./dist/models/whaleAllTransactionsV2.model').default;
    const influencerWhaleTransactionsModelV2 = require('./dist/models/influencerWhaleTransactionsV2.model').default;

    // Find transactions with "Unknown" tokens
    log('cyan', '🔍 Searching for transactions with "Unknown" token symbols...\n');

    // Search whale transactions
    const whaleTransactions = await whaleAllTransactionModelV2
      .find({
        $or: [
          { 'transaction.tokenIn.symbol': 'Unknown' },
          { 'transaction.tokenOut.symbol': 'Unknown' },
          { tokenInSymbol: 'Unknown' },
          { tokenOutSymbol: 'Unknown' }
        ]
      })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();

    // Search influencer transactions
    const influencerTransactions = await influencerWhaleTransactionsModelV2
      .find({
        $or: [
          { 'transaction.tokenIn.symbol': 'Unknown' },
          { 'transaction.tokenOut.symbol': 'Unknown' },
          { tokenInSymbol: 'Unknown' },
          { tokenOutSymbol: 'Unknown' }
        ]
      })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();

    const allTransactions = [...whaleTransactions, ...influencerTransactions];

    if (allTransactions.length === 0) {
      log('yellow', '⚠️  No transactions with "Unknown" tokens found in database');
      log('yellow', '   This is actually good - means SHYFT is providing symbols!');
      log('yellow', '\n   Testing with a sample transaction instead...\n');
      
      // Get any recent transaction
      const sampleTx = await whaleAllTransactionModelV2
        .findOne({})
        .sort({ timestamp: -1 })
        .lean();
      
      if (sampleTx) {
        allTransactions.push(sampleTx);
      }
    }

    log('cyan', `Found ${allTransactions.length} transactions to test\n`);

    // Statistics
    const stats = {
      total: 0,
      usedShyft: 0,
      usedCache: 0,
      calledAPI: 0,
      usedFallback: 0,
      totalApiCalls: 0,
      totalDuration: 0
    };

    // Test each transaction
    for (let i = 0; i < Math.min(allTransactions.length, 100); i++) {
      const tx = allTransactions[i];
      
      log('blue', `\n${'='.repeat(70)}`);
      log('blue', `Transaction ${i + 1}/${Math.min(allTransactions.length, 100)}`);
      log('blue', '='.repeat(70));
      
      log('cyan', `\n📋 Transaction Info:`);
      log('cyan', `   Signature: ${tx.signature?.slice(0, 16)}...`);
      log('cyan', `   Type: ${tx.type || 'unknown'}`);
      log('cyan', `   Timestamp: ${tx.timestamp}`);
      
      // Test tokenIn
      if (tx.transaction?.tokenIn || tx.tokenInAddress) {
        const tokenIn = {
          token_address: tx.transaction?.tokenIn?.address || tx.tokenInAddress,
          symbol: tx.transaction?.tokenIn?.symbol || tx.tokenInSymbol || 'Unknown',
          name: tx.transaction?.tokenIn?.name || tx.tokenInSymbol || 'Unknown'
        };
        
        log('yellow', `\n🔹 Testing TokenIn:`);
        log('cyan', `   Address: ${tokenIn.token_address?.slice(0, 8)}...`);
        log('cyan', `   Current Symbol: "${tokenIn.symbol}"`);
        
        const result = await resolveSymbol(tokenIn, getTokenMetaDataUsingRPC);
        stats.total++;
        
        if (result.source === 'shyft') stats.usedShyft++;
        else if (result.source === 'cache') stats.usedCache++;
        else if (result.source === 'api') stats.calledAPI++;
        else stats.usedFallback++;
        
        if (result.apiCalled) stats.totalApiCalls++;
        if (result.duration) stats.totalDuration += result.duration;
        
        log('cyan', `\n   📊 Result:`);
        log('cyan', `      New Symbol: ${result.symbol}`);
        log('cyan', `      New Name: ${result.name}`);
        log('cyan', `      Source: ${result.source}`);
        if (result.duration) log('cyan', `      Duration: ${result.duration}ms`);
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Test tokenOut
      if (tx.transaction?.tokenOut || tx.tokenOutAddress) {
        const tokenOut = {
          token_address: tx.transaction?.tokenOut?.address || tx.tokenOutAddress,
          symbol: tx.transaction?.tokenOut?.symbol || tx.tokenOutSymbol || 'Unknown',
          name: tx.transaction?.tokenOut?.name || tx.tokenOutSymbol || 'Unknown'
        };
        
        log('yellow', `\n🔹 Testing TokenOut:`);
        log('cyan', `   Address: ${tokenOut.token_address?.slice(0, 8)}...`);
        log('cyan', `   Current Symbol: "${tokenOut.symbol}"`);
        
        const result = await resolveSymbol(tokenOut, getTokenMetaDataUsingRPC);
        stats.total++;
        
        if (result.source === 'shyft') stats.usedShyft++;
        else if (result.source === 'cache') stats.usedCache++;
        else if (result.source === 'api') stats.calledAPI++;
        else stats.usedFallback++;
        
        if (result.apiCalled) stats.totalApiCalls++;
        if (result.duration) stats.totalDuration += result.duration;
        
        log('cyan', `\n   📊 Result:`);
        log('cyan', `      New Symbol: ${result.symbol}`);
        log('cyan', `      New Name: ${result.name}`);
        log('cyan', `      Source: ${result.source}`);
        if (result.duration) log('cyan', `      Duration: ${result.duration}ms`);
        
        // Only wait if calling API to avoid rate limits
        if (result.apiCalled) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay for API calls
        } else {
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms for cache/SHYFT
        }
      }
    }

    // Summary
    log('blue', `\n${'='.repeat(70)}`);
    log('blue', 'Test Summary');
    log('blue', '='.repeat(70));

    const shyftPercent = stats.total > 0 ? (stats.usedShyft / stats.total * 100).toFixed(1) : 0;
    const cachePercent = stats.total > 0 ? (stats.usedCache / stats.total * 100).toFixed(1) : 0;
    const apiPercent = stats.total > 0 ? (stats.calledAPI / stats.total * 100).toFixed(1) : 0;
    const fallbackPercent = stats.total > 0 ? (stats.usedFallback / stats.total * 100).toFixed(1) : 0;
    const avgDuration = stats.totalApiCalls > 0 ? Math.round(stats.totalDuration / stats.totalApiCalls) : 0;

    log('cyan', `\n📊 Results:`);
    log('cyan', `   Total tokens tested: ${stats.total}`);
    log('green', `   ✅ Used SHYFT: ${stats.usedShyft} (${shyftPercent}%) - NO API CALL`);
    log('green', `   ✅ Used Cache: ${stats.usedCache} (${cachePercent}%) - NO API CALL`);
    log('yellow', `   📡 Called API: ${stats.calledAPI} (${apiPercent}%) - COSTS MONEY`);
    log('red', `   ⚠️  Used Fallback: ${stats.usedFallback} (${fallbackPercent}%)`);
    
    const noApiCalls = stats.usedShyft + stats.usedCache;
    const efficiency = stats.total > 0 ? (noApiCalls / stats.total * 100).toFixed(1) : 0;
    
    log('cyan', `\n💰 Cost Efficiency:`);
    log('cyan', `   Requests without API call: ${noApiCalls}/${stats.total} (${efficiency}%)`);
    log('cyan', `   API calls made: ${stats.totalApiCalls}`);
    if (avgDuration > 0) {
      log('cyan', `   Avg API call duration: ${avgDuration}ms`);
    }

    log('cyan', `\n💡 Analysis:`);
    if (efficiency >= 90) {
      log('green', '   ✅ Excellent! 90%+ tokens resolved without API calls');
      log('green', '   ✅ SHYFT is providing good symbol coverage');
      log('green', '   ✅ Free tier should be sufficient');
    } else if (efficiency >= 70) {
      log('yellow', '   ⚠️  Good, but could be better (70-90% efficiency)');
      log('yellow', '   💡 Some tokens need API calls - this is normal for new tokens');
      log('yellow', '   💡 Cache will improve over time');
    } else if (efficiency >= 50) {
      log('yellow', '   ⚠️  Moderate efficiency (50-70%)');
      log('yellow', '   💡 Many tokens need API calls');
      log('yellow', '   💡 Consider checking SHYFT parser configuration');
    } else {
      log('red', '   ❌ Low efficiency (<50%)');
      log('red', '   ❌ Too many API calls');
      log('red', '   💡 Check why SHYFT symbols are often "Unknown"');
    }

    log('cyan', `\n🎯 What This Means:`);
    log('cyan', `   - In production, ${shyftPercent}% of tokens will use SHYFT (instant, free)`);
    log('cyan', `   - ${cachePercent}% will use cache (fast, free)`);
    log('cyan', `   - Only ${apiPercent}% will call CoinGecko API (slow, costs money)`);
    log('cyan', `   - This is a ${efficiency}% reduction in API calls!`);

    await mongoose.disconnect();
    log('green', '\n✅ Disconnected from MongoDB\n');

  } catch (error) {
    log('red', `\n❌ Error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testRealTransactions();
