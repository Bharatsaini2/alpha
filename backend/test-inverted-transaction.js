/**
 * Test Inverted Transaction
 * 
 * Fetches a specific transaction from SHYFT and analyzes why it's inverted
 */

const axios = require('axios');
require('dotenv').config();

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_';

// Import V2 parser
delete require.cache[require.resolve('./dist/utils/shyftParserV2')];
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');

async function testTransaction(signature) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing transaction: ${signature}`);
  console.log('='.repeat(80));
  
  try {
    // Fetch from SHYFT
    console.log('\n📡 Fetching from SHYFT API...');
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

    if (!response.data || !response.data.result) {
      console.log('❌ No data returned from SHYFT');
      return;
    }

    const tx = response.data.result;
    
    console.log('\n📊 SHYFT Raw Data:');
    console.log(`Status: ${tx.status}`);
    console.log(`Type: ${tx.type}`);
    console.log(`Protocol: ${tx.protocol?.name || 'Unknown'}`);
    console.log(`Fee Payer: ${tx.fee_payer}`);
    
    // Show token balance changes
    console.log('\n💰 Token Balance Changes:');
    if (tx.token_balance_changes && tx.token_balance_changes.length > 0) {
      tx.token_balance_changes.forEach((change, i) => {
        console.log(`\n  [${i + 1}] ${change.mint?.substring(0, 8)}...`);
        console.log(`      Symbol: ${change.symbol || 'Unknown'}`);
        console.log(`      Owner: ${change.owner?.substring(0, 8)}...`);
        console.log(`      Change: ${change.change_amount}`);
        console.log(`      Pre: ${change.pre_balance} → Post: ${change.post_balance}`);
      });
    }
    
    // Show actions
    console.log('\n⚡ Actions:');
    if (tx.actions && tx.actions.length > 0) {
      tx.actions.forEach((action, i) => {
        console.log(`\n  [${i + 1}] ${action.type}`);
        if (action.info) {
          console.log(`      Info: ${JSON.stringify(action.info, null, 2)}`);
        }
      });
    }
    
    // Parse with V2
    console.log('\n\n🔍 V2 Parser Analysis:');
    console.log('='.repeat(80));
    
    const v2Input = {
      signature: tx.signatures?.[0] || signature,
      timestamp: tx.timestamp ? new Date(tx.timestamp).getTime() : Date.now(),
      status: tx.status || 'Success',
      fee: tx.fee || 0,
      fee_payer: tx.fee_payer || '',
      signers: tx.signers || [],
      protocol: tx.protocol,
      token_balance_changes: tx.token_balance_changes || [],
      actions: tx.actions || []
    };

    const parseResult = parseShyftTransactionV2(v2Input);
    
    if (parseResult.success && parseResult.data) {
      const swap = parseResult.data;
      
      if ('sellRecord' in swap) {
        console.log('\n🔄 SPLIT SWAP DETECTED');
        console.log('\nSELL Record:');
        console.log(`  Direction: ${swap.sellRecord.direction}`);
        console.log(`  Quote: ${swap.sellRecord.quoteAsset.symbol} (${swap.sellRecord.quoteAsset.mint.substring(0, 8)}...)`);
        console.log(`  Base: ${swap.sellRecord.baseAsset.symbol} (${swap.sellRecord.baseAsset.mint.substring(0, 8)}...)`);
        
        console.log('\nBUY Record:');
        console.log(`  Direction: ${swap.buyRecord.direction}`);
        console.log(`  Quote: ${swap.buyRecord.quoteAsset.symbol} (${swap.buyRecord.quoteAsset.mint.substring(0, 8)}...)`);
        console.log(`  Base: ${swap.buyRecord.baseAsset.symbol} (${swap.buyRecord.baseAsset.mint.substring(0, 8)}...)`);
      } else {
        console.log(`\n✅ Direction: ${swap.direction}`);
        console.log(`\nQuote Asset (pricing currency):`);
        console.log(`  Symbol: ${swap.quoteAsset.symbol}`);
        console.log(`  Mint: ${swap.quoteAsset.mint.substring(0, 8)}...`);
        console.log(`  Decimals: ${swap.quoteAsset.decimals}`);
        
        console.log(`\nBase Asset (token being traded):`);
        console.log(`  Symbol: ${swap.baseAsset.symbol}`);
        console.log(`  Mint: ${swap.baseAsset.mint.substring(0, 8)}...`);
        console.log(`  Decimals: ${swap.baseAsset.decimals}`);
        
        console.log(`\nAmounts:`);
        console.log(`  Swap Input: ${swap.amounts.swapInputAmount || 'N/A'}`);
        console.log(`  Total Wallet Cost: ${swap.amounts.totalWalletCost || 'N/A'}`);
        console.log(`  Base Amount: ${swap.amounts.baseAmount || 'N/A'}`);
        console.log(`  Swap Output: ${swap.amounts.swapOutputAmount || 'N/A'}`);
        console.log(`  Net Wallet Received: ${swap.amounts.netWalletReceived || 'N/A'}`);
        
        console.log(`\n📝 Interpretation:`);
        if (swap.direction === 'BUY') {
          console.log(`  User BOUGHT ${swap.baseAsset.symbol} with ${swap.quoteAsset.symbol}`);
          console.log(`  Spent: ${swap.amounts.totalWalletCost || swap.amounts.swapInputAmount} ${swap.quoteAsset.symbol}`);
          console.log(`  Received: ${swap.amounts.baseAmount} ${swap.baseAsset.symbol}`);
        } else {
          console.log(`  User SOLD ${swap.baseAsset.symbol} for ${swap.quoteAsset.symbol}`);
          console.log(`  Spent: ${swap.amounts.baseAmount} ${swap.baseAsset.symbol}`);
          console.log(`  Received: ${swap.amounts.netWalletReceived || swap.amounts.swapOutputAmount} ${swap.quoteAsset.symbol}`);
        }
      }
      
      console.log(`\nConfidence: ${swap.confidence || (swap.sellRecord?.confidence)}`);
      console.log(`Protocol: ${swap.protocol || (swap.sellRecord?.protocol)}`);
      
    } else if (parseResult.erase) {
      console.log(`\n❌ Transaction REJECTED`);
      console.log(`Reason: ${parseResult.erase.reason}`);
      console.log(`Debug: ${JSON.stringify(parseResult.erase.debugInfo, null, 2)}`);
    }
    
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

async function main() {
  const signature = process.argv[2] || '5mB2YAC3TjAux9eRDegehoCRyjBVdWkTgqgAcRCDS8xayESqTfxD3xHQeo1bAquu7yyYtFAA7kQ1yamFrvZnezax';
  
  await testTransaction(signature);
}

main();
