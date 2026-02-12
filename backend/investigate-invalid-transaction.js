require('dotenv').config();
const axios = require('axios');

const SHYFT_API_KEY = process.env.SHYFT_API_KEY;
const signature = '3vJkjLaJK6cfuK8KNhC8as9jJsHauKot6Cm3P3JDtK3rVo7vW9s4EHq1EfDCmQLmhTLTEXcMpdcYZH3xSKx8PprR';

async function investigateTransaction() {
  try {
    console.log('🔍 Fetching transaction from Shyft API...\n');
    
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed`,
      {
        params: {
          network: 'mainnet-beta',
          txn_signature: signature
        },
        headers: {
          'x-api-key': SHYFT_API_KEY
        }
      }
    );

    const txData = response.data;
    
    console.log('📊 Transaction Data:\n');
    console.log('Success:', txData.success);
    console.log('Type:', txData.result?.type);
    console.log('Status:', txData.result?.status);
    console.log('Fee:', txData.result?.fee);
    console.log('Timestamp:', txData.result?.timestamp);
    console.log('\n');

    // Check actions
    if (txData.result?.actions) {
      console.log('🎬 Actions:');
      txData.result.actions.forEach((action, idx) => {
        console.log(`\nAction ${idx + 1}:`);
        console.log('  Type:', action.type);
        console.log('  Info:', JSON.stringify(action.info, null, 2));
      });
    }

    // Check if it's a swap
    console.log('\n\n🔍 Swap Detection:');
    const hasSwapAction = txData.result?.actions?.some(action => 
      action.type === 'SWAP' || 
      action.type === 'TOKEN_SWAP' ||
      action.type === 'SWAP_TOKEN'
    );
    console.log('Has SWAP action:', hasSwapAction);

    // Check token transfers
    if (txData.result?.actions) {
      const tokenTransfers = txData.result.actions.filter(action => 
        action.type === 'TOKEN_TRANSFER' || 
        action.type === 'TRANSFER'
      );
      console.log('Token transfers:', tokenTransfers.length);
      
      if (tokenTransfers.length > 0) {
        console.log('\n📤 Token Transfers:');
        tokenTransfers.forEach((transfer, idx) => {
          console.log(`\nTransfer ${idx + 1}:`);
          console.log(JSON.stringify(transfer, null, 2));
        });
      }
    }

    // Full response for analysis
    console.log('\n\n📋 Full Response:');
    console.log(JSON.stringify(txData, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

investigateTransaction();
