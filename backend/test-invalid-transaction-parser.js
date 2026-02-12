require('dotenv').config();
const axios = require('axios');
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');

const SHYFT_API_KEY = process.env.SHYFT_API_KEY;
const signature = '3vJkjLaJK6cfuK8KNhC8as9jJsHauKot6Cm3P3JDtK3rVo7vW9s4EHq1EfDCmQLmhTLTEXcMpdcYZH3xSKx8PprR';

async function testParser() {
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

    const txData = response.data.result;
    
    // Add signature if missing
    if (!txData.signature && txData.signatures && txData.signatures[0]) {
      txData.signature = txData.signatures[0];
    }
    
    console.log('📊 Transaction Type:', txData.type);
    console.log('📊 Transaction Status:', txData.status);
    console.log('\n');

    // Analyze actions
    console.log('🎬 Actions Analysis:');
    const swapActions = txData.actions.filter(a => 
      a.type === 'SWAP' || 
      a.type === 'JUPITER_SWAP' ||
      a.type === 'RAYDIUM_SWAP' ||
      a.type === 'ORCA_SWAP'
    );
    console.log('Swap actions:', swapActions.length);

    const transferActions = txData.actions.filter(a =>
      a.type === 'TOKEN_TRANSFER' ||
      a.type === 'SOL_TRANSFER' ||
      a.type === 'TRANSFER'
    );
    console.log('Transfer actions:', transferActions.length);

    const emptyActions = txData.actions.filter(a => !a.type || a.type === '');
    console.log('Empty actions:', emptyActions.length);

    const otherActions = txData.actions.filter(a => 
      a.type && 
      a.type !== 'TOKEN_TRANSFER' && 
      a.type !== 'SOL_TRANSFER' && 
      a.type !== 'TRANSFER' &&
      a.type !== 'SWAP' &&
      a.type !== 'JUPITER_SWAP' &&
      a.type !== 'RAYDIUM_SWAP' &&
      a.type !== 'ORCA_SWAP'
    );
    console.log('Other actions:', otherActions.length);
    if (otherActions.length > 0) {
      console.log('Other action types:', otherActions.map(a => a.type));
    }

    console.log('\n');

    // Check if only transfer actions (current logic)
    const onlyTransferActions = txData.actions.length > 0 && txData.actions.every(action =>
      action.type === 'TOKEN_TRANSFER' ||
      action.type === 'SOL_TRANSFER' ||
      action.type === 'TRANSFER'
    );
    console.log('❌ Current logic - Only transfer actions:', onlyTransferActions);

    // Check if only transfer actions (improved logic - ignore empty)
    const nonEmptyActions = txData.actions.filter(a => a.type && a.type !== '');
    const onlyTransferActionsImproved = nonEmptyActions.length > 0 && nonEmptyActions.every(action =>
      action.type === 'TOKEN_TRANSFER' ||
      action.type === 'SOL_TRANSFER' ||
      action.type === 'TRANSFER'
    );
    console.log('✅ Improved logic - Only transfer actions (ignoring empty):', onlyTransferActionsImproved);

    console.log('\n');

    // Test parser
    console.log('🧪 Testing Parser...\n');
    const result = parseShyftTransactionV2(txData);
    
    console.log('Parser Result:');
    console.log('Success:', result.success);
    
    if (result.success) {
      console.log('❌ PROBLEM: Parser accepted this transaction!');
      console.log('Data:', JSON.stringify(result.data, null, 2));
    } else {
      console.log('✅ GOOD: Parser rejected this transaction');
      console.log('Reason:', result.eraseReason);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testParser();
