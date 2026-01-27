#!/usr/bin/env node

/**
 * Test all unknown tokens from the database with the complete fallback chain
 */

const axios = require('axios');
const { Metaplex, PublicKey } = require('@metaplex-foundation/js');
const { Connection } = require('@solana/web3.js');
const mongoose = require('mongoose');
require('dotenv').config();

const SOLANA_RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const BIRD_EYE_API_KEY = process.env.BIRD_EYE_API_KEY || '1209ac01dce54f0a97fd6b58c7b9ecb4';
const MONGODB_URI = process.env.MONGODB_URI;

// Define the schema inline
const whaleTransactionSchema = new mongoose.Schema({
  transaction: {
    tokenIn: {
      symbol: String,
      address: String
    },
    tokenOut: {
      symbol: String,
      address: String
    }
  },
  createdAt: Date
}, { collection: 'whalealltransactionsv2s' });

const whaleAllTransactionModelV2 = mongoose.model('WhaleAllTransactionV2', whaleTransactionSchema);

async function testMetadataFallback(tokenAddress) {
  const connection = new Connection(SOLANA_RPC_URL);
  const metaplex = Metaplex.make(connection);
  const mint = new PublicKey(tokenAddress);

  try {
    // Try RPC first
    const metadata = await metaplex.nfts().findByMint({ mintAddress: mint });
    return { success: true, symbol: metadata.symbol, name: metadata.name, source: 'RPC' };
  } catch (error) {
    // Fallback 1: Try DexScreener with retry logic
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const dexResponse = await axios.get(
          `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
          { timeout: 10000 }
        );
        
        if (dexResponse.data?.pairs && dexResponse.data.pairs.length > 0) {
          const pair = dexResponse.data.pairs[0];
          const symbol = pair.baseToken?.symbol;
          const name = pair.baseToken?.name;
          
          if (symbol && symbol !== 'Unknown' && symbol.trim() !== '') {
            return { success: true, symbol, name: name || symbol, source: `DexScreener (attempt ${attempt})` };
          }
        }
        break; // No valid data, don't retry
      } catch (dexError) {
        if (dexError.code === 'ECONNABORTED' && attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        if (attempt === 3) break;
      }
    }
    
    // Fallback 2: Try Birdeye
    try {
      const birdeyeResponse = await axios.get(
        `https://public-api.birdeye.so/defi/token_overview?address=${tokenAddress}`,
        {
          headers: { 'X-API-KEY': BIRD_EYE_API_KEY },
          timeout: 8000,
        }
      );
      
      if (birdeyeResponse.data?.data) {
        const symbol = birdeyeResponse.data.data.symbol;
        const name = birdeyeResponse.data.data.name;
        
        if (symbol && symbol !== 'Unknown' && symbol.trim() !== '') {
          return { success: true, symbol, name: name || symbol, source: 'Birdeye' };
        }
      }
    } catch (birdeyeError) {
      // Continue to next fallback
    }
    
    // Fallback 3: Try Jupiter Token List
    try {
      const jupiterResponse = await axios.get(
        `https://tokens.jup.ag/token/${tokenAddress}`,
        { timeout: 5000 }
      );
      
      if (jupiterResponse.data) {
        const symbol = jupiterResponse.data.symbol;
        const name = jupiterResponse.data.name;
        
        if (symbol && symbol !== 'Unknown' && symbol.trim() !== '') {
          return { success: true, symbol, name: name || symbol, source: 'Jupiter' };
        }
      }
    } catch (jupiterError) {
      // Continue to next fallback
    }
    
    // Fallback 4: Try Solscan
    try {
      const solscanResponse = await axios.get(
        `https://api.solscan.io/token/meta?token=${tokenAddress}`,
        { timeout: 8000 }
      );
      
      if (solscanResponse.data) {
        const symbol = solscanResponse.data.symbol;
        const name = solscanResponse.data.name;
        
        if (symbol && symbol !== 'Unknown' && symbol.trim() !== '') {
          return { success: true, symbol, name: name || symbol, source: 'Solscan' };
        }
      }
    } catch (solscanError) {
      // Continue to fallback
    }
    
    // Fallback 5: Use shortened contract address
    const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`;
    return { 
      success: false, 
      symbol: shortAddress,
      name: tokenAddress,
      source: 'Fallback (Address)' 
    };
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           Testing All Unknown Tokens from Database                             ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  // Connect to MongoDB
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  // Find all transactions with "Unknown" tokens
  const unknownTransactions = await whaleAllTransactionModelV2
    .find({
      $or: [
        { 'transaction.tokenIn.symbol': 'Unknown' },
        { 'transaction.tokenOut.symbol': 'Unknown' }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  console.log(`📊 Found ${unknownTransactions.length} transactions with unknown tokens\n`);

  // Extract unique token addresses
  const unknownTokens = new Set();
  unknownTransactions.forEach(tx => {
    if (tx.transaction.tokenIn.symbol === 'Unknown') {
      unknownTokens.add(tx.transaction.tokenIn.address);
    }
    if (tx.transaction.tokenOut.symbol === 'Unknown') {
      unknownTokens.add(tx.transaction.tokenOut.address);
    }
  });

  console.log(`🔍 Testing ${unknownTokens.size} unique unknown tokens...\n`);
  console.log('─'.repeat(80));

  const results = [];
  let index = 1;

  for (const tokenAddress of unknownTokens) {
    console.log(`\n[${index}/${unknownTokens.size}] Testing: ${tokenAddress}`);
    
    const result = await testMetadataFallback(tokenAddress);
    results.push({ address: tokenAddress, ...result });
    
    const status = result.success ? '✅' : '⚠️';
    console.log(`${status} ${result.source}: ${result.symbol}${result.name ? ` (${result.name})` : ''}`);
    
    index++;
    
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n📊 FINAL SUMMARY:');
  console.log('─'.repeat(80));
  
  const resolved = results.filter(r => r.success).length;
  const fallback = results.filter(r => !r.success).length;
  
  console.log(`   ✅ Resolved: ${resolved}/${results.length} (${Math.round(resolved/results.length*100)}%)`);
  console.log(`   ⚠️  Fallback: ${fallback}/${results.length} (${Math.round(fallback/results.length*100)}%)`);
  
  console.log('\n📈 Resolution by Source:');
  const sources = {};
  results.forEach(r => {
    sources[r.source] = (sources[r.source] || 0) + 1;
  });
  Object.entries(sources).sort((a, b) => b[1] - a[1]).forEach(([source, count]) => {
    console.log(`   ${source}: ${count}`);
  });

  console.log('\n⚠️  Tokens that still need fallback:');
  results.filter(r => !r.success).forEach(r => {
    console.log(`   ${r.address} → ${r.symbol}`);
  });

  console.log('\n✅ Test Complete!');
  console.log('\n💡 Current Implementation:');
  console.log('   1. RPC metadata (fastest)');
  console.log('   2. DexScreener with 3 retries (most reliable)');
  console.log('   3. Birdeye API');
  console.log('   4. Jupiter Token List');
  console.log('   5. Solscan API');
  console.log('   6. Fallback: Shortened address');
  
  console.log('\n🎯 Expected Result: 95%+ resolution rate');
  console.log('   Tokens that fail all sources are likely:');
  console.log('   - Very new tokens not yet indexed');
  console.log('   - Tokens with no liquidity/trading');
  console.log('   - Invalid/dead tokens');

  await mongoose.disconnect();
}

main().catch(console.error);
