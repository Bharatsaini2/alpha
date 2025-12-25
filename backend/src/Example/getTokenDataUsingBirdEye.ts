const axios = require('axios');

const API_KEY      = '1209ac01dce54f0a97fd6b58c7b9ecb4';       
// const TOKEN_ADDRESS = 'GkyPYa7NnCFbduLknCfBfP7p8564X1VZhwZYJ6CZpump';  
const TOKEN_ADDRESS = 'F4H9DL8bJ1YYPMAW2YZbWai43t93t2dncisE9x4Jpump';  
// Example: USDC on Solana. Swap for any SPL token address.

const client = axios.create({
  baseURL: 'https://public-api.birdeye.so',
  headers: { 'X-API-KEY': API_KEY }
});

async function fetchTokenOverview(address:string) {
  try {
    const resp = await client.get('/defi/token_overview', {
      params: { address }
    });

    const d = resp.data.data;

    // adjust these property names if they differ slightly in the real response:
    const overview = {
      name       : d.name,
      symbol     : d.symbol,
      price      : d.price,           
      volume24h  : d.v24hUSD,
      marketCap  : d.marketCap,
      imageUrl   : d.logoURI        
    };

    return overview;
  } catch (err:any) {
    console.error('❌ API error:', err.response?.data || err.message);
    process.exit(1);
  }
}

(async () => {
  const info = await fetchTokenOverview(TOKEN_ADDRESS);
  console.log('🔍 Token Overview:');
  console.log(`  Name       : ${info.name}`);
  console.log(`  Symbol     : ${info.symbol}`);
  console.log(`  Price (USD): $${info.price}`);
  console.log(`  24 h Volume : $${info.volume24h}`);
  console.log(`  Market Cap : $${info.marketCap}`);
  console.log(`  Image URL  : ${info.imageUrl}`);
})();
