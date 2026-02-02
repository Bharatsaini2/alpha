/**
 * Debug V2 Parser Amount Extraction
 * 
 * Test a few recent transactions to see what amounts the V2 parser is returning
 */

require('dotenv').config();
const axios = require('axios');
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '';

// Test signatures from recent results
const testSignatures = [
  '3JU8q3akMiC9cvuRom1HFnSVsDKu7z4xS46Z4cqMca6HpoB3QXazKnpUSkrHevTDgfK4aNuMsbN3GpN843S7emvN',
  '2TuWAFj1E4J9hZhoxr4mHv9g959x6sHUTj2vra7YLwPMUmCqqWGCoLSLGKaxJ3wK8mFMWQgRCWxD2d2KHBnAnuCA',
  'mFtyiy5ccNtVQ7h1XbWfrrZY2Lhby8vVUww7cQpuW1GB6ziQ3ExFx1Q9chvexpKXJFN2Rx2ZLCV5SuFDsWaEAA9'
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
    console.error(`Error fetching ${signature}:`, error.message);
    return null;
  }
}

async function debugAmounts() {
  console.log('🔍 Debugging V2 Parser Amount Extraction\n');
  
  for (const signature of testSignatures) {
    console.log(`\n📝 Testing: ${signature}`);
    console.log('─'.repeat(80));
    
    // Fetch SHYFT data
    const shyftResponse = await fetchShyftTransaction(signature);
    if (!shyftResponse) {
      console.log('❌ Failed to fetch SHYFT data');
      continue;
    }
    
    // Convert to V2 format
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
    
    console.log(`📊 SHYFT Data:`);
    console.log(`   Status: ${v2Input.status}`);
    console.log(`   Fee Payer: ${v2Input.fee_payer}`);
    console.log(`   Balance Changes: ${v2Input.token_balance_changes.length}`);
    console.log(`   Actions: ${v2Input.actions.length}`);
    
    // Show balance changes
    if (v2Input.token_balance_changes.length > 0) {
      console.log(`\n   Balance Changes:`);
      v2Input.token_balance_changes.forEach((change, i) => {
        console.log(`     ${i + 1}. ${change.mint.substring(0, 8)}... (${change.owner?.substring(0, 8)}...)`);
        console.log(`        Change: ${change.change_amount} (decimals: ${change.decimals})`);
      });
    }
    
    // Show actions
    if (v2Input.actions.length > 0) {
      console.log(`\n   Actions:`);
      v2Input.actions.forEach((action, i) => {
        console.log(`     ${i + 1}. ${action.type}`);
        if (action.info) {
          console.log(`        Info: ${JSON.stringify(action.info, null, 8)}`);
        }
      });
    }
    
    // Parse with V2
    console.log(`\n🔧 V2 Parser Result:`);
    const parseResult = parseShyftTransactionV2(v2Input);
    
    if (parseResult.success && parseResult.data) {
      const swapData = parseResult.data;
      console.log(`   Success: ${parseResult.success}`);
      console.log(`   Processing Time: ${parseResult.processingTimeMs}ms`);
      
      if ('sellRecord' in swapData) {
        // SplitSwapPair
        console.log(`   Type: SplitSwapPair`);
        console.log(`   Sell Record:`);
        console.log(`     Direction: ${swapData.sellRecord.direction}`);
        console.log(`     Quote: ${swapData.sellRecord.quoteAsset.symbol} (${swapData.sellRecord.quoteAsset.mint.substring(0, 8)}...)`);
        console.log(`     Base: ${swapData.sellRecord.baseAsset.symbol} (${swapData.sellRecord.baseAsset.mint.substring(0, 8)}...)`);
        console.log(`     Amounts:`, swapData.sellRecord.amounts);
        console.log(`     Confidence: ${swapData.sellRecord.confidence}`);
      } else {
        // ParsedSwap
        console.log(`   Type: ParsedSwap`);
        console.log(`   Direction: ${swapData.direction}`);
        console.log(`   Quote: ${swapData.quoteAsset.symbol} (${swapData.quoteAsset.mint.substring(0, 8)}...)`);
        console.log(`   Base: ${swapData.baseAsset.symbol} (${swapData.baseAsset.mint.substring(0, 8)}...)`);
        console.log(`   Amounts:`, swapData.amounts);
        console.log(`   Confidence: ${swapData.confidence}`);
      }
    } else {
      console.log(`   Success: ${parseResult.success}`);
      console.log(`   Error: ${JSON.stringify(parseResult.data, null, 2)}`);
    }
    
    console.log('\n');
  }
}

debugAmounts().catch(console.error);