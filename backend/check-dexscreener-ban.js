#!/usr/bin/env node

/**
 * Check if Your Server IP is Banned by DexScreener
 * 
 * Usage:
 * 1. Upload this file to your droplet
 * 2. Run: node check-dexscreener-ban.js
 * 3. Check the results
 */

const https = require('https');

// Test with multiple well-known tokens
const TEST_TOKENS = [
  {
    name: 'BONK',
    address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
  },
  {
    name: 'SOL',
    address: 'So11111111111111111111111111111111111111112'
  },
  {
    name: 'USDC',
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  }
];

function testDexScreener(tokenAddress, tokenName) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.dexscreener.com',
      port: 443,
      path: `/latest/dex/tokens/${tokenAddress}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            const pairCount = parsed.pairs?.length || 0;
            resolve({
              success: true,
              status: res.statusCode,
              tokenName,
              pairCount,
              message: `✅ SUCCESS - Found ${pairCount} pairs`
            });
          } catch (e) {
            resolve({
              success: false,
              status: res.statusCode,
              tokenName,
              message: `⚠️  Got 200 but invalid JSON`
            });
          }
        } else if (res.statusCode === 403) {
          resolve({
            success: false,
            status: res.statusCode,
            tokenName,
            message: `❌ BANNED - 403 Forbidden`
          });
        } else if (res.statusCode === 429) {
          resolve({
            success: false,
            status: res.statusCode,
            tokenName,
            message: `❌ RATE LIMITED - 429 Too Many Requests`
          });
        } else {
          resolve({
            success: false,
            status: res.statusCode,
            tokenName,
            message: `⚠️  Unexpected status: ${res.statusCode}`
          });
        }
      });
    });

    req.on('error', (error) => {
      resolve({
        success: false,
        status: 0,
        tokenName,
        message: `❌ Network error: ${error.message}`
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        status: 0,
        tokenName,
        message: `❌ Timeout - No response after 10s`
      });
    });

    req.end();
  });
}

async function checkAllTokens() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   DexScreener IP Ban Check                                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('🔍 Testing DexScreener API from this server...\n');

  const results = [];

  for (const token of TEST_TOKENS) {
    console.log(`Testing ${token.name}...`);
    const result = await testDexScreener(token.address, token.name);
    results.push(result);
    console.log(`   ${result.message}\n`);
    
    // Wait 1 second between requests to avoid triggering rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log('═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60) + '\n');

  const successCount = results.filter(r => r.success).length;
  const bannedCount = results.filter(r => r.status === 403).length;
  const rateLimitedCount = results.filter(r => r.status === 429).length;

  console.log(`Total tests: ${results.length}`);
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Banned (403): ${bannedCount}`);
  console.log(`⚠️  Rate limited (429): ${rateLimitedCount}`);
  console.log('');

  // Verdict
  if (successCount === results.length) {
    console.log('🎉 VERDICT: Your IP is NOT banned!');
    console.log('   DexScreener is working perfectly.');
    console.log('   No proxy needed.\n');
  } else if (bannedCount > 0) {
    console.log('🚨 VERDICT: Your IP IS BANNED!');
    console.log('   Status: 403 Forbidden');
    console.log('   Solution: Use proxy service or deploy to new server.\n');
    console.log('   Quick fix: Sign up for ScraperAPI (1000 free requests/month)');
    console.log('   https://www.scraperapi.com/\n');
  } else if (rateLimitedCount > 0) {
    console.log('⚠️  VERDICT: Rate limited (temporary)');
    console.log('   Status: 429 Too Many Requests');
    console.log('   This might be temporary. Try again in a few minutes.\n');
  } else {
    console.log('⚠️  VERDICT: Unknown issue');
    console.log('   Check network connectivity and firewall settings.\n');
  }

  // Additional info
  console.log('═'.repeat(60));
  console.log('NEXT STEPS');
  console.log('═'.repeat(60) + '\n');

  if (bannedCount > 0) {
    console.log('Your IP is banned. Here are your options:\n');
    console.log('1. Use Proxy Service (Recommended)');
    console.log('   - ScraperAPI: https://www.scraperapi.com/');
    console.log('   - 1,000 free requests/month');
    console.log('   - $49/month for 100,000 requests\n');
    console.log('2. Deploy to New Server');
    console.log('   - Create new droplet with different IP');
    console.log('   - $5-10/month\n');
    console.log('3. Contact DexScreener Support');
    console.log('   - Email: support@dexscreener.com');
    console.log('   - Explain your use case');
    console.log('   - Ask for unban\n');
  } else if (successCount === results.length) {
    console.log('Your IP is working! To improve token coverage:\n');
    console.log('1. Add DexScreener to your fallback chain');
    console.log('2. Use SHYFT symbols first (90% coverage)');
    console.log('3. Cache results (5% coverage)');
    console.log('4. DexScreener fallback (4% coverage)');
    console.log('5. CoinGecko fallback (1% coverage)\n');
    console.log('Expected result: 99%+ token name coverage!\n');
  }
}

// Run the check
checkAllTokens().catch(error => {
  console.error('\n❌ Error running check:', error.message);
  process.exit(1);
});
