/**
 * Debug Comparison Logic - Exact Replication
 * 
 * This script exactly replicates the comparison script logic
 * to find where the doubling is happening
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

// EXACT REPLICATION OF COMPARISON SCRIPT LOGIC
async function handleTransactionExactly(signature) {
  try {
    const shyftResponse = await fetchShyftTransaction(signature);
    if (!shyftResponse) return null;

    // Map SHYFT API response to V2 parser input format
    const v2Input = {
      signature: signature,
      timestamp: shyftResponse.timestamp ? new Date(shyftResponse.timestamp).getTime() : Date.now(),
      status: shyftResponse.status || 'Success',
      fee: shyftResponse.fee || 0,
      fee_payer: shyftResponse.fee_payer || '',
      signers: shyftResponse.signers || [],
      protocol: shyftResponse.protocol,
      token_balance_changes: shyftResponse.token_balance_changes || [],
      actions: shyftResponse.actions || []
    };

    const parseResult = parseShyftTransactionV2(v2Input);

    if (parseResult.success && parseResult.data) {
      const swapData = parseResult.data;
      let inputAmount, outputAmount, inputDecimals, outputDecimals;
      let inputNormalized, outputNormalized;

      // Handle both ParsedSwap and SplitSwapPair
      if ('sellRecord' in swapData) {
        // SplitSwapPair - use sellRecord for display
        const sellRecord = swapData.sellRecord;
        
        // CRITICAL FIX: V2 parser already returns normalized amounts, don't normalize again
        inputAmount = sellRecord.amounts.baseAmount || sellRecord.amounts.swapInputAmount || 0;
        outputAmount = sellRecord.amounts.swapOutputAmount || sellRecord.amounts.netWalletReceived || 0;
        
        // These are already normalized amounts from the V2 parser
        inputNormalized = Math.abs(inputAmount).toFixed(6);
        outputNormalized = Math.abs(outputAmount).toFixed(6);
        
        const detection = {
          signature: signature,
          timestamp: new Date(),
          side: sellRecord.direction || 'SELL',
          inputToken: sellRecord.quoteAsset.symbol || 'UNKNOWN',
          outputToken: sellRecord.baseAsset.symbol || 'UNKNOWN',
          inputMint: sellRecord.quoteAsset.mint,
          outputMint: sellRecord.baseAsset.mint,
          inputAmount: inputAmount,
          outputAmount: outputAmount,
          inputAmountNormalized: inputNormalized,
          outputAmountNormalized: outputNormalized,
          whaleAddress: sellRecord.swapper || 'UNKNOWN',
          confidence: sellRecord.confidence,
          source: 'v2_parser_split'
        };
        
        return detection;
      } else {
        // ParsedSwap
        // CRITICAL FIX: V2 parser already returns normalized amounts, don't normalize again
        if (swapData.direction === 'BUY') {
          // BUY: spending quote asset to get base asset
          inputAmount = swapData.amounts.swapInputAmount || swapData.amounts.totalWalletCost || 0;
          outputAmount = swapData.amounts.baseAmount || 0;
        } else {
          // SELL: spending base asset to get quote asset
          inputAmount = swapData.amounts.baseAmount || 0;
          outputAmount = swapData.amounts.swapOutputAmount || swapData.amounts.netWalletReceived || 0;
        }
        
        // These are already normalized amounts from the V2 parser
        inputNormalized = Math.abs(inputAmount).toFixed(6);
        outputNormalized = Math.abs(outputAmount).toFixed(6);
        
        const detection = {
          signature: signature,
          timestamp: new Date(),
          side: swapData.direction || 'UNKNOWN',
          inputToken: swapData.direction === 'BUY' ? (swapData.quoteAsset.symbol || 'UNKNOWN') : (swapData.baseAsset.symbol || 'UNKNOWN'),
          outputToken: swapData.direction === 'BUY' ? (swapData.baseAsset.symbol || 'UNKNOWN') : (swapData.quoteAsset.symbol || 'UNKNOWN'),
          inputMint: swapData.direction === 'BUY' ? swapData.quoteAsset.mint : swapData.baseAsset.mint,
          outputMint: swapData.direction === 'BUY' ? swapData.baseAsset.mint : swapData.quoteAsset.mint,
          inputAmount: inputAmount,
          outputAmount: outputAmount,
          inputAmountNormalized: inputNormalized,
          outputAmountNormalized: outputNormalized,
          whaleAddress: swapData.swapper || 'UNKNOWN',
          confidence: swapData.confidence,
          source: 'v2_parser'
        };
        
        return detection;
      }
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
}

async function debugComparisonLogic() {
  const signature = '3SJDfTEBrEvoMWT1EqGuYBkV9WcF2tYHyqyaH1fr2Ef5rmdLdGSuFCAmBAwp8wJNWRUUZKHfq9UyZYpfkk8LgUrw';
  
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')));
  console.log(colors.cyan(colors.bold('║                    Debug Comparison Logic Exactly                        ║')));
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')));

  console.log(colors.white(`Testing Signature: ${signature}\n`));

  // Connect to MongoDB
  console.log(colors.cyan('📊 Connecting to MongoDB...'));
  await mongoose.connect(MONGO_URI);
  console.log(colors.green('✅ Connected to MongoDB\n'));

  const detection = await handleTransactionExactly(signature);
  
  if (detection) {
    console.log(colors.green('✅ COMPARISON SCRIPT LOGIC RESULT:'));
    console.log(colors.white(`   Signature: ${detection.signature}`));
    console.log(colors.white(`   Side: ${detection.side}`));
    console.log(colors.white(`   Input Token: ${detection.inputToken}`));
    console.log(colors.white(`   Output Token: ${detection.outputToken}`));
    console.log(colors.white(`   Input Amount (raw): ${detection.inputAmount}`));
    console.log(colors.white(`   Output Amount (raw): ${detection.outputAmount}`));
    console.log(colors.white(`   Input Amount (normalized): ${detection.inputAmountNormalized}`));
    console.log(colors.white(`   Output Amount (normalized): ${detection.outputAmountNormalized}`));
    console.log(colors.white(`   Whale Address: ${detection.whaleAddress}`));
    console.log(colors.white(`   Source: ${detection.source}`));
    
    // Check if this matches your data
    console.log(colors.cyan('\n🔍 COMPARISON WITH YOUR DATA:'));
    console.log(colors.white(`Your data shows: SOL amount = 2`));
    console.log(colors.white(`Our result shows: SOL amount = ${detection.inputAmountNormalized}`));
    
    if (detection.inputAmountNormalized === '1.000000') {
      console.log(colors.green('✅ Our logic shows 1.0 SOL (correct)'));
      console.log(colors.red('❌ But your data shows 2.0 SOL'));
      console.log(colors.yellow('🔍 This suggests the issue is in a DIFFERENT version of the comparison script'));
      console.log(colors.yellow('🔍 Or there\'s some other processing happening after this logic'));
    } else {
      console.log(colors.red('❌ Our logic also shows wrong amount'));
    }
    
  } else {
    console.log(colors.red('❌ Failed to process transaction'));
  }

  await mongoose.disconnect();
  console.log(colors.green('\n✅ Disconnected from MongoDB'));
}

debugComparisonLogic().catch((error) => {
  console.error(colors.red('💥 Debug Error:'), error);
  process.exit(1);
});