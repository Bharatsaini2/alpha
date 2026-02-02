/**
 * Test Pump.fun API for Token Metadata
 * 
 * Pump.fun has an API that can get metadata for their tokens
 * This is the BEST source for new pump.fun tokens!
 */

require('dotenv').config();
const axios = require('axios');

// Test with a pump.fun token from your list
const TEST_TOKENS = [
  '7jbDtonpvXCKfDnq4PqV9udzVY6',
  'AKEGuXaVhRfPFfom2gpump',
  'G5bStqnKPQtAdaos'
];

async function getPumpFunMetadata(tokenAddress) {
  try {
    console.log(`\n🔍 Fetching metadata for: ${tokenAddress}`);
    
    // Try Pump.fun API
    const response = await axios.get(
      `https://frontend-api.pump.fun/coins/${tokenAddress}`,
      { timeout: 10000 }
    );

    if (response.data) {
      const data = response.data;
      console.log(`✅ Found on Pump.fun:`);
      console.log(`   Symbol: ${data.symbol || 'N/A'}`);
      console.log(`   Name: ${data.name || 'N/A'}`);
      console.log(`   Description: ${data.description?.slice(0, 100) || 'N/A'}...`);
      console.log(`   Market Cap: $${data.usd_market_cap || 'N/A'}`);
      console.log(`   Creator: ${data.creator || 'N/A'}`);
      
      return {
        symbol: data.symbol,
        name: data.name,
        description: data.description,
        marketCap: data.usd_market_cap,
        creator: data.creator,
        imageUrl: data.image_uri
      };
    }

    console.log(`⚠️ No data found`);
    return null;

  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`⚠️ Token not found on Pump.fun (might not be a pump.fun token)`);
    } else {
      console.log(`❌ Error: ${error.message}`);
    }
    return null;
  }
}

async function testPumpFunAPI() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   Test Pump.fun API for Token Metadata                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  for (const token of TEST_TOKENS) {
    await getPumpFunMetadata(token);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between calls
  }

  console.log('\n✅ Test complete!\n');
}

testPumpFunAPI();
