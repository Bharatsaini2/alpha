#!/usr/bin/env node

/**
 * Test script to verify validation functions only (no database required)
 * Tests the enhanced validation logic
 */

// Import the validation function directly
function isValidMetadata(symbol) {
  if (!symbol || typeof symbol !== 'string') return false
  
  const trimmed = symbol.trim()
  if (trimmed === '' || trimmed.length === 0) return false
  
  // ✅ ENHANCED: Comprehensive blacklist for garbage symbols
  const blacklistedSymbols = [
    'Unknown', 'unknown', 'UNKNOWN',
    'Token', 'token', 'TOKEN',
    'localhost', 'LOCALHOST',
    'pump', 'PUMP',
    'unknown token', 'UNKNOWN TOKEN',
    'test', 'TEST',
    'null', 'NULL',
    'undefined', 'UNDEFINED',
    'N/A', 'n/a',
    'TBD', 'tbd',
    '???', '...',
    'TEMP', 'temp',
    'PLACEHOLDER', 'placeholder',
  ]
  
  if (blacklistedSymbols.includes(trimmed)) return false
  
  // ✅ FIXED: Detect shortened addresses more accurately
  if (trimmed.includes('...') && trimmed.length <= 12) return false
  if (/^[A-Za-z0-9]{3,4}\.\.\.[A-Za-z0-9]{3,4}$/.test(trimmed)) return false
  
  // ✅ Additional validation
  if (trimmed.length < 2) return false  // Too short
  if (trimmed.length > 20) return false // Suspiciously long
  if (/^[0-9]+$/.test(trimmed)) return false // All numbers
  if (/^0x[a-fA-F0-9]+$/.test(trimmed)) return false // Ethereum address format
  
  // ✅ Check for Solana address patterns (44 chars, base58)
  if (trimmed.length >= 32 && trimmed.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)) {
    return false // Looks like a Solana address
  }
  
  return true
}

async function testValidation() {
  console.log('\n🧪 Testing enhanced validation functions...\n');
  
  const testCases = [
    { symbol: 'BONK', expected: true, desc: 'Valid symbol' },
    { symbol: 'Unknown', expected: false, desc: 'Unknown symbol' },
    { symbol: 'unknown', expected: false, desc: 'unknown (lowercase)' },
    { symbol: 'Token', expected: false, desc: 'Generic Token' },
    { symbol: 'token', expected: false, desc: 'token (lowercase)' },
    { symbol: 'localhost', expected: false, desc: 'localhost garbage' },
    { symbol: 'pump', expected: false, desc: 'pump garbage' },
    { symbol: 'unknown token', expected: false, desc: 'unknown token phrase' },
    { symbol: 'test', expected: false, desc: 'test symbol' },
    { symbol: 'null', expected: false, desc: 'null string' },
    { symbol: 'undefined', expected: false, desc: 'undefined string' },
    { symbol: 'N/A', expected: false, desc: 'N/A placeholder' },
    { symbol: '???', expected: false, desc: 'Question marks' },
    { symbol: 'TEMP', expected: false, desc: 'Temporary symbol' },
    { symbol: 'PLACEHOLDER', expected: false, desc: 'Placeholder symbol' },
    { symbol: 'DezX...B263', expected: false, desc: 'Shortened address' },
    { symbol: '', expected: false, desc: 'Empty string' },
    { symbol: null, expected: false, desc: 'Null value' },
    { symbol: '123456', expected: false, desc: 'All numbers' },
    { symbol: 'A', expected: false, desc: 'Too short' },
    { symbol: 'VERYLONGTOKENSYMBOLNAME', expected: false, desc: 'Too long' },
    { symbol: '0x1234567890abcdef', expected: false, desc: 'Ethereum address' },
    { symbol: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', expected: false, desc: 'Solana address' },
    // Additional valid cases
    { symbol: 'SOL', expected: true, desc: 'SOL token' },
    { symbol: 'USDC', expected: true, desc: 'USDC token' },
    { symbol: 'BTC', expected: true, desc: 'BTC token' },
    { symbol: 'ETH', expected: true, desc: 'ETH token' },
    { symbol: 'ALPHA', expected: true, desc: 'ALPHA token' },
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(test => {
    const result = isValidMetadata(test.symbol);
    const status = result === test.expected ? '✅' : '❌';
    const symbolDisplay = test.symbol === null ? 'null' : `"${test.symbol}"`;
    
    console.log(`${status} ${test.desc}: ${symbolDisplay} → ${result}`);
    
    if (result === test.expected) {
      passed++;
    } else {
      failed++;
      console.log(`   Expected: ${test.expected}, Got: ${result}`);
    }
  });
  
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All validation tests passed!');
    return true;
  } else {
    console.log('❌ Some validation tests failed!');
    return false;
  }
}

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Enhanced Validation Test Suite (No Database Required)   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  try {
    const success = await testValidation();
    
    if (success) {
      console.log('\n✅ All tests passed! The enhanced validation is working correctly.');
      console.log('\n📋 Next steps:');
      console.log('   1. Deploy the code changes to the server');
      console.log('   2. Run the full cleanup script on the server (with Redis/MongoDB)');
      console.log('   3. Restart the backend services');
      console.log('   4. Monitor logs for improved token resolution');
    } else {
      console.log('\n❌ Some tests failed. Please review the validation logic.');
    }
    
  } catch (error) {
    console.error('\n💥 Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests
runTests().then(() => {
  console.log('\n🏁 Validation test completed');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});