/**
 * Test Updated Amount Extraction
 * 
 * Test the updated live comparison script logic with a few transactions
 */

require('dotenv').config();
const axios = require('axios');
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '';

// Test signatures with known amounts
const testSignatures = [
  '3JU8q3akMiC9cvuRom1HFnSVsDKu7z4xS46Z4cqMca6HpoB3QXazKnpUSkrHevTDgfK4aNuMsbN3GpN843S7emvN', // BUY
  '2TuWAFj1E4J9hZhoxr4mHv9g959x6sHUTj2vra7YLwPMUmCqqWGCoLSLGKaxJ3wK8mFMWQgRCWxD2d2KHBnAnuCA'  // SELL
];

async function fetchShyftTransaction(signature) {
  try {
    const response = await axios.get('https://api.shyft.to/sol/v1/transaction/parsed', {
      params: {
        network: 'mainnet-beta',
        txn_signature: signature,
      },
      headers: {
        'x-api-key': SHYFT_API_KEY,
      },
    });
    return response.data?.result || null;
  } catch (error) {
    return null;
  }
}

async function testAmountExtraction() {
  console.log('🧪 Testing Updated Amount Extraction Logic\n');
  
  for (const signature of testSignatures) {
    console.log(`📝 Testing: ${signature.substring(0, 20)}...`);
    console.log('─'.repeat(60));
    
    // Fetch and parse
    const shyftResponse = await fetchShyftTransaction(signature);
    if (!shyftResponse) continue;
    
    const v2Input = {
      signature: signature,
      timestamp: shyftResponse.timestamp ? new Date(shyftResponse.timestamp).getTime() : Date.now(),
      status: shyftResponse.status || 'Success',
      fee: shyftResponse.fee || 0,
      fee_payer: shyftResponse.fee_payer || '',
      signers: shyftResponse.signers || [],
      protocol: shyftResponse.protocol,
      token_balance_changes: shyftResponse.token_balance_changes || [],
      actions: shyftResponse.actions || []
    };
    
    const parseResult = parseShyftTransactionV2(v2Input);
    
    if (parseResult.success && parseResult.data) {
      const swapData = parseResult.data;
      let inputAmount, outputAmount, inputDecimals, outputDecimals, inputNormalized, outputNormalized;
      
      // Use the updated logic from the fixed live comparison script
      if ('sellRecord' in swapData) {
        // SplitSwapPair - use sellRecord for display
        const sellRecord = swapData.sellRecord;
        
        inputAmount = sellRecord.amounts.baseAmount || sellRecord.amounts.swapInputAmount || 0;
        outputAmount = sellRecord.amounts.swapOutputAmount || sellRecord.amounts.netWalletReceived || 0;
        inputDecimals = sellRecord.quoteAsset.decimals || 9;
        outputDecimals = sellRecord.baseAsset.decimals || 9;
        
        console.log(`   Type: SplitSwapPair`);
        console.log(`   Direction: ${sellRecord.direction}`);
        console.log(`   Quote: ${sellRecord.quoteAsset.symbol}`);
        console.log(`   Base: ${sellRecord.baseAsset.symbol}`);
      } else {
        // ParsedSwap
        if (swapData.direction === 'BUY') {
          // BUY: spending quote asset to get base asset
          inputAmount = swapData.amounts.swapInputAmount || swapData.amounts.totalWalletCost || 0;
          outputAmount = swapData.amounts.baseAmount || 0;
          inputDecimals = swapData.quoteAsset.decimals || 9;
          outputDecimals = swapData.baseAsset.decimals || 9;
        } else {
          // SELL: spending base asset to get quote asset
          inputAmount = swapData.amounts.baseAmount || 0;
          outputAmount = swapData.amounts.swapOutputAmount || swapData.amounts.netWalletReceived || 0;
          inputDecimals = swapData.baseAsset.decimals || 9;
          outputDecimals = swapData.quoteAsset.decimals || 9;
        }
        
        console.log(`   Type: ParsedSwap`);
        console.log(`   Direction: ${swapData.direction}`);
        console.log(`   Quote: ${swapData.quoteAsset.symbol}`);
        console.log(`   Base: ${swapData.baseAsset.symbol}`);
      }
      
      inputNormalized = inputAmount > 0
        ? (Math.abs(inputAmount) / Math.pow(10, inputDecimals)).toFixed(6)
        : '0';
      outputNormalized = outputAmount > 0
        ? (Math.abs(outputAmount) / Math.pow(10, outputDecimals)).toFixed(6)
        : '0';
      
      console.log(`   Raw Amounts: ${inputAmount} → ${outputAmount}`);
      console.log(`   Decimals: ${inputDecimals} → ${outputDecimals}`);
      console.log(`   Normalized: ${inputNormalized} → ${outputNormalized}`);
      console.log(`   Full amounts object:`, JSON.stringify(swapData.amounts || swapData.sellRecord?.amounts, null, 2));
    } else {
      console.log(`   ❌ Parse failed: ${JSON.stringify(parseResult.data)}`);
    }
    
    console.log('\n');
  }
}

testAmountExtraction().catch(console.error);