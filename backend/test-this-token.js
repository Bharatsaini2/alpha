const axios = require('axios');

const tokenAddress = '3yr17ZEE6wvCG7e3qD51XsfeSoSSKuCKptVissoopump';

async function testToken() {
  console.log(`🔍 Testing fallback for: ${tokenAddress}\n`);
  console.log('='.repeat(80));
  
  // Test DexScreener
  console.log('\n1️⃣ DexScreener API:');
  try {
    const dexResponse = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      { timeout: 5000 }
    );
    
    if (dexResponse.data?.pairs && dexResponse.data.pairs.length > 0) {
      const pair = dexResponse.data.pairs[0];
      const symbol = pair.baseToken?.symbol;
      const name = pair.baseToken?.name;
      
      console.log(`   ✅ Symbol: ${symbol || 'N/A'}`);
      console.log(`   ✅ Name: ${name || 'N/A'}`);
      console.log(`   Price: $${pair.priceUsd || 'N/A'}`);
      console.log(`   Liquidity: $${pair.liquidity?.usd?.toLocaleString() || 'N/A'}`);
      
      if (symbol && symbol !== 'Unknown') {
        console.log(`\n   ✨ RESULT: Will show as "${symbol}" (${name})`);
      } else {
        const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`;
        console.log(`\n   ⚠️ RESULT: Will show as "${shortAddress}"`);
      }
    } else {
      console.log('   ❌ No pairs found');
      const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`;
      console.log(`\n   ⚠️ RESULT: Will show as "${shortAddress}"`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`;
    console.log(`\n   ⚠️ RESULT: Will show as "${shortAddress}"`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Test complete!\n');
}

testToken();
