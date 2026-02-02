/**
 * Test DexScreener with Proxy to Bypass IP Ban
 * 
 * If your IP is banned, use a proxy service to make requests
 */

require('dotenv').config();
const axios = require('axios');

// Test token
const TEST_TOKEN = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'; // BONK

async function testDexScreenerDirect() {
  console.log('\n🔍 Testing DexScreener WITHOUT proxy...\n');
  
  try {
    const response = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${TEST_TOKEN}`,
      { timeout: 10000 }
    );

    console.log('✅ SUCCESS! Not banned.');
    console.log(`   Found ${response.data.pairs?.length || 0} pairs`);
    if (response.data.pairs?.[0]) {
      console.log(`   Symbol: ${response.data.pairs[0].baseToken.symbol}`);
    }
    return true;

  } catch (error) {
    if (error.response?.status === 403 || error.response?.status === 429) {
      console.log('❌ BANNED! Status:', error.response.status);
      console.log('   Message:', error.response.data);
      return false;
    } else {
      console.log('❌ Error:', error.message);
      return false;
    }
  }
}

async function testDexScreenerWithProxy() {
  console.log('\n🔍 Testing DexScreener WITH proxy...\n');
  
  // Free proxy services you can use:
  // 1. ScraperAPI: https://www.scraperapi.com/ (1000 free requests/month)
  // 2. ProxyMesh: https://proxymesh.com/ (10 free proxies)
  // 3. Bright Data: https://brightdata.com/ (free trial)
  
  // Example with ScraperAPI (get free API key from scraperapi.com)
  const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || 'YOUR_API_KEY_HERE';
  
  if (SCRAPER_API_KEY === 'YOUR_API_KEY_HERE') {
    console.log('⚠️  No proxy API key configured.');
    console.log('   Get free API key from: https://www.scraperapi.com/');
    console.log('   Then add to .env: SCRAPER_API_KEY=your_key');
    return;
  }

  try {
    // ScraperAPI automatically rotates IPs
    const response = await axios.get(
      `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=https://api.dexscreener.com/latest/dex/tokens/${TEST_TOKEN}`,
      { timeout: 30000 }
    );

    console.log('✅ SUCCESS with proxy!');
    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    console.log(`   Found ${data.pairs?.length || 0} pairs`);
    if (data.pairs?.[0]) {
      console.log(`   Symbol: ${data.pairs[0].baseToken.symbol}`);
    }
    return true;

  } catch (error) {
    console.log('❌ Proxy failed:', error.message);
    return false;
  }
}

async function testRotatingProxies() {
  console.log('\n⚠️  Rotating proxy test skipped (requires https-proxy-agent package)');
  console.log('   Install with: npm install https-proxy-agent');
  return false;
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   DexScreener IP Ban Bypass Test                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // Test 1: Direct (check if banned)
  const directWorks = await testDexScreenerDirect();

  if (directWorks) {
    console.log('\n✅ You are NOT banned! No proxy needed.');
    return;
  }

  // Test 2: Try with ScraperAPI
  console.log('\n' + '='.repeat(60));
  await testDexScreenerWithProxy();

  // Test 3: Skip rotating proxies (requires extra package)
  // console.log('\n' + '='.repeat(60));
  // await testRotatingProxies();

  console.log('\n' + '='.repeat(60));
  console.log('\n💡 Recommendations:');
  console.log('   1. Use ScraperAPI (easiest) - 1000 free requests/month');
  console.log('   2. Use Bright Data (best) - rotating residential proxies');
  console.log('   3. Deploy backend on different server (new IP)');
  console.log('   4. Contact DexScreener support to unban your IP');
  console.log('');
}

runTests();
