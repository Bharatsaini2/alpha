#!/usr/bin/env node

/**
 * Test the specific unknown token
 */

const axios = require('axios');
require('dotenv').config();

const TOKEN_ADDRESS = '3B1ijcocqYUPcMwi8oN8F4ZvBfVU3yyNRJAXkSqApump';

async function main() {
  console.log(`Testing token: ${TOKEN_ADDRESS}\n`);

  // Test DexScreener
  try {
    const response = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS}`,
      { timeout: 10000 }
    );
    
    if (response.data?.pairs && response.data.pairs.length > 0) {
      const pair = response.data.pairs[0];
      const symbol = pair.baseToken?.symbol;
      const name = pair.baseToken?.name;
      
      console.log(`✅ DexScreener: ${symbol} (${name})`);
    } else {
      console.log(`❌ DexScreener: No data found`);
    }
  } catch (error) {
    console.log(`❌ DexScreener failed: ${error.message}`);
  }

  // Test Jupiter
  try {
    const response = await axios.get(
      'https://token.jup.ag/strict',
      { timeout: 5000 }
    );

    if (response.data && Array.isArray(response.data)) {
      const token = response.data.find((t) => t.address === TOKEN_ADDRESS);

      if (token) {
        console.log(`✅ Jupiter: ${token.symbol} (${token.name})`);
      } else {
        console.log(`❌ Jupiter: Token not in list`);
      }
    }
  } catch (error) {
    console.log(`❌ Jupiter failed: ${error.message}`);
  }

  console.log(`\n💡 This token might be:`);
  console.log(`   - Too new (not indexed yet)`);
  console.log(`   - Delisted/rugged`);
  console.log(`   - Not traded on major DEXes`);
  console.log(`\n   This is expected for ~0.2% of tokens.`);
}

main().catch(console.error);
