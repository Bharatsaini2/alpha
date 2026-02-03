/**
 * Debug Amount Calculation Issues
 * 
 * This script compares:
 * 1. Raw SHYFT API response amounts
 * 2. V2 parser calculated amounts
 * 3. Shows the difference and identifies the calculation issue
 */

const dotenv = require('dotenv');
const axios = require('axios');
const mongoose = require('mongoose');
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');
const InfluencerWhaleTransactionsV2Model = require('./dist/models/influencerWhaleTransactionsV2.model').default;

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

async function debugAmountCalculation() {
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')));
  console.log(colors.cyan(colors.bold('║                    Debug Amount Calculation Issues                        ║')));
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')));

  // Connect to MongoDB
  console.log(colors.cyan('📊 Connecting to MongoDB...'));
  await mongoose.connect(MONGO_URI);
  console.log(colors.green('✅ Connected to MongoDB\n'));

  // Get a recent successful KOL transaction
  console.log(colors.cyan('🔍 Finding recent successful KOL transaction...'));
  const recentKolTx = await InfluencerWhaleTransactionsV2Model.findOne({
    'transaction.timestamp': { $gte: new Date(Date.now() - 30 * 60 * 1000) } // Last 30 minutes
  }).sort({ 'transaction.timestamp': -1 }).lean();

  if (!recentKolTx) {
    console.log(colors.red('❌ No recent KOL transactions found'));
    await mongoose.disconnect();
    return;
  }

  console.log(colors.green('✅ Found recent KOL transaction:'));
  console.log(colors.white(`   Signature: ${recentKolTx.signature}`));
  console.log(colors.white(`   KOL: ${recentKolTx.whaleAddress} (${recentKolTx.influencerName})`));
  console.log(colors.white(`   Type: ${recentKolTx.type}`));
  console.log(colors.white(`   Database amounts: ${recentKolTx.transaction.tokenIn.amount} ${recentKolTx.transaction.tokenIn.symbol} → ${recentKolTx.transaction.tokenOut.amount} ${recentKolTx.transaction.tokenOut.symbol}\n`));

  // Fetch raw SHYFT data
  console.log(colors.cyan('📡 Fetching raw SHYFT data...'));
  const shyftData = await fetchShyftTransaction(recentKolTx.signature);
  
  if (!shyftData) {
    console.log(colors.red('❌ Failed to fetch SHYFT data'));
    await mongoose.disconnect();
    return;
  }

  console.log(colors.green('✅ Raw SHYFT data fetched'));
  console.log(colors.white(`   Status: ${shyftData.status}`));
  console.log(colors.white(`   Fee Payer: ${shyftData.fee_payer}`));
  console.log(colors.white(`   Token Balance Changes: ${shyftData.token_balance_changes?.length || 0}\n`));

  // Show raw token balance changes
  if (shyftData.token_balance_changes && shyftData.token_balance_changes.length > 0) {
    console.log(colors.cyan('💰 Raw SHYFT Token Balance Changes:'));
    shyftData.token_balance_changes.forEach((change, i) => {
      const normalizedAmount = normalizeAmount(Math.abs(change.change_amount), change.decimals);
      console.log(colors.gray(`   ${i + 1}. ${change.mint?.substring(0, 8)}... (Owner: ${change.owner?.substring(0, 8)}...)`));
      console.log(colors.gray(`      Raw Change: ${change.change_amount}`));
      console.log(colors.gray(`      Decimals: ${change.decimals}`));
      console.log(colors.gray(`      Normalized: ${normalizedAmount.toFixed(6)}`));
      console.log('');
    });
  }

  // Test V2 parser
  console.log(colors.cyan('🧪 Testing V2 parser on this transaction...'));
  const v2Input = {
    signature: recentKolTx.signature,
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

    // Compare with raw SHYFT amounts
    console.log(colors.cyan('\n📊 COMPARISON: Raw SHYFT vs V2 Parser'));
    console.log(colors.cyan('─'.repeat(80)));
    
    // Find the relevant balance changes
    const kolAddress = recentKolTx.whaleAddress;
    const kolBalanceChanges = shyftData.token_balance_changes.filter(change => change.owner === kolAddress);
    
    console.log(colors.white(`KOL Address: ${kolAddress}`));
    console.log(colors.white(`KOL Balance Changes: ${kolBalanceChanges.length}\n`));
    
    kolBalanceChanges.forEach((change, i) => {
      const rawAmount = Math.abs(change.change_amount);
      const normalizedAmount = normalizeAmount(rawAmount, change.decimals);
      const isSOL = change.mint === 'So11111111111111111111111111111111111111112';
      
      console.log(colors.gray(`${i + 1}. ${isSOL ? 'SOL/WSOL' : 'TOKEN'} (${change.mint.substring(0, 8)}...)`));
      console.log(colors.gray(`   Raw SHYFT: ${rawAmount} (decimals: ${change.decimals})`));
      console.log(colors.gray(`   Normalized: ${normalizedAmount.toFixed(6)}`));
      
      // Compare with V2 parser amounts
      if (swapData.direction === 'BUY') {
        if (isSOL) {
          const v2Amount = Math.abs(swapData.amounts.swapInputAmount || swapData.amounts.totalWalletCost || 0);
          console.log(colors.gray(`   V2 Parser: ${v2Amount.toFixed(6)}`));
          console.log(colors.gray(`   Difference: ${(v2Amount - normalizedAmount).toFixed(6)}`));
          if (Math.abs(v2Amount - normalizedAmount) > 0.001) {
            console.log(colors.red(`   ❌ MISMATCH! V2 parser amount differs from raw SHYFT`));
          } else {
            console.log(colors.green(`   ✅ MATCH`));
          }
        } else {
          const v2Amount = Math.abs(swapData.amounts.baseAmount || 0);
          console.log(colors.gray(`   V2 Parser: ${v2Amount.toFixed(6)}`));
          console.log(colors.gray(`   Difference: ${(v2Amount - normalizedAmount).toFixed(6)}`));
          if (Math.abs(v2Amount - normalizedAmount) > 0.001) {
            console.log(colors.red(`   ❌ MISMATCH! V2 parser amount differs from raw SHYFT`));
          } else {
            console.log(colors.green(`   ✅ MATCH`));
          }
        }
      } else { // SELL
        if (isSOL) {
          const v2Amount = Math.abs(swapData.amounts.swapOutputAmount || swapData.amounts.netWalletReceived || 0);
          console.log(colors.gray(`   V2 Parser: ${v2Amount.toFixed(6)}`));
          console.log(colors.gray(`   Difference: ${(v2Amount - normalizedAmount).toFixed(6)}`));
          if (Math.abs(v2Amount - normalizedAmount) > 0.001) {
            console.log(colors.red(`   ❌ MISMATCH! V2 parser amount differs from raw SHYFT`));
          } else {
            console.log(colors.green(`   ✅ MATCH`));
          }
        } else {
          const v2Amount = Math.abs(swapData.amounts.baseAmount || 0);
          console.log(colors.gray(`   V2 Parser: ${v2Amount.toFixed(6)}`));
          console.log(colors.gray(`   Difference: ${(v2Amount - normalizedAmount).toFixed(6)}`));
          if (Math.abs(v2Amount - normalizedAmount) > 0.001) {
            console.log(colors.red(`   ❌ MISMATCH! V2 parser amount differs from raw SHYFT`));
          } else {
            console.log(colors.green(`   ✅ MATCH`));
          }
        }
      }
      console.log('');
    });

    // Recommendation
    console.log(colors.cyan('\n💡 RECOMMENDATION:'));
    console.log(colors.yellow('Instead of using V2 parser calculated amounts, we should:'));
    console.log(colors.yellow('1. Use raw SHYFT token_balance_changes amounts directly'));
    console.log(colors.yellow('2. Normalize them using decimals: amount / Math.pow(10, decimals)'));
    console.log(colors.yellow('3. This avoids any calculation errors in the V2 parser'));
    console.log(colors.yellow('4. Gives us the exact amounts from the blockchain'));

  } else {
    console.log(colors.red('❌ V2 PARSER FAILED'));
    console.log(colors.red(`   Reason: ${parseResult.erase?.reason}`));
  }

  await mongoose.disconnect();
  console.log(colors.green('\n✅ Disconnected from MongoDB'));
}

debugAmountCalculation().catch((error) => {
  console.error(colors.red('💥 Debug Error:'), error);
  process.exit(1);
});