/**
 * Test SHYFT API Response
 * This script fetches a real transaction from SHYFT to see what data it returns
 */

require('dotenv').config();

const SHYFT_API_KEY = process.env.SHYFT_API_KEY;

// Test with a recent transaction signature (you can replace this)
const TEST_SIGNATURE = '5YJvQvK6FqL8cXqH9Z3wX2N4M7P8R9T1K3L5M6N7P8Q9R1S2T3U4V5W6X7Y8Z9A1B2C3D4E5F6G7H8';

async function testShyftResponse() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║   Test SHYFT API Response                                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  console.log(`🔍 Fetching transaction: ${TEST_SIGNATURE}`);
  console.log('');
  
  try {
    const response = await fetch(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${TEST_SIGNATURE}&commitment=confirmed`,
      {
        method: 'GET',
        headers: {
          'x-api-key': SHYFT_API_KEY
        }
      }
    );
    
    const data = await response.json();
    
    console.log('📊 SHYFT Response:');
    console.log(JSON.stringify(data, null, 2));
    console.log('');
    
    // Check if token_balance_changes has symbols
    if (data.result && data.result.token_balance_changes) {
      console.log('🔍 Token Balance Changes:');
      data.result.token_balance_changes.forEach((change, index) => {
        console.log(`\n  Token ${index + 1}:`);
        console.log(`    Mint: ${change.mint}`);
        console.log(`    Symbol: ${change.symbol || 'NOT PROVIDED'}`);
        console.log(`    Name: ${change.name || 'NOT PROVIDED'}`);
        console.log(`    Decimals: ${change.decimals}`);
        console.log(`    Change: ${change.change_amount}`);
      });
    }
    
    // Check if actions have token info
    if (data.result && data.result.actions) {
      console.log('\n\n🔍 Actions:');
      data.result.actions.forEach((action, index) => {
        console.log(`\n  Action ${index + 1}:`);
        console.log(`    Type: ${action.type}`);
        if (action.info && action.info.tokens_swapped) {
          console.log(`    Tokens Swapped:`);
          action.info.tokens_swapped.forEach((token, i) => {
            console.log(`      Token ${i + 1}:`);
            console.log(`        Mint: ${token.mint}`);
            console.log(`        Symbol: ${token.symbol || 'NOT PROVIDED'}`);
            console.log(`        Name: ${token.name || 'NOT PROVIDED'}`);
          });
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
testShyftResponse().catch(console.error);
