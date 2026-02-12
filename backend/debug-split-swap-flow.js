require('dotenv').config();
const axios = require('axios');

const SHYFT_API_KEY = process.env.SHYFT_API_KEY;
const signature = '4uooDQdF2pXMWEod84Snv6hPn9Ahp7jie1GxEjirbqWrrEYd8bkNZTgrv5Ua6jtnd2yHRAU1T8S3Jvsn8mzVj9eF';
const whaleAddress = '5mx9Y6Mhm1GE5VEAahfnrrWxUAhgsSfXQotzFJ96eCXa';

async function debugSplitSwapFlow() {
  try {
    console.log('🔍 DEBUGGING SPLIT SWAP TOKEN FLOW');
    console.log('='.repeat(100));
    console.log(`Transaction: ${signature}`);
    console.log(`Whale: ${whaleAddress}\n`);
    
    // Fetch from Shyft
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${signature}`,
      {
        headers: {
          'x-api-key': SHYFT_API_KEY
        }
      }
    );
    
    const tx = response.data.result;
    
    console.log('📊 TOKEN BALANCE CHANGES (Whale perspective):');
    console.log('='.repeat(100));
    
    const whaleChanges = tx.token_balance_changes?.filter(change => change.owner === whaleAddress) || [];
    
    whaleChanges.forEach((change, idx) => {
      const netChange = parseFloat(change.post_balance) - parseFloat(change.pre_balance);
      const direction = netChange > 0 ? '📈 RECEIVED' : '📉 SENT';
      
      console.log(`\n${idx + 1}. ${direction}`);
      console.log(`   Token: ${change.token_address || change.mint || 'Unknown'}`);
      console.log(`   Symbol: ${change.symbol || 'Unknown'}`);
      console.log(`   Pre Balance: ${change.pre_balance}`);
      console.log(`   Post Balance: ${change.post_balance}`);
      console.log(`   Net Change: ${netChange > 0 ? '+' : ''}${netChange}`);
    });
    
    console.log('\n' + '='.repeat(100));
    console.log('🔄 ACTUAL TRANSACTION FLOW:');
    console.log('='.repeat(100));
    
    const sent = whaleChanges.filter(c => parseFloat(c.post_balance) - parseFloat(c.pre_balance) < 0);
    const received = whaleChanges.filter(c => parseFloat(c.post_balance) - parseFloat(c.pre_balance) > 0);
    
    console.log('\n📤 SENT (What whale gave up):');
    sent.forEach(c => {
      const amount = Math.abs(parseFloat(c.post_balance) - parseFloat(c.pre_balance));
      const tokenAddr = c.token_address || c.mint || 'Unknown';
      console.log(`   - ${amount} ${c.symbol || tokenAddr.slice(0, 8)}`);
    });
    
    console.log('\n📥 RECEIVED (What whale got):');
    received.forEach(c => {
      const amount = parseFloat(c.post_balance) - parseFloat(c.pre_balance);
      const tokenAddr = c.token_address || c.mint || 'Unknown';
      console.log(`   - ${amount} ${c.symbol || tokenAddr.slice(0, 8)}`);
    });
    
    console.log('\n' + '='.repeat(100));
    console.log('💡 INTERPRETATION:');
    console.log('='.repeat(100));
    
    if (sent.length > 0 && received.length > 0) {
      const sentToken = sent[0];
      const receivedToken = received[0];
      const sentAmount = Math.abs(parseFloat(sentToken.post_balance) - parseFloat(sentToken.pre_balance));
      const receivedAmount = parseFloat(receivedToken.post_balance) - parseFloat(receivedToken.pre_balance);
      const sentTokenAddr = sentToken.token_address || sentToken.mint || 'Unknown';
      const receivedTokenAddr = receivedToken.token_address || receivedToken.mint || 'Unknown';
      
      console.log(`\nWhale swapped:`);
      console.log(`   ${sentAmount} ${sentToken.symbol || sentTokenAddr.slice(0, 8)}`);
      console.log(`   ↓`);
      console.log(`   ${receivedAmount} ${receivedToken.symbol || receivedTokenAddr.slice(0, 8)}`);
      
      console.log(`\nThis is a: ${receivedToken.symbol || receivedTokenAddr.slice(0, 8)} BUY`);
      console.log(`(Buying ${receivedToken.symbol || receivedTokenAddr.slice(0, 8)} with ${sentToken.symbol || sentTokenAddr.slice(0, 8)})`);
      
      console.log(`\nFor split swap storage:`);
      console.log(`   SELL leg: Selling ${sentToken.symbol || sentTokenAddr.slice(0, 8)} for SOL`);
      console.log(`   BUY leg: Buying ${receivedToken.symbol || receivedTokenAddr.slice(0, 8)} with SOL`);
    }
    
    console.log('\n' + '='.repeat(100));
    console.log('📋 ACTIONS (Jupiter routing):');
    console.log('='.repeat(100));
    
    tx.actions?.forEach((action, idx) => {
      if (action.type === 'SWAP') {
        console.log(`\n${idx + 1}. ${action.type}`);
        console.log(`   Protocol: ${action.source_protocol?.name || 'Unknown'}`);
        if (action.info?.tokens_swapped) {
          const swap = action.info.tokens_swapped;
          console.log(`   In: ${swap.in.amount} ${swap.in.symbol || swap.in.token_address.slice(0, 8)}`);
          console.log(`   Out: ${swap.out.amount} ${swap.out.symbol || swap.out.token_address.slice(0, 8)}`);
        }
      }
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
  }
}

debugSplitSwapFlow();
