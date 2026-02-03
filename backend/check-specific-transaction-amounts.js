/**
 * Check Specific Transaction Amount Calculation
 * 
 * This script will analyze the specific transaction signature provided by the user
 * to identify amount calculation differences between raw SHYFT and V2 parser
 */

const dotenv = require('dotenv');
const axios = require('axios');
const mongoose = require('mongoose');
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');

dotenv.config();

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '';
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';

// Color helpers
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  white: (text) => `\x1b[37m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
};

async function fetchShyftTransaction(signature) {
  try {
    const response = await axios.get(`https://api.shyft.to/sol/v1/transaction/parsed`, {
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
    if (error.response?.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return fetchShyftTransaction(signature);
    }
    return null;
  }
}

function normalizeAmount(amount, decimals) {
  return amount / Math.pow(10, decimals);
}

async function checkSpecificTransaction() {
  const signature = '3SJDfTEBrEvoMWT1EqGuYBkV9WcF2tYHyqyaH1fr2Ef5rmdLdGSuFCAmBAwp8wJNWRUUZKHfq9UyZYpfkk8LgUrw';
  
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')));
  console.log(colors.cyan(colors.bold('║                    Check Specific Transaction Amounts                     ║')));
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')));

  console.log(colors.white(`Analyzing Transaction: ${signature}\n`));

  // Connect to MongoDB
  console.log(colors.cyan('📊 Connecting to MongoDB...'));
  await mongoose.connect(MONGO_URI);
  console.log(colors.green('✅ Connected to MongoDB\n'));

  // Fetch raw SHYFT data
  console.log(colors.cyan('📡 Fetching raw SHYFT data...'));
  const shyftData = await fetchShyftTransaction(signature);
  
  if (!shyftData) {
    console.log(colors.red('❌ Failed to fetch SHYFT data'));
    await mongoose.disconnect();
    return;
  }

  console.log(colors.green('✅ Raw SHYFT data fetched'));
  console.log(colors.white(`   Status: ${shyftData.status}`));
  console.log(colors.white(`   Fee Payer: ${shyftData.fee_payer}`));
  console.log(colors.white(`   Token Balance Changes: ${shyftData.token_balance_changes?.length || 0}`));
  console.log(colors.white(`   Actions: ${shyftData.actions?.length || 0}\n`));

  // Show all token balance changes
  if (shyftData.token_balance_changes && shyftData.token_balance_changes.length > 0) {
    console.log(colors.cyan('💰 ALL Token Balance Changes:'));
    shyftData.token_balance_changes.forEach((change, i) => {
      const normalizedAmount = normalizeAmount(Math.abs(change.change_amount), change.decimals);
      const isSOL = change.mint === 'So11111111111111111111111111111111111111112';
      console.log(colors.gray(`   ${i + 1}. ${isSOL ? 'SOL/WSOL' : 'TOKEN'} (${change.mint?.substring(0, 8)}...)`));
      console.log(colors.gray(`      Owner: ${change.owner?.substring(0, 8)}...`));
      console.log(colors.gray(`      Raw Change: ${change.change_amount}`));
      console.log(colors.gray(`      Decimals: ${change.decimals}`));
      console.log(colors.gray(`      Normalized: ${normalizedAmount.toFixed(6)}`));
      console.log('');
    });
  }

  // Show all actions
  if (shyftData.actions && shyftData.actions.length > 0) {
    console.log(colors.cyan('⚡ ALL Actions:'));
    shyftData.actions.forEach((action, i) => {
      console.log(colors.gray(`   ${i + 1}. Type: ${action.type}`));
      console.log(colors.gray(`      Info: ${JSON.stringify(action.info, null, 2)}`));
      console.log('');
    });
  }

  // Test V2 parser
  console.log(colors.cyan('🧪 Testing V2 parser on this transaction...'));
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

  if (parseResult.success && parseResult.data) {
    const swapData = parseResult.data;
    console.log(colors.green('✅ V2 PARSER SUCCESS!'));
    console.log(colors.white(`   Direction: ${swapData.direction}`));
    console.log(colors.white(`   Swapper: ${swapData.swapper}`));
    console.log(colors.white(`   Quote Asset: ${swapData.quoteAsset.symbol} (${swapData.quoteAsset.mint.substring(0, 8)}...)`));
    console.log(colors.white(`   Base Asset: ${swapData.baseAsset.symbol} (${swapData.baseAsset.mint.substring(0, 8)}...)`));
    
    console.log(colors.yellow('\n🔍 V2 PARSER CALCULATED AMOUNTS:'));
    console.log(colors.white(`   Base Amount: ${Math.abs(swapData.amounts.baseAmount || 0).toFixed(6)}`));
    console.log(colors.white(`   Swap Input Amount: ${Math.abs(swapData.amounts.swapInputAmount || 0).toFixed(6)}`));
    console.log(colors.white(`   Swap Output Amount: ${Math.abs(swapData.amounts.swapOutputAmount || 0).toFixed(6)}`));
    console.log(colors.white(`   Total Wallet Cost: ${Math.abs(swapData.amounts.totalWalletCost || 0).toFixed(6)}`));
    console.log(colors.white(`   Net Wallet Received: ${Math.abs(swapData.amounts.netWalletReceived || 0).toFixed(6)}`));

    // Find the swapper's balance changes
    const swapperAddress = swapData.swapper;
    const swapperBalanceChanges = shyftData.token_balance_changes.filter(change => change.owner === swapperAddress);
    
    console.log(colors.cyan('\n📊 DETAILED COMPARISON: Raw SHYFT vs V2 Parser'));
    console.log(colors.cyan('─'.repeat(80)));
    console.log(colors.white(`Swapper Address: ${swapperAddress}`));
    console.log(colors.white(`Swapper Balance Changes: ${swapperBalanceChanges.length}\n`));
    
    let rawSOLAmount = 0;
    let rawTokenAmount = 0;
    
    swapperBalanceChanges.forEach((change, i) => {
      const rawAmount = Math.abs(change.change_amount);
      const normalizedAmount = normalizeAmount(rawAmount, change.decimals);
      const isSOL = change.mint === 'So11111111111111111111111111111111111111112';
      
      if (isSOL) {
        rawSOLAmount = normalizedAmount;
      } else {
        rawTokenAmount = normalizedAmount;
      }
      
      console.log(colors.gray(`${i + 1}. ${isSOL ? 'SOL/WSOL' : 'TOKEN'} (${change.mint.substring(0, 8)}...)`));
      console.log(colors.gray(`   Raw SHYFT: ${rawAmount} (decimals: ${change.decimals})`));
      console.log(colors.gray(`   Normalized: ${normalizedAmount.toFixed(6)}`));
      console.log('');
    });

    // Compare amounts based on direction
    console.log(colors.yellow('🔍 AMOUNT COMPARISON:'));
    
    if (swapData.direction === 'BUY') {
      const v2SOLAmount = Math.abs(swapData.amounts.swapInputAmount || swapData.amounts.totalWalletCost || 0);
      const v2TokenAmount = Math.abs(swapData.amounts.baseAmount || 0);
      
      console.log(colors.white(`BUY Transaction:`));
      console.log(colors.white(`   SOL Spent (Raw SHYFT): ${rawSOLAmount.toFixed(6)}`));
      console.log(colors.white(`   SOL Spent (V2 Parser): ${v2SOLAmount.toFixed(6)}`));
      console.log(colors.white(`   SOL Difference: ${(v2SOLAmount - rawSOLAmount).toFixed(6)}`));
      
      if (Math.abs(v2SOLAmount - rawSOLAmount) > 0.001) {
        console.log(colors.red(`   ❌ SOL AMOUNT MISMATCH!`));
      } else {
        console.log(colors.green(`   ✅ SOL amounts match`));
      }
      
      console.log(colors.white(`   Token Received (Raw SHYFT): ${rawTokenAmount.toFixed(6)}`));
      console.log(colors.white(`   Token Received (V2 Parser): ${v2TokenAmount.toFixed(6)}`));
      console.log(colors.white(`   Token Difference: ${(v2TokenAmount - rawTokenAmount).toFixed(6)}`));
      
      if (Math.abs(v2TokenAmount - rawTokenAmount) > 0.001) {
        console.log(colors.red(`   ❌ TOKEN AMOUNT MISMATCH!`));
      } else {
        console.log(colors.green(`   ✅ Token amounts match`));
      }
      
    } else { // SELL
      const v2SOLAmount = Math.abs(swapData.amounts.swapOutputAmount || swapData.amounts.netWalletReceived || 0);
      const v2TokenAmount = Math.abs(swapData.amounts.baseAmount || 0);
      
      console.log(colors.white(`SELL Transaction:`));
      console.log(colors.white(`   Token Sold (Raw SHYFT): ${rawTokenAmount.toFixed(6)}`));
      console.log(colors.white(`   Token Sold (V2 Parser): ${v2TokenAmount.toFixed(6)}`));
      console.log(colors.white(`   Token Difference: ${(v2TokenAmount - rawTokenAmount).toFixed(6)}`));
      
      if (Math.abs(v2TokenAmount - rawTokenAmount) > 0.001) {
        console.log(colors.red(`   ❌ TOKEN AMOUNT MISMATCH!`));
      } else {
        console.log(colors.green(`   ✅ Token amounts match`));
      }
      
      console.log(colors.white(`   SOL Received (Raw SHYFT): ${rawSOLAmount.toFixed(6)}`));
      console.log(colors.white(`   SOL Received (V2 Parser): ${v2SOLAmount.toFixed(6)}`));
      console.log(colors.white(`   SOL Difference: ${(v2SOLAmount - rawSOLAmount).toFixed(6)}`));
      
      if (Math.abs(v2SOLAmount - rawSOLAmount) > 0.001) {
        console.log(colors.red(`   ❌ SOL AMOUNT MISMATCH!`));
        console.log(colors.yellow(`   🔍 This might be the issue the user mentioned!`));
        console.log(colors.yellow(`   Raw SHYFT shows ${rawSOLAmount.toFixed(6)} but V2 parser shows ${v2SOLAmount.toFixed(6)}`));
      } else {
        console.log(colors.green(`   ✅ SOL amounts match`));
      }
    }

  } else {
    console.log(colors.red('❌ V2 PARSER FAILED'));
    console.log(colors.red(`   Reason: ${parseResult.erase?.reason}`));
  }

  await mongoose.disconnect();
  console.log(colors.green('\n✅ Disconnected from MongoDB'));
}

checkSpecificTransaction().catch((error) => {
  console.error(colors.red('💥 Check Error:'), error);
  process.exit(1);
});