const axios = require('axios');

const API_KEY      = '1209ac01dce54f0a97fd6b58c7b9ecb4';       
// const TOKEN_ADDRESS = 'GkyPYa7NnCFbduLknCfBfP7p8564X1VZhwZYJ6CZpump';  
const TOKEN_ADDRESS = 'HLJzUzWU7eFKDCvuoJ6cQCYxkinE1cXCZjxWJWwWpump';  

const client = axios.create({
  baseURL: 'https://public-api.birdeye.so',
  headers: { 'X-API-KEY': API_KEY }
});

async function fetchTokenOverview(address:string) {
  try {
    const resp = await client.get('/defi/v3/token/market-data', {
      params: { address }
    });

    const d = resp.data.data;
    console.log("d-----------",d)

    // adjust these property names if they differ slightly in the real response:
    const overview = {
      price      : d.price,   
      marketCap  : d.market_cap     
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
  console.log(`  Price (USD): $${info.price}`);
  console.log(`  Market Cap : $${info.marketCap}`);
})();
