#!/usr/bin/env node

/**
 * Test pump.fun token resolution
 */

require('dotenv').config();
const { getTokenMetaDataUsingRPC } = require('./dist/config/solana-tokens-config');

const pumpFunToken = {
  address: 'GB8KtQfMChhYrCYtd5PoAB42kAdkHnuyAincSSmFpump',
  url: 'https://pump.fun/coin/GB8KtQfMChhYrCYtd5PoAB42kAdkHnuyAincSSmFpump'
};

async function testPumpFunToken() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Pump.fun Token Resolution Test                              ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  console.log(`Token URL: ${pumpFunToken.url}`);
  console.log(`Token Address: ${pumpFunToken.address}\n`);
  console.log('─'.repeat(80));

  try {
    const startTime = Date.now();
    const result = await getTokenMetaDataUsingRPC(pumpFunToken.address);
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`\n${'='.repeat(80)}`);
    console.log('✅ Result:');
    console.log(`   Symbol: ${result.symbol}`);
    console.log(`   Name: ${result.name}`);
    console.log(`   Time: ${duration}ms`);
    console.log('='.repeat(80));

    if (result.symbol && result.symbol !== 'Unknown' && !result.symbol.includes('...')) {
      console.log(`\n🎉 SUCCESS! Token resolved to: ${result.symbol}`);
      console.log(`   This token will display correctly in your app!`);
    } else if (result.symbol && result.symbol.includes('...')) {
      console.log(`\n⚠️  FALLBACK: Token fell back to shortened address: ${result.symbol}`);
      console.log(`   This means the token was not found on any API.`);
      console.log(`   Possible reasons:`);
      console.log(`   - Token is too new (just created)`);
      console.log(`   - Token doesn't exist on-chain`);
      console.log(`   - APIs haven't indexed it yet`);
    } else {
      console.log(`\n❌ UNKNOWN: Token could not be resolved`);
    }

  } catch (error) {
    console.log(`\n💥 ERROR: ${error.message}`);
    console.error(error);
  }

  console.log(`\n✅ Test Complete!`);
  process.exit(0);
}

testPumpFunToken().catch(console.error);
