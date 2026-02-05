/**
 * Test SOL Merge Fix
 * 
 * Verifies that SOL/WSOL deltas are correctly merged before asset counting
 */

require('dotenv').config();
const axios = require('axios');
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_';

async function fetchShyftTransaction(signature) {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed`,
      {
        params: {
          network: 'mainnet-beta',
          txn_signature: signature,
        },
        headers: {
          'x-api-key': SHYFT_API_KEY,
        },
      }
    );
    return response.data?.result || null;
  } catch (error) {
    console.error(`Error fetching ${signature}:`, error.message);
    return null;
  }
}

async function testTransaction(signature, description) {
  console.log('\n' + '='.repeat(80));
  console.log(`TEST: ${description}`);
  console.log('='.repeat(80));
  console.log(`Signature: ${signature}`);

  const shyftData = await fetchShyftTransaction(signature);
  
  if (!shyftData) {
    console.log('❌ Could not fetch transaction data');
    return;
  }

  console.log('\n📊 TOKEN BALANCE CHANGES:');
  if (shyftData.token_balance_changes && shyftData.token_balance_changes.length > 0) {
    const swapper = shyftData.fee_payer;
    const swapperChanges = shyftData.token_balance_changes.filter(c => c.owner === swapper);
    
    console.log(`  Swapper: ${swapper}`);
    console.log(`  Total changes: ${shyftData.token_balance_changes.length}`);
    console.log(`  Swapper changes: ${swapperChanges.length}`);
    
    swapperChanges.forEach((change, i) => {
      const symbol = change.symbol || (change.token && change.token.symbol) || 'UNKNOWN';
      const mint = change.mint || (change.token && change.token.address) || 'UNKNOWN';
      const delta = change.change_amount || (change.post_balance - change.pre_balance);
      
      console.log(`\n  [${i + 1}] ${symbol}`);
      console.log(`      Mint: ${mint.substring(0, 8)}...`);
      console.log(`      Delta: ${delta}`);
    });
  }

  const v2Input = {
    signature: signature,
    timestamp: shyftData.timestamp ? new Date(shyftData.timestamp).getTime() : Date.now(),
    status: shyftData.status || 'Success',
    fee: shyftData.fee || 0,
    fee_payer: shyftData.fee_payer || '',
    signers: shyftData.signers || [],
    protocol: shyftData.protocol,
    token_balance_changes: shyftData.token_balance_changes || [],
    actions: shyftData.actions || []
  };

  const parseResult = parseShyftTransactionV2(v2Input);

  console.log('\n🔍 V2 PARSER RESULT:');
  
  if (parseResult.success && parseResult.data) {
    const swapData = parseResult.data;
    
    console.log('✅ ACCEPTED');
    console.log('  Direction:', swapData.direction);
    console.log('  Quote:', swapData.quoteAsset.symbol);
    console.log('  Base:', swapData.baseAsset.symbol);
    console.log('  Confidence:', swapData.confidence);
    console.log('\n  Amounts:');
    console.log('    swapInputAmount:', swapData.amounts.swapInputAmount);
    console.log('    totalWalletCost:', swapData.amounts.totalWalletCost);
    console.log('    baseAmount:', swapData.amounts.baseAmount);
    
    return true;
  } else if (parseResult.erase) {
    console.log('❌ REJECTED');
    console.log('  Reason:', parseResult.erase.reason);
    if (parseResult.erase.metadata) {
      console.log('  Metadata:', JSON.stringify(parseResult.erase.metadata, null, 2));
    }
    return false;
  }

  return false;
}

async function main() {
  console.log('🧪 Testing SOL Merge Fix\n');
  
  // Test the transaction that was showing doubled amounts
  await testTransaction(
    '3Xrasm33YS3yALUuqX6gVdzhzpUkBV2FkwuRwC3KwK6RXxwXDP6b7ovzBEoHKdVjk8bQVBGSxZRmjFxTzw5MGxQ4',
    'Pump swap with token account creation'
  );
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Test complete');
  console.log('='.repeat(80));
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
