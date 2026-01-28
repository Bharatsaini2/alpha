#!/usr/bin/env node

/**
 * Stress test: Run token resolution 100 times to find failure patterns
 */

require('dotenv').config();
const { getTokenMetaDataUsingRPC } = require('./dist/config/solana-tokens-config');

const testTokens = [
  {
    address: '5y5zsAJPCFzzNmbCz67ya72ZxDBwJKnAeAEyABQRj5LN',
    name: 'Token 1'
  },
  {
    address: '9CrY7PsMPx8pHaFKFV1Ty9CBp5GrvVT4dAanZoJHpump',
    name: 'Token 2'
  },
  {
    address: 'Cm6fNnMk7NfzStP9CZpsQA2v3jjzbcYGAxdJySmHpump',
    name: 'Token 3'
  },
  {
    address: 'kMKX8hBaj3BTRBbeYix9c16EieBP5dih8DTSSwCpump',
    name: 'afk'
  },
  {
    address: '8Jx8AAHj86wbQgUTjGuj6GTTL5Ps3cqxKRTvpaJApump',
    name: 'PENGUIN'
  }
];

const ITERATIONS = 100;
const DELAY_BETWEEN_TESTS = 500; // 500ms delay to avoid rate limiting

// Statistics tracking
const stats = {
  total: 0,
  success: 0,
  failed: 0,
  unknown: 0,
  fallback: 0,
  byToken: {},
  failures: [],
  timings: []
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testToken(token, iteration) {
  const startTime = Date.now();
  
  try {
    const result = await getTokenMetaDataUsingRPC(token.address);
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    stats.total++;
    stats.timings.push(duration);
    
    // Initialize token stats if needed
    if (!stats.byToken[token.name]) {
      stats.byToken[token.name] = {
        success: 0,
        failed: 0,
        unknown: 0,
        fallback: 0,
        symbols: new Set(),
        timings: []
      };
    }
    
    const tokenStats = stats.byToken[token.name];
    tokenStats.timings.push(duration);
    
    // Categorize result
    if (result.symbol && result.symbol !== 'Unknown') {
      if (result.symbol.includes('...')) {
        // Fallback address
        stats.fallback++;
        tokenStats.fallback++;
        tokenStats.symbols.add(`FALLBACK:${result.symbol}`);
        
        console.log(`[${iteration}] ⚠️  ${token.name}: ${result.symbol} (fallback) - ${duration}ms`);
        
        stats.failures.push({
          iteration,
          token: token.name,
          address: token.address,
          result: result.symbol,
          duration,
          type: 'fallback'
        });
      } else {
        // Valid symbol
        stats.success++;
        tokenStats.success++;
        tokenStats.symbols.add(result.symbol);
        
        console.log(`[${iteration}] ✅ ${token.name}: ${result.symbol} - ${duration}ms`);
      }
    } else {
      // Unknown
      stats.unknown++;
      tokenStats.unknown++;
      tokenStats.symbols.add('Unknown');
      
      console.log(`[${iteration}] ❌ ${token.name}: Unknown - ${duration}ms`);
      
      stats.failures.push({
        iteration,
        token: token.name,
        address: token.address,
        result: 'Unknown',
        duration,
        type: 'unknown'
      });
    }
    
    return result;
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    stats.total++;
    stats.failed++;
    stats.timings.push(duration);
    
    if (!stats.byToken[token.name]) {
      stats.byToken[token.name] = {
        success: 0,
        failed: 0,
        unknown: 0,
        fallback: 0,
        symbols: new Set(),
        timings: []
      };
    }
    
    stats.byToken[token.name].failed++;
    stats.byToken[token.name].timings.push(duration);
    
    console.log(`[${iteration}] 💥 ${token.name}: ERROR - ${error.message} - ${duration}ms`);
    
    stats.failures.push({
      iteration,
      token: token.name,
      address: token.address,
      result: 'ERROR',
      error: error.message,
      duration,
      type: 'error'
    });
    
    return null;
  }
}

async function runStressTest() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Token Resolution Stress Test (100x)                         ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`Testing ${testTokens.length} tokens × ${ITERATIONS} iterations = ${testTokens.length * ITERATIONS} total tests\n`);
  console.log('─'.repeat(80));
  
  const overallStartTime = Date.now();
  
  for (let i = 1; i <= ITERATIONS; i++) {
    console.log(`\n🔄 Iteration ${i}/${ITERATIONS}`);
    console.log('─'.repeat(80));
    
    for (const token of testTokens) {
      await testToken(token, i);
      await sleep(DELAY_BETWEEN_TESTS); // Delay to avoid rate limiting
    }
    
    // Progress update every 10 iterations
    if (i % 10 === 0) {
      const successRate = ((stats.success / stats.total) * 100).toFixed(1);
      const avgTime = (stats.timings.reduce((a, b) => a + b, 0) / stats.timings.length).toFixed(0);
      console.log(`\n📊 Progress: ${i}/${ITERATIONS} iterations | Success: ${successRate}% | Avg: ${avgTime}ms`);
    }
  }
  
  const overallEndTime = Date.now();
  const totalDuration = ((overallEndTime - overallStartTime) / 1000).toFixed(1);
  
  // Print final statistics
  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           FINAL STATISTICS                                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log('📊 Overall Results:');
  console.log(`   Total Tests: ${stats.total}`);
  console.log(`   ✅ Success: ${stats.success} (${((stats.success / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   ⚠️  Fallback: ${stats.fallback} (${((stats.fallback / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   ❌ Unknown: ${stats.unknown} (${((stats.unknown / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   💥 Errors: ${stats.failed} (${((stats.failed / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   ⏱️  Total Time: ${totalDuration}s`);
  
  // Timing statistics
  const avgTime = (stats.timings.reduce((a, b) => a + b, 0) / stats.timings.length).toFixed(0);
  const minTime = Math.min(...stats.timings);
  const maxTime = Math.max(...stats.timings);
  const sortedTimings = [...stats.timings].sort((a, b) => a - b);
  const medianTime = sortedTimings[Math.floor(sortedTimings.length / 2)];
  
  console.log(`\n⏱️  Timing Statistics:`);
  console.log(`   Average: ${avgTime}ms`);
  console.log(`   Median: ${medianTime}ms`);
  console.log(`   Min: ${minTime}ms`);
  console.log(`   Max: ${maxTime}ms`);
  
  // Per-token statistics
  console.log(`\n📈 Per-Token Results:\n`);
  
  for (const [tokenName, tokenStats] of Object.entries(stats.byToken)) {
    const total = tokenStats.success + tokenStats.fallback + tokenStats.unknown + tokenStats.failed;
    const successRate = ((tokenStats.success / total) * 100).toFixed(1);
    const avgTokenTime = (tokenStats.timings.reduce((a, b) => a + b, 0) / tokenStats.timings.length).toFixed(0);
    
    console.log(`   ${tokenName}:`);
    console.log(`      ✅ Success: ${tokenStats.success}/${total} (${successRate}%)`);
    console.log(`      ⚠️  Fallback: ${tokenStats.fallback}`);
    console.log(`      ❌ Unknown: ${tokenStats.unknown}`);
    console.log(`      💥 Errors: ${tokenStats.failed}`);
    console.log(`      ⏱️  Avg Time: ${avgTokenTime}ms`);
    console.log(`      🏷️  Symbols: ${Array.from(tokenStats.symbols).join(', ')}`);
    console.log('');
  }
  
  // Failure analysis
  if (stats.failures.length > 0) {
    console.log(`\n⚠️  Failure Analysis (${stats.failures.length} failures):\n`);
    
    // Group failures by type
    const failuresByType = {
      fallback: stats.failures.filter(f => f.type === 'fallback'),
      unknown: stats.failures.filter(f => f.type === 'unknown'),
      error: stats.failures.filter(f => f.type === 'error')
    };
    
    console.log(`   Fallback: ${failuresByType.fallback.length}`);
    console.log(`   Unknown: ${failuresByType.unknown.length}`);
    console.log(`   Errors: ${failuresByType.error.length}`);
    
    // Show first 10 failures
    console.log(`\n   First 10 Failures:`);
    stats.failures.slice(0, 10).forEach((failure, idx) => {
      console.log(`      ${idx + 1}. [Iter ${failure.iteration}] ${failure.token}: ${failure.result} (${failure.duration}ms)`);
    });
    
    if (stats.failures.length > 10) {
      console.log(`      ... and ${stats.failures.length - 10} more`);
    }
  } else {
    console.log(`\n✅ No failures! 100% success rate! 🎉`);
  }
  
  // Recommendations
  console.log(`\n\n💡 Recommendations:\n`);
  
  const successRate = (stats.success / stats.total) * 100;
  const fallbackRate = (stats.fallback / stats.total) * 100;
  
  if (successRate >= 95) {
    console.log(`   ✅ Excellent! ${successRate.toFixed(1)}% success rate`);
    console.log(`   → System is working very well`);
  } else if (successRate >= 80) {
    console.log(`   ⚠️  Good but could be better: ${successRate.toFixed(1)}% success rate`);
    console.log(`   → Consider adding database cache to improve consistency`);
  } else {
    console.log(`   ❌ Needs improvement: ${successRate.toFixed(1)}% success rate`);
    console.log(`   → Database cache is highly recommended`);
  }
  
  if (fallbackRate > 10) {
    console.log(`   ⚠️  High fallback rate: ${fallbackRate.toFixed(1)}%`);
    console.log(`   → Many tokens falling back to shortened addresses`);
    console.log(`   → Database cache would help significantly`);
  }
  
  if (avgTime > 5000) {
    console.log(`   ⚠️  Slow average response time: ${avgTime}ms`);
    console.log(`   → Database cache would speed this up dramatically`);
  }
  
  console.log(`\n✅ Stress Test Complete!`);
  console.log(`\n📝 Summary: ${stats.success}/${stats.total} successful (${successRate.toFixed(1)}%)`);
  
  process.exit(0);
}

runStressTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
