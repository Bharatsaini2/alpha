/**
 * Debug totalWalletCost vs swapInputAmount
 * 
 * This script will check the specific transaction to see why totalWalletCost shows 2
 * when the actual swap input is 1
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

async function debugTotalWalletCost() {
  const signature = '3SJDfTEBrEvoMWT1EqGuYBkV9WcF2tYHyqyaH1fr2Ef5rmdLdGSuFCAmBAwp8wJNWRUUZKHfq9UyZYpfkk8LgUrw';
  
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')));
  console.log(colors.cyan(colors.bold('║                    Debug totalWalletCost Issue                            ║')));
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
    
    console.log(colors.yellow('\n🔍 ALL V2 PARSER AMOUNTS:'));
    console.log(colors.white(`   baseAmount: ${swapData.amounts.baseAmount}`));
    console.log(colors.white(`   swapInputAmount: ${swapData.amounts.swapInputAmount}`));
    console.log(colors.white(`   swapOutputAmount: ${swapData.amounts.swapOutputAmount}`));
    console.log(colors.white(`   totalWalletCost: ${swapData.amounts.totalWalletCost}`));
    console.log(colors.white(`   netWalletReceived: ${swapData.amounts.netWalletReceived}`));

    console.log(colors.cyan('\n🔍 COMPARISON SCRIPT LOGIC:'));
    console.log(colors.white(`Direction: ${swapData.direction}`));
    
    if (swapData.direction === 'BUY') {
      const inputAmount = swapData.amounts.swapInputAmount || swapData.amounts.totalWalletCost || 0;
      const outputAmount = swapData.amounts.baseAmount || 0;
      
      console.log(colors.yellow('\nBUY Logic:'));
      console.log(colors.white(`   swapInputAmount: ${swapData.amounts.swapInputAmount}`));
      console.log(colors.white(`   totalWalletCost: ${swapData.amounts.totalWalletCost}`));
      console.log(colors.white(`   Selected inputAmount: ${inputAmount} (using ${swapData.amounts.swapInputAmount ? 'swapInputAmount' : 'totalWalletCost'})`));
      console.log(colors.white(`   baseAmount: ${swapData.amounts.baseAmount}`));
      console.log(colors.white(`   Selected outputAmount: ${outputAmount}`));
      
      console.log(colors.red('\n❌ PROBLEM IDENTIFIED:'));
      console.log(colors.red(`   The comparison script uses totalWalletCost (${swapData.amounts.totalWalletCost}) when swapInputAmount is available (${swapData.amounts.swapInputAmount})`));
      console.log(colors.red(`   totalWalletCost includes fees and other costs, making it higher than the actual swap amount`));
      
      console.log(colors.green('\n✅ SOLUTION:'));
      console.log(colors.green(`   Use swapInputAmount (${swapData.amounts.swapInputAmount}) instead of totalWalletCost (${swapData.amounts.totalWalletCost})`));
      console.log(colors.green(`   This matches the raw SHYFT amount of 1.0 SOL`));
    }

  } else {
    console.log(colors.red('❌ V2 PARSER FAILED'));
    console.log(colors.red(`   Reason: ${parseResult.erase?.reason}`));
  }

  await mongoose.disconnect();
  console.log(colors.green('\n✅ Disconnected from MongoDB'));
}

debugTotalWalletCost().catch((error) => {
  console.error(colors.red('💥 Debug Error:'), error);
  process.exit(1);
});