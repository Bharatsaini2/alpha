const axios = require('axios');
require('dotenv').config();

const signature = '3cpuauNRc9Ry5mgSc6zqY7VWKHtXCBtT4XwSRwLp6zRuNAhD9nmGxqtHHJKJdRvEY5t4hQ5J3TzR341pVEnhkzib';

async function checkTransaction() {
  try {
    console.log(`🔍 Checking transaction: ${signature.substring(0, 20)}...\n`);
    
    const shyftApiKey = process.env.SHYFT_API_KEY;
    
    if (!shyftApiKey) {
      console.log('❌ SHYFT_API_KEY not found in .env file\n');
      return;
    }
    
    // 1. Check Shyft API
    console.log('1️⃣ Checking Shyft API...\n');
    const shyftResponse = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${signature}&commitment=confirmed`,
      {
        headers: {
          'x-api-key': shyftApiKey
        }
      }
    );
    
    if (shyftResponse.data && shyftResponse.data.result) {
      const result = shyftResponse.data.result;
      
      console.log('✅ Shyft API Response:');
      console.log(`   Type: ${result.type}`);
      console.log(`   Status: ${result.status}`);
      
      if (result.actions && result.actions.length > 0) {
        result.actions.forEach((action, i) => {
          if (action.info?.tokens_swapped) {
            console.log(`\n   Swap Action ${i + 1}:`);
            
            if (action.info.tokens_swapped.in) {
              const tokenIn = action.info.tokens_swapped.in;
              console.log(`\n   Token IN (Shyft):`);
              console.log(`      Symbol: ${tokenIn.symbol || 'N/A'}`);
              console.log(`      Name: ${tokenIn.name || 'N/A'}`);
              console.log(`      Address: ${tokenIn.token_address || 'N/A'}`);
            }
            
            if (action.info.tokens_swapped.out) {
              const tokenOut = action.info.tokens_swapped.out;
              console.log(`\n   Token OUT (Shyft):`);
              console.log(`      Symbol: ${tokenOut.symbol || 'N/A'}`);
              console.log(`      Name: ${tokenOut.name || 'N/A'}`);
              console.log(`      Address: ${tokenOut.token_address || 'N/A'}`);
              
              // Check DexScreener for this token
              if (tokenOut.token_address) {
                console.log(`\n2️⃣ Checking DexScreener for token: ${tokenOut.token_address}...\n`);
                
                (async () => {
                  try {
                    const dexResponse = await axios.get(
                      `https://api.dexscreener.com/latest/dex/tokens/${tokenOut.token_address}`
                    );
                    
                    if (dexResponse.data?.pairs && dexResponse.data.pairs.length > 0) {
                      const pair = dexResponse.data.pairs[0];
                      console.log('   ✅ DexScreener Response:');
                      console.log(`      Symbol: ${pair.baseToken?.symbol || 'N/A'}`);
                      console.log(`      Name: ${pair.baseToken?.name || 'N/A'}`);
                      console.log(`      Price: $${pair.priceUsd || 'N/A'}`);
                      
                      // Compare
                      console.log(`\n📊 Comparison:`);
                      console.log(`   Shyft Symbol: "${tokenOut.symbol || 'N/A'}"`);
                      console.log(`   DexScreener Symbol: "${pair.baseToken?.symbol || 'N/A'}"`);
                      console.log(`   Shyft Name: "${tokenOut.name || 'N/A'}"`);
                      console.log(`   DexScreener Name: "${pair.baseToken?.name || 'N/A'}"`);
                      
                      if ((tokenOut.symbol === null || tokenOut.symbol === 'N/A') && pair.baseToken?.symbol) {
                        console.log(`\n   ⚠️  ISSUE: Shyft has no symbol, but DexScreener has: "${pair.baseToken.symbol}"`);
                      } else if (tokenOut.symbol && pair.baseToken?.symbol && tokenOut.symbol !== pair.baseToken.symbol) {
                        console.log(`\n   ⚠️  MISMATCH: Shyft and DexScreener have different symbols!`);
                      } else if (tokenOut.symbol && pair.baseToken?.symbol && tokenOut.symbol === pair.baseToken.symbol) {
                        console.log(`\n   ✅ MATCH: Both have the same symbol`);
                      }
                    } else {
                      console.log('   ❌ DexScreener: No pairs found');
                    }
                  } catch (error) {
                    console.log(`   ❌ DexScreener error: ${error.message}`);
                  }
                })();
              }
            }
          }
        });
      }
    } else {
      console.log('❌ No result from Shyft API');
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Check complete\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.log('Response status:', error.response.status);
    }
  }
}

checkTransaction();
