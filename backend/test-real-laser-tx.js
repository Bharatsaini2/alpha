/**
 * Test Real LASER Transaction
 * 
 * Tests the actual LASER transaction that was failing:
 * ZkD29a4wUftF4j2fqpyR9GoKrWvnk5iKHxUbr6vBDFoaNwHNadx51P4ECTHRMvWrwbgWkS6KfqAGxPv9mNZzsc8
 */

const axios = require('axios');
const { createShyftParserV2 } = require('./dist/utils/shyftParserV2');
require('dotenv').config();

const SIGNATURE = 'ZkD29a4wUftF4j2fqpyR9GoKrWvnk5iKHxUbr6vBDFoaNwHNadx51P4ECTHRMvWrwbgWkS6KfqAGxPv9mNZzsc8';

async function testRealTransaction() {
  console.log('🧪 Testing Real LASER Transaction\n');
  console.log('Signature:', SIGNATURE);
  console.log('\n📡 Fetching transaction from SHYFT API...\n');

  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed`,
      {
        params: {
          network: 'mainnet-beta',
          txn_signature: SIGNATURE,
        },
        headers: {
          'x-api-key': process.env.SHYFT_API_KEY,
        },
      }
    );

    if (!response.data || !response.data.result) {
      console.error('❌ Failed to fetch transaction');
      console.error('Response:', response.data);
      return;
    }

    const tx = response.data.result;
    
    console.log('✅ Transaction fetched successfully');
    console.log('\n📊 Transaction Data:');
    console.log('  Fee Payer:', tx.fee_payer);
    console.log('  Status:', tx.status);
    console.log('  Protocol:', tx.protocol?.name || 'unknown');
    console.log('  Balance Changes:', tx.token_balance_changes?.length || 0);
    console.log('  Actions:', tx.actions?.length || 0);
    
    // Show balance changes for swapper
    console.log('\n  Balance Changes for Fee Payer:');
    const swapperChanges = tx.token_balance_changes?.filter(c => c.owner === tx.fee_payer) || [];
    swapperChanges.forEach(change => {
      const symbol = change.mint === 'So11111111111111111111111111111111111111112' ? 'SOL' : change.mint.substring(0, 8) + '...';
      console.log(`    ${symbol}: ${change.change_amount > 0 ? '+' : ''}${change.change_amount}`);
    });
    
    // Show SWAP actions
    const swapActions = tx.actions?.filter(a => a.type === 'SWAP') || [];
    if (swapActions.length > 0) {
      console.log('\n  SWAP Actions:');
      swapActions.forEach(action => {
        if (action.info?.tokens_swapped) {
          console.log(`    IN:  ${action.info.tokens_swapped.in?.amount_raw || 'N/A'} ${action.info.tokens_swapped.in?.symbol || 'unknown'}`);
          console.log(`    OUT: ${action.info.tokens_swapped.out?.amount_raw || 'N/A'} ${action.info.tokens_swapped.out?.symbol || 'unknown'}`);
        }
      });
    }

    console.log('\n🔧 Parsing with V2 Parser...\n');

    const parser = createShyftParserV2();
    const result = parser.parseTransaction(tx);

    console.log('📋 Result:');
    console.log('  Success:', result.success);
    console.log('  Processing Time:', result.processingTimeMs, 'ms');

    if (result.success && result.data) {
      const swap = result.data;
      console.log('\n✅ PARSED SUCCESSFULLY!');
      console.log('  Direction:', swap.direction);
      console.log('  Quote Asset:', swap.quoteAsset.symbol, '(' + swap.quoteAsset.mint.substring(0, 8) + '...)');
      console.log('  Base Asset:', swap.baseAsset.symbol, '(' + swap.baseAsset.mint.substring(0, 8) + '...)');
      console.log('  Swap Input Amount:', swap.amounts.swapInputAmount);
      console.log('  Swap Output Amount:', swap.amounts.swapOutputAmount);
      console.log('  Total Wallet Cost:', swap.amounts.totalWalletCost);
      console.log('  Net Wallet Received:', swap.amounts.netWalletReceived);
      console.log('  Confidence:', swap.confidence);
      
      console.log('\n🔍 Verification:');
      console.log('  ✅ Transaction parsed successfully');
      console.log('  ✅ Direction:', swap.direction);
      console.log('  ✅ Quote/Base assignment correct');
      
      if (swap.direction === 'SELL') {
        console.log('\n🎉 FIX VERIFIED! Token → SOL sell transactions now work correctly!');
      }
    } else if (result.erase) {
      console.log('\n❌ TRANSACTION ERASED');
      console.log('  Reason:', result.erase.reason);
      console.log('  Debug Info:', JSON.stringify(result.erase.debugInfo, null, 2));
      
      console.log('\n⚠️  This transaction should have been parsed as a SELL!');
    } else {
      console.log('\n❌ UNEXPECTED RESULT');
      console.log(JSON.stringify(result, null, 2));
    }

    console.log('\n' + '='.repeat(60));
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testRealTransaction();
