/**
 * Market Cap Filter Test Script (Simplified)
 * Tests market cap filtering logic directly
 */

// Test the market cap filtering logic
function testMarketCapFilter(tokenMarketCap, minMarketCapUSD, maxMarketCapUSD) {
  // If no filter is set, accept all
  if (minMarketCapUSD === undefined && maxMarketCapUSD === undefined) {
    return true;
  }

  const marketCap = parseFloat(tokenMarketCap || '0');

  // Check minimum market cap
  if (minMarketCapUSD !== undefined && marketCap < minMarketCapUSD) {
    return false;
  }

  // Check maximum market cap (50M+ means no upper limit)
  if (maxMarketCapUSD !== undefined && maxMarketCapUSD < 50000000) {
    if (marketCap > maxMarketCapUSD) {
      return false;
    }
  }
  // If maxMarketCapUSD >= 50M, accept all (no upper limit)

  return true;
}

function formatMarketCap(value) {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value}`;
}

// Test cases
const testCases = [
  {
    name: 'Token with 500 USD market cap (below 1K min)',
    marketCap: 500,
    shouldMatch: {
      noFilter: true,
      range_1K_50M: false,
      range_1K_10M: false,
      range_100K_1M: false,
    }
  },
  {
    name: 'Token with 5K USD market cap',
    marketCap: 5000,
    shouldMatch: {
      noFilter: true,
      range_1K_50M: true,
      range_1K_10M: true,
      range_100K_1M: false,
    }
  },
  {
    name: 'Token with 500K USD market cap',
    marketCap: 500000,
    shouldMatch: {
      noFilter: true,
      range_1K_50M: true,
      range_1K_10M: true,
      range_100K_1M: true,
    }
  },
  {
    name: 'Token with 5M USD market cap',
    marketCap: 5000000,
    shouldMatch: {
      noFilter: true,
      range_1K_50M: true,
      range_1K_10M: true,
      range_100K_1M: false,
    }
  },
  {
    name: 'Token with 25M USD market cap',
    marketCap: 25000000,
    shouldMatch: {
      noFilter: true,
      range_1K_50M: true,
      range_1K_10M: false,
      range_100K_1M: false,
    }
  },
  {
    name: 'Token with 100M USD market cap (above 50M max)',
    marketCap: 100000000,
    shouldMatch: {
      noFilter: true,
      range_1K_50M: true, // 50M+ means unlimited
      range_1K_10M: false,
      range_100K_1M: false,
    }
  },
];

// Alert configurations to test
const alertConfigs = {
  noFilter: {
    name: 'No Market Cap Filter',
    minMarketCapUSD: undefined,
    maxMarketCapUSD: undefined,
  },
  range_1K_50M: {
    name: 'Range: 1K - 50M+ (Default)',
    minMarketCapUSD: 1000,
    maxMarketCapUSD: 50000000,
  },
  range_1K_10M: {
    name: 'Range: 1K - 10M',
    minMarketCapUSD: 1000,
    maxMarketCapUSD: 10000000,
  },
  range_100K_1M: {
    name: 'Range: 100K - 1M',
    minMarketCapUSD: 100000,
    maxMarketCapUSD: 1000000,
  },
};

function runTests() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   MARKET CAP FILTER - LOGIC TEST SUITE               ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('\n');

  let totalPassed = 0;
  let totalFailed = 0;

  for (const [configKey, config] of Object.entries(alertConfigs)) {
    console.log(`\n📋 Testing: ${config.name}`);
    console.log('─'.repeat(60));

    for (const testCase of testCases) {
      const result = testMarketCapFilter(
        testCase.marketCap.toString(),
        config.minMarketCapUSD,
        config.maxMarketCapUSD
      );
      const expected = testCase.shouldMatch[configKey];
      const status = result === expected ? '✅ PASS' : '❌ FAIL';

      if (result === expected) {
        totalPassed++;
      } else {
        totalFailed++;
      }

      console.log(`  ${status} | ${formatMarketCap(testCase.marketCap).padEnd(10)} | Expected: ${expected ? 'MATCH' : 'NO MATCH'} | Got: ${result ? 'MATCH' : 'NO MATCH'}`);
    }
  }

  // Edge cases
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('EDGE CASES');
  console.log('═══════════════════════════════════════════════════════\n');

  // Test 1: Exactly at minimum boundary (1K)
  console.log('📋 Test: Exactly at minimum boundary (1K)');
  const result1K = testMarketCapFilter('1000', 1000, 50000000);
  console.log(`  ${result1K ? '✅ PASS' : '❌ FAIL'} | Should MATCH at exact minimum (1K)`);
  result1K ? totalPassed++ : totalFailed++;

  // Test 2: Exactly at maximum boundary (50M)
  console.log('\n📋 Test: Exactly at maximum boundary (50M)');
  const result50M = testMarketCapFilter('50000000', 1000, 50000000);
  console.log(`  ${result50M ? '✅ PASS' : '❌ FAIL'} | Should MATCH at exact maximum (50M)`);
  result50M ? totalPassed++ : totalFailed++;

  // Test 3: Missing market cap data (should not match when filter is set)
  console.log('\n📋 Test: Missing market cap data');
  const resultNoMcap = testMarketCapFilter('', 1000, 50000000);
  console.log(`  ${!resultNoMcap ? '✅ PASS' : '❌ FAIL'} | Should NOT MATCH when market cap is missing/0`);
  !resultNoMcap ? totalPassed++ : totalFailed++;

  // Test 4: 50M+ means unlimited
  console.log('\n📋 Test: 50M+ means unlimited (100M token)');
  const result100M = testMarketCapFilter('100000000', 1000, 50000000);
  console.log(`  ${result100M ? '✅ PASS' : '❌ FAIL'} | Should MATCH when max is 50M+ (unlimited)`);
  result100M ? totalPassed++ : totalFailed++;

  // Test 5: Below 50M should enforce max
  console.log('\n📋 Test: Max below 50M should enforce limit (25M token with 10M max)');
  const result25M = testMarketCapFilter('25000000', 1000, 10000000);
  console.log(`  ${!result25M ? '✅ PASS' : '❌ FAIL'} | Should NOT MATCH when above max (25M > 10M)`);
  !result25M ? totalPassed++ : totalFailed++;

  const totalTests = totalPassed + totalFailed;

  // Summary
  console.log('\n\n╔═══════════════════════════════════════════════════════╗');
  console.log('║                    FINAL SUMMARY                      ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');
  console.log(`  Total Tests:  ${totalTests}`);
  console.log(`  ✅ Passed:     ${totalPassed}`);
  console.log(`  ❌ Failed:     ${totalFailed}`);
  console.log(`  Success Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);
  console.log('\n');

  if (totalFailed === 0) {
    console.log('🎉 ALL TESTS PASSED! Market cap filter logic is correct.\n');
  } else {
    console.log('⚠️  SOME TESTS FAILED. Please review the results above.\n');
  }

  process.exit(totalFailed === 0 ? 0 : 1);
}

// Run tests
runTests();
