/**
 * V1 vs V2 Parser Direct Comparison
 * 
 * This script compares the current production parser (V1) with the new V2 parser
 * on the same SHYFT transaction data to see the differences in output.
 */

const dotenv = require('dotenv');
const axios = require('axios');

// Import both parsers
const { parseShyftTransaction: parseV1 } = require('./src/utils/shyftParser');
const { parseShyftTransactionV2: parseV2 } = require('./dist/utils/shyftParserV2');

dotenv.config();

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '';

// Color helpers
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  magenta: (text) => `\x1b[35m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  white: (text) => `\x1b[37m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
};

async function fetchShyftTransaction(signature) {
  try {
    const response = await axios.get("https://api.shyft.to/sol/v1/transaction/parsed", {
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

function formatV1Result(result) {
  if (!result) return null;
  
  const inputNormalized = result.input.decimals
    ? (result.input.amount / Math.pow(10, result.input.decimals)).toFixed(6)
    : result.input.amount.toString();
  const outputNormalized = result.output.decimals
    ? (result.output.amount / Math.pow(10, result.output.decimals)).toFixed(6)
    : result.output.amount.toString();

  return {
    signature: result.transaction_hash,
    side: result.side,
    swapper: result.swapper,
    inputToken: result.input.symbol || 'UNKNOWN',
    outputToken: result.output.symbol || 'UNKNOWN',
    inputMint: result.input.mint,
    outputMint: result.output.mint,
    inputAmount: result.input.amount,
    outputAmount: result.output.amount,
    inputAmountNormalized,
    outputAmountNormalized,
    confidence: result.confidence,
    source: result.classification_source,
    router: result.router_or_amm
  };
}

function formatV2Result(result, signature) {
  if (!result.success) {
    return {
      signature,
      erased: true,
      reason: result.erase?.reason || 'unknown',
      processingTime: result.processingTimeMs
    };
  }

  const swapData = result.data;
  
  if ('sellRecord' in swapData) {
    // SplitSwapPair
    const sellRecord = swapData.sellRecord;
    const buyRecord = swapData.buyRecord;
    
    return {
      signature,
      type: 'split',
      sellRecord: {
        side: sellRecord.direction,
        swapper: sellRecord.swapper,
        inputToken: sellRecord.quoteAsset.symbol,
        outputToken: sellRecord.baseAsset.symbol,
        inputMint: sellRecord.quoteAsset.mint,
        outputMint: sellRecord.baseAsset.mint,
        swapAmount: sellRecord.amounts.swapAmount,
        walletAmount: sellRecord.amounts.walletAmount,
        confidence: sellRecord.confidence
      },
      buyRecord: {
        side: buyRecord.direction,
        swapper: buyRecord.swapper,
        inputToken: buyRecord.quoteAsset.symbol,
        outputToken: buyRecord.baseAsset.symbol,
        inputMint: buyRecord.quoteAsset.mint,
        outputMint: buyRecord.baseAsset.mint,
        swapAmount: buyRecord.amounts.swapAmount,
        walletAmount: buyRecord.amounts.walletAmount,
        confidence: buyRecord.confidence
      },
      processingTime: result.processingTimeMs
    };
  } else {
    // ParsedSwap
    let inputAmount, outputAmount, inputToken, outputToken, inputMint, outputMint;
    
    if (swapData.direction === 'BUY') {
      // BUY: spending quote to get base
      inputAmount = swapData.amounts.swapAmount;
      outputAmount = swapData.amounts.walletAmount;
      inputToken = swapData.quoteAsset.symbol;
      outputToken = swapData.baseAsset.symbol;
      inputMint = swapData.quoteAsset.mint;
      outputMint = swapData.baseAsset.mint;
    } else {
      // SELL: spending base to get quote
      inputAmount = swapData.amounts.walletAmount;
      outputAmount = swapData.amounts.swapAmount;
      inputToken = swapData.baseAsset.symbol;
      outputToken = swapData.quoteAsset.symbol;
      inputMint = swapData.baseAsset.mint;
      outputMint = swapData.quoteAsset.mint;
    }
    
    const inputDecimals = swapData.direction === 'BUY' ? swapData.quoteAsset.decimals : swapData.baseAsset.decimals;
    const outputDecimals = swapData.direction === 'BUY' ? swapData.baseAsset.decimals : swapData.quoteAsset.decimals;
    
    const inputNormalized = inputAmount > 0
      ? (Math.abs(inputAmount) / Math.pow(10, inputDecimals || 9)).toFixed(6)
      : '0';
    const outputNormalized = outputAmount > 0
      ? (Math.abs(outputAmount) / Math.pow(10, outputDecimals || 9)).toFixed(6)
      : '0';

    return {
      signature,
      type: 'standard',
      side: swapData.direction,
      swapper: swapData.swapper,
      inputToken,
      outputToken,
      inputMint,
      outputMint,
      inputAmount,
      outputAmount,
      inputAmountNormalized,
      outputAmountNormalized,
      confidence: swapData.confidence,
      protocol: swapData.protocol,
      processingTime: result.processingTimeMs
    };
  }
}

async function compareTransaction(signature) {
  console.log(colors.cyan(`\n${'='.repeat(80)}`));
  console.log(colors.cyan(colors.bold(`COMPARING TRANSACTION: ${signature}`)));
  console.log(colors.cyan(`${'='.repeat(80)}`));

  try {
    // Fetch SHYFT data
    console.log(colors.gray('📡 Fetching SHYFT transaction data...'));
    const shyftResponse = await fetchShyftTransaction(signature);
    
    if (!shyftResponse) {
      console.log(colors.red('❌ Failed to fetch SHYFT data'));
      return null;
    }

    // Parse with V1
    console.log(colors.gray('🔄 Parsing with V1 parser...'));
    const v1Result = parseV1(shyftResponse);
    const v1Formatted = formatV1Result(v1Result);

    // Parse with V2
    console.log(colors.gray('🔄 Parsing with V2 parser...'));
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
    const v2Result = parseV2(v2Input);
    const v2Formatted = formatV2Result(v2Result, signature);

    // Display results
    console.log(colors.yellow('\n📊 COMPARISON RESULTS:'));
    console.log(colors.yellow('─'.repeat(80)));

    // V1 Results
    console.log(colors.blue('\n🔵 V1 PARSER RESULT:'));
    if (v1Formatted) {
      console.log(colors.green(`✅ SUCCESS`));
      console.log(colors.white(`   Side: ${v1Formatted.side}`));
      console.log(colors.white(`   Swapper: ${v1Formatted.swapper.substring(0, 8)}...`));
      console.log(colors.white(`   ${v1Formatted.inputToken} (${v1Formatted.inputAmountNormalized}) → ${v1Formatted.outputToken} (${v1Formatted.outputAmountNormalized})`));
      console.log(colors.white(`   Input Mint:  ${v1Formatted.inputMint.substring(0, 8)}...`));
      console.log(colors.white(`   Output Mint: ${v1Formatted.outputMint.substring(0, 8)}...`));
      console.log(colors.white(`   Confidence: ${v1Formatted.confidence} | Source: ${v1Formatted.source}`));
      if (v1Formatted.router) {
        console.log(colors.white(`   Router: ${v1Formatted.router}`));
      }
    } else {
      console.log(colors.red(`❌ ERASED/NULL`));
    }

    // V2 Results
    console.log(colors.magenta('\n🟣 V2 PARSER RESULT:'));
    if (v2Formatted.erased) {
      console.log(colors.red(`❌ ERASED`));
      console.log(colors.white(`   Reason: ${v2Formatted.reason}`));
      console.log(colors.white(`   Processing Time: ${v2Formatted.processingTime}ms`));
    } else if (v2Formatted.type === 'split') {
      console.log(colors.green(`✅ SUCCESS (SPLIT SWAP PAIR)`));
      console.log(colors.white(`   Processing Time: ${v2Formatted.processingTime}ms`));
      console.log(colors.white(`   SELL Record:`));
      console.log(colors.white(`     ${v2Formatted.sellRecord.inputToken} → ${v2Formatted.sellRecord.outputToken}`));
      console.log(colors.white(`     Confidence: ${v2Formatted.sellRecord.confidence}`));
      console.log(colors.white(`   BUY Record:`));
      console.log(colors.white(`     ${v2Formatted.buyRecord.inputToken} → ${v2Formatted.buyRecord.outputToken}`));
      console.log(colors.white(`     Confidence: ${v2Formatted.buyRecord.confidence}`));
    } else {
      console.log(colors.green(`✅ SUCCESS (STANDARD SWAP)`));
      console.log(colors.white(`   Side: ${v2Formatted.side}`));
      console.log(colors.white(`   Swapper: ${v2Formatted.swapper.substring(0, 8)}...`));
      console.log(colors.white(`   ${v2Formatted.inputToken} (${v2Formatted.inputAmountNormalized}) → ${v2Formatted.outputToken} (${v2Formatted.outputAmountNormalized})`));
      console.log(colors.white(`   Input Mint:  ${v2Formatted.inputMint.substring(0, 8)}...`));
      console.log(colors.white(`   Output Mint: ${v2Formatted.outputMint.substring(0, 8)}...`));
      console.log(colors.white(`   Confidence: ${v2Formatted.confidence} | Protocol: ${v2Formatted.protocol}`));
      console.log(colors.white(`   Processing Time: ${v2Formatted.processingTime}ms`));
    }

    // Comparison Analysis
    console.log(colors.yellow('\n🔍 ANALYSIS:'));
    console.log(colors.yellow('─'.repeat(40)));

    if (!v1Formatted && v2Formatted.erased) {
      console.log(colors.gray('🤝 AGREEMENT: Both parsers rejected this transaction'));
    } else if (v1Formatted && !v2Formatted.erased) {
      console.log(colors.green('🤝 AGREEMENT: Both parsers accepted this transaction'));
      
      if (v2Formatted.type === 'split') {
        console.log(colors.blue('📝 V2 ENHANCEMENT: Split into two records (token-to-token)'));
      } else {
        // Compare details
        const sideMatch = v1Formatted.side === v2Formatted.side;
        const swapperMatch = v1Formatted.swapper === v2Formatted.swapper;
        const inputTokenMatch = v1Formatted.inputToken === v2Formatted.inputToken;
        const outputTokenMatch = v1Formatted.outputToken === v2Formatted.outputToken;
        
        console.log(colors.white(`   Side Match: ${sideMatch ? '✅' : '❌'} (V1: ${v1Formatted.side}, V2: ${v2Formatted.side})`));
        console.log(colors.white(`   Swapper Match: ${swapperMatch ? '✅' : '❌'}`));
        console.log(colors.white(`   Input Token Match: ${inputTokenMatch ? '✅' : '❌'} (V1: ${v1Formatted.inputToken}, V2: ${v2Formatted.inputToken})`));
        console.log(colors.white(`   Output Token Match: ${outputTokenMatch ? '✅' : '❌'} (V1: ${v1Formatted.outputToken}, V2: ${v2Formatted.outputToken})`));
      }
    } else if (v1Formatted && v2Formatted.erased) {
      console.log(colors.red('⚠️  DISAGREEMENT: V1 accepted, V2 rejected'));
      console.log(colors.red(`   V2 Rejection Reason: ${v2Formatted.reason}`));
      console.log(colors.yellow('   This might be a transfer that V1 incorrectly classified as a swap'));
    } else if (!v1Formatted && !v2Formatted.erased) {
      console.log(colors.green('⚠️  DISAGREEMENT: V1 rejected, V2 accepted'));
      console.log(colors.green('   V2 found a swap that V1 missed'));
    }

    return {
      signature,
      v1Result: v1Formatted,
      v2Result: v2Formatted,
      agreement: (!!v1Formatted) === (!v2Formatted.erased)
    };
  } catch (error) {
    console.log(colors.red(`❌ Error in comparison: ${error.message}`));
    return null;
  }
}

async function main() {
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')));
  console.log(colors.cyan(colors.bold('║                    V1 vs V2 Parser Direct Comparison                      ║')));
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')));

  // Test signatures - mix of swaps and transfers
  const testSignatures = [
    // Known swap signatures
    'YcfxcrHAXWiMbxnuempdACCnD8KCwXgi84LUqi2e1KTSbzFYwzKnLAkLQirA3TNcHLodazwxxJNxdBjDiGfeCHT',
    '5qB2mdLofYFqdyFnxuJtkNsyw5EXj5f3hpymqN7eG7DXmeqnj1XgEPvHfwkCdSJxfvV2iRgbxoretviZL8S3GtRH',
    '3yQ6QD5i8zyYBBKUjPBUVq2nGr7PvhzRDrhz7PdKHMAHjZfw4nWfrcmptt91kMf2uLpbAA8ssYdf4b32RwUMLHPu',
    
    // Potentially problematic signatures from your original list
    '2kVd8mKgz6bKZFSRaMFvgX3BktD94DPEm2fN7ees1u7ubMLT2T3H6SeQKQ2AR4bFdaV6qfrxgEBGe7oG2YSLz5a5',
    'jaDaLjyXwZhrfSijSVFLfRNXhhDVef5MuG4xPjrRWBnm3jRnEqyAi8dXAy336FyXEuJ1ADdUJQyxpLsYDFzieH4',
    '42W5H12g9q7PHLVdYefCSiusmXLkC7LfX3jr5QaC6917YfQBKqxETapcY4E9W8y4mnh11qbt6reT6kHQJxM2Qewu'
  ];

  const results = [];
  let agreements = 0;
  let disagreements = 0;
  let v1Only = 0;
  let v2Only = 0;

  for (const signature of testSignatures) {
    try {
      const result = await compareTransaction(signature);
      if (result) {
        results.push(result);
        
        if (result.agreement) {
          agreements++;
        } else {
          disagreements++;
          if (result.v1Result && result.v2Result.erased) {
            v1Only++;
          } else if (!result.v1Result && !result.v2Result.erased) {
            v2Only++;
          }
        }
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(colors.red(`❌ Error processing ${signature}: ${error.message}`));
    }
  }

  // Summary
  console.log(colors.cyan('\n\n' + '═'.repeat(80)));
  console.log(colors.cyan(colors.bold('FINAL SUMMARY')));
  console.log(colors.cyan('═'.repeat(80)));
  
  console.log(colors.white(`\nTotal Transactions Tested: ${results.length}`));
  console.log(colors.green(`✅ Agreements: ${agreements}`));
  console.log(colors.yellow(`⚠️  Disagreements: ${disagreements}`));
  console.log(colors.red(`   V1 Only: ${v1Only} (V2 rejected as transfers)`));
  console.log(colors.green(`   V2 Only: ${v2Only} (V2 found new swaps)`));
  
  const agreementRate = ((agreements / results.length) * 100).toFixed(1);
  console.log(colors.white(`\nAgreement Rate: ${agreementRate}%`));
  
  if (v1Only > 0) {
    console.log(colors.yellow(`\n🔍 V2 Transfer Detection: ${v1Only} transactions that V1 classified as swaps were identified as transfers by V2`));
  }
  
  if (v2Only > 0) {
    console.log(colors.green(`\n🎯 V2 Improvements: ${v2Only} additional swaps detected that V1 missed`));
  }

  console.log(colors.cyan('\n' + '═'.repeat(80) + '\n'));
}

main().catch(error => {
  console.error(colors.red('💥 Fatal Error:'), error);
  process.exit(1);
});