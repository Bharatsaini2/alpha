const axios = require('axios');

const API_KEY      = '1209ac01dce54f0a97fd6b58c7b9ecb4';        
const TOKEN_ADDRESS = '71Jvq4Epe2FCJ7JFSF7jLXdNk1Wy4Bhqd9iL6bEFELvg';  
// Example: USDC on Solana. Swap for any SPL token address.

const client = axios.create({
  baseURL: 'https://public-api.birdeye.so',
  headers: { 'X-API-KEY': API_KEY }
});

async function getMarketCap(address:string) {
  try {
    const resp = await client.get('/defi/v3/token/market-data', {
      params: { address }
    });

    const d = resp.data.data;

    console.log("d---------",d)

    return d;
  } catch (err:any) {
    console.error('❌ API error:', err.response?.data || err.message);
    process.exit(1);
  }
}

(async () => {
  const info = await getMarketCap(TOKEN_ADDRESS);
  console.log('🔍 Token Overview:',info);
  console.log(`  Market Cap       : ${info.market_cap}`);
})();
