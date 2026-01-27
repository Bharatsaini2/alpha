#!/usr/bin/env node

/**
 * Test the complete fallback chain for token metadata
 * Tests: RPC → DexScreener → Birdeye → Solscan → Fallback
 */

const axios = require('axios');
const { Metaplex, PublicKey } = require('@metaplex-foundation/js');
const { Connection } = require('@solana/web3.js');
require('dotenv').config();

const SOLANA_RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const BIRD_EYE_API_KEY = process.env.BIRD_EYE_API_KEY || '1209ac01dce54f0a97fd6b58c7b9ecb4';

// Test tokens from the database that were showing as "Unknown"
const TEST_TOKENS = [
  { address: '3vZY2MKBzRMoT4nGUCWYzXPTES2jLaLNMV8Fn5cKpump', name: 'Token (Tokenization)' },
  { address: '3xM8TzVg45KKkH9f8y678UfnR93aJEfXiEwPJy9upump', name: 'Unknown Token 1' },
  { address: 'GwrMsjVBEfiGcYfgNQJckuhvWUWhXHz1LBsCgxfaTRND', name: 'Unknown Token 2' },
  { address: 'DtKyu1kSzDVxPEN4X44Z34Ma69qUYBq6PD3kBKukpump', name: 'Unknown Token 3' },
  { address: '258Po41aeXsh3jyqt5TqcJ4JSQe4rnSVd9wvcNPupump', name: 'CPENG' },
];

async function testRPC(tokenAddress) {
  try {
    const start = Date.now();
    const connection = new Connection(SOLANA_RPC_URL);
    const metaplex = Metaplex.make(connection);
    const mint = new PublicKey(tokenAddress);
    
    const metadata = await metaplex.nfts().findByMint({ mintAddress: mint });
    const duration = Date.now() - start;
    
    return { success: true, symbol: metadata.symbol, name: metadata.name, duration, source: 'RPC' };
  } catch (error) {
    return { success: false, duration: 0, source: 'RPC', reason: error.message };
  }
}

async function testDexScreener(tokenAddress, attempt = 1) {
  try {
    const start = Date.now();
    const response = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      { timeout: 10000 }
    );
    const duration = Date.now() - start;
    
    if (response.data?.pairs && response.data.pairs.length > 0) {
      const pair = response.data.pairs[0];
      const symbol = pair.baseToken?.symbol;
      const name = pair.baseToken?.name;
      
      if (symbol && symbol !== 'Unknown' && symbol.trim() !== '') {
        return { success: true, symbol, name, duration, source: `DexScreener (attempt ${attempt})` };
      }
    }
    return { success: false, duration, source: `DexScreener (attempt ${attempt})`, reason: 'No valid data' };
  } catch (error) {
    return { success: false, duration: 0, source: `DexScreener (attempt ${attempt})`, reason: error.message };
  }
}

async function testBirdeye(tokenAddress) {
  try {
    const start = Date.now();
    const response = await axios.get(
      `https://public-api.birdeye.so/defi/token_overview?address=${tokenAddress}`,
      {
        headers: { 'X-API-KEY': BIRD_EYE_API_KEY },
        timeout: 8000,
      }
    );
    const duration = Date.now() - start;
    
    if (response.data?.data) {
      const symbol = response.data.data.symbol;
      const name = response.data.data.name;
      
      if (symbol && symbol !== 'Unknown' && symbol.trim() !== '') {
        return { success: true, symbol, name, duration, source: 'Birdeye' };
      }
    }
    return { success: false, duration, source: 'Birdeye', reason: 'No valid data' };
  } catch (error) {
    return { success: false, duration: 0, source: 'Birdeye', reason: error.message };
  }
}

async function testSolscan(tokenAddress) {
  try {
    const start = Date.now();
    const response = await axios.get(
      `https://api.solscan.io/token/meta?token=${tokenAddress}`,
      { timeout: 8000 }
    );
    const duration = Date.now() - start;
    
    if (response.data) {
      const symbol = response.data.symbol;
      const name = response.data.name;
      
      if (symbol && symbol !== 'Unknown' && symbol.trim() !== '') {
        return { success: true, symbol, name, duration, source: 'Solscan' };
      }
    }
    return { success: false, duration, source: 'Solscan', reason: 'No valid data' };
  } catch (error) {
    return { success: false, duration: 0, source: 'Solscan', reason: error.message };
  }
}

async function testToken(tokenAddress, tokenName) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 Testing: ${tokenName}`);
  console.log(`   Address: ${tokenAddress}`);
  console.log('─'.repeat(80));

  // Test all sources
  const rpcResult = await testRPC(tokenAddress);
  console.log(`   ${rpcResult.success ? '✅' : '❌'} RPC: ${rpcResult.success ? `${rpcResult.symbol} (${rpcResult.duration}ms)` : rpcResult.reason}`);

  // If RPC fails, test DexScreener with retries
  if (!rpcResult.success) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const dexResult = await testDexScreener(tokenAddress, attempt);
      console.log(`   ${dexResult.success ? '✅' : '❌'} DexScreener (${attempt}/3): ${dexResult.success ? `${dexResult.symbol} (${dexResult.duration}ms)` : dexResult.reason}`);
      
      if (dexResult.success) {
        console.log(`\n   🎯 RESOLVED: ${dexResult.symbol} (${dexResult.name}) via ${dexResult.source}`);
        return { resolved: true, source: dexResult.source, symbol: dexResult.symbol };
      }
      
      if (attempt < 3 && dexResult.reason.includes('timeout')) {
        console.log(`   ⏳ Waiting 2 seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Test Birdeye
    const birdeyeResult = await testBirdeye(tokenAddress);
    console.log(`   ${birdeyeResult.success ? '✅' : '❌'} Birdeye: ${birdeyeResult.success ? `${birdeyeResult.symbol} (${birdeyeResult.duration}ms)` : birdeyeResult.reason}`);
    
    if (birdeyeResult.success) {
      console.log(`\n   🎯 RESOLVED: ${birdeyeResult.symbol} (${birdeyeResult.name}) via ${birdeyeResult.source}`);
      return { resolved: true, source: birdeyeResult.source, symbol: birdeyeResult.symbol };
    }

    // Test Solscan
    const solscanResult = await testSolscan(tokenAddress);
    console.log(`   ${solscanResult.success ? '✅' : '❌'} Solscan: ${solscanResult.success ? `${solscanResult.symbol} (${solscanResult.duration}ms)` : solscanResult.reason}`);
    
    if (solscanResult.success) {
      console.log(`\n   🎯 RESOLVED: ${solscanResult.symbol} (${solscanResult.name}) via ${solscanResult.source}`);
      return { resolved: true, source: solscanResult.source, symbol: solscanResult.symbol };
    }

    // Fallback
    const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`;
    console.log(`\n   ⚠️  FALLBACK: Using shortened address: ${shortAddress}`);
    return { resolved: false, source: 'Fallback', symbol: shortAddress };
  } else {
    console.log(`\n   🎯 RESOLVED: ${rpcResult.symbol} (${rpcResult.name}) via ${rpcResult.source}`);
    return { resolved: true, source: rpcResult.source, symbol: rpcResult.symbol };
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              Token Metadata Fallback Chain Test                                ║');
  console.log('║  RPC → DexScreener (3 retries) → Birdeye → Solscan → Fallback                 ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝');

  const results = [];
  
  for (const token of TEST_TOKENS) {
    const result = await testToken(token.address, token.name);
    results.push({ ...token, ...result });
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('\n📊 SUMMARY:');
  console.log('─'.repeat(80));
  
  const resolved = results.filter(r => r.resolved).length;
  const fallback = results.filter(r => !r.resolved).length;
  
  console.log(`   ✅ Resolved: ${resolved}/${TEST_TOKENS.length} (${Math.round(resolved/TEST_TOKENS.length*100)}%)`);
  console.log(`   ⚠️  Fallback: ${fallback}/${TEST_TOKENS.length} (${Math.round(fallback/TEST_TOKENS.length*100)}%)`);
  
  console.log('\n📈 Resolution by Source:');
  const sources = {};
  results.forEach(r => {
    sources[r.source] = (sources[r.source] || 0) + 1;
  });
  Object.entries(sources).forEach(([source, count]) => {
    console.log(`   ${source}: ${count}`);
  });

  console.log('\n✅ Test Complete!');
  console.log('\n💡 Expected Behavior:');
  console.log('   - Most tokens should resolve via DexScreener or Birdeye');
  console.log('   - Very few should need Solscan');
  console.log('   - Almost none should use Fallback (shortened address)');
  console.log('\n🚀 If results look good, deploy with: npm run build && npm start');
}

main().catch(console.error);
