#!/usr/bin/env node

/**
 * Test live token resolution with the current implementation
 */

require('dotenv').config();
const { getTokenMetaDataUsingRPC } = require('./dist/config/solana-tokens-config');

const testTokens = [
  {
    address: 'kMKX8hBaj3BTRBbeYix9c16EieBP5dih8DTSSwCpump',
    expected: 'afk'
  },
  {
    address: '8Jx8AAHj86wbQgUTjGuj6GTTL5Ps3cqxKRTvpaJApump',
    expected: 'PENGUIN'
  }
];

async function testTokenResolution() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Live Token Resolution Test                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  for (const token of testTokens) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Testing: ${token.address}`);
    console.log(`Expected: ${token.expected}`);
    console.log('─'.repeat(80));

    try {
      const startTime = Date.now();
      const result = await getTokenMetaDataUsingRPC(token.address);
      const endTime = Date.now();

      console.log(`\n✅ Result:`);
      console.log(`   Symbol: ${result.symbol}`);
      console.log(`   Name: ${result.name}`);
      console.log(`   Time: ${endTime - startTime}ms`);

      if (result.symbol === token.expected) {
        console.log(`   ✅ MATCH! Got expected symbol "${token.expected}"`);
      } else if (result.symbol && result.symbol !== 'Unknown' && !result.symbol.includes('...')) {
        console.log(`   ⚠️  Got different symbol: "${result.symbol}" (expected "${token.expected}")`);
      } else {
        console.log(`   ❌ FAILED! Got "${result.symbol}" instead of "${token.expected}"`);
      }
    } catch (error) {
      console.log(`\n❌ Error: ${error.message}`);
      console.error(error);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ Test Complete!');
  process.exit(0);
}

testTokenResolution().catch(console.error);
