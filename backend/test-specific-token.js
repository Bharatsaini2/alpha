const axios = require('axios');

const tokenAddress = 'r3fcAzv5NXCPFf2GRPPxEkbAZQJRfaHcR8WQngEpump';

async function checkAllSources() {
  console.log(`🔍 Checking all sources for: ${tokenAddress}\n`);
  console.log('='.repeat(80));
  
  // 1. DexScreener
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
  
  // 2. Jupiter
  console.log('\n2️⃣ Jupiter API:');
  try {
    const jupResponse = await axios.get(
      `https://price.jup.ag/v4/price?ids=${tokenAddress}`,
      { timeout: 5000 }
    );
    
    if (jupResponse.data?.data?.[tokenAddress]) {
      console.log(`   ✅ Price: $${jupResponse.data.data[tokenAddress].price}`);
      console.log('   ⚠️ Jupiter only provides price, not name/symbol');
    } else {
      console.log('   ❌ Not found');
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  // 3. Birdeye
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
      console.log(`   Price: $${data.price || 'N/A'}`);
    } else {
      console.log('   ❌ No data found');
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  // 4. Solscan
  console.log('\n4️⃣ Solscan API:');
  try {
    const solscanResponse = await axios.get(
      `https://api.solscan.io/token/meta?token=${tokenAddress}`,
      { timeout: 5000 }
    );
    
    if (solscanResponse.data) {
      console.log(`   ✅ Symbol: ${solscanResponse.data.symbol || 'N/A'}`);
      console.log(`   ✅ Name: ${solscanResponse.data.name || 'N/A'}`);
    } else {
      console.log('   ❌ No data found');
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  // 5. Helius
  console.log('\n5️⃣ Helius API:');
  try {
    const heliusResponse = await axios.post(
      `https://api.helius.xyz/v0/token-metadata?api-key=demo`,
      {
        mintAccounts: [tokenAddress]
      },
      { timeout: 5000 }
    );
    
    if (heliusResponse.data && heliusResponse.data.length > 0) {
      const data = heliusResponse.data[0];
      console.log(`   ✅ Symbol: ${data.symbol || 'N/A'}`);
      console.log(`   ✅ Name: ${data.name || 'N/A'}`);
    } else {
      console.log('   ❌ No data found');
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Check complete!\n');
}

checkAllSources();
