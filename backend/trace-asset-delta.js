/**
 * Trace Asset Delta Collection
 * 
 * Detailed trace of how assets are collected and merged
 */

require('dotenv').config();
const axios = require('axios');

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_';
const SIGNATURE = '3Xrasm33YS3yALUuqX6gVdzhzpUkBV2FkwuRwC3KwK6RXxwXDP6b7ovzBEoHKdVjk8bQVBGSxZRmjFxTzw5MGxQ4';

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

async function main() {
  console.log('🔍 Tracing Asset Delta Collection\n');
  console.log('Signature:', SIGNATURE);
  console.log('='.repeat(80));

  const shyftData = await fetchShyftTransaction(SIGNATURE);
  
  if (!shyftData) {
    console.log('❌ Could not fetch transaction data');
    return;
  }

  const swapper = shyftData.fee_payer;
  console.log('\n📊 SWAPPER:', swapper);

  // Step 1: Show all token_balance_changes
  console.log('\n' + '='.repeat(80));
  console.log('STEP 1: ALL TOKEN BALANCE CHANGES');
  console.log('='.repeat(80));
  
  if (shyftData.token_balance_changes) {
    console.log(`Total changes: ${shyftData.token_balance_changes.length}`);
    
    shyftData.token_balance_changes.forEach((change, i) => {
      const symbol = change.symbol || (change.token && change.token.symbol) || 'UNKNOWN';
      const mint = change.mint || (change.token && change.token.address) || 'UNKNOWN';
      const delta = change.change_amount || (change.post_balance - change.pre_balance);
      const isSwapper = change.owner === swapper;
      
      console.log(`\n[${i + 1}] ${symbol} ${isSwapper ? '← SWAPPER' : ''}`);
      console.log(`    Mint: ${mint.substring(0, 12)}...`);
      console.log(`    Owner: ${change.owner.substring(0, 12)}...`);
      console.log(`    Delta: ${delta}`);
    });
  }

  // Step 2: Show swapper's changes only
  console.log('\n' + '='.repeat(80));
  console.log('STEP 2: SWAPPER CHANGES ONLY');
  console.log('='.repeat(80));
  
  const swapperChanges = shyftData.token_balance_changes.filter(c => c.owner === swapper);
  console.log(`Swapper changes: ${swapperChanges.length}`);
  
  swapperChanges.forEach((change, i) => {
    const symbol = change.symbol || (change.token && change.token.symbol) || 'UNKNOWN';
    const mint = change.mint || (change.token && change.token.address) || 'UNKNOWN';
    const delta = change.change_amount || (change.post_balance - change.pre_balance);
    
    console.log(`\n[${i + 1}] ${symbol}`);
    console.log(`    Mint: ${mint}`);
    console.log(`    Delta: ${delta}`);
    console.log(`    Decimals: ${change.decimals || 'unknown'}`);
  });

  // Step 3: Check for SWAP actions
  console.log('\n' + '='.repeat(80));
  console.log('STEP 3: SWAP ACTIONS');
  console.log('='.repeat(80));
  
  const swapActions = shyftData.actions.filter(a => a.type === 'SWAP');
  console.log(`SWAP actions found: ${swapActions.length}`);
  
  swapActions.forEach((action, i) => {
    console.log(`\n[${i + 1}] SWAP Action`);
    console.log(JSON.stringify(action.info, null, 2));
  });

  // Step 4: Check for transfer actions
  console.log('\n' + '='.repeat(80));
  console.log('STEP 4: TRANSFER ACTIONS');
  console.log('='.repeat(80));
  
  const transferActions = shyftData.actions.filter(a => 
    a.type === 'SOL_TRANSFER' || a.type === 'TOKEN_TRANSFER'
  );
  console.log(`Transfer actions found: ${transferActions.length}`);
  
  transferActions.forEach((action, i) => {
    console.log(`\n[${i + 1}] ${action.type}`);
    if (action.info) {
      console.log(`    Amount: ${action.info.amount || action.info.amount_raw || 'unknown'}`);
      console.log(`    Sender: ${action.info.sender ? action.info.sender.substring(0, 12) + '...' : 'unknown'}`);
      console.log(`    Receiver: ${action.info.receiver ? action.info.receiver.substring(0, 12) + '...' : 'unknown'}`);
    }
  });

  // Step 5: Expected behavior
  console.log('\n' + '='.repeat(80));
  console.log('STEP 5: EXPECTED BEHAVIOR');
  console.log('='.repeat(80));
  
  console.log('\nBased on the data:');
  console.log(`1. Swapper has ${swapperChanges.length} token balance change(s)`);
  console.log(`2. There are ${transferActions.length} transfer actions`);
  console.log(`3. There are ${swapActions.length} SWAP actions`);
  
  console.log('\nExpected parser behavior:');
  if (swapperChanges.length === 1 && transferActions.length > 0) {
    console.log('✅ Should NOT use SWAP action fallback (has transfer actions)');
    console.log('✅ Should only have 1 asset in deltaMap (the token)');
    console.log('❌ Should be REJECTED with invalid_asset_count');
  } else if (swapperChanges.length === 1 && transferActions.length === 0 && swapActions.length > 0) {
    console.log('✅ Should use SWAP action fallback (no transfer actions)');
    console.log('✅ Should add missing SOL from SWAP action');
    console.log('✅ Should have 2 assets after fallback');
    console.log('✅ Should be ACCEPTED');
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Trace complete');
  console.log('='.repeat(80));
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
