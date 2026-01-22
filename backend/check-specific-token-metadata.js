const axios = require('axios');

const tokenAddress = 'D2mpYXfgGw3xCR3Qbdwj2KaDX8BgkRNth7dGjY4KTRND';

async function checkTokenMetadata() {
  console.log(`🔍 Checking token: ${tokenAddress}\n`);
  
  // 1. Check DexScreener
  console.log('1️⃣ Checking DexScreener...');
  try {
    const dexResponse = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    if (dexResponse.data && dexResponse.data.pairs && dexResponse.data.pairs.length > 0) {
      const pair = dexResponse.data.pairs[0];
      console.log(`   ✅ Found on DexScreener`);
      console.log(`   Symbol: ${pair.baseToken?.symbol || 'N/A'}`);
      console.log(`   Name: ${pair.baseToken?.name || 'N/A'}`);
      console.log(`   Price: $${pair.priceUsd || 'N/A'}`);
    } else {
      console.log(`   ❌ Not found on DexScreener`);
    }
  } catch (error) {
    console.log(`   ❌ DexScreener error: ${error.message}`);
  }

  // 2. Check Jupiter
  console.log('\n2️⃣ Checking Jupiter...');
  try {
    const jupResponse = await axios.get(`https://price.jup.ag/v4/price?ids=${tokenAddress}`);
    if (jupResponse.data && jupResponse.data.data && jupResponse.data.data[tokenAddress]) {
      const tokenData = jupResponse.data.data[tokenAddress];
      console.log(`   ✅ Found on Jupiter`);
      console.log(`   Price: $${tokenData.price || 'N/A'}`);
    } else {
      console.log(`   ❌ Not found on Jupiter`);
    }
  } catch (error) {
    console.log(`   ❌ Jupiter error: ${error.message}`);
  }

  // 3. Check BirdEye (requires API key)
  console.log('\n3️⃣ Checking BirdEye...');
  const birdeyeApiKey = process.env.BIRDEYE_API_KEY || 'YOUR_API_KEY';
  try {
    const birdeyeResponse = await axios.get(
      `https://public-api.birdeye.so/defi/token_overview?address=${tokenAddress}`,
      {
        headers: {
          'X-API-KEY': birdeyeApiKey
        }
      }
    );
    if (birdeyeResponse.data && birdeyeResponse.data.data) {
      const data = birdeyeResponse.data.data;
      console.log(`   ✅ Found on BirdEye`);
      console.log(`   Symbol: ${data.symbol || 'N/A'}`);
      console.log(`   Name: ${data.name || 'N/A'}`);
      console.log(`   Price: $${data.price || 'N/A'}`);
      console.log(`   Logo: ${data.logoURI || 'N/A'}`);
    } else {
      console.log(`   ❌ Not found on BirdEye`);
    }
  } catch (error) {
    console.log(`   ❌ BirdEye error: ${error.message}`);
    if (error.response?.status === 401) {
      console.log(`   ⚠️  API key might be invalid or missing`);
    }
  }

  // 4. Check Solana RPC (token metadata)
  console.log('\n4️⃣ Checking Solana RPC...');
  try {
    const { Connection, PublicKey } = require('@solana/web3.js');
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    
    const tokenPubkey = new PublicKey(tokenAddress);
    const accountInfo = await connection.getParsedAccountInfo(tokenPubkey);
    
    if (accountInfo.value) {
      console.log(`   ✅ Token account exists on-chain`);
      console.log(`   Owner: ${accountInfo.value.owner.toString()}`);
    } else {
      console.log(`   ❌ Token account not found on-chain`);
    }
  } catch (error) {
    console.log(`   ❌ RPC error: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Check complete\n');
}

checkTokenMetadata();
