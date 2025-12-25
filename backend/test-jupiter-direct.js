/**
 * Direct Jupiter API test to debug transaction issues
 * Run with: node test-jupiter-direct.js
 */

const axios = require('axios');
require('dotenv').config();

const JUPITER_API = 'https://quote-api.jup.ag/v6';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Replace with your actual wallet address
const YOUR_WALLET = process.env.TEST_WALLET_ADDRESS || 'YOUR_WALLET_ADDRESS_HERE';

async function testJupiterSwap() {
  try {
    console.log('🧪 Testing Jupiter API directly...\n');
    
    // Step 1: Get Quote
    console.log('📊 Step 1: Getting quote for 0.1 SOL → USDC');
    const quoteParams = {
      inputMint: SOL_MINT,
      outputMint: USDC_MINT,
      amount: 100000000, // 0.1 SOL in lamports
      slippageBps: 100, // 1% slippage
    };
    
    console.log('Quote params:', quoteParams);
    
    const quoteResponse = await axios.get(`${JUPITER_API}/quote`, {
      params: quoteParams,
    });
    
    console.log('✅ Quote received:');
    console.log(`   Input: ${quoteResponse.data.inAmount} lamports SOL`);
    console.log(`   Output: ${quoteResponse.data.outAmount} USDC (smallest unit)`);
    console.log(`   Price Impact: ${quoteResponse.data.priceImpactPct}%\n`);
    
    // Step 2: Get Swap Transaction
    console.log('🔄 Step 2: Getting swap transaction');
    const swapRequest = {
      quoteResponse: quoteResponse.data,
      userPublicKey: YOUR_WALLET,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 1000,
    };
    
    console.log('Swap request:', {
      userPublicKey: YOUR_WALLET,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    });
    
    const swapResponse = await axios.post(`${JUPITER_API}/swap`, swapRequest);
    
    console.log('✅ Swap transaction received:');
    console.log(`   Transaction length: ${swapResponse.data.swapTransaction.length} chars`);
    console.log(`   Last valid block height: ${swapResponse.data.lastValidBlockHeight}`);
    
    if (swapResponse.data.computeUnitLimit) {
      console.log(`   Compute units: ${swapResponse.data.computeUnitLimit}`);
    }
    
    console.log('\n✅ SUCCESS! Jupiter API is working correctly.');
    console.log('The issue might be in how the transaction is being signed/sent.\n');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.response?.data || error.message);
    
    if (error.response?.data) {
      console.error('\nFull error response:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.log('\n💡 Troubleshooting:');
    console.log('1. Make sure TEST_WALLET_ADDRESS is set in .env');
    console.log('2. Check if the wallet has SOL balance');
    console.log('3. Try with a different amount or token pair');
  }
}

testJupiterSwap();
