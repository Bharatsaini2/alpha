/**
 * Check Multiple Transactions to Find Amount Calculation Issue
 * 
 * This script will check the specific transactions showing SOL amount as 2
 * to identify where the calculation error is coming from
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

function extractRawAmountsFromShyft(shyftData, targetAddress) {
  const balanceChanges = shyftData.token_balance_changes || [];
  const targetChanges = balanceChanges.filter(change => change.owner === targetAddress);
  
  const amounts = {};
  
  targetChanges.forEach(change => {
    const isSOL = change.mint === 'So11111111111111111111111111111111111111112';
    const normalizedAmount = normalizeAmount(Math.abs(change.change_amount), change.decimals);
    
    if (isSOL) {
      amounts.solAmount = normalizedAmount;
      amounts.solMint = change.mint;
    } else {
      amounts.tokenAmount = normalizedAmount;
      amounts.tokenMint = change.mint;
      amounts.tokenSymbol = 'UNKNOWN';
    }
  });
  
  return amounts;
}

async function checkMultipleTransactions() {
  // Transactions from your data that show SOL amount as 2
  const problemTransactions = [
    '3SJDfTEBrEvoMWT1EqGuYBkV9WcF2tYHyqyaH1fr2Ef5rmdLdGSuFCAmBAwp8wJNWRUUZKHfq9UyZYpfkk8LgUrw',
    '4DnUr2oPWk941GzVgm3VYHAyq2URYHXbHKP1eUpjjARhVp84K2JLE4FeNQFnqANsbnVdWJJfR5YdpzBFLwQg3LrX'
  ];
  
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')));
  console.log(colors.cyan(colors.bold('║                    Check Multiple Problem Transactions                    ║')));
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')));

  // Connect to MongoDB
  console.log(colors.cyan('📊 Connecting to MongoDB...'));
  await mongoose.connect(MONGO_URI);
  console.log(colors.green('✅ Connected to MongoDB\n'));

  for (let i = 0; i < problemTransactions.length; i++) {
    const signature = problemTransactions[i];
    
    console.log(colors.cyan(`\n📊 Testing Transaction ${i + 1}/${problemTransactions.length}`));
    console.log(colors.white(`Signature: ${signature}\n`));

    // Fetch raw SHYFT data
    const shyftData = await fetchShyftTransaction(signature);
    
    if (!shyftData) {
      console.log(colors.red('❌ Failed to fetch SHYFT data'));
      continue;
    }

    console.log(colors.green('✅ Raw SHYFT data fetched'));
    console.log(colors.white(`   Status: ${shyftData.status}`));
    console.log(colors.white(`   Fee Payer: ${shyftData.fee_payer}`));
    console.log(colors.white(`   Token Balance Changes: ${shyftData.token_balance_changes?.length || 0}\n`));

    // Show all token balance changes
    if (shyftData.token_balance_changes && shyftData.token_balance_changes.length > 0) {
      console.log(colors.cyan('💰 ALL Token Balance Changes:'));
      shyftData.token_balance_changes.forEach((change, j) => {
        const normalizedAmount = normalizeAmount(Math.abs(change.change_amount), change.decimals);
        const isSOL = change.mint === 'So11111111111111111111111111111111111111112';
        console.log(colors.gray(`   ${j + 1}. ${isSOL ? 'SOL/WSOL' : 'TOKEN'} (${change.mint?.substring(0, 8)}...)`));
        console.log(colors.gray(`      Owner: ${change.owner?.substring(0, 8)}...`));
        console.log(colors.gray(`      Raw Change: ${change.change_amount}`));
        console.log(colors.gray(`      Decimals: ${change.decimals}`));
        console.log(colors.gray(`      Normalized: ${normalizedAmount.toFixed(6)}`));
      });
      console.log('');
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
      
      // Extract raw amounts from SHYFT data directly
      const rawAmounts = extractRawAmountsFromShyft(shyftData, swapData.swapper);
      
      console.log(colors.yellow('\n🔍 RAW SHYFT AMOUNTS FOR SWAPPER:'));
      console.log(colors.white(`   SOL Amount: ${(rawAmounts.solAmount || 0).toFixed(6)}`));
      console.log(colors.white(`   Token Amount: ${(rawAmounts.tokenAmount || 0).toFixed(6)}`));
      
      console.log(colors.yellow('\n🔍 V2 PARSER CALCULATED AMOUNTS:'));
      console.log(colors.white(`   Base Amount: ${Math.abs(swapData.amounts.baseAmount || 0).toFixed(6)}`));
      console.log(colors.white(`   Swap Input Amount: ${Math.abs(swapData.amounts.swapInputAmount || 0).toFixed(6)}`));
      console.log(colors.white(`   Swap Output Amount: ${Math.abs(swapData.amounts.swapOutputAmount || 0).toFixed(6)}`));
      console.log(colors.white(`   Total Wallet Cost: ${Math.abs(swapData.amounts.totalWalletCost || 0).toFixed(6)}`));
      console.log(colors.white(`   Net Wallet Received: ${Math.abs(swapData.amounts.netWalletReceived || 0).toFixed(6)}`));

      // Simulate comparison script logic
      console.log(colors.cyan('\n🔍 COMPARISON SCRIPT SIMULATION:'));
      
      let inputAmount, outputAmount;
      
      if (swapData.direction === 'BUY') {
        // OLD LOGIC (problematic):
        const oldInputAmount = swapData.amounts.swapInputAmount || swapData.amounts.totalWalletCost || 0;
        const oldOutputAmount = swapData.amounts.baseAmount || 0;
        
        // NEW LOGIC (using raw SHYFT):
        const newInputAmount = rawAmounts.solAmount || 0;
        const newOutputAmount = rawAmounts.tokenAmount || 0;
        
        console.log(colors.red('   OLD LOGIC (V2 Parser Amounts):'));
        console.log(colors.red(`     Input (SOL): ${Math.abs(oldInputAmount).toFixed(6)}`));
        console.log(colors.red(`     Output (Token): ${Math.abs(oldOutputAmount).toFixed(6)}`));
        
        console.log(colors.green('   NEW LOGIC (Raw SHYFT Amounts):'));
        console.log(colors.green(`     Input (SOL): ${newInputAmount.toFixed(6)}`));
        console.log(colors.green(`     Output (Token): ${newOutputAmount.toFixed(6)}`));
        
        if (Math.abs(oldInputAmount - newInputAmount) > 0.001) {
          console.log(colors.red(`   ❌ MISMATCH FOUND! Old shows ${Math.abs(oldInputAmount).toFixed(6)}, Raw SHYFT shows ${newInputAmount.toFixed(6)}`));
          console.log(colors.yellow(`   🔍 Difference: ${(Math.abs(oldInputAmount) - newInputAmount).toFixed(6)}`));
        } else {
          console.log(colors.green(`   ✅ Amounts match`));
        }
        
      } else { // SELL
        const oldInputAmount = swapData.amounts.baseAmount || 0;
        const oldOutputAmount = swapData.amounts.swapOutputAmount || swapData.amounts.netWalletReceived || 0;
        
        const newInputAmount = rawAmounts.tokenAmount || 0;
        const newOutputAmount = rawAmounts.solAmount || 0;
        
        console.log(colors.red('   OLD LOGIC (V2 Parser Amounts):'));
        console.log(colors.red(`     Input (Token): ${Math.abs(oldInputAmount).toFixed(6)}`));
        console.log(colors.red(`     Output (SOL): ${Math.abs(oldOutputAmount).toFixed(6)}`));
        
        console.log(colors.green('   NEW LOGIC (Raw SHYFT Amounts):'));
        console.log(colors.green(`     Input (Token): ${newInputAmount.toFixed(6)}`));
        console.log(colors.green(`     Output (SOL): ${newOutputAmount.toFixed(6)}`));
        
        if (Math.abs(oldOutputAmount - newOutputAmount) > 0.001) {
          console.log(colors.red(`   ❌ MISMATCH FOUND! Old shows ${Math.abs(oldOutputAmount).toFixed(6)}, Raw SHYFT shows ${newOutputAmount.toFixed(6)}`));
          console.log(colors.yellow(`   🔍 Difference: ${(Math.abs(oldOutputAmount) - newOutputAmount).toFixed(6)}`));
        } else {
          console.log(colors.green(`   ✅ Amounts match`));
        }
      }

    } else {
      console.log(colors.red('❌ V2 PARSER FAILED'));
      console.log(colors.red(`   Reason: ${parseResult.erase?.reason}`));
    }

    console.log(colors.gray('\n' + '─'.repeat(80)));
    
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  await mongoose.disconnect();
  console.log(colors.green('\n✅ Disconnected from MongoDB'));
}

checkMultipleTransactions().catch((error) => {
  console.error(colors.red('💥 Check Error:'), error);
  process.exit(1);
});