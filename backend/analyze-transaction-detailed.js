/**
 * Analyze Transaction in Detail
 * Fetch from SHYFT and see what the parser should have done
 */

const axios = require('axios');
require('dotenv').config();

async function analyzeTransaction() {
  try {
    const signature = process.argv[2] || '5ReBLmBVSqXbyQyTr2ag1yco7q4UwVcxZe52QQVrY6WBASZSne2udLkTvmVinZnkGZDVouh9HH9i8bmyezkemzhc';
    const whaleAddress = process.argv[3] || 'G11LHDyKR4RiyL4Fq4sDFsMTMTHDsHC35YTn7rDueYuq';
    
    console.log(`🔍 Analyzing transaction: ${signature}`);
    console.log(`Whale address: ${whaleAddress}\n`);
    
    // Fetch from SHYFT
    console.log('Fetching from SHYFT API...');
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${signature}`,
      {
        headers: {
          'x-api-key': process.env.SHYFT_API_KEY
        }
      }
    );
    
    const tx = response.data.result;
    
    console.log('\n📊 Transaction Details:');
    console.log(`Type: ${tx.type}`);
    console.log(`Status: ${tx.status}`);
    console.log(`Fee Payer: ${tx.fee_payer}`);
    console.log(`Signers: ${tx.signers.join(', ')}`);
    console.log(`Protocol: ${tx.protocol?.name || 'Unknown'}`);
    
    console.log('\n💰 Token Balance Changes:');
    tx.token_balance_changes.forEach((change, i) => {
      const tokenDisplay = change.symbol || (change.token_address ? change.token_address.substring(0, 8) : 'Unknown');
      console.log(`\n${i + 1}. ${tokenDisplay}`);
      console.log(`   Owner: ${change.owner}`);
      console.log(`   Change: ${change.change_amount}`);
      console.log(`   Is Whale: ${change.owner === whaleAddress ? '✅ YES' : '❌ NO'}`);
    });
    
    // Filter to whale's changes only
    const whaleChanges = tx.token_balance_changes.filter(c => c.owner === whaleAddress);
    
    console.log(`\n🐋 Whale's Token Changes (${whaleChanges.length}):`);
    whaleChanges.forEach((change, i) => {
      const tokenDisplay = change.symbol || (change.token_address ? change.token_address.substring(0, 8) : 'Unknown');
      console.log(`${i + 1}. ${tokenDisplay}: ${change.change_amount}`);
    });
    
    // Determine what should happen
    console.log('\n🤔 Analysis:');
    
    const nonCoreTokens = whaleChanges.filter(c => 
      c.symbol !== 'SOL' && 
      c.symbol !== 'WSOL' &&
      c.symbol !== 'USDC' &&
      c.symbol !== 'USDT'
    );
    
    if (nonCoreTokens.length === 2) {
      console.log('✅ This is a token-to-token swap (both non-core)');
      console.log('Should create: 2 separate transactions (SELL + BUY)');
      
      const outgoing = whaleChanges.find(c => c.change_amount < 0);
      const incoming = whaleChanges.find(c => c.change_amount > 0);
      
      console.log(`\nExpected records:`);
      console.log(`1. SELL: ${outgoing?.symbol} → ${incoming?.symbol}`);
      console.log(`2. BUY: ${incoming?.symbol} → ${outgoing?.symbol}`);
    } else if (nonCoreTokens.length === 1) {
      const coreToken = whaleChanges.find(c => 
        c.symbol === 'SOL' || 
        c.symbol === 'WSOL' ||
        c.symbol === 'USDC' ||
        c.symbol === 'USDT'
      );
      const nonCoreToken = nonCoreTokens[0];
      
      if (coreToken.change_amount < 0 && nonCoreToken.change_amount > 0) {
        console.log('✅ This is a BUY (spent core token, received non-core)');
      } else if (coreToken.change_amount > 0 && nonCoreToken.change_amount < 0) {
        console.log('✅ This is a SELL (sold non-core, received core token)');
      }
      
      console.log('Should create: 1 transaction');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

analyzeTransaction();
