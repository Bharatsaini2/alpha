/**
 * Market Cap Filter Test Script
 * Tests all 3 alert types with market cap filtering
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import only the matching functions we need to test
const alertMatcherPath = './src/services/alertMatcher.service';
let evaluateWhaleAlert, matchesKOLActivityFilters;

try {
  const alertMatcher = require(alertMatcherPath);
  evaluateWhaleAlert = alertMatcher.evaluateWhaleAlert;
  matchesKOLActivityFilters = alertMatcher.matchesKOLActivityFilters;
} catch (error) {
  console.error('❌ Error loading alert matcher service:', error.message);
  console.log('\n💡 Make sure you are running this from the backend directory:');
  console.log('   cd alpha-tracker-ai/backend');
  console.log('   node test-market-cap-filter.js\n');
  process.exit(1);
}

// Test configuration
const TEST_USER_ID = 'test-user-' + Date.now();
const TEST_WALLET = 'TestWallet123';
const TEST_KOL_ADDRESS = 'KOLAddress123';
const TEST_KOL_USERNAME = 'testkol';

// Mock transaction with different market caps
const createMockTransaction = (marketCapUSD) => ({
  transaction: {
    tokenOut: {
      symbol: 'TEST',
      address: 'TokenAddress123',
      marketCap: marketCapUSD.toString(),
      priceUSD: '1.0',
    },
    tokenIn: {
      symbol: 'SOL',
      address: 'So11111111111111111111111111111111111111112',
    },
    amountOut: '1000',
    amountIn: '1',
    amountOutUSD: 1000,
    amountInUSD: 100,
  },
  walletAddress: TEST_WALLET,
  hotnessScore: 8,
  timestamp: new Date(),
});

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
    config: {
      hotnessScoreThreshold: 5,
      minBuyAmountUSD: 100,
      // No minMarketCapUSD or maxMarketCapUSD
    }
  },
  range_1K_50M: {
    name: 'Range: 1K - 50M+ (Default)',
    config: {
      hotnessScoreThreshold: 5,
      minBuyAmountUSD: 100,
      minMarketCapUSD: 1000,
      maxMarketCapUSD: 50000000,
    }
  },
  range_1K_10M: {
    name: 'Range: 1K - 10M',
    config: {
      hotnessScoreThreshold: 5,
      minBuyAmountUSD: 100,
      minMarketCapUSD: 1000,
      maxMarketCapUSD: 10000000,
    }
  },
  range_100K_1M: {
    name: 'Range: 100K - 1M',
    config: {
      hotnessScoreThreshold: 5,
      minBuyAmountUSD: 100,
      minMarketCapUSD: 100000,
      maxMarketCapUSD: 1000000,
    }
  },
};

async function connectDB() {
  try {
    if (!process.env.MONGO_URI) {
      console.log('⚠️  MONGO_URI not found in .env, skipping database connection');
      console.log('   Tests will run without database connection\n');
      return;
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');
  } catch (error) {
    console.log('⚠️  MongoDB connection failed:', error.message);
    console.log('   Tests will run without database connection\n');
  }
}

async function disconnectDB() {
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

function formatMarketCap(value) {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value}`;
}

async function testWhaleAlerts() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('TEST 1: WHALE ALERTS - Market Cap Filtering');
  console.log('═══════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  for (const [configKey, alertConfig] of Object.entries(alertConfigs)) {
    console.log(`\n📋 Testing: ${alertConfig.name}`);
    console.log('─'.repeat(60));

    for (const testCase of testCases) {
      const tx = createMockTransaction(testCase.marketCap);
      const mockAlert = {
        type: 'WHALE',
        config: {
          ...alertConfig.config,
          walletLabels: [TEST_WALLET],
        }
      };

      const result = await evaluateWhaleAlert(mockAlert, tx);
      const expected = testCase.shouldMatch[configKey];
      const status = result === expected ? '✅ PASS' : '❌ FAIL';

      if (result === expected) {
        passed++;
      } else {
        failed++;
      }

      console.log(`  ${status} | ${formatMarketCap(testCase.marketCap).padEnd(10)} | Expected: ${expected ? 'MATCH' : 'NO MATCH'} | Got: ${result ? 'MATCH' : 'NO MATCH'}`);
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`Whale Alerts: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

async function testKOLAlerts() {
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('TEST 2: KOL FEED ALERTS - Market Cap Filtering');
  console.log('═══════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  for (const [configKey, alertConfig] of Object.entries(alertConfigs)) {
    console.log(`\n📋 Testing: ${alertConfig.name}`);
    console.log('─'.repeat(60));

    for (const testCase of testCases) {
      const tx = createMockTransaction(testCase.marketCap);
      const mockAlert = {
        type: 'KOL_FEED',
        config: alertConfig.config
      };

      const result = matchesKOLActivityFilters(mockAlert.config, tx);
      const expected = testCase.shouldMatch[configKey];
      const status = result === expected ? '✅ PASS' : '❌ FAIL';

      if (result === expected) {
        passed++;
      } else {
        failed++;
      }

      console.log(`  ${status} | ${formatMarketCap(testCase.marketCap).padEnd(10)} | Expected: ${expected ? 'MATCH' : 'NO MATCH'} | Got: ${result ? 'MATCH' : 'NO MATCH'}`);
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`KOL Feed Alerts: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

async function testKOLProfileAlerts() {
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('TEST 3: KOL PROFILE ALERTS - Market Cap Filtering');
  console.log('═══════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  for (const [configKey, alertConfig] of Object.entries(alertConfigs)) {
    console.log(`\n📋 Testing: ${alertConfig.name}`);
    console.log('─'.repeat(60));

    for (const testCase of testCases) {
      const tx = createMockTransaction(testCase.marketCap);
      const mockAlert = {
        type: 'KOL_PROFILE',
        config: {
          ...alertConfig.config,
          targetKolAddress: TEST_KOL_ADDRESS,
          targetKolUsername: TEST_KOL_USERNAME,
          minHotnessScore: 5,
          minAmount: 100,
        }
      };

      // KOL Profile uses same matching logic as KOL Feed
      const result = matchesKOLActivityFilters(mockAlert.config, tx);
      const expected = testCase.shouldMatch[configKey];
      const status = result === expected ? '✅ PASS' : '❌ FAIL';

      if (result === expected) {
        passed++;
      } else {
        failed++;
      }

      console.log(`  ${status} | ${formatMarketCap(testCase.marketCap).padEnd(10)} | Expected: ${expected ? 'MATCH' : 'NO MATCH'} | Got: ${result ? 'MATCH' : 'NO MATCH'}`);
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`KOL Profile Alerts: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

async function testEdgeCases() {
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('TEST 4: EDGE CASES');
  console.log('═══════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Exactly at minimum boundary (1K)
  console.log('📋 Test: Exactly at minimum boundary (1K)');
  const tx1K = createMockTransaction(1000);
  const alert1K = {
    type: 'WHALE',
    config: {
      hotnessScoreThreshold: 5,
      minBuyAmountUSD: 100,
      minMarketCapUSD: 1000,
      maxMarketCapUSD: 50000000,
      walletLabels: [TEST_WALLET],
    }
  };
  const result1K = await evaluateWhaleAlert(alert1K, tx1K);
  console.log(`  ${result1K ? '✅ PASS' : '❌ FAIL'} | Should MATCH at exact minimum (1K)`);
  result1K ? passed++ : failed++;

  // Test 2: Exactly at maximum boundary (50M)
  console.log('\n📋 Test: Exactly at maximum boundary (50M)');
  const tx50M = createMockTransaction(50000000);
  const alert50M = {
    type: 'WHALE',
    config: {
      hotnessScoreThreshold: 5,
      minBuyAmountUSD: 100,
      minMarketCapUSD: 1000,
      maxMarketCapUSD: 50000000,
      walletLabels: [TEST_WALLET],
    }
  };
  const result50M = await evaluateWhaleAlert(alert50M, tx50M);
  console.log(`  ${result50M ? '✅ PASS' : '❌ FAIL'} | Should MATCH at exact maximum (50M)`);
  result50M ? passed++ : failed++;

  // Test 3: Missing market cap data (should not filter)
  console.log('\n📋 Test: Missing market cap data');
  const txNoMcap = createMockTransaction(0);
  txNoMcap.transaction.tokenOut.marketCap = '';
  const alertWithFilter = {
    type: 'WHALE',
    config: {
      hotnessScoreThreshold: 5,
      minBuyAmountUSD: 100,
      minMarketCapUSD: 1000,
      maxMarketCapUSD: 50000000,
      walletLabels: [TEST_WALLET],
    }
  };
  const resultNoMcap = await evaluateWhaleAlert(alertWithFilter, txNoMcap);
  console.log(`  ${!resultNoMcap ? '✅ PASS' : '❌ FAIL'} | Should NOT MATCH when market cap is missing/0`);
  !resultNoMcap ? passed++ : failed++;

  console.log('\n' + '─'.repeat(60));
  console.log(`Edge Cases: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

async function runTests() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   MARKET CAP FILTER - COMPREHENSIVE TEST SUITE       ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('\n');

  await connectDB();

  const results = {
    whale: await testWhaleAlerts(),
    kolFeed: await testKOLAlerts(),
    kolProfile: await testKOLProfileAlerts(),
    edgeCases: await testEdgeCases(),
  };

  // Summary
  const totalPassed = results.whale.passed + results.kolFeed.passed + results.kolProfile.passed + results.edgeCases.passed;
  const totalFailed = results.whale.failed + results.kolFeed.failed + results.kolProfile.failed + results.edgeCases.failed;
  const totalTests = totalPassed + totalFailed;

  console.log('\n\n╔═══════════════════════════════════════════════════════╗');
  console.log('║                    FINAL SUMMARY                      ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');
  console.log(`  Total Tests:  ${totalTests}`);
  console.log(`  ✅ Passed:     ${totalPassed}`);
  console.log(`  ❌ Failed:     ${totalFailed}`);
  console.log(`  Success Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);
  console.log('\n');

  if (totalFailed === 0) {
    console.log('🎉 ALL TESTS PASSED! Market cap filter is working correctly.\n');
  } else {
    console.log('⚠️  SOME TESTS FAILED. Please review the results above.\n');
  }

  await disconnectDB();
  process.exit(totalFailed === 0 ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test execution error:', error);
  process.exit(1);
});
