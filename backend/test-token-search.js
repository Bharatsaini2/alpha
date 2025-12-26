/**
 * Test script for Jupiter Ultra token search functionality
 * 
 * This script tests:
 * 1. Backend /api/v1/trade/search endpoint with various queries
 * 2. Response format and required fields
 * 3. Error handling for invalid queries
 * 4. Token image URLs and fallback handling
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:9090/api/v1';

// ANSI color codes for terminal output
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
    expectedFields: ['id', 'name', 'symbol', 'decimals', 'icon'],
    shouldContain: 'SOL',
  },
  {
    name: 'Search by token symbol (USDC)',
    query: 'USDC',
    expectedFields: ['id', 'name', 'symbol', 'decimals'],
    shouldContain: 'USDC',
  },
  {
    name: 'Search by token name (Solana)',
    query: 'Solana',
    expectedFields: ['id', 'name', 'symbol', 'decimals'],
    shouldContain: 'SOL',
  },
  {
    name: 'Search by mint address (SOL)',
    query: 'So11111111111111111111111111111111111111112',
    expectedFields: ['id', 'name', 'symbol', 'decimals'],
    shouldContain: 'SOL',
  },
  {
    name: 'Search with partial match (USD)',
    query: 'USD',
    expectedFields: ['id', 'name', 'symbol', 'decimals'],
    minResults: 1,
  },
];

// Error test cases
const errorTestCases = [
  {
    name: 'Empty query',
    query: '',
    expectedError: 'INVALID_QUERY',
  },
  {
    name: 'Query too short (single character)',
    query: 'S',
    // Jupiter Ultra may still return results for single character
    allowResults: true,
  },
];

async function testTokenSearch(testCase) {
  logTest(testCase.name);
  
  try {
    const response = await axios.get(`${BASE_URL}/trade/search`, {
      params: { query: testCase.query },
      timeout: 15000,
    });

    // Check response structure
    if (!response.data.success) {
      logError('Response success field is false');
      return false;
    }

    logSuccess('Response success: true');

    // Check data structure
    if (!response.data.data) {
      logError('Response missing data field');
      return false;
    }

    const { query, tokens, count } = response.data.data;

    logInfo(`Query: "${query}"`);
    logInfo(`Results: ${count} tokens found`);

    if (count === 0) {
      logWarning('No tokens found');
      if (testCase.minResults && testCase.minResults > 0) {
        logError(`Expected at least ${testCase.minResults} results`);
        return false;
      }
      return true;
    }

    // Check minimum results
    if (testCase.minResults && count < testCase.minResults) {
      logError(`Expected at least ${testCase.minResults} results, got ${count}`);
      return false;
    }

    // Verify first token has required fields
    const firstToken = tokens[0];
    logInfo(`First result: ${firstToken.symbol} - ${firstToken.name}`);

    for (const field of testCase.expectedFields) {
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
      isVerified: firstToken.isVerified,
    }, null, 2));

    // Check token image URL
    if (firstToken.icon) {
      logSuccess(`Token has image URL: ${firstToken.icon.substring(0, 60)}...`);
    } else {
      logWarning('Token has no image URL (will use fallback)');
    }

    return true;
  } catch (error) {
    if (error.response) {
      logError(`HTTP ${error.response.status}: ${error.response.statusText}`);
      console.log('Error response:', JSON.stringify(error.response.data, null, 2));
    } else if (error.code === 'ECONNREFUSED') {
      logError('Connection refused - is the backend server running?');
      logInfo('Start the backend with: cd alpha-tracker-ai/backend && npm start');
    } else {
      logError(`Error: ${error.message}`);
    }
    return false;
  }
}

async function testErrorHandling(testCase) {
  logTest(testCase.name);

  try {
    const response = await axios.get(`${BASE_URL}/trade/search`, {
      params: { query: testCase.query },
      timeout: 15000,
    });

    // If we expect an error but got success
    if (testCase.expectedError && response.data.success) {
      if (testCase.allowResults) {
        logWarning('Expected error but got results (Jupiter Ultra may allow this)');
        logInfo(`Results: ${response.data.data.count} tokens found`);
        return true;
      } else {
        logError('Expected error but got success response');
        return false;
      }
    }

    // If we got an error response
    if (!response.data.success) {
      const errorCode = response.data.error?.code;
      logInfo(`Error code: ${errorCode}`);

      if (testCase.expectedError && errorCode === testCase.expectedError) {
        logSuccess(`Got expected error: ${errorCode}`);
        return true;
      } else {
        logError(`Expected error ${testCase.expectedError}, got ${errorCode}`);
        return false;
      }
    }

    return true;
  } catch (error) {
    if (error.response) {
      const errorCode = error.response.data?.error?.code;
      logInfo(`HTTP ${error.response.status}: ${errorCode}`);

      if (testCase.expectedError && errorCode === testCase.expectedError) {
        logSuccess(`Got expected error: ${errorCode}`);
        return true;
      } else {
        logError(`Expected error ${testCase.expectedError}, got ${errorCode}`);
        return false;
      }
    } else if (error.code === 'ECONNREFUSED') {
      logError('Connection refused - is the backend server running?');
      return false;
    } else {
      logError(`Unexpected error: ${error.message}`);
      return false;
    }
  }
}

async function runTests() {
  logSection('Jupiter Ultra Token Search - Verification Tests');

  let passedTests = 0;
  let failedTests = 0;

  // Run normal test cases
  logSection('Test Cases: Valid Queries');
  for (const testCase of testCases) {
    const passed = await testTokenSearch(testCase);
    if (passed) {
      passedTests++;
    } else {
      failedTests++;
    }
    await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
  }

  // Run error test cases
  logSection('Test Cases: Error Handling');
  for (const testCase of errorTestCases) {
    const passed = await testErrorHandling(testCase);
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
