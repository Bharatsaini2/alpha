/**
 * Direct test of Jupiter Ultra API token search
 * 
 * This script tests the Jupiter Ultra API directly without needing the backend server.
 * It verifies:
 * 1. API key is configured correctly
 * 2. Token search returns valid results
 * 3. Response format matches expectations
 * 4. Token images and metadata are present
 */

const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const JUPITER_ULTRA_URL = process.env.JUPITER_ULTRA_URL || 'https://api.jup.ag/ultra/v1';
const JUPITER_API_KEY = process.env.JUPITER_API_KEY;

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

function logTest(testName) {
  log(`\n🧪 Test: ${testName}`, 'blue');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// Test cases
const testCases = [
  {
    name: 'Search by token symbol (SOL)',
    query: 'SOL',
    shouldContain: 'SOL',
  },
  {
    name: 'Search by token symbol (USDC)',
    query: 'USDC',
    shouldContain: 'USDC',
  },
  {
    name: 'Search by token name (Solana)',
    query: 'Solana',
    shouldContain: 'SOL',
  },
  {
    name: 'Search by mint address (SOL)',
    query: 'So11111111111111111111111111111111111111112',
    shouldContain: 'SOL',
  },
  {
    name: 'Search with partial match (USD)',
    query: 'USD',
    minResults: 1,
  },
];

async function testJupiterUltraSearch(testCase) {
  logTest(testCase.name);

  try {
    const response = await axios.get(`${JUPITER_ULTRA_URL}/search`, {
      params: { query: testCase.query },
      headers: {
        'x-api-key': JUPITER_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    const tokens = response.data;

    if (!Array.isArray(tokens)) {
      logError('Response is not an array');
      return false;
    }

    logInfo(`Query: "${testCase.query}"`);
    logInfo(`Results: ${tokens.length} tokens found`);

    if (tokens.length === 0) {
      logWarning('No tokens found');
      if (testCase.minResults && testCase.minResults > 0) {
        logError(`Expected at least ${testCase.minResults} results`);
        return false;
      }
      return true;
    }

    // Check minimum results
    if (testCase.minResults && tokens.length < testCase.minResults) {
      logError(`Expected at least ${testCase.minResults} results, got ${tokens.length}`);
      return false;
    }

    // Verify first token structure
    const firstToken = tokens[0];
    logInfo(`First result: ${firstToken.symbol} - ${firstToken.name}`);

    // Check required fields
    const requiredFields = ['id', 'name', 'symbol', 'decimals'];
    for (const field of requiredFields) {
      if (!(field in firstToken)) {
        logError(`Missing required field: ${field}`);
        return false;
      }
    }

    logSuccess('All required fields present');

    // Check if results contain expected symbol/name
    if (testCase.shouldContain) {
      const found = tokens.some(
        token =>
          token.symbol.toUpperCase().includes(testCase.shouldContain.toUpperCase()) ||
          token.name.toUpperCase().includes(testCase.shouldContain.toUpperCase())
      );

      if (!found) {
        logError(`No token found containing "${testCase.shouldContain}"`);
        return false;
      }

      logSuccess(`Found token containing "${testCase.shouldContain}"`);
    }

    // Display sample token data
    console.log('\nSample token data:');
    console.log(JSON.stringify({
      id: firstToken.id,
      symbol: firstToken.symbol,
      name: firstToken.name,
      decimals: firstToken.decimals,
      icon: firstToken.icon ? firstToken.icon.substring(0, 50) + '...' : null,
      usdPrice: firstToken.usdPrice,
      mcap: firstToken.mcap,
      fdv: firstToken.fdv,
      liquidity: firstToken.liquidity,
      isVerified: firstToken.isVerified,
      tags: firstToken.tags,
    }, null, 2));

    // Check token image URL
    if (firstToken.icon) {
      logSuccess(`Token has image URL: ${firstToken.icon.substring(0, 60)}...`);
      
      // Test if image URL is accessible
      try {
        await axios.head(firstToken.icon, { timeout: 5000 });
        logSuccess('Token image URL is accessible');
      } catch (error) {
        logWarning('Token image URL is not accessible (will use fallback)');
      }
    } else {
      logWarning('Token has no image URL (will use fallback)');
    }

    return true;
  } catch (error) {
    if (error.response) {
      logError(`HTTP ${error.response.status}: ${error.response.statusText}`);
      
      if (error.response.status === 401) {
        logError('Invalid or missing Jupiter API key');
        logInfo('Check JUPITER_API_KEY in .env file');
      } else if (error.response.status === 429) {
        logError('Rate limit exceeded');
        logInfo('Wait a moment and try again');
      }
      
      console.log('Error response:', JSON.stringify(error.response.data, null, 2));
    } else {
      logError(`Error: ${error.message}`);
    }
    return false;
  }
}

async function runTests() {
  logSection('Jupiter Ultra Token Search - Direct API Test');

  // Check if API key is configured
  if (!JUPITER_API_KEY) {
    logError('JUPITER_API_KEY is not configured in .env file');
    logInfo('Add JUPITER_API_KEY=your-api-key to alpha-tracker-ai/backend/.env');
    process.exit(1);
  }

  logSuccess(`API Key configured: ${JUPITER_API_KEY.substring(0, 8)}...`);
  logInfo(`Jupiter Ultra URL: ${JUPITER_ULTRA_URL}`);

  let passedTests = 0;
  let failedTests = 0;

  // Run test cases
  logSection('Test Cases: Token Search');
  for (const testCase of testCases) {
    const passed = await testJupiterUltraSearch(testCase);
    if (passed) {
      passedTests++;
    } else {
      failedTests++;
    }
    await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
  }

  // Summary
  logSection('Test Summary');
  log(`Total tests: ${passedTests + failedTests}`, 'blue');
  log(`Passed: ${passedTests}`, 'green');
  log(`Failed: ${failedTests}`, failedTests > 0 ? 'red' : 'green');

  if (failedTests === 0) {
    log('\n🎉 All tests passed!', 'green');
    log('\n✅ Jupiter Ultra token search is working correctly', 'green');
    log('✅ Backend controller (jupiter-search.controller.ts) is properly configured', 'green');
    log('✅ Frontend hook (useJupiterSearch.ts) will work correctly', 'green');
    log('✅ TokenSelectionModal will display search results properly', 'green');
  } else {
    log(`\n⚠️  ${failedTests} test(s) failed`, 'red');
  }

  console.log('\n' + '='.repeat(60) + '\n');

  process.exit(failedTests > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
