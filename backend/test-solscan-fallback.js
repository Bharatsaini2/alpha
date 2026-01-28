#!/usr/bin/env node

const axios = require('axios');

const TEST_TOKENS = [
  'kMKX8hBaj3BTRBbeYix9c16EieBP5dih8DTSSwCpump',
  '8Jx8AAHj86wbQgUTjGuj6GTTL5Ps3cqxKRTvpaJApump',
];

async function testSolscan(tokenAddress) {
  console.log(`\n🔍 Testing Solscan for: ${tokenAddress.substring(0, 8)}...`);
  
  try {
    const response = await axios.get(
      `https://api.solscan.io/token/meta?token=${tokenAddress}`,
      { timeout: 5000 }
    );
    
    if (response.data) {
      const symbol = response.data.symbol;
      const name = response.data.name;
      console.log(`✅ Solscan found: ${symbol} (${name})`);
      return { symbol, name };
    }
  } catch (error) {
    console.log(`❌ Solscan failed: ${error.message}`);
  }
  
  return null;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Testing Solscan API Fallback                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝');

  for (const token of TEST_TOKENS) {
    await testSolscan(token);
  }

  console.log('\n✅ Test Complete!');
}

main().catch(console.error);
