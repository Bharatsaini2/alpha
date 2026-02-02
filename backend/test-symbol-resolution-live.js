/**
 * Test Symbol Resolution on Production Server
 * This script tests if the DexScreener fallback is working
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import the function (we'll need to require the compiled JS)
const { getTokenMetaDataUsingRPC } = require('./dist/config/solana-tokens-config');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/alpha-tracker';

// Test tokens that should trigger DexScreener fallback
const TEST_TOKENS = [
  {
    name: 'POPCAT (should use DexScreener)',
    address: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
    expected: 'POPCAT'
  },
  {
    name: 'BONK (should use DexScreener)',
    address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    expected: 'BONK'
  },
  {
    name: 'Unknown token (should use DexScreener)',
    address: 'GJAFwWjJ3vnTsrQVabjBVK2TYB1YtRCQXRDfDgUnpump',
    expected: 'Should resolve or show shortened address'
  }
];

async function testSymbolResolution() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║   Test Symbol Resolution with DexScreener Fallback                ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  try {
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');
    
    for (const token of TEST_TOKENS) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`Testing: ${token.name}`);
      console.log(`Address: ${token.address}`);
      console.log(`Expected: ${token.expected}`);
      console.log('─'.repeat(70));
      
      try {
        const result = await getTokenMetaDataUsingRPC(token.address);
        
        console.log(`\n✅ Result:`);
        console.log(`   Symbol: ${result.symbol}`);
        console.log(`   Name: ${result.name}`);
        
        if (result.symbol === token.expected) {
          console.log(`   ✅ PASS: Got expected symbol`);
        } else if (result.symbol && result.symbol !== 'Unknown') {
          console.log(`   ✅ PASS: Got valid symbol (${result.symbol})`);
        } else {
          console.log(`   ⚠️ WARNING: Got "${result.symbol}"`);
        }
      } catch (error) {
        console.error(`   ❌ ERROR: ${error.message}`);
      }
      
      // Wait 2 seconds between tests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║   Test Complete                                                    ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run the test
testSymbolResolution().catch(console.error);
