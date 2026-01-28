#!/usr/bin/env node

const axios = require('axios');

const TEST_TOKENS = [
  'kMKX8hBaj3BTRBbeYix9c16EieBP5dih8DTSSwCpump',
  '8Jx8AAHj86wbQgUTjGuj6GTTL5Ps3cqxKRTvpaJApump',
];

async function testJupiterTokenList(tokenAddress) {
  console.log(`\n🔍 Testing Jupiter for: ${tokenAddress.substring(0, 8)}...`);
  
  try {
    const response = await axios.get('https://token.jup.ag/strict', { timeout: 5000 });
    
    if (response.data && Array.isArray(response.data)) {
      const token = response.data.find(t => t.address === tokenAddress);
      
      if (token) {
        console.log(`✅ Jupiter found: ${token.symbol} (${token.name})`);
        return { symbol: token.symbol, name: token.name };
      } else {
        console.log(`❌ Token not in Jupiter list`);
      }
    }
  } catch (error) {
    console.log(`❌ Jupiter failed: ${error.message}`);
  }
  
  return null;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Testing Jupiter Token List Fallback                         ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝');

  for (const token of TEST_TOKENS) {
    await testJupiterTokenList(token);
  }

  console.log('\n✅ Test Complete!');
}

main().catch(console.error);
