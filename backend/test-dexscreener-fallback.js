const axios = require('axios');

// Test tokens that are showing as "Unknown"
const unknownTokens = [
  '3heQ1WdWD973ebPoJijSpJDzbcWN5dJCK8pH3UNaWpG5',
  'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn',
  'DzKk8Z7pK6XcdyPgUrkdCNBcNK5i3FLx96CMLnC5pump'
];

async function testDexScreenerFallback() {
  console.log('🔍 Testing DexScreener Fallback for Unknown Tokens\n');
  console.log('='.repeat(80));
  
  for (const tokenAddress of unknownTokens) {
    console.log(`\n📝 Token: ${tokenAddress}\n`);
    
    try {
      const dexResponse = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
        { timeout: 5000 }
      );
      
      if (dexResponse.data?.pairs && dexResponse.data.pairs.length > 0) {
        const pair = dexResponse.data.pairs[0];
        const symbol = pair.baseToken?.symbol;
        const name = pair.baseToken?.name;
        
        console.log('   ✅ DexScreener Success:');
        console.log(`      Symbol: ${symbol || 'N/A'}`);
        console.log(`      Name: ${name || 'N/A'}`);
        console.log(`      Price: $${pair.priceUsd || 'N/A'}`);
        console.log(`      Liquidity: $${pair.liquidity?.usd?.toLocaleString() || 'N/A'}`);
        console.log(`      Volume 24h: $${pair.volume?.h24?.toLocaleString() || 'N/A'}`);
        
        if (symbol && symbol !== 'Unknown') {
          console.log(`\n      ✨ Would display as: "${symbol}" instead of "Unknown"`);
        } else {
          const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`;
          console.log(`\n      ⚠️ Symbol still unknown, would display as: "${shortAddress}"`);
        }
      } else {
        console.log('   ⚠️ DexScreener: No pairs found');
        const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`;
        console.log(`   📋 Would display as: "${shortAddress}"`);
      }
    } catch (error) {
      console.log(`   ❌ DexScreener error: ${error.message}`);
      const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`;
      console.log(`   📋 Would display as: "${shortAddress}"`);
    }
    
    console.log('\n' + '-'.repeat(80));
  }
  
  console.log('\n✅ Test complete!\n');
  console.log('📌 Fallback Strategy:');
  console.log('   1. Try RPC metadata (Metaplex)');
  console.log('   2. If fails, try DexScreener API');
  console.log('   3. If fails, use contract address (e.g., "3heQ...WpG5")');
  console.log('');
}

testDexScreenerFallback();
