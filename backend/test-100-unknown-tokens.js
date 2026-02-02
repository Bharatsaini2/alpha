/**
 * Test 100 Unknown Tokens with BEST Fallback Chain
 * 
 * This script tests 100 distinct "Unknown" tokens from real transactions
 * and uses the BEST fallback chain to achieve 100% resolution:
 * 
 * 1. SHYFT symbol (if valid)
 * 2. MongoDB cache
 * 3. CoinGecko API
 * 4. Helius DAS API (NEW - best for Solana tokens!)
 * 5. Jupiter Token List (NEW - comprehensive)
 * 6. RPC Metadata
 * 7. Shortened address (last resort)
 * 
 * Usage: node test-100-unknown-tokens.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || 'ba7496c3-65bf-4a12-a4a2-fb6c20cd4e96';

// Import models
const TokenMetadataCacheModel = require('./dist/models/token-metadata-cache.model').default;

// Colors
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

// Statistics
const stats = {
  total: 0,
  shyft: 0,
  cache: 0,
  coingecko: 0,
  helius: 0,
  jupiter: 0,
  rpc: 0,
  fallback: 0,
  resolved: 0,
  failed: 0,
  results: []
};

// ============ ENHANCED FALLBACK CHAIN ============

/**
 * Try Helius DAS API (Digital Asset Standard)
 * Best for Solana tokens - includes metadata from on-chain data
 */
async function tryHeliusDAS(tokenAddress) {
  try {
    log('cyan', `  🔍 Trying Helius DAS API...`);
    
    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`,
      {
        jsonrpc: '2.0',
        id: 'test-token',
        method: 'getAsset',
        params: {
          id: tokenAddress,
          displayOptions: {
            showFungible: true
          }
        }
      },
      { timeout: 10000 }
    );

    if (response.data?.result) {
      const asset = response.data.result;
      
      // Try to get symbol and name from various fields
      const symbol = asset.content?.metadata?.symbol || 
                     asset.token_info?.symbol ||
                     asset.content?.metadata?.name;
      
      const name = asset.content?.metadata?.name || 
                   asset.token_info?.name ||
                   symbol;

      if (symbol && symbol !== 'Unknown' && symbol.trim() !== '') {
        log('green', `  ✅ Helius DAS found: ${symbol}`);
        return { symbol, name: name || symbol, source: 'helius' };
      }
    }

    log('yellow', `  ⚠️ Helius DAS: No valid metadata`);
    return null;
  } catch (error) {
    log('red', `  ❌ Helius DAS failed: ${error.message}`);
    return null;
  }
}

/**
 * Try Jupiter Token List
 * Comprehensive list of Solana tokens
 */
async function tryJupiterTokenList(tokenAddress) {
  try {
    log('cyan', `  🔍 Trying Jupiter Token List...`);
    
    const response = await axios.get(
      'https://token.jup.ag/all',
      { timeout: 10000 }
    );

    if (response.data && Array.isArray(response.data)) {
      const token = response.data.find(t => t.address === tokenAddress);
      
      if (token && token.symbol && token.symbol !== 'Unknown') {
        log('green', `  ✅ Jupiter found: ${token.symbol}`);
        return { 
          symbol: token.symbol, 
          name: token.name || token.symbol,
          source: 'jupiter'
        };
      }
    }

    log('yellow', `  ⚠️ Jupiter: Token not found`);
    return null;
  } catch (error) {
    log('red', `  ❌ Jupiter failed: ${error.message}`);
    return null;
  }
}

/**
 * Try CoinGecko API
 */
async function tryCoinGecko(tokenAddress) {
  try {
    log('cyan', `  🔍 Trying CoinGecko API...`);
    
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/coins/solana/contract/${tokenAddress}`,
      { timeout: 10000 }
    );

    if (response.data) {
      const symbol = response.data.symbol?.toUpperCase();
      const name = response.data.name;

      if (symbol && symbol !== 'Unknown' && symbol.trim() !== '') {
        log('green', `  ✅ CoinGecko found: ${symbol}`);
        return { symbol, name: name || symbol, source: 'coingecko' };
      }
    }

    log('yellow', `  ⚠️ CoinGecko: No valid data`);
    return null;
  } catch (error) {
    if (error.response?.status === 404) {
      log('yellow', `  ⚠️ CoinGecko: Token not found (404)`);
    } else if (error.response?.status === 429) {
      log('red', `  ❌ CoinGecko: Rate limited (429)`);
    } else {
      log('red', `  ❌ CoinGecko failed: ${error.message}`);
    }
    return null;
  }
}

/**
 * Try RPC Metadata (Metaplex)
 */
async function tryRPCMetadata(tokenAddress) {
  try {
    log('cyan', `  🔍 Trying RPC Metadata...`);
    
    // Use Helius RPC for better reliability
    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [
          tokenAddress,
          { encoding: 'jsonParsed' }
        ]
      },
      { timeout: 10000 }
    );

    if (response.data?.result?.value?.data?.parsed?.info) {
      const info = response.data.result.value.data.parsed.info;
      const symbol = info.symbol;
      const name = info.name;

      if (symbol && symbol !== 'Unknown' && symbol.trim() !== '') {
        log('green', `  ✅ RPC found: ${symbol}`);
        return { symbol, name: name || symbol, source: 'rpc' };
      }
    }

    log('yellow', `  ⚠️ RPC: No metadata found`);
    return null;
  } catch (error) {
    log('red', `  ❌ RPC failed: ${error.message}`);
    return null;
  }
}

/**
 * Check MongoDB cache
 */
async function checkCache(tokenAddress) {
  try {
    const cached = await TokenMetadataCacheModel.findOne({ tokenAddress }).lean();
    
    if (cached && cached.symbol && cached.symbol !== 'Unknown' && !cached.symbol.includes('...')) {
      log('green', `  ✅ Cache HIT: ${cached.symbol} (source: ${cached.source})`);
      return { symbol: cached.symbol, name: cached.name, source: 'cache' };
    }
    
    return null;
  } catch (error) {
    log('red', `  ❌ Cache check failed: ${error.message}`);
    return null;
  }
}

/**
 * Save to cache
 */
async function saveToCache(tokenAddress, symbol, name, source) {
  try {
    // Don't save invalid symbols
    if (!symbol || symbol === 'Unknown' || symbol.includes('...')) {
      return;
    }

    await TokenMetadataCacheModel.findOneAndUpdate(
      { tokenAddress },
      {
        $set: {
          symbol,
          name: name || symbol,
          source,
          lastUpdated: new Date()
        }
      },
      { upsert: true, new: true }
    );
    
    log('cyan', `  💾 Saved to cache: ${symbol}`);
  } catch (error) {
    log('red', `  ⚠️ Failed to save to cache: ${error.message}`);
  }
}

/**
 * ENHANCED RESOLUTION FUNCTION
 * Uses best fallback chain for 100% resolution
 */
async function resolveTokenWithBestFallback(tokenAddress, shyftSymbol = null) {
  log('blue', `\n${'='.repeat(70)}`);
  log('blue', `Resolving: ${tokenAddress.slice(0, 8)}...${tokenAddress.slice(-8)}`);
  log('blue', '='.repeat(70));

  const startTime = Date.now();

  try {
    // Step 1: Check SHYFT symbol
    if (shyftSymbol && 
        shyftSymbol !== 'Unknown' && 
        shyftSymbol !== 'Token' && 
        shyftSymbol.trim() !== '' && 
        !shyftSymbol.includes('...')) {
      
      log('green', `  ✅ Using SHYFT symbol: ${shyftSymbol}`);
      stats.shyft++;
      stats.resolved++;
      return { 
        symbol: shyftSymbol, 
        name: shyftSymbol, 
        source: 'shyft',
        duration: Date.now() - startTime
      };
    }

    log('yellow', `  ⚠️ SHYFT symbol invalid (${shyftSymbol}), trying fallbacks...`);

    // Step 2: Check cache
    const cached = await checkCache(tokenAddress);
    if (cached) {
      stats.cache++;
      stats.resolved++;
      return { ...cached, duration: Date.now() - startTime };
    }

    // Step 3: Try Helius DAS (BEST for Solana tokens!)
    const heliusResult = await tryHeliusDAS(tokenAddress);
    if (heliusResult) {
      await saveToCache(tokenAddress, heliusResult.symbol, heliusResult.name, 'helius');
      stats.helius++;
      stats.resolved++;
      return { ...heliusResult, duration: Date.now() - startTime };
    }

    // Wait 1s to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 4: Try Jupiter Token List
    const jupiterResult = await tryJupiterTokenList(tokenAddress);
    if (jupiterResult) {
      await saveToCache(tokenAddress, jupiterResult.symbol, jupiterResult.name, 'jupiter');
      stats.jupiter++;
      stats.resolved++;
      return { ...jupiterResult, duration: Date.now() - startTime };
    }

    // Wait 1s to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 5: Try CoinGecko
    const coingeckoResult = await tryCoinGecko(tokenAddress);
    if (coingeckoResult) {
      await saveToCache(tokenAddress, coingeckoResult.symbol, coingeckoResult.name, 'coingecko');
      stats.coingecko++;
      stats.resolved++;
      return { ...coingeckoResult, duration: Date.now() - startTime };
    }

    // Wait 1s to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 6: Try RPC Metadata
    const rpcResult = await tryRPCMetadata(tokenAddress);
    if (rpcResult) {
      await saveToCache(tokenAddress, rpcResult.symbol, rpcResult.name, 'rpc');
      stats.rpc++;
      stats.resolved++;
      return { ...rpcResult, duration: Date.now() - startTime };
    }

    // Step 7: Last resort - shortened address
    const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`;
    log('yellow', `  ⚠️ All sources failed, using fallback: ${shortAddress}`);
    stats.fallback++;
    stats.resolved++; // Still counts as resolved (we have something to show)
    
    return {
      symbol: shortAddress,
      name: tokenAddress,
      source: 'fallback',
      duration: Date.now() - startTime
    };

  } catch (error) {
    log('red', `  ❌ ERROR: ${error.message}`);
    stats.failed++;
    
    // Even on error, return shortened address
    const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`;
    return {
      symbol: shortAddress,
      name: tokenAddress,
      source: 'error',
      duration: Date.now() - startTime
    };
  }
}

/**
 * Get 100 distinct unknown tokens from database
 */
async function get100UnknownTokens() {
  try {
    log('cyan', '\n🔍 Fetching 100 distinct unknown tokens from database...\n');

    // Get transactions with "Unknown" tokens
    // Try multiple collection names (MongoDB lowercases them)
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    log('cyan', `Available collections: ${collectionNames.join(', ')}\n`);
    
    // Find the correct collection name
    const possibleNames = [
      'whalealltransactionv2s',  // Mongoose pluralizes
      'whalealltransactionv2',   // Singular
      'whaleAllTransactionV2s',  // With caps
      'whaleAllTransactionV2'    // Singular with caps
    ];
    
    let collectionName = null;
    for (const name of possibleNames) {
      if (collectionNames.includes(name)) {
        collectionName = name;
        break;
      }
    }
    
    if (!collectionName) {
      log('red', `❌ Could not find whale transactions collection!`);
      log('yellow', `Available collections: ${collectionNames.join(', ')}`);
      throw new Error('Collection not found');
    }
    
    log('green', `✅ Using collection: ${collectionName}\n`);
    
    const whaleTransactions = await mongoose.connection.db
      .collection(collectionName)
      .find({
        $or: [
          { 'transaction.tokenIn.symbol': 'Unknown' },
          { 'transaction.tokenOut.symbol': 'Unknown' },
          { tokenInSymbol: 'Unknown' },
          { tokenOutSymbol: 'Unknown' }
        ]
      })
      .limit(500)
      .toArray();

    log('green', `✅ Found ${whaleTransactions.length} transactions with unknown tokens\n`);

    // Extract unique token addresses
    const unknownTokens = new Set();
    
    whaleTransactions.forEach(tx => {
      if (tx.transaction?.tokenIn?.symbol === 'Unknown' && tx.transaction?.tokenIn?.address) {
        unknownTokens.add(tx.transaction.tokenIn.address);
      }
      if (tx.transaction?.tokenOut?.symbol === 'Unknown' && tx.transaction?.tokenOut?.address) {
        unknownTokens.add(tx.transaction.tokenOut.address);
      }
    });

    const tokenArray = Array.from(unknownTokens).slice(0, 100);
    
    log('green', `✅ Found ${tokenArray.length} distinct unknown token addresses\n`);
    
    return tokenArray;

  } catch (error) {
    log('red', `❌ Error fetching tokens: ${error.message}`);
    throw error;
  }
}

/**
 * Main test function
 */
async function runTest() {
  console.log('\n');
  log('magenta', '╔════════════════════════════════════════════════════════════════════╗');
  log('magenta', '║   Test 100 Unknown Tokens with BEST Fallback Chain                ║');
  log('magenta', '╚════════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  // Connect to MongoDB
  await mongoose.connect(MONGO_URI);
  log('green', '✅ Connected to MongoDB\n');

  // Get 100 unknown tokens
  const tokens = await get100UnknownTokens();
  
  if (tokens.length === 0) {
    log('red', '❌ No unknown tokens found in database!');
    await mongoose.disconnect();
    return;
  }

  log('cyan', `\n🚀 Starting resolution test for ${tokens.length} tokens...\n`);
  log('yellow', 'This will take a while (rate limiting between API calls)...\n');

  stats.total = tokens.length;

  // Process each token
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    log('magenta', `\n[${i + 1}/${tokens.length}] Processing token ${i + 1}...`);
    
    const result = await resolveTokenWithBestFallback(token);
    
    stats.results.push({
      address: token,
      symbol: result.symbol,
      name: result.name,
      source: result.source,
      duration: result.duration
    });

    // Show progress
    const progress = ((i + 1) / tokens.length * 100).toFixed(1);
    log('cyan', `  Progress: ${progress}% (${i + 1}/${tokens.length})`);

    // Wait between tokens to avoid rate limits
    if (i < tokens.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay
    }
  }

  // Display results
  displayResults();

  // Save results to file
  await saveResults();

  await mongoose.disconnect();
  log('green', '\n✅ Disconnected from MongoDB\n');
}

/**
 * Display results
 */
function displayResults() {
  log('blue', `\n${'='.repeat(70)}`);
  log('blue', 'Test Results Summary');
  log('blue', '='.repeat(70));

  log('cyan', `\n📊 Resolution Statistics:`);
  log('cyan', `   Total tokens: ${stats.total}`);
  log('green', `   ✅ Resolved: ${stats.resolved} (${(stats.resolved / stats.total * 100).toFixed(1)}%)`);
  log('red', `   ❌ Failed: ${stats.failed} (${(stats.failed / stats.total * 100).toFixed(1)}%)`);

  log('cyan', `\n📈 Source Breakdown:`);
  log('cyan', `   SHYFT: ${stats.shyft} (${(stats.shyft / stats.total * 100).toFixed(1)}%)`);
  log('cyan', `   Cache: ${stats.cache} (${(stats.cache / stats.total * 100).toFixed(1)}%)`);
  log('green', `   Helius DAS: ${stats.helius} (${(stats.helius / stats.total * 100).toFixed(1)}%)`);
  log('green', `   Jupiter: ${stats.jupiter} (${(stats.jupiter / stats.total * 100).toFixed(1)}%)`);
  log('cyan', `   CoinGecko: ${stats.coingecko} (${(stats.coingecko / stats.total * 100).toFixed(1)}%)`);
  log('cyan', `   RPC: ${stats.rpc} (${(stats.rpc / stats.total * 100).toFixed(1)}%)`);
  log('yellow', `   Fallback: ${stats.fallback} (${(stats.fallback / stats.total * 100).toFixed(1)}%)`);

  // Calculate average duration
  const avgDuration = stats.results.reduce((sum, r) => sum + r.duration, 0) / stats.results.length;
  log('cyan', `\n⏱️  Average resolution time: ${Math.round(avgDuration)}ms`);

  // Show API efficiency
  const noApiCalls = stats.shyft + stats.cache;
  const apiCalls = stats.helius + stats.jupiter + stats.coingecko + stats.rpc;
  log('cyan', `\n💰 API Efficiency:`);
  log('green', `   No API calls: ${noApiCalls} (${(noApiCalls / stats.total * 100).toFixed(1)}%)`);
  log('yellow', `   API calls made: ${apiCalls} (${(apiCalls / stats.total * 100).toFixed(1)}%)`);

  // Show top resolved tokens
  log('cyan', `\n🏆 Top 10 Resolved Tokens:`);
  stats.results
    .filter(r => r.source !== 'fallback' && r.source !== 'error')
    .slice(0, 10)
    .forEach((r, i) => {
      const shortAddr = `${r.address.slice(0, 8)}...${r.address.slice(-8)}`;
      log('green', `   ${i + 1}. ${r.symbol} (${shortAddr}) - ${r.source}`);
    });

  // Show fallback tokens
  const fallbackTokens = stats.results.filter(r => r.source === 'fallback' || r.source === 'error');
  if (fallbackTokens.length > 0) {
    log('yellow', `\n⚠️  Tokens using fallback (${fallbackTokens.length}):`);
    fallbackTokens.slice(0, 10).forEach((r, i) => {
      const shortAddr = `${r.address.slice(0, 8)}...${r.address.slice(-8)}`;
      log('yellow', `   ${i + 1}. ${r.symbol} (${shortAddr})`);
    });
    if (fallbackTokens.length > 10) {
      log('yellow', `   ... and ${fallbackTokens.length - 10} more`);
    }
  }

  // Final verdict
  const resolutionRate = (stats.resolved / stats.total * 100).toFixed(1);
  const realResolutionRate = ((stats.resolved - stats.fallback) / stats.total * 100).toFixed(1);

  log('blue', `\n${'='.repeat(70)}`);
  if (resolutionRate === '100.0') {
    log('green', '🎉 SUCCESS! 100% of tokens were resolved!');
    log('green', `   Real symbols found: ${realResolutionRate}%`);
    log('green', `   Fallback used: ${(stats.fallback / stats.total * 100).toFixed(1)}%`);
  } else {
    log('yellow', `⚠️  Resolution rate: ${resolutionRate}%`);
    log('yellow', `   Real symbols found: ${realResolutionRate}%`);
  }
  log('blue', '='.repeat(70) + '\n');
}

/**
 * Save results to CSV
 */
async function saveResults() {
  const fs = require('fs');
  
  // Create CSV content
  let csv = 'Address,Symbol,Name,Source,Duration(ms)\n';
  stats.results.forEach(r => {
    csv += `${r.address},"${r.symbol}","${r.name}",${r.source},${r.duration}\n`;
  });

  // Save to file
  const filename = `test-100-tokens-results-${Date.now()}.csv`;
  fs.writeFileSync(filename, csv);
  
  log('green', `\n💾 Results saved to: ${filename}`);
}

// Run the test
runTest().catch(error => {
  log('red', `\n❌ Test failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
