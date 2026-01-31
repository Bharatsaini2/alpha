#!/usr/bin/env node

/**
 * Test the specific tokens you mentioned
 */

const axios = require('axios');
const { Metaplex, PublicKey } = require('@metaplex-foundation/js');
const { Connection } = require('@solana/web3.js');
require('dotenv').config();

const SOLANA_RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

const TEST_TOKENS = [
  'kMKX8hBaj3BTRBbeYix9c16EieBP5dih8DTSSwCpump',
  '8Jx8AAHj86wbQgUTjGuj6GTTL5Ps3cqxKRTvpaJApump',
  'aTPu8cDEM7P7ifhoTd6NxaLf42tCiVcMCT3ZEGEpump',
  'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn',
  '6zdUYEEVUxB3DrgvrQQs5cAFczXtSdWBos854iQJTRND',
  'DtR4D9FtVoTX2569gaL837ZgrB6wNjj6tkmnX9Rdk9B2',
  '9QMJMYayGxjVJNVWKLk6woRJ9Rweh63vjTVsqoBtpump',
  '9KbgSh6XZaHiDBQE26tGTDuJuUZmVyvJGGabrE7fpump',

];

async function testToken(tokenAddress) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 Testing: ${tokenAddress}`);
  console.log('─'.repeat(80));

  // Test RPC
  try {
    const connection = new Connection(SOLANA_RPC_URL);
    const metaplex = Metaplex.make(connection);
    const mint = new PublicKey(tokenAddress);
    
    const metadata = await metaplex.nfts().findByMint({ mintAddress: mint });
    console.log(`✅ RPC: ${metadata.symbol} (${metadata.name})`);
    return { source: 'RPC', symbol: metadata.symbol, name: metadata.name };
  } catch (error) {
    console.log(`❌ RPC failed: ${error.message}`);
  }

  // Test DexScreener
  try {
    const response = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      { timeout: 10000 }
    );
    
    if (response.data?.pairs && response.data.pairs.length > 0) {
      const pair = response.data.pairs[0];
      const symbol = pair.baseToken?.symbol;
      const name = pair.baseToken?.name;
      
      if (symbol && symbol !== 'Unknown' && symbol.trim() !== '') {
        console.log(`✅ DexScreener: ${symbol} (${name})`);
        return { source: 'DexScreener', symbol, name };
      }
    }
    
    console.log(`❌ DexScreener: No valid data`);
  } catch (error) {
    console.log(`❌ DexScreener failed: ${error.message}`);
  }

  // Fallback
  const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`;
  console.log(`⚠️  Fallback: ${shortAddress}`);
  return { source: 'Fallback', symbol: shortAddress, name: tokenAddress };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Testing Your Specific Tokens                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝');

  for (const token of TEST_TOKENS) {
    await testToken(token);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Test Complete!');
  console.log('\nIf DexScreener works here but not in your app, the backend is NOT deployed yet!');
}

main().catch(console.error);
