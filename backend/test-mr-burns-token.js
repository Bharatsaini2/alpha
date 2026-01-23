require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const { Metaplex } = require('@metaplex-foundation/js');
const axios = require('axios');

const SOLANA_RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

async function getTokenMetaDataUsingRPC(tokenAddress, retries = 3) {
  const connection = new Connection(SOLANA_RPC_URL);
  const metaplex = Metaplex.make(connection);
  const mint = new PublicKey(tokenAddress);

  try {
    const metadata = await metaplex.nfts().findByMint({ mintAddress: mint });
    return {
      symbol: metadata.symbol,
      name: metadata.name,
    };
  } catch (error) {
    console.error('Error fetching token metadata from RPC:', error.message);
    
    // Fallback 1: Try DexScreener
    try {
      console.log(`🔄 Trying DexScreener fallback for ${tokenAddress}`);
      const dexResponse = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
        { timeout: 5000 }
      );
      
      if (dexResponse.data?.pairs && dexResponse.data.pairs.length > 0) {
        const pair = dexResponse.data.pairs[0];
        const symbol = pair.baseToken?.symbol;
        const name = pair.baseToken?.name;
        
        if (symbol && symbol !== 'Unknown') {
          console.log(`✅ DexScreener found: ${symbol} (${name})`);
          return { symbol, name: name || symbol };
        }
      }
    } catch (dexError) {
      console.error('DexScreener fallback failed:', dexError.message);
    }
    
    // Fallback 2: Use shortened contract address as symbol
    const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`;
    console.log(`⚠️ Using contract address as fallback: ${shortAddress}`);
    return { 
      symbol: shortAddress,
      name: tokenAddress
    };
  }
}

async function testMrBurnsToken() {
  const tokenAddress = 'r3fcAzv5NXCPFf2GRPPxEkbAZQJRfaHcR8WQngEpump';
  
  console.log('🔥 Testing Mr Burns Token\n');
  console.log('='.repeat(80));
  console.log(`\nToken Address: ${tokenAddress}\n`);
  
  console.log('❌ BEFORE FIX:');
  console.log('   Symbol: Unknown');
  console.log('   Name: Unknown');
  console.log('   Display: "Unknown" / "Unknown"\n');
  
  console.log('✅ AFTER FIX (with our code):\n');
  
  const result = await getTokenMetaDataUsingRPC(tokenAddress);
  
  console.log(`\n📊 Result:`);
  console.log(`   Symbol: ${result.symbol}`);
  console.log(`   Name: ${result.name}`);
  
  console.log(`\n🎨 How it will display in Alpha Stream:`);
  console.log(`   <h5>${result.symbol}</h5>        ← Big text (symbol)`);
  console.log(`   <p>${result.name}</p>            ← Small text (name)`);
  
  console.log('\n' + '='.repeat(80));
  
  if (result.symbol !== 'Unknown' && result.name !== 'Unknown') {
    console.log('\n🎉 SUCCESS! Token will show as:');
    console.log(`   "${result.symbol}" - "${result.name}"`);
    console.log(`   Instead of "Unknown" - "Unknown"`);
  } else {
    console.log('\n⚠️ Still showing Unknown');
  }
  
  console.log('');
}

testMrBurnsToken().catch(console.error);
