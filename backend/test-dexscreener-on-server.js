#!/usr/bin/env node

/**
 * Test DexScreener API on Production Server
 * 
 * This script:
 * 1. Gets 100 distinct tokens from your database
 * 2. Tests DexScreener API for each token
 * 3. Shows which tokens DexScreener can resolve
 * 4. Detects if your server IP is banned
 * 
 * Usage:
 * 1. Upload to your droplet
 * 2. Run: node test-dexscreener-on-server.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const https = require('https');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

// Statistics
const stats = {
  total: 0,
  success: 0,
  notFound: 0,
  banned: 0,
  rateLimited: 0,
  networkError: 0,
  timeout: 0,
  results: []
};

// Colors for console
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

/**
 * Test DexScreener API for a single token
 */
function testDexScreener(tokenAddress) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const options = {
      hostname: 'api.dexscreener.com',
      port: 443,
      path: `/latest/dex/tokens/${tokenAddress}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const duration = Date.now() - startTime;

        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            const pairs = parsed.pairs || [];
            
            if (pairs.length > 0) {
              const symbol = pairs[0].baseToken?.symbol || 'Unknown';
              const name = pairs[0].baseToken?.name || symbol;
              
              resolve({
                success: true,
                status: 200,
                symbol,
                name,
                pairCount: pairs.length,
                duration,
                message: `✅ Found: ${symbol}`
              });
            } else {
              resolve({
                success: false,
                status: 200,
                symbol: null,
                duration,
                message: `⚠️  No pairs found`
              });
            }
          } catch (e) {
            resolve({
              success: false,
              status: 200,
              symbol: null,
              duration,
              message: `⚠️  Invalid JSON`
            });
          }
        } else if (res.statusCode === 403) {
          resolve({
            success: false,
            status: 403,
            symbol: null,
            duration,
            message: `❌ BANNED (403)`
          });
        } else if (res.statusCode === 429) {
          resolve({
            success: false,
            status: 429,
            symbol: null,
            duration,
            message: `⚠️  Rate limited (429)`
          });
        } else if (res.statusCode === 404) {
          resolve({
            success: false,
            status: 404,
            symbol: null,
            duration,
            message: `⚠️  Not found (404)`
          });
        } else {
          resolve({
            success: false,
            status: res.statusCode,
            symbol: null,
            duration,
            message: `⚠️  Status ${res.statusCode}`
          });
        }
      });
    });

    req.on('error', (error) => {
      const duration = Date.now() - startTime;
      resolve({
        success: false,
        status: 0,
        symbol: null,
        duration,
        message: `❌ Network error: ${error.message}`
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const duration = Date.now() - startTime;
      resolve({
        success: false,
        status: 0,
        symbol: null,
        duration,
        message: `❌ Timeout (15s)`
      });
    });

    req.end();
  });
}

/**
 * Get 100 distinct tokens from database
 */
async function get100Tokens() {
  try {
    log('cyan', '\n🔍 Fetching 100 distinct tokens from database...\n');

    // Try multiple collection names
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    log('cyan', `Available collections: ${collectionNames.slice(0, 10).join(', ')}...\n`);
    
    // Find whale transactions collection
    const possibleNames = [
      'whalealltransactionv2s',
      'whalealltransactionv2',
      'whaleAllTransactionV2s',
      'whaleAllTransactionV2'
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
      return [];
    }
    
    log('green', `✅ Using collection: ${collectionName}\n`);
    
    // Get transactions
    const transactions = await mongoose.connection.db
      .collection(collectionName)
      .find({})
      .limit(1000)
      .toArray();

    log('green', `✅ Found ${transactions.length} transactions\n`);

    // Extract unique token addresses
    const tokenAddresses = new Set();
    
    transactions.forEach(tx => {
      // Try different field structures
      if (tx.transaction?.tokenIn?.address) {
        tokenAddresses.add(tx.transaction.tokenIn.address);
      }
      if (tx.transaction?.tokenOut?.address) {
        tokenAddresses.add(tx.transaction.tokenOut.address);
      }
      if (tx.tokenInAddress) {
        tokenAddresses.add(tx.tokenInAddress);
      }
      if (tx.tokenOutAddress) {
        tokenAddresses.add(tx.tokenOutAddress);
      }
    });

    const tokenArray = Array.from(tokenAddresses).slice(0, 100);
    
    log('green', `✅ Found ${tokenArray.length} distinct token addresses\n`);
    
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
  log('magenta', '║   Test DexScreener API on Production Server (100 Tokens)          ║');
  log('magenta', '╚════════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  // Connect to MongoDB
  await mongoose.connect(MONGO_URI);
  log('green', '✅ Connected to MongoDB\n');

  // Get 100 tokens
  const tokens = await get100Tokens();
  
  if (tokens.length === 0) {
    log('red', '❌ No tokens found in database!');
    await mongoose.disconnect();
    return;
  }

  log('cyan', `\n🚀 Testing DexScreener API for ${tokens.length} tokens...\n`);
  log('yellow', 'This will take a few minutes (rate limiting between requests)...\n');

  stats.total = tokens.length;

  // Test each token
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const shortAddr = `${token.slice(0, 8)}...${token.slice(-8)}`;
    
    log('blue', `\n[${i + 1}/${tokens.length}] Testing: ${shortAddr}`);
    
    const result = await testDexScreener(token);
    
    log(result.success ? 'green' : 'yellow', `   ${result.message} (${result.duration}ms)`);
    
    // Update stats
    if (result.success) {
      stats.success++;
    } else if (result.status === 403) {
      stats.banned++;
    } else if (result.status === 429) {
      stats.rateLimited++;
    } else if (result.status === 404) {
      stats.notFound++;
    } else if (result.status === 0) {
      if (result.message.includes('Timeout')) {
        stats.timeout++;
      } else {
        stats.networkError++;
      }
    }
    
    stats.results.push({
      address: token,
      symbol: result.symbol,
      status: result.status,
      duration: result.duration,
      success: result.success
    });

    // Show progress
    const progress = ((i + 1) / tokens.length * 100).toFixed(1);
    log('cyan', `   Progress: ${progress}% (${i + 1}/${tokens.length})`);

    // Wait between requests to avoid rate limits
    if (i < tokens.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1s delay
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

  log('cyan', `\n📊 Overall Statistics:`);
  log('cyan', `   Total tokens tested: ${stats.total}`);
  log('green', `   ✅ Success: ${stats.success} (${(stats.success / stats.total * 100).toFixed(1)}%)`);
  log('yellow', `   ⚠️  Not found (404): ${stats.notFound} (${(stats.notFound / stats.total * 100).toFixed(1)}%)`);
  log('red', `   ❌ Banned (403): ${stats.banned} (${(stats.banned / stats.total * 100).toFixed(1)}%)`);
  log('yellow', `   ⚠️  Rate limited (429): ${stats.rateLimited} (${(stats.rateLimited / stats.total * 100).toFixed(1)}%)`);
  log('red', `   ❌ Network error: ${stats.networkError} (${(stats.networkError / stats.total * 100).toFixed(1)}%)`);
  log('red', `   ❌ Timeout: ${stats.timeout} (${(stats.timeout / stats.total * 100).toFixed(1)}%)`);

  // Calculate average duration for successful requests
  const successfulResults = stats.results.filter(r => r.success);
  if (successfulResults.length > 0) {
    const avgDuration = successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length;
    log('cyan', `\n⏱️  Average response time: ${Math.round(avgDuration)}ms`);
  }

  // Show top resolved tokens
  if (successfulResults.length > 0) {
    log('cyan', `\n🏆 Top 10 Resolved Tokens:`);
    successfulResults.slice(0, 10).forEach((r, i) => {
      const shortAddr = `${r.address.slice(0, 8)}...${r.address.slice(-8)}`;
      log('green', `   ${i + 1}. ${r.symbol} (${shortAddr})`);
    });
  }

  // Final verdict
  log('blue', `\n${'='.repeat(70)}`);
  
  if (stats.banned > 0) {
    log('red', '🚨 VERDICT: Your server IP IS BANNED by DexScreener!');
    log('red', `   ${stats.banned} requests returned 403 Forbidden`);
    log('yellow', '\n💡 Solutions:');
    log('yellow', '   1. Use proxy service (ScraperAPI - 1000 free requests/month)');
    log('yellow', '   2. Deploy to new server (fresh IP)');
    log('yellow', '   3. Contact DexScreener support');
  } else if (stats.rateLimited > stats.total * 0.5) {
    log('yellow', '⚠️  VERDICT: Heavily rate limited');
    log('yellow', `   ${stats.rateLimited} requests returned 429`);
    log('yellow', '\n💡 Solution: Add delays between requests or use proxy');
  } else if (stats.success > 0) {
    log('green', '✅ VERDICT: DexScreener is working!');
    log('green', `   Successfully resolved ${stats.success} tokens (${(stats.success / stats.total * 100).toFixed(1)}%)`);
    log('cyan', '\n💡 Next step: Add DexScreener to your fallback chain');
  } else {
    log('red', '❌ VERDICT: DexScreener is not working');
    log('red', '   No successful requests');
    log('yellow', '\n💡 Check network connectivity and firewall settings');
  }
  
  log('blue', '='.repeat(70) + '\n');
}

/**
 * Save results to CSV
 */
async function saveResults() {
  const fs = require('fs');
  
  // Create CSV content
  let csv = 'Address,Symbol,Status,Duration(ms),Success\n';
  stats.results.forEach(r => {
    csv += `${r.address},"${r.symbol || 'N/A'}",${r.status},${r.duration},${r.success}\n`;
  });

  // Save to file
  const filename = `dexscreener-test-results-${Date.now()}.csv`;
  fs.writeFileSync(filename, csv);
  
  log('green', `\n💾 Results saved to: ${filename}`);
}

// Run the test
runTest().catch(error => {
  log('red', `\n❌ Test failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
