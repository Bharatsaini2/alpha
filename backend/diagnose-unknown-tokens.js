const axios = require('axios');
const { Metaplex, PublicKey } = require('@metaplex-foundation/js');
const { Connection } = require('@solana/web3.js');

const SOLANA_RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

async function testTokenMetadata(tokenAddress) {
  console.log(`\n🔍 Testing token metadata resolution for: ${tokenAddress}`);
  
  const connection = new Connection(SOLANA_RPC_URL);
  const metaplex = Metaplex.make(connection);
  const mint = new PublicKey(tokenAddress);

  try {
    console.log('  ⏳ Attempting RPC metadata fetch...');
    const metadata = await metaplex.nfts().findByMint({ mintAddress: mint });
    console.log(`  ✅ RPC Success: ${metadata.symbol} (${metadata.name})`);
    return { symbol: metadata.symbol, name: metadata.name, source: 'RPC' };
  } catch (error) {
    console.log(`  ❌ RPC failed: ${error.message}`);
    
    // Try DexScreener
    try {
      console.log('  ⏳ Attempting DexScreener fallback...');
      const dexResponse = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
        { timeout: 5000 }
      );
      
      if (dexResponse.data?.pairs && dexResponse.data.pairs.length > 0) {
        const pair = dexResponse.data.pairs[0];
        const symbol = pair.baseToken?.symbol;
        const name = pair.baseToken?.name;
        
        if (symbol && symbol !== 'Unknown') {
          console.log(`  ✅ DexScreener Success: ${symbol} (${name})`);
          return { symbol, name, source: 'DexScreener' };
        }
      }
      console.log('  ❌ DexScreener returned no valid data');
    } catch (dexError) {
      console.log(`  ❌ DexScreener failed: ${dexError.message}`);
    }
    
    // Fallback
    const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`;
    console.log(`  ⚠️ Using fallback: ${shortAddress}`);
    return { symbol: shortAddress, name: tokenAddress, source: 'FALLBACK' };
  }
}

async function main() {
  console.log('🚀 Unknown Token Diagnostic Tool');
  console.log('================================\n');
  
  // Test with some common tokens
  const testTokens = [
    'So11111111111111111111111111111111111111112', // SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    'DyUKckoakaTfSWSqixECmjutLrkSL5hVe67MfREipump', // Random token
  ];
  
  for (const token of testTokens) {
    const result = await testTokenMetadata(token);
    console.log(`  Result: ${result.symbol} from ${result.source}`);
  }
  
  console.log('\n✅ Diagnostic complete');
}

main().catch(console.error);
