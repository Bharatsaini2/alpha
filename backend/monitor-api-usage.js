/**
 * Monitor API Usage in Production
 * 
 * This script monitors your production logs to show:
 * 1. How many times SHYFT symbols are used (no API call)
 * 2. How many times CoinGecko API is called
 * 3. Cache hit rate
 * 4. API cost estimation
 * 
 * Usage: 
 * - Local: node monitor-api-usage.js
 * - Production: ssh root@your-server "pm2 logs backend --lines 1000 --nostream" | node monitor-api-usage.js
 */

const fs = require('fs');
const readline = require('readline');

// Statistics
const stats = {
  shyftUsed: 0,           // Used SHYFT symbol (no API call)
  cacheHit: 0,            // Cache hit (no API call)
  apiCalled: 0,           // CoinGecko API called
  cacheMiss: 0,           // Cache miss
  totalRequests: 0,       // Total token resolution requests
  apiCallsByToken: {},    // Track which tokens needed API calls
  shyftByToken: {},       // Track which tokens used SHYFT
};

// Read from stdin or file
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

console.log('📊 Monitoring API Usage...\n');
console.log('Reading logs from stdin (pipe pm2 logs or paste logs)...\n');

rl.on('line', (line) => {
  // Count SHYFT symbol usage (no API call)
  if (line.includes('Using SHYFT symbol:')) {
    stats.shyftUsed++;
    stats.totalRequests++;
    
    // Extract token symbol
    const match = line.match(/Using SHYFT symbol: (\w+)/);
    if (match) {
      const symbol = match[1];
      stats.shyftByToken[symbol] = (stats.shyftByToken[symbol] || 0) + 1;
    }
  }
  
  // Count cache hits
  if (line.includes('Memory cache HIT:') || line.includes('Cache HIT:')) {
    stats.cacheHit++;
    stats.totalRequests++;
  }
  
  // Count cache misses
  if (line.includes('Cache MISS')) {
    stats.cacheMiss++;
  }
  
  // Count CoinGecko API calls
  if (line.includes('Trying CoinGecko')) {
    stats.apiCalled++;
    
    // Extract token address
    const match = line.match(/Resolving token: (\w+)/);
    if (match) {
      const address = match[1];
      stats.apiCallsByToken[address] = (stats.apiCallsByToken[address] || 0) + 1;
    }
  }
});

rl.on('close', () => {
  displayStats();
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n📊 Final Statistics:\n');
  displayStats();
  process.exit(0);
});

function displayStats() {
  console.log('\n' + '='.repeat(70));
  console.log('📊 API Usage Statistics');
  console.log('='.repeat(70) + '\n');
  
  // Calculate percentages
  const shyftPercent = stats.totalRequests > 0 ? (stats.shyftUsed / stats.totalRequests * 100).toFixed(1) : 0;
  const cachePercent = stats.totalRequests > 0 ? (stats.cacheHit / stats.totalRequests * 100).toFixed(1) : 0;
  const apiPercent = stats.totalRequests > 0 ? (stats.apiCalled / stats.totalRequests * 100).toFixed(1) : 0;
  
  console.log('📈 Request Breakdown:');
  console.log(`   Total Requests: ${stats.totalRequests}`);
  console.log(`   ✅ SHYFT Used: ${stats.shyftUsed} (${shyftPercent}%) - NO API CALL`);
  console.log(`   ✅ Cache Hit: ${stats.cacheHit} (${cachePercent}%) - NO API CALL`);
  console.log(`   📡 API Called: ${stats.apiCalled} (${apiPercent}%) - COSTS MONEY`);
  console.log(`   ⚠️  Cache Miss: ${stats.cacheMiss}\n`);
  
  // Calculate efficiency
  const noApiCalls = stats.shyftUsed + stats.cacheHit;
  const efficiency = stats.totalRequests > 0 ? (noApiCalls / stats.totalRequests * 100).toFixed(1) : 0;
  
  console.log('💰 Cost Efficiency:');
  console.log(`   Requests without API call: ${noApiCalls}/${stats.totalRequests} (${efficiency}%)`);
  console.log(`   API calls saved: ${noApiCalls}`);
  
  // Estimate costs (CoinGecko free tier: 10-30 calls/min)
  const estimatedCost = stats.apiCalled * 0.001; // Rough estimate
  console.log(`   Estimated API cost: $${estimatedCost.toFixed(3)} (if paid tier)\n`);
  
  // Show most common SHYFT tokens
  if (Object.keys(stats.shyftByToken).length > 0) {
    console.log('🔝 Top Tokens Using SHYFT (no API calls):');
    const sortedShyft = Object.entries(stats.shyftByToken)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    sortedShyft.forEach(([symbol, count], index) => {
      console.log(`   ${index + 1}. ${symbol}: ${count} times`);
    });
    console.log('');
  }
  
  // Show tokens that needed API calls
  if (Object.keys(stats.apiCallsByToken).length > 0) {
    console.log('📡 Tokens That Needed API Calls:');
    const sortedApi = Object.entries(stats.apiCallsByToken)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    sortedApi.forEach(([address, count], index) => {
      const shortAddr = `${address.slice(0, 8)}...${address.slice(-8)}`;
      console.log(`   ${index + 1}. ${shortAddr}: ${count} times`);
    });
    console.log('');
  }
  
  // Recommendations
  console.log('💡 Recommendations:');
  if (efficiency >= 90) {
    console.log('   ✅ Excellent! 90%+ requests use SHYFT/cache (no API calls)');
    console.log('   ✅ Free tier should be sufficient');
  } else if (efficiency >= 70) {
    console.log('   ✅ Good! 70%+ requests use SHYFT/cache');
    console.log('   ⚠️  Monitor API usage, may need paid tier if traffic grows');
  } else if (efficiency >= 50) {
    console.log('   ⚠️  Only 50-70% using SHYFT/cache');
    console.log('   ⚠️  Consider upgrading to paid tier');
    console.log('   💡 Check why SHYFT symbols are missing');
  } else {
    console.log('   ❌ Low efficiency (<50% using SHYFT/cache)');
    console.log('   ❌ Upgrade to paid tier recommended');
    console.log('   💡 Investigate why SHYFT symbols are often missing');
  }
  
  console.log('\n' + '='.repeat(70) + '\n');
}

// If no input after 5 seconds, show help
setTimeout(() => {
  if (stats.totalRequests === 0) {
    console.log('⚠️  No logs detected yet. Make sure to pipe logs to this script:\n');
    console.log('Examples:');
    console.log('  Local: pm2 logs backend --lines 1000 --nostream | node monitor-api-usage.js');
    console.log('  Production: ssh root@your-server "pm2 logs backend --lines 1000 --nostream" | node monitor-api-usage.js');
    console.log('  Or paste logs directly and press Ctrl+D when done\n');
  }
}, 5000);
