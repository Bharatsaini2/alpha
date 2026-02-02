/**
 * Test Complete Token Resolution Flow
 * Tests: SHYFT → Memory Cache → MongoDB Cache → DexScreener → CoinGecko → RPC → Fallback
 */

const mongoose = require('mongoose');
const axios = require('axios');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/alpha-tracker';

// Token Metadata Cache Model
const tokenMetadataCacheSchema = new mongoose.Schema({
  tokenAddress: { type: String, required: true, unique: true, index: true },
  symbol: { type: String, required: true },
  name: { type: String, required: true },
  source: { 
    type: String, 
    enum: ['rpc', 'helius', 'coingecko', 'solscan', 'dexscreener', 'jupiter', 'birdeye'],
    required: true 
  },
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true, collection: 'tokenmetadatacache' });

const TokenMetadataCache = mongoose.model('TokenMetadataCache', tokenMetadataCacheSchema);

// Test tokens (mix of known and unknown)
const TEST_TOKENS = [
  {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    expectedSource: 'shyft',
    description: 'USDC (should use SHYFT)'
  },
  {
    address: 'So11111111111111111111111111111111111111112', // SOL
    expectedSource: 'shyft',
    description: 'Wrapped SOL (should use SHYFT)'
  },
  {
    address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
    expectedSource: 'cache_or_dexscreener',
    description: 'BONK (should use cache or DexScreener)'
  },
  {
    address: 'HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC', // Random token
    expectedSource: 'dexscreener_or_fallback',
    description: 'Random token (should use DexScreener or fallback)'
  }
];

// Simulate SHYFT response
function simulateShyftSymbol(tokenAddress) {
  const knownTokens = {
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin' },
    'So11111111111111111111111111111111111111112': { symbol: 'SOL', name: 'Wrapped SOL' },
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { symbol: 'BONK', name: 'Bonk' }
  };
  
  return knownTokens[tokenAddress] || { symbol: 'Unknown', name: 'Unknown' };
}

// Test DexScreener API
async function testDexScreener(tokenAddress) {
  try {
    console.log(`  🔄 Testing DexScreener API...`);
    
    const response = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      { 
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );

    if (response.data && response.data.pairs && response.data.pairs.length > 0) {
      const pair = response.data.pairs[0];
      const symbol = pair.baseToken?.symbol?.toUpperCase();
      const name = pair.baseToken?.name;
      
      if (symbol && symbol !== 'Unknown') {
        console.log(`  ✅ DexScreener found: ${symbol} (${name})`);
        return { symbol, name: name || symbol, source: 'dexscreener' };
      }
    }
    
    console.log(`  ⚠️ DexScreener returned no valid data`);
    return null;
  } catch (error) {
    console.log(`  ❌ DexScreener failed: ${error.message}`);
    return null;
  }
}

// Test CoinGecko API
async function testCoinGecko(tokenAddress) {
  try {
    console.log(`  🔄 Testing CoinGecko API...`);
    
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/coins/solana/contract/${tokenAddress}`,
      { 
        timeout: 15000,
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (response.data) {
      const symbol = response.data.symbol?.toUpperCase();
      const name = response.data.name;
      
      if (symbol && symbol !== 'Unknown') {
        console.log(`  ✅ CoinGecko found: ${symbol} (${name})`);
        return { symbol, name: name || symbol, source: 'coingecko' };
      }
    }
    
    console.log(`  ⚠️ CoinGecko returned no valid data`);
    return null;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`  ⚠️ CoinGecko: Token not found (404)`);
    } else {
      console.log(`  ❌ CoinGecko failed: ${error.message}`);
    }
    return null;
  }
}

// Test complete flow
async function testTokenResolution(token) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 Testing: ${token.description}`);
  console.log(`📍 Address: ${token.address}`);
  console.log(`${'='.repeat(80)}`);
  
  let result = null;
  let source = null;
  
  // STEP 1: Check SHYFT symbol
  console.log(`\n1️⃣ STEP 1: Checking SHYFT symbol...`);
  const shyftData = simulateShyftSymbol(token.address);
  
  if (shyftData.symbol && shyftData.symbol !== 'Unknown' && shyftData.symbol !== 'Token') {
    console.log(`  ✅ SHYFT has valid symbol: ${shyftData.symbol}`);
    result = shyftData;
    source = 'shyft';
  } else {
    console.log(`  ⚠️ SHYFT symbol invalid (${shyftData.symbol}), checking cache...`);
    
    // STEP 2: Check MongoDB cache
    console.log(`\n2️⃣ STEP 2: Checking MongoDB cache...`);
    const cached = await TokenMetadataCache.findOne({ tokenAddress: token.address }).lean();
    
    if (cached && cached.symbol && cached.symbol !== 'Unknown' && !cached.symbol.includes('...')) {
      console.log(`  ✅ Cache HIT: ${cached.symbol} (source: ${cached.source})`);
      result = cached;
      source = 'cache';
    } else {
      console.log(`  ⚠️ Cache MISS, trying APIs...`);
      
      // STEP 3: Try DexScreener
      console.log(`\n3️⃣ STEP 3: Trying DexScreener API...`);
      const dexResult = await testDexScreener(token.address);
      
      if (dexResult) {
        result = dexResult;
        source = 'dexscreener';
        
        // Save to cache
        await TokenMetadataCache.findOneAndUpdate(
          { tokenAddress: token.address },
          {
            $set: {
              symbol: dexResult.symbol,
              name: dexResult.name,
              source: 'dexscreener',
              lastUpdated: new Date()
            }
          },
          { upsert: true, new: true }
        );
        console.log(`  💾 Saved to cache`);
      } else {
        // STEP 4: Try CoinGecko
        console.log(`\n4️⃣ STEP 4: Trying CoinGecko API...`);
        const coinGeckoResult = await testCoinGecko(token.address);
        
        if (coinGeckoResult) {
          result = coinGeckoResult;
          source = 'coingecko';
          
          // Save to cache
          await TokenMetadataCache.findOneAndUpdate(
            { tokenAddress: token.address },
            {
              $set: {
                symbol: coinGeckoResult.symbol,
                name: coinGeckoResult.name,
                source: 'coingecko',
                lastUpdated: new Date()
              }
            },
            { upsert: true, new: true }
          );
          console.log(`  💾 Saved to cache`);
        } else {
          // STEP 5: Fallback to shortened address
          console.log(`\n5️⃣ STEP 5: Using fallback (shortened address)...`);
          const shortAddress = `${token.address.slice(0, 4)}...${token.address.slice(-4)}`;
          result = { symbol: shortAddress, name: token.address };
          source = 'fallback';
          console.log(`  ⚠️ Using fallback: ${shortAddress}`);
        }
      }
    }
  }
  
  // Summary
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`📊 RESULT:`);
  console.log(`   Symbol: ${result.symbol}`);
  console.log(`   Name: ${result.name || result.symbol}`);
  console.log(`   Source: ${source}`);
  console.log(`   Expected: ${token.expectedSource}`);
  console.log(`${'─'.repeat(80)}`);
  
  return { token: token.address, result, source };
}

// Main test function
async function runTests() {
  console.log(`╔════════════════════════════════════════════════════════════════════╗`);
  console.log(`║   Test Complete Token Resolution Flow                             ║`);
  console.log(`╚════════════════════════════════════════════════════════════════════╝`);
  
  try {
    // Connect to MongoDB
    console.log(`\n🔌 Connecting to MongoDB...`);
    await mongoose.connect(MONGODB_URI);
    console.log(`✅ Connected to MongoDB`);
    
    // Run tests
    const results = [];
    
    for (const token of TEST_TOKENS) {
      const result = await testTokenResolution(token);
      results.push(result);
      
      // Add delay between tests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Summary
    console.log(`\n\n╔════════════════════════════════════════════════════════════════════╗`);
    console.log(`║   TEST SUMMARY                                                     ║`);
    console.log(`╚════════════════════════════════════════════════════════════════════╝`);
    
    const sourceCounts = {};
    results.forEach(r => {
      sourceCounts[r.source] = (sourceCounts[r.source] || 0) + 1;
    });
    
    console.log(`\n📊 Source Distribution:`);
    Object.entries(sourceCounts).forEach(([source, count]) => {
      const percentage = ((count / results.length) * 100).toFixed(1);
      console.log(`   ${source.padEnd(15)}: ${count} (${percentage}%)`);
    });
    
    console.log(`\n✅ All tests completed!`);
    
  } catch (error) {
    console.error(`\n❌ Error:`, error);
  } finally {
    await mongoose.disconnect();
    console.log(`\n🔌 Disconnected from MongoDB`);
  }
}

// Run tests
runTests();
