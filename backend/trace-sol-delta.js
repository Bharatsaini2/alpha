/**
 * Trace SOL Delta Source
 * 
 * Traces exactly where the SOL delta is coming from in the parser
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
  console.log('🔍 Tracing SOL Delta Source\n');
  console.log('Signature:', SIGNATURE);
  
  const shyftData = await fetchShyftTransaction(SIGNATURE);
  
  if (!shyftData) {
    console.log('❌ Could not fetch transaction data');
    return;
  }

  const swapper = shyftData.fee_payer;
  console.log('\nSwapper:', swapper);

  // Check token_balance_changes
  console.log('\n📊 TOKEN_BALANCE_CHANGES:');
  if (shyftData.token_balance_changes) {
    console.log('Total changes:', shyftData.token_balance_changes.length);
    
    const swapperChanges = shyftData.token_balance_changes.filter(c => c.owner === swapper);
    console.log('Swapper changes:', swapperChanges.length);
    
    swapperChanges.forEach((change, i) => {
      const symbol = change.symbol || 'UNKNOWN';
      const mint = change.mint || (change.token && change.token.address) || 'UNKNOWN';
      const delta = change.change_amount || 0;
      
      console.log(`\n  [${i + 1}] ${symbol}`);
      console.log(`      Mint: ${mint}`);
      console.log(`      Delta: ${delta}`);
      console.log(`      Decimals: ${change.decimals || 'N/A'}`);
    });
    
    // Check if SOL is in token_balance_changes
    const solChange = swapperChanges.find(c => 
      (c.mint === 'So11111111111111111111111111111111111111112') ||
      (c.token && c.token.address === 'So11111111111111111111111111111111111111112')
    );
    
    if (solChange) {
      console.log('\n✅ SOL found in token_balance_changes');
      console.log('   Delta:', solChange.change_amount || 0);
    } else {
      console.log('\n❌ SOL NOT found in token_balance_changes');
      console.log('   This will trigger SWAP action fallback');
    }
  }

  // Check actions
  console.log('\n🎬 ACTIONS:');
  if (shyftData.actions) {
    console.log('Total actions:', shyftData.actions.length);
    
    shyftData.actions.forEach((action, i) => {
      console.log(`\n  [${i + 1}] ${action.type}`);
      
      if (action.type === 'SWAP' && action.info) {
        console.log('      ✅ SWAP action found!');
        console.log('      Swapper:', action.info.swapper);
        console.log('      tokens_swapped:', action.info.tokens_swapped ? 'YES' : 'NO');
        
        if (action.info.tokens_swapped) {
          console.log('      IN:', action.info.tokens_swapped.in);
          console.log('      OUT:', action.info.tokens_swapped.out);
        }
      }
      
      if (action.type === 'ROUTE_V2' && action.info) {
        console.log('      ✅ ROUTE_V2 action found!');
        console.log('      in_amount:', action.info.in_amount);
        console.log('      quoted_out_amount:', action.info.quoted_out_amount);
        console.log('      source_mint:', action.info.source_mint);
        console.log('      destination_mint:', action.info.destination_mint);
      }
      
      if (action.type === 'SOL_TRANSFER' && action.info) {
        const sender = action.info.sender;
        const receiver = action.info.receiver;
        const amount = action.info.amount;
        
        if (sender === swapper || receiver === swapper) {
          console.log(`      ${sender === swapper ? '📤 SENT' : '📥 RECEIVED'} by swapper`);
          console.log('      Amount:', amount, 'SOL');
          console.log('      Amount raw:', action.info.amount_raw);
        }
      }
      
      if (action.type === 'TOKEN_TRANSFER' && action.info) {
        const sender = action.info.sender;
        const receiver = action.info.receiver;
        const amount = action.info.amount;
        const token = action.info.token_address;
        
        if (sender === swapper || receiver === swapper) {
          console.log(`      ${sender === swapper ? '📤 SENT' : '📥 RECEIVED'} by swapper`);
          console.log('      Amount:', amount);
          console.log('      Token:', token);
        }
      }
    });
  }

  // Calculate expected SOL delta from SOL_TRANSFER actions
  console.log('\n💰 EXPECTED SOL DELTA FROM SOL_TRANSFERS:');
  let totalSolDelta = 0;
  
  if (shyftData.actions) {
    shyftData.actions.forEach(action => {
      if (action.type === 'SOL_TRANSFER' && action.info) {
        const sender = action.info.sender;
        const receiver = action.info.receiver;
        const amountRaw = action.info.amount_raw || 0;
        
        if (sender === swapper) {
          totalSolDelta -= amountRaw / 1e9; // Sent (negative)
          console.log(`  - ${amountRaw / 1e9} SOL (sent to ${receiver.substring(0, 8)}...)`);
        }
        if (receiver === swapper) {
          totalSolDelta += amountRaw / 1e9; // Received (positive)
          console.log(`  + ${amountRaw / 1e9} SOL (received from ${sender.substring(0, 8)}...)`);
        }
      }
    });
  }
  
  console.log(`\nTotal SOL Delta: ${totalSolDelta} SOL`);
  console.log('This should match the parser output!');
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Trace complete');
  console.log('='.repeat(80));
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
