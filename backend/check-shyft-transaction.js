const axios = require('axios');
require('dotenv').config();

const signature = '5U1Q5nuWscdx5HRCuYBBYZU1FRtjUJJkxrh1vXEPYWi9LSYojEvGPjboUnB6PnuCFvyJ9MG5n9gK2hi63LKJ4iHa';

async function checkShyftTransaction() {
  try {
    console.log(`🔍 Checking Shyft API for transaction: ${signature.substring(0, 20)}...\n`);
    
    const shyftApiKey = process.env.SHYFT_API_KEY;
    
    if (!shyftApiKey) {
      console.log('❌ SHYFT_API_KEY not found in .env file\n');
      return;
    }
    
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${signature}&commitment=confirmed`,
      {
        headers: {
          'x-api-key': shyftApiKey
        }
      }
    );
    
    if (response.data && response.data.result) {
      const result = response.data.result;
      
      console.log('✅ Shyft API Response:\n');
      console.log(`   Type: ${result.type}`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Timestamp: ${result.timestamp}`);
      
      if (result.actions && result.actions.length > 0) {
        console.log(`\n   Actions (${result.actions.length}):`);
        result.actions.forEach((action, i) => {
          console.log(`\n   Action ${i + 1}:`);
          console.log(`      Type: ${action.type}`);
          
          if (action.info) {
            console.log(`      Info:`);
            
            if (action.info.sender) console.log(`         Sender: ${action.info.sender}`);
            if (action.info.receiver) console.log(`         Receiver: ${action.info.receiver}`);
            
            if (action.info.tokens_swapped) {
              console.log(`\n         Tokens Swapped:`);
              
              if (action.info.tokens_swapped.in) {
                const tokenIn = action.info.tokens_swapped.in;
                console.log(`\n         Token IN:`);
                console.log(`            Symbol: ${tokenIn.symbol || 'N/A'}`);
                console.log(`            Name: ${tokenIn.name || 'N/A'}`);
                console.log(`            Token Address: ${tokenIn.token_address || 'N/A'}`);
                console.log(`            Amount: ${tokenIn.amount || 'N/A'}`);
              }
              
              if (action.info.tokens_swapped.out) {
                const tokenOut = action.info.tokens_swapped.out;
                console.log(`\n         Token OUT:`);
                console.log(`            Symbol: ${tokenOut.symbol || 'N/A'}`);
                console.log(`            Name: ${tokenOut.name || 'N/A'}`);
                console.log(`            Token Address: ${tokenOut.token_address || 'N/A'}`);
                console.log(`            Amount: ${tokenOut.amount || 'N/A'}`);
              }
            }
            
            if (action.info.token_address) {
              console.log(`         Token Address: ${action.info.token_address}`);
              console.log(`         Symbol: ${action.info.symbol || 'N/A'}`);
              console.log(`         Name: ${action.info.name || 'N/A'}`);
              console.log(`         Amount: ${action.info.amount || 'N/A'}`);
            }
          }
        });
      }
      
      console.log('\n' + '='.repeat(80));
      
      // Now check if any token has Unknown or missing symbol
      let hasUnknown = false;
      if (result.actions) {
        result.actions.forEach(action => {
          if (action.info?.tokens_swapped) {
            if (!action.info.tokens_swapped.in?.symbol || action.info.tokens_swapped.in.symbol === 'Unknown') {
              hasUnknown = true;
              console.log(`\n⚠️  Token IN has Unknown/missing symbol`);
              console.log(`   Address: ${action.info.tokens_swapped.in?.token_address}`);
            }
            if (!action.info.tokens_swapped.out?.symbol || action.info.tokens_swapped.out.symbol === 'Unknown') {
              hasUnknown = true;
              console.log(`\n⚠️  Token OUT has Unknown/missing symbol`);
              console.log(`   Address: ${action.info.tokens_swapped.out?.token_address}`);
            }
          }
        });
      }
      
      if (hasUnknown) {
        console.log(`\n🔍 ROOT CAUSE: Shyft API is returning Unknown/missing symbols`);
        console.log(`   This means the token metadata is not available in Shyft's database`);
      }
      
    } else {
      console.log('❌ No result from Shyft API');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.log('Response status:', error.response.status);
      console.log('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

checkShyftTransaction();
