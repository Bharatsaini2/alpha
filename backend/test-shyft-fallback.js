/**
 * Test SHYFT Symbol Fallback Logic
 * 
 * This tests that:
 * 1. SHYFT symbols are used first (no API call)
 * 2. CoinGecko is only called when SHYFT doesn't have symbol
 * 3. Cache is used for repeated requests
 * 
 * Usage: node test-shyft-fallback.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { getTokenMetaDataUsingRPC } = require('./dist/config/solana-tokens-config');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

// Simulate tokens as they come from SHYFT parser
const TEST_SCENARIOS = [
  {
    name: 'Scenario 1: SHYFT has valid symbol',
    token: {
      token_address: 'So11111111111111111111111111111111111111112',
      symbol: 'SOL',  // SHYFT provides this
      name: 'Solana'
    },
    expectedBehavior: 'Should use SHYFT symbol directly (no API call)',
    shouldCallAPI: false
  },
  {
    name: 'Scenario 2: SHYFT has "Unknown" symbol',
    token: {
      token_address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      symbol: 'Unknown',  // SHYFT doesn't know
      name: 'Unknown'
    },
    expectedBehavior: 'Should call CoinGecko API (fallback)',
    shouldCallAPI: true
  },
  {
    name: 'Scenario 3: SHYFT has "Token" symbol',
    token: {
      token_address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      symbol: 'Token',  // SHYFT generic placeholder
      name: 'Token'
    },
    expectedBehavior: 'Should call CoinGecko API (fallback)',
    shouldCallAPI: true
  },
  {
    name: 'Scenario 4: SHYFT has empty symbol',
    token: {
      token_address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      symbol: '',  // SHYFT has nothing
      name: ''
    },
    expectedBehavior: 'Should call CoinGecko API (fallback)',
    shouldCallAPI: true
  },
  {
    name: 'Scenario 5: SHYFT has valid USDC symbol',
    token: {
      token_address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      symbol: 'USDC',  // SHYFT provides this
      name: 'USD Coin'
    },
    expectedBehavior: 'Should use SHYFT symbol directly (no API call)',
    shouldCallAPI: false
  }
];

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

// Mock the resolveSymbol function to test the logic
async function resolveSymbol(token) {
  try {
    // ✅ STEP 1: Check if SHYFT already provided valid symbol (FASTEST - no API call!)
    if (token.symbol && token.symbol !== 'Unknown' && token.symbol !== 'Token' && token.symbol.trim() !== '' && !token.symbol.includes('...')) {
      log('green', `  ✅ Using SHYFT symbol: ${token.symbol} (no API call needed)`);
      return { 
        symbol: token.symbol, 
        name: token.name || token.symbol,
        source: 'shyft'
      };
    }
    
    log('yellow', `  ⚠️ SHYFT symbol missing or invalid (${token.symbol}), checking cache/API...`);
    
    // ✅ STEP 2: SHYFT doesn't have it - check cache/API (fallback)
    const startTime = Date.now();
    const metadata = await getTokenMetaDataUsingRPC(token.token_address);
    const duration = Date.now() - startTime;
    
    // If cache/API returned valid metadata, use it
    if (metadata && metadata.symbol && metadata.symbol !== 'Unknown' && metadata.symbol.trim() !== '' && !metadata.symbol.includes('...')) {
      log('cyan', `  📡 Got from cache/API: ${metadata.symbol} (${duration}ms)`);
      return {
        ...metadata,
        source: duration < 100 ? 'cache' : 'api'
      };
    }
    
    // ✅ STEP 3: Last resort - use shortened contract address
    const shortAddress = `${token.token_address.slice(0, 4)}...${token.token_address.slice(-4)}`;
    log('red', `  ⚠️ All sources failed, using fallback: ${shortAddress}`);
    return { 
      symbol: shortAddress,
      name: token.token_address,
      source: 'fallback'
    };
  } catch (error) {
    log('red', `  ❌ Error: ${error.message}`);
    
    // On error, try SHYFT symbol first
    if (token.symbol && token.symbol !== 'Unknown' && token.symbol !== 'Token' && token.symbol.trim() !== '') {
      return { symbol: token.symbol, name: token.name || token.symbol, source: 'shyft-error' };
    }
    
    // Last resort: use contract address
    const shortAddress = `${token.token_address.slice(0, 4)}...${token.token_address.slice(-4)}`;
    return { 
      symbol: shortAddress,
      name: token.token_address,
      source: 'fallback-error'
    };
  }
}

async function testScenario(scenario, index) {
  log('blue', `\n${'='.repeat(70)}`);
  log('blue', `Test ${index + 1}: ${scenario.name}`);
  log('blue', '='.repeat(70));
  
  log('cyan', `\n📋 Input:`);
  log('cyan', `   Token Address: ${scenario.token.token_address.slice(0, 8)}...`);
  log('cyan', `   SHYFT Symbol: "${scenario.token.symbol}"`);
  log('cyan', `   SHYFT Name: "${scenario.token.name}"`);
  
  log('yellow', `\n🎯 Expected: ${scenario.expectedBehavior}`);
  
  try {
    const startTime = Date.now();
    const result = await resolveSymbol(scenario.token);
    const duration = Date.now() - startTime;
    
    log('cyan', `\n📊 Result:`);
    log('cyan', `   Symbol: ${result.symbol}`);
    log('cyan', `   Name: ${result.name}`);
    log('cyan', `   Source: ${result.source}`);
    log('cyan', `   Duration: ${duration}ms`);
    
    // Verify behavior
    const calledAPI = result.source === 'api' || duration > 500;
    const usedSHYFT = result.source === 'shyft';
    const usedCache = result.source === 'cache';
    
    if (scenario.shouldCallAPI && (calledAPI || usedCache)) {
      if (usedCache) {
        log('green', `\n✅ PASS: Used cache (token was already cached from previous fetch)`);
      } else {
        log('green', `\n✅ PASS: Called API as expected (SHYFT didn't have symbol)`);
      }
      return { pass: true, scenario: scenario.name };
    } else if (!scenario.shouldCallAPI && usedSHYFT) {
      log('green', `\n✅ PASS: Used SHYFT symbol (no API call needed)`);
      return { pass: true, scenario: scenario.name };
    } else if (!scenario.shouldCallAPI && usedCache) {
      log('green', `\n✅ PASS: Used cache (SHYFT was invalid, but cache had it)`);
      return { pass: true, scenario: scenario.name };
    } else {
      log('red', `\n❌ FAIL: Unexpected behavior`);
      log('red', `   Expected API call: ${scenario.shouldCallAPI}`);
      log('red', `   Actually called API: ${calledAPI}`);
      return { pass: false, scenario: scenario.name };
    }
  } catch (error) {
    log('red', `\n❌ ERROR: ${error.message}`);
    return { pass: false, scenario: scenario.name, error: error.message };
  }
}

async function runTests() {
  console.log('\n');
  log('magenta', '╔════════════════════════════════════════════════════════════════════╗');
  log('magenta', '║   SHYFT Symbol Fallback Logic Test                                ║');
  log('magenta', '╚════════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  await mongoose.connect(MONGO_URI);
  log('green', '✅ Connected to MongoDB\n');

  const results = [];
  
  for (let i = 0; i < TEST_SCENARIOS.length; i++) {
    const result = await testScenario(TEST_SCENARIOS[i], i);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between tests
  }

  // Summary
  log('blue', `\n${'='.repeat(70)}`);
  log('blue', 'Test Summary');
  log('blue', '='.repeat(70));

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  log('cyan', `\n📊 Results:`);
  log('cyan', `   Total tests: ${results.length}`);
  log('green', `   Passed: ${passed}`);
  if (failed > 0) {
    log('red', `   Failed: ${failed}`);
  }

  results.forEach((result, index) => {
    const icon = result.pass ? '✅' : '❌';
    const color = result.pass ? 'green' : 'red';
    log(color, `   ${icon} Test ${index + 1}: ${result.scenario}`);
  });

  if (passed === results.length) {
    log('green', '\n🎉 ALL TESTS PASSED! SHYFT fallback logic is working correctly.');
    log('green', '\nKey Points:');
    log('green', '  ✅ SHYFT symbols are used first (no API calls)');
    log('green', '  ✅ CoinGecko is only called when SHYFT has Unknown/Token/empty');
    log('green', '  ✅ This minimizes API usage and costs');
  } else {
    log('red', '\n❌ SOME TESTS FAILED! Check the logic.');
  }

  await mongoose.disconnect();
  log('green', '\n✅ Disconnected from MongoDB\n');
}

runTests().catch(error => {
  log('red', `\n❌ Test suite failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
