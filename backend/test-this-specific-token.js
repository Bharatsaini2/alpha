const axios = require('axios');

const tokenAddress = 'DK9nBUMfdu4XprPRWeh8f6KnQiGWD8Z4xz3yzs9gpump';

async function testToken() {
  console.log(`🔍 Testing: ${tokenAddress}\n`);
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
      console.log(`   ✅ Symbol: ${pair.baseToken?.symbol || 'N/A'}`);
      console.log(`   ✅ Name: ${pair.baseToken?.name || 'N/A'}`);
      console.log(`   Price: $${pair.priceUsd || 'N/A'}`);
    } else {
      console.log('   ❌ No pairs found');
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  // Test Jupiter
  console.log('\n2️⃣ Jupiter API:');
  try {
    const jupResponse = await axios.get(
      `https://price.jup.ag/v4/price?ids=${tokenAddress}`,
      { timeout: 5000 }
    );
    
    if (jupResponse.data?.data?.[tokenAddress]) {
      console.log(`   ✅ Price: $${jupResponse.data.data[tokenAddress].price}`);
    } else {
      console.log('   ❌ Not found');
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  // Test Birdeye
  console.log('\n3️⃣ Birdeye API:');
  try {
    const birdeyeResponse = await axios.get(
      `https://public-api.birdeye.so/defi/token_overview`,
      {
        params: { address: tokenAddress },
        headers: { 'X-API-KEY': process.env.BIRD_EYE_API_KEY || '1209ac01dce54f0a97fd6b58c7b9ecb4' },
        timeout: 5000
      }
    );
    
    if (birdeyeResponse.data?.data) {
      const data = birdeyeResponse.data.data;
      console.log(`   ✅ Symbol: ${data.symbol || 'N/A'}`);
      console.log(`   ✅ Name: ${data.name || 'N/A'}`);
    } else {
      console.log('   ❌ No data found');
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(80));
  
  // Final verdict
  console.log('\n📊 VERDICT:');
  console.log('   If all APIs fail, the fallback will show:');
  const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`;
  console.log(`   Symbol: "${shortAddress}"`);
  console.log(`   Name: "${tokenAddress}"\n`);
}

testToken();
