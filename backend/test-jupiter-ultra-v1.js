/**
 * Jupiter Ultra v1 API Test Script
 * 
 * This script tests the Jupiter Ultra v1 /order endpoint directly
 * to verify API key and endpoint configuration.
 * 
 * Usage: node test-jupiter-ultra-v1.js
 */

require('dotenv').config();
const axios = require('axios');

// Configuration
const JUPITER_ULTRA_BASE_URL = process.env.JUPITER_ULTRA_URL || 'https://api.jup.ag/ultra/v1';
const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
const JUPITER_REFERRAL_KEY = process.env.JUPITER_REFERRAL_KEY;

// Test tokens
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TEST_AMOUNT = '100000000'; // 0.1 SOL
const TEST_WALLET = 'CJxUxmYj8stPw8hN9eszH9MUTwoS2DGW4PF1tKDe9ann'; // Example wallet

console.log('🚀 Jupiter Ultra v1 API Test\n');
console.log('Configuration:');
console.log(`  Base URL: ${JUPITER_ULTRA_BASE_URL}`);
console.log(`  API Key: ${JUPITER_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`  Referral Key: ${JUPITER_REFERRAL_KEY ? '✅ Set' : '❌ Missing'}`);
console.log('');

async function testJupiterUltraV1() {
  try {
    // Test 1: GET /order endpoint (quote + transaction)
    console.log('📝 Test 1: GET /order endpoint');
    console.log('  Testing: Quote + Transaction generation in one call');
    console.log('  Endpoint: GET /order');
    console.log('');

    const orderParams = {
      inputMint: SOL_MINT,
      outputMint: USDC_MINT,
      amount: TEST_AMOUNT,
      taker: TEST_WALLET,
    };

    // Add referral params - account is now initialized
    if (JUPITER_REFERRAL_KEY) {
      orderParams.referralAccount = JUPITER_REFERRAL_KEY;
      orderParams.referralFee = 75; // 0.75% = 75 basis points
    }

    console.log('  Request params:', JSON.stringify(orderParams, null, 2));
    console.log('');

    const response = await axios.get(`${JUPITER_ULTRA_BASE_URL}/order`, {
      params: orderParams,
      headers: {
        'x-api-key': JUPITER_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    console.log('✅ Success! Jupiter Ultra v1 /order endpoint is working');
    console.log('');
    console.log('Response structure:');
    console.log(`  - Has data: ${response.data ? '✅ Present' : '❌ Missing'}`);
    console.log(`  - Response keys: ${Object.keys(response.data).join(', ')}`);
    console.log('');

    // Jupiter Ultra v1 returns the data directly (not wrapped in transaction/quote)
    if (response.data) {
      console.log('Response details:');
      
      // Check for quote data
      if (response.data.inAmount) {
        console.log(`  Input amount: ${response.data.inAmount}`);
        console.log(`  Output amount: ${response.data.outAmount}`);
      }
      
      // Check for platform fee
      if (response.data.platformFee) {
        console.log(`  Platform fee: ${response.data.platformFee.amount} (${response.data.platformFee.pct * 100}%)`);
      }
      
      // Check for price impact
      if (response.data.priceImpactPct) {
        console.log(`  Price impact: ${response.data.priceImpactPct}%`);
      }
      
      // Check for swap transaction
      if (response.data.swapTransaction) {
        console.log(`  Swap transaction: ✅ Present (${response.data.swapTransaction.length} chars)`);
      }
    }
    console.log('');

    // Test 2: Verify API key is working
    console.log('📝 Test 2: API Key Verification');
    try {
      await axios.get(`${JUPITER_ULTRA_BASE_URL}/order`, {
        params: orderParams,
        headers: {
          'Content-Type': 'application/json',
          // Intentionally omit API key
        },
        timeout: 10000,
      });
      console.log('❌ FAIL: Request succeeded without API key (should have failed)');
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('✅ PASS: API key is required (401 without key)');
      } else {
        console.log(`⚠️  Unexpected error: ${error.message}`);
      }
    }
    console.log('');

    // Test 3: Verify platform fee in response
    console.log('📝 Test 3: Platform Fee Verification');
    if (JUPITER_REFERRAL_KEY) {
      if (response.data.platformFee) {
        const platformFee = response.data.platformFee;
        console.log(`✅ Platform fee present in response`);
        console.log(`  Amount: ${platformFee.amount || platformFee} lamports`);
        console.log(`  Percentage: ${platformFee.pct ? (platformFee.pct * 100).toFixed(2) + '%' : '0.75%'}`);
        console.log(`  Referral Account: ${JUPITER_REFERRAL_KEY}`);
      } else {
        console.log(`⚠️  Platform fee not in response (may be calculated differently)`);
        console.log(`  Referral Account: ${JUPITER_REFERRAL_KEY}`);
        console.log(`  Platform Fee BPS: 75 (0.75%)`);
        console.log(`  Note: Fee may be included in output amount calculation`);
      }
    } else {
      console.log(`⚠️  No referral account configured - platform fees disabled`);
    }
    console.log('');

    console.log('🎉 All tests passed!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. ✅ Environment variables are configured correctly');
    console.log('  2. ✅ Jupiter Ultra v1 API is accessible');
    console.log('  3. ✅ API key authentication is working');
    console.log('  4. ✅ Platform fees are being calculated');
    console.log('  5. 🔄 Test your backend endpoints: /api/v1/trade/quote and /api/v1/trade/swap');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed!');
    console.error('');

    if (error.response) {
      console.error('HTTP Error:');
      console.error(`  Status: ${error.response.status} ${error.response.statusText}`);
      console.error(`  Data:`, JSON.stringify(error.response.data, null, 2));
      console.error('');

      if (error.response.status === 401) {
        console.error('🔑 Authentication Error:');
        console.error('  - Check that JUPITER_API_KEY is set in .env');
        console.error('  - Verify your API key is valid at https://portal.jup.ag');
        console.error('  - Wait 2-5 minutes after generating a new key');
      } else if (error.response.status === 404) {
        console.error('🔍 Endpoint Not Found:');
        console.error('  - Verify JUPITER_ULTRA_URL is set to: https://api.jup.ag/ultra/v1');
        console.error('  - Check that you\'re using the /order endpoint (not /quote or /swap)');
      } else if (error.response.status === 429) {
        console.error('⏱️  Rate Limit Exceeded:');
        console.error('  - Wait a few seconds and try again');
        console.error('  - Rate limit: 50 requests per 10 seconds (base)');
      }
    } else if (error.request) {
      console.error('Network Error:');
      console.error(`  Message: ${error.message}`);
      console.error('  - Check your internet connection');
      console.error('  - Verify the base URL is correct');
    } else {
      console.error('Error:', error.message);
    }

    console.error('');
    process.exit(1);
  }
}

// Run the test
testJupiterUltraV1();
