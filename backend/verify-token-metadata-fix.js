#!/usr/bin/env node

/**
 * Verify Token Metadata Fix
 * Tests the new metadata resolution chain to ensure it's working properly
 */

const axios = require('axios');
const { Metaplex, PublicKey } = require('@metaplex-foundation/js');
const { Connection } = require('@solana/web3.js');

const SOLANA_RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const BIRD_EYE_API_KEY = process.env.BIRD_EYE_API_KEY || '1209ac01dce54f0a97fd6b58c7b9ecb4';

// Test tokens
const TEST_TOKENS = [
  { address: 'So11111111111111111111111111111111111111112', name: 'SOL' },
  { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', name: 'USDC' },
  { address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', name: 'USDT' },
  { address: 'DyUKckoakaTfSWSqixECmjutLrkSL5hVe67MfREipump', name: 'Random Token' },
];

async function testDexScreener(tokenAddress) {
  try {
    const start = Date.now();
    const response = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      { timeout: 8000 }
    );
    const duration = Date.now() - start;

    if (response.data?.pairs && response.data.pairs.length > 0) {
      const pair = response.data.pairs[0];
      const symbol = pair.baseToken?.symbol;
      const name = pair.baseToken?.name;
      
      if (symbol && symbol !== 'Unknown') {
        return { success: true, symbol, name, duration, source: 'DexScreener' };
      }
    }
    return { success: false, duration, source: 'DexScreener', reason: 'No valid pairs' };
  } catch (error) {
    return { success: false, duration: 0, source: 'DexScreener', reason: error.message };
  }
}

async function testRPC(tokenAddress) {
  try {
    const start = Date.now();
    const connection = new Connection(SOLANA_RPC_URL, { commitment: 'confirmed' });
    const metaplex = Metaplex.make(connection);
    const mint = new PublicKey(tokenAddress);

    const metadataPromise = metaplex.nfts().findByMint({ mintAddress: mint });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('RPC timeout')), 5000)
    );

    const metadata = await Promise.race([metadataPromise, timeoutPromise]);
    const duration = Date.now() - start;

    if (metadata?.symbol) {
      return { success: true, symbol: metadata.symbol, name: metadata.name, duration, source: 'RPC' };
    }
    return { success: false, duration, source: 'RPC', reason: 'No metadata' };
  } catch (error) {
    return { success: false, duration: Date.now() - start, source: 'RPC', reason: error.message };
  }
}

async function testBirdeye(tokenAddress) {
  try {
    const start = Date.now();
    const response = await axios.get(
      `https://public-api.birdeye.so/defi/token_overview?address=${tokenAddress}`,
      {
        headers: { 'X-API-KEY': BIRD_EYE_API_KEY },
        timeout: 5000,
      }
    );
    const duration = Date.now() - start;

    if (response.data?.data) {
      const symbol = response.data.data.symbol;
      const name = response.data.data.name;
      
      if (symbol && symbol !== 'Unknown') {
        return { success: true, symbol, name, duration, source: 'Birdeye' };
      }
    }
    return { success: false, duration, source: 'Birdeye', reason: 'No valid data' };
  } catch (error) {
    return { success: false, duration: 0, source: 'Birdeye', reason: error.message };
  }
}

async function testToken(tokenAddress, tokenName) {
  console.log(`\n🔍 Testing: ${tokenName} (${tokenAddress})`);
  console.log('─'.repeat(80));

  const results = await Promise.all([
    testDexScreener(tokenAddress),
    testRPC(tokenAddress),
    testBirdeye(tokenAddress),
  ]);

  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    const symbol = result.symbol ? ` → ${result.symbol}` : '';
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    const reason = result.reason ? ` [${result.reason}]` : '';
    console.log(`${status} ${result.source}${symbol}${duration}${reason}`);
  });

  // Find first successful result
  const successful = results.find(r => r.success);
  if (successful) {
    console.log(`\n✅ Resolution: ${successful.symbol} (${successful.name}) via ${successful.source}`);
  } else {
    console.log(`\n⚠️ All sources failed - would use fallback`);
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Token Metadata Resolution Test                              ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝');

  for (const token of TEST_TOKENS) {
    await testToken(token.address, token.name);
  }

  console.log('\n' + '═'.repeat(80));
  console.log('✅ Test complete!');
  console.log('\nExpected behavior:');
  console.log('  • DexScreener should be fastest (usually <1000ms)');
  console.log('  • RPC should work but may be slower');
  console.log('  • Birdeye is a backup');
  console.log('  • At least one source should succeed for each token');
}

main().catch(console.error);
