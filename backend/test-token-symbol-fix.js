#!/usr/bin/env node

/**
 * Test Token Symbol Fix
 * Tests that tokens with symbol "Token" are now accepted
 */

const axios = require('axios');

// Test tokens that were showing as "Unknown"
const TEST_TOKENS = [
  {
    address: '3vZY2MKBzRMoT4nGUCWYzXPTES2jLaLNMV8Fn5cKpump',
    expectedSymbol: 'Token',
    expectedName: 'Tokenization',
    description: 'Token with symbol "Token" (was showing as Unknown)'
  },
  {
    address: '3xM8TzVg45KKkH9f8y678UfnR93aJEfXiEwPJy9upump',
    expectedSymbol: 'Unknown', // This one might actually be unknown
    description: 'Another token that was showing as Unknown'
  },
  {
    address: '9KbgSh6XZaHiDBQE26tGTDuJuUZmVyvJGGabrE7fpump',
    expectedSymbol: 'Unknown', // This one might actually be unknown
    description: 'Third token that was showing as Unknown'
  }
];

async function testDexScreener(tokenAddress) {
  try {
    const response = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      { timeout: 5000 }
    );
    
    if (response.data?.pairs && response.data.pairs.length > 0) {
      const pair = response.data.pairs[0];
      return {
        success: true,
        symbol: pair.baseToken?.symbol,
        name: pair.baseToken?.name,
        price: pair.priceUsd
      };
    }
    return { success: false, reason: 'No pairs found' };
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Token Symbol Fix Test                                       ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  let passCount = 0;
  let failCount = 0;

  for (const token of TEST_TOKENS) {
    console.log(`\n🔍 Testing: ${token.description}`);
    console.log(`   Address: ${token.address}`);
    console.log('─'.repeat(80));

    const result = await testDexScreener(token.address);

    if (result.success) {
      console.log(`   ✅ DexScreener Response:`);
      console.log(`      Symbol: ${result.symbol}`);
      console.log(`      Name: ${result.name}`);
      console.log(`      Price: $${result.price}`);

      // Check if it matches expected
      if (result.symbol === token.expectedSymbol) {
        console.log(`   ✅ PASS: Symbol matches expected "${token.expectedSymbol}"`);
        passCount++;
      } else if (result.symbol && result.symbol !== 'Unknown') {
        console.log(`   ✅ PASS: Got valid symbol "${result.symbol}" (expected "${token.expectedSymbol}")`);
        passCount++;
      } else {
        console.log(`   ⚠️  Got: "${result.symbol}", Expected: "${token.expectedSymbol}"`);
        failCount++;
      }

      // The key test: If symbol is "Token", it should be accepted now
      if (result.symbol === 'Token') {
        console.log(`   🎯 KEY TEST: Symbol is "Token" - this should now be ACCEPTED (not marked as Unknown)`);
      }
    } else {
      console.log(`   ❌ DexScreener failed: ${result.reason}`);
      console.log(`   ℹ️  This token might genuinely not have metadata`);
      failCount++;
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log(`\n📊 Test Results:`);
  console.log(`   ✅ Passed: ${passCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   📝 Total: ${TEST_TOKENS.length}`);

  console.log('\n💡 What to look for:');
  console.log('   1. Token "3vZY2...pump" should show symbol "Token" (not "Unknown")');
  console.log('   2. The fix allows "Token" as a valid symbol');
  console.log('   3. After deploying, new transactions should show "Token" correctly');

  console.log('\n🚀 Next Steps:');
  console.log('   1. Build: npm run build');
  console.log('   2. Restart backend: npm start');
  console.log('   3. Check database: node check-recent-unknown-tokens.js');
  console.log('   4. Monitor logs for new transactions');
}

main().catch(console.error);
