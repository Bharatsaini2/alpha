#!/usr/bin/env node

/**
 * Test script to verify token resolution fixes
 * Tests the complete fallback chain and validation
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import the fixed functions
const { 
  getTokenMetaDataUsingRPC, 
  cleanupPoisonedCache,
  isValidMetadata 
} = require('./src/config/solana-tokens-config');

// Test tokens
const TEST_TOKENS = [
  {
    name: 'BONK (should work)',
    address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    expectedSymbol: 'BONK'
  },
  {
    name: 'SOL (should work)',
    address: 'So11111111111111111111111111111111111111112',
    expectedSymbol: 'SOL'
  },
  {
    name: 'Random token (may fail)',
    address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    expectedSymbol: null // Unknown
  },
  {
    name: 'Invalid address (should fail)',
    address: 'invalid-address-123',
    expectedSymbol: null
  }
];

async function testValidation() {
  console.log('\n🧪 Testing validation functions...\n');
  
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
  ];
  
  testCases.forEach(test => {
    const result = isValidMetadata(test.symbol);
    const status = result === test.expected ? '✅' : '❌';
    console.log(`${status} ${test.desc}: "${test.symbol}" → ${result}`);
  });
}

async function testTokenResolution() {
  console.log('\n🔍 Testing token resolution...\n');
  
  // Connect to MongoDB
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/alpha-tracker';
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');
  
  for (const token of TEST_TOKENS) {
    console.log(`\n🪙 Testing: ${token.name}`);
    console.log(`   Address: ${token.address}`);
    
    try {
      const startTime = Date.now();
      const result = await getTokenMetaDataUsingRPC(token.address);
      const duration = Date.now() - startTime;
      
      console.log(`   Result: ${result.symbol} (${result.name})`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Is shortened: ${result._isShortened || false}`);
      
      if (token.expectedSymbol) {
        const status = result.symbol === token.expectedSymbol ? '✅' : '❌';
        console.log(`   ${status} Expected: ${token.expectedSymbol}, Got: ${result.symbol}`);
      } else {
        console.log(`   ℹ️  No expected result (testing fallback behavior)`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
}

async function testCacheCleanup() {
  console.log('\n🧹 Testing cache cleanup...\n');
  
  try {
    await cleanupPoisonedCache();
    console.log('✅ Cache cleanup test completed');
  } catch (error) {
    console.log(`❌ Cache cleanup failed: ${error.message}`);
  }
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Token Resolution Fixes Test Suite                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  try {
    // Test 1: Validation functions
    await testValidation();
    
    // Test 2: Token resolution
    await testTokenResolution();
    
    // Test 3: Cache cleanup
    await testCacheCleanup();
    
    console.log('\n🎉 All tests completed!');
    
  } catch (error) {
    console.error('\n💥 Test suite failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run tests
runAllTests().then(() => {
  console.log('\n✅ Test script finished');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Test script failed:', error);
  process.exit(1);
});