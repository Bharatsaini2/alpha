/**
 * Test Delta Calculation
 * 
 * Tests how the parser calculates asset deltas for the inverted transaction
 */

const axios = require('axios');
require('dotenv').config();

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_';

async function testDeltaCalculation(signature) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing Delta Calculation: ${signature}`);
  console.log('='.repeat(80));
  
  try {
    // Fetch from SHYFT
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed`,
      {
        params: {
          network: 'mainnet-beta',
          txn_signature: signature
        },
        headers: {
          'x-api-key': SHYFT_API_KEY
        },
        timeout: 15000
      }
    );

    const tx = response.data.result;
    const feePayer = tx.fee_payer;
    const signers = tx.signers || [];
    
    console.log(`\nFee Payer: ${feePayer}`);
    console.log(`Signers: ${signers.join(', ')}`);
    
    // Identify swapper (simplified logic)
    const swapper = feePayer;
    console.log(`\nIdentified Swapper: ${swapper}`);
    
    // Calculate deltas for BOTH wallets
    console.log(`\n💰 Token Balance Changes for ALL Participants:`);
    
    const uniqueOwners = [...new Set(tx.token_balance_changes.map(c => c.owner))];
    
    uniqueOwners.forEach(owner => {
      console.log(`\n  Owner: ${owner}`);
      console.log(`  ${owner === swapper ? '👑 (SWAPPER/FEE PAYER)' : '👤 (OTHER PARTICIPANT)'}`);
      
      const ownerChanges = tx.token_balance_changes.filter(change => change.owner === owner);
      
      ownerChanges.forEach(change => {
        console.log(`\n    Token: ${change.mint?.substring(0, 8)}...`);
        console.log(`    Symbol: ${change.symbol || 'Unknown'}`);
        console.log(`    Change: ${change.change_amount} (${change.change_amount > 0 ? 'RECEIVED' : 'SPENT'})`);
      });
    });
    
    const swapperChanges = tx.token_balance_changes.filter(change => change.owner === swapper);
    
    console.log(`\n🔍 Analysis for SWAPPER (${swapper.substring(0, 8)}...):`);
    
    swapperChanges.forEach(change => {
      console.log(`\n  Token: ${change.mint?.substring(0, 8)}...`);
      console.log(`  Symbol: ${change.symbol || 'Unknown'}`);
      console.log(`  Change Amount: ${change.change_amount}`);
      console.log(`  Pre: ${change.pre_balance} → Post: ${change.post_balance}`);
      console.log(`  Net Delta: ${change.change_amount} (${change.change_amount > 0 ? 'POSITIVE (received)' : 'NEGATIVE (spent)'})`);
    });
    
    // Determine which is core
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    
    console.log(`\n🔍 Analysis:`);
    swapperChanges.forEach(change => {
      const isCore = change.mint === USDC_MINT;
      console.log(`\n  ${change.mint?.substring(0, 8)}... (${change.symbol || 'Unknown'})`);
      console.log(`    Core Token: ${isCore ? 'YES' : 'NO'}`);
      console.log(`    Delta: ${change.change_amount}`);
      console.log(`    Role: ${isCore ? 'QUOTE (pricing currency)' : 'BASE (token being traded)'}`);
    });
    
    // Determine expected direction
    const usdcChange = swapperChanges.find(c => c.mint === USDC_MINT);
    const tokenChange = swapperChanges.find(c => c.mint !== USDC_MINT);
    
    if (usdcChange && tokenChange) {
      console.log(`\n📊 Expected Direction:`);
      console.log(`  USDC (quote) delta: ${usdcChange.change_amount}`);
      console.log(`  Token (base) delta: ${tokenChange.change_amount}`);
      
      if (usdcChange.change_amount < 0 && tokenChange.change_amount > 0) {
        console.log(`  ✅ Should be: BUY (spent USDC to buy token)`);
      } else if (usdcChange.change_amount > 0 && tokenChange.change_amount < 0) {
        console.log(`  ✅ Should be: SELL (sold token to receive USDC)`);
      } else {
        console.log(`  ❌ Invalid: both same sign`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function main() {
  const signature = process.argv[2] || '5mB2YAC3TjAux9eRDegehoCRyjBVdWkTgqgAcRCDS8xayESqTfxD3xHQeo1bAquu7yyYtFAA7kQ1yamFrvZnezax';
  
  await testDeltaCalculation(signature);
}

main();
