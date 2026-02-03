/**
 * Test Raw SHYFT Amounts vs V2 Parser Calculations
 * 
 * This script will:
 * 1. Get multiple recent transactions
 * 2. Compare raw SHYFT amounts vs V2 parser amounts
 * 3. Create a modified comparison script that uses raw SHYFT amounts directly
 */

const dotenv = require('dotenv');
const axios = require('axios');
const mongoose = require('mongoose');
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');
const InfluencerWhaleTransactionsV2Model = require('./dist/models/influencerWhaleTransactionsV2.model').default;
const WhaleAllTransactionsV2Model = require('./dist/models/whaleAllTransactionsV2.model').default;

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
    }
  });
  
  return amounts;
}

async function testMultipleTransactions() {
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')));
  console.log(colors.cyan(colors.bold('║                Test Raw SHYFT Amounts vs V2 Parser                        ║')));
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')));

  // Connect to MongoDB
  console.log(colors.cyan('📊 Connecting to MongoDB...'));
  await mongoose.connect(MONGO_URI);
  console.log(colors.green('✅ Connected to MongoDB\n'));

  // Get recent transactions from both collections
  console.log(colors.cyan('🔍 Finding recent transactions...'));
  
  const recentKolTxs = await InfluencerWhaleTransactionsV2Model.find({
    'transaction.timestamp': { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
  }).sort({ 'transaction.timestamp': -1 }).limit(5).lean();

  const recentWhaleTxs = await WhaleAllTransactionsV2Model.find({
    'transaction.timestamp': { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
  }).sort({ 'transaction.timestamp': -1 }).limit(5).lean();

  const allTransactions = [...recentKolTxs, ...recentWhaleTxs];
  
  console.log(colors.green(`✅ Found ${allTransactions.length} recent transactions\n`));

  const results = [];

  for (let i = 0; i < Math.min(allTransactions.length, 10); i++) {
    const tx = allTransactions[i];
    const signature = tx.signature || tx.transaction?.signature;
    const walletAddress = tx.whaleAddress || tx.whale?.address;
    
    if (!signature || !walletAddress) continue;

    console.log(colors.cyan(`\n📊 Testing Transaction ${i + 1}/${Math.min(allTransactions.length, 10)}`));
    console.log(colors.gray(`   Signature: ${signature}`));
    console.log(colors.gray(`   Wallet: ${walletAddress.substring(0, 8)}...`));
    console.log(colors.gray(`   Type: ${tx.type}`));

    // Fetch raw SHYFT data
    const shyftData = await fetchShyftTransaction(signature);
    if (!shyftData) {
      console.log(colors.red('   ❌ Failed to fetch SHYFT data'));
      continue;
    }

    // Extract raw amounts
    const rawAmounts = extractRawAmountsFromShyft(shyftData, walletAddress);
    
    // Test V2 parser
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
      
      let v2SolAmount = 0;
      let v2TokenAmount = 0;
      
      if (swapData.direction === 'BUY') {
        v2SolAmount = Math.abs(swapData.amounts.swapInputAmount || swapData.amounts.totalWalletCost || 0);
        v2TokenAmount = Math.abs(swapData.amounts.baseAmount || 0);
      } else {
        v2SolAmount = Math.abs(swapData.amounts.swapOutputAmount || swapData.amounts.netWalletReceived || 0);
        v2TokenAmount = Math.abs(swapData.amounts.baseAmount || 0);
      }

      const result = {
        signature,
        walletAddress,
        type: tx.type,
        direction: swapData.direction,
        rawSolAmount: rawAmounts.solAmount || 0,
        rawTokenAmount: rawAmounts.tokenAmount || 0,
        v2SolAmount,
        v2TokenAmount,
        solDifference: v2SolAmount - (rawAmounts.solAmount || 0),
        tokenDifference: v2TokenAmount - (rawAmounts.tokenAmount || 0),
        solMatch: Math.abs(v2SolAmount - (rawAmounts.solAmount || 0)) < 0.001,
        tokenMatch: Math.abs(v2TokenAmount - (rawAmounts.tokenAmount || 0)) < 0.001
      };

      results.push(result);

      console.log(colors.white(`   Direction: ${swapData.direction}`));
      console.log(colors.white(`   Raw SOL Amount: ${(rawAmounts.solAmount || 0).toFixed(6)}`));
      console.log(colors.white(`   V2 SOL Amount:  ${v2SolAmount.toFixed(6)}`));
      console.log(colors.white(`   SOL Difference: ${result.solDifference.toFixed(6)}`));
      
      if (result.solMatch) {
        console.log(colors.green(`   ✅ SOL amounts match`));
      } else {
        console.log(colors.red(`   ❌ SOL amounts differ by ${Math.abs(result.solDifference).toFixed(6)}`));
      }

      console.log(colors.white(`   Raw Token Amount: ${(rawAmounts.tokenAmount || 0).toFixed(6)}`));
      console.log(colors.white(`   V2 Token Amount:  ${v2TokenAmount.toFixed(6)}`));
      console.log(colors.white(`   Token Difference: ${result.tokenDifference.toFixed(6)}`));
      
      if (result.tokenMatch) {
        console.log(colors.green(`   ✅ Token amounts match`));
      } else {
        console.log(colors.red(`   ❌ Token amounts differ by ${Math.abs(result.tokenDifference).toFixed(6)}`));
      }

    } else {
      console.log(colors.red(`   ❌ V2 parser failed: ${parseResult.erase?.reason}`));
    }

    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Summary
  console.log(colors.cyan('\n\n' + '═'.repeat(80)));
  console.log(colors.cyan(colors.bold('SUMMARY')));
  console.log(colors.cyan('═'.repeat(80)));

  const solMatches = results.filter(r => r.solMatch).length;
  const tokenMatches = results.filter(r => r.tokenMatch).length;
  const solMismatches = results.filter(r => !r.solMatch);
  const tokenMismatches = results.filter(r => !r.tokenMatch);

  console.log(colors.white(`\nTotal Transactions Tested: ${results.length}`));
  console.log(colors.green(`SOL Amount Matches: ${solMatches}/${results.length}`));
  console.log(colors.green(`Token Amount Matches: ${tokenMatches}/${results.length}`));

  if (solMismatches.length > 0) {
    console.log(colors.red(`\nSOL Amount Mismatches: ${solMismatches.length}`));
    solMismatches.forEach((result, i) => {
      console.log(colors.red(`${i + 1}. ${result.signature.substring(0, 16)}... | Raw: ${result.rawSolAmount.toFixed(6)} | V2: ${result.v2SolAmount.toFixed(6)} | Diff: ${result.solDifference.toFixed(6)}`));
    });
  }

  if (tokenMismatches.length > 0) {
    console.log(colors.red(`\nToken Amount Mismatches: ${tokenMismatches.length}`));
    tokenMismatches.forEach((result, i) => {
      console.log(colors.red(`${i + 1}. ${result.signature.substring(0, 16)}... | Raw: ${result.rawTokenAmount.toFixed(6)} | V2: ${result.v2TokenAmount.toFixed(6)} | Diff: ${result.tokenDifference.toFixed(6)}`));
    });
  }

  console.log(colors.cyan('\n💡 RECOMMENDATION:'));
  if (solMismatches.length > 0 || tokenMismatches.length > 0) {
    console.log(colors.yellow('Found calculation differences! We should modify comparison scripts to use raw SHYFT amounts.'));
  } else {
    console.log(colors.green('All amounts match! V2 parser calculations are accurate.'));
  }

  await mongoose.disconnect();
  console.log(colors.green('\n✅ Disconnected from MongoDB'));
}

testMultipleTransactions().catch((error) => {
  console.error(colors.red('💥 Test Error:'), error);
  process.exit(1);
});