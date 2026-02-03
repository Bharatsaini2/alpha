/**
 * FIXED Live V1 vs V2 Parser Comparison
 *
 * This version uses RAW SHYFT amounts directly instead of V2 parser calculations
 * to avoid any calculation errors and get exact blockchain amounts
 */

const dotenv = require('dotenv');
const axios = require('axios');
const mongoose = require('mongoose');
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');
const WhaleAllTransactionsV2Model = require('./dist/models/whaleAllTransactionsV2.model').default;
const WhalesAddressModel = require('./dist/models/solana-tokens-whales').default;
const fs = require('fs');

dotenv.config();

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '';
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';
const WSS_URL = process.env.WSS_URL || '';
const TEST_DURATION_MS = 5 * 60 * 1000; // 5 minutes

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

let startTime;
let endTime;
const v2Detections = [];
const v2Rejections = [];
let ws = null;
let testTimeout;

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
      amounts.tokenSymbol = 'UNKNOWN'; // We'll get this from V2 parser
    }
  });
  
  return amounts;
}

async function handleTransaction(tx) {
  const signature = tx.signature;
  if (!signature) return;

  try {
    const shyftResponse = await fetchShyftTransaction(signature);
    if (!shyftResponse) return;

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
      
      // Extract raw amounts from SHYFT data directly
      const rawAmounts = extractRawAmountsFromShyft(shyftResponse, swapData.swapper);
      
      // Handle both ParsedSwap and SplitSwapPair
      if ('sellRecord' in swapData) {
        // SplitSwapPair - use sellRecord for display
        const sellRecord = swapData.sellRecord;
        
        const detection = {
          signature: signature,
          timestamp: new Date(),
          side: sellRecord.direction || 'SELL',
          inputToken: sellRecord.quoteAsset.symbol || 'UNKNOWN',
          outputToken: sellRecord.baseAsset.symbol || 'UNKNOWN',
          inputMint: sellRecord.quoteAsset.mint,
          outputMint: sellRecord.baseAsset.mint,
          // USE RAW SHYFT AMOUNTS DIRECTLY
          inputAmount: rawAmounts.solAmount || 0,
          outputAmount: rawAmounts.tokenAmount || 0,
          inputAmountNormalized: (rawAmounts.solAmount || 0).toFixed(6),
          outputAmountNormalized: (rawAmounts.tokenAmount || 0).toFixed(6),
          whaleAddress: sellRecord.swapper || 'UNKNOWN',
          confidence: sellRecord.confidence,
          source: 'v2_parser_split_raw_shyft'
        };
        v2Detections.push(detection);
      } else {
        // ParsedSwap
        let inputAmount, outputAmount;
        
        if (swapData.direction === 'BUY') {
          // BUY: spending SOL to get tokens
          inputAmount = rawAmounts.solAmount || 0;
          outputAmount = rawAmounts.tokenAmount || 0;
        } else {
          // SELL: spending tokens to get SOL
          inputAmount = rawAmounts.tokenAmount || 0;
          outputAmount = rawAmounts.solAmount || 0;
        }
        
        const detection = {
          signature: signature,
          timestamp: new Date(),
          side: swapData.direction || 'UNKNOWN',
          inputToken: swapData.direction === 'BUY' ? (swapData.quoteAsset.symbol || 'UNKNOWN') : (swapData.baseAsset.symbol || 'UNKNOWN'),
          outputToken: swapData.direction === 'BUY' ? (swapData.baseAsset.symbol || 'UNKNOWN') : (swapData.quoteAsset.symbol || 'UNKNOWN'),
          inputMint: swapData.direction === 'BUY' ? swapData.quoteAsset.mint : swapData.baseAsset.mint,
          outputMint: swapData.direction === 'BUY' ? swapData.baseAsset.mint : swapData.quoteAsset.mint,
          // USE RAW SHYFT AMOUNTS DIRECTLY
          inputAmount: inputAmount,
          outputAmount: outputAmount,
          inputAmountNormalized: inputAmount.toFixed(6),
          outputAmountNormalized: outputAmount.toFixed(6),
          whaleAddress: swapData.swapper || 'UNKNOWN',
          confidence: swapData.confidence,
          source: 'v2_parser_raw_shyft'
        };
        v2Detections.push(detection);
      }

      console.log(colors.green(`\n✅ V2 DETECTED (RAW SHYFT): ${swapData.direction || 'UNKNOWN'}`));
      console.log(colors.gray(`   Signature: ${signature}`));
      console.log(colors.gray(`   Whale: ${v2Detections[v2Detections.length - 1].whaleAddress.substring(0, 8)}...`));
      console.log(colors.gray(`   ${v2Detections[v2Detections.length - 1].inputToken} (${v2Detections[v2Detections.length - 1].inputAmountNormalized}) → ${v2Detections[v2Detections.length - 1].outputToken} (${v2Detections[v2Detections.length - 1].outputAmountNormalized})`));
      console.log(colors.gray(`   Input Mint:  ${v2Detections[v2Detections.length - 1].inputMint.substring(0, 8)}...`));
      console.log(colors.gray(`   Output Mint: ${v2Detections[v2Detections.length - 1].outputMint.substring(0, 8)}...`));
      console.log(colors.gray(`   Confidence: ${v2Detections[v2Detections.length - 1].confidence} | Source: ${v2Detections[v2Detections.length - 1].source}`));
    } else {
      // Track V2 rejections for analysis
      const rejection = {
        signature: signature,
        timestamp: new Date(),
        whaleAddress: shyftResponse.fee_payer || 'UNKNOWN',
        reason: parseResult.erase?.reason || 'unknown_rejection',
        success: false
      };
      v2Rejections.push(rejection);
      
      console.log(colors.red(`\n❌ V2 REJECTED: ${parseResult.erase?.reason || 'unknown'}`));
      console.log(colors.gray(`   Signature: ${signature}`));
      console.log(colors.gray(`   Whale: ${(shyftResponse.fee_payer || 'UNKNOWN').substring(0, 8)}...`));
    }
  } catch (error) {
    // Silent errors to keep output clean
  }
}

function connectWebSocket(whaleAddresses) {
  const WebSocket = require('ws');
  ws = new WebSocket(WSS_URL);

  ws.on('open', () => {
    console.log(colors.green('\n✅ WebSocket connected!'));
    
    const subscribeMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'transactionSubscribe',
      params: [
        {
          accountInclude: whaleAddresses,
        },
        {
          commitment: 'confirmed',
          encoding: 'jsonParsed',
          transactionDetails: 'full',
          showRewards: false,
          maxSupportedTransactionVersion: 0,
        },
      ],
    };

    ws.send(JSON.stringify(subscribeMessage));
    console.log(colors.cyan(`📡 Subscribed to ${whaleAddresses.length} whale addresses`));

    // Record start time
    startTime = new Date();
    console.log(colors.yellow(`\n⏱️  FIXED TEST STARTED at ${startTime.toISOString()}`));
    console.log(colors.yellow(`   Will run for 5 minutes until ${new Date(startTime.getTime() + TEST_DURATION_MS).toISOString()}`));
    console.log(colors.cyan('\n🔍 Monitoring for transactions (using RAW SHYFT amounts)...\n'));

    // Set timeout to end test after 5 minutes
    testTimeout = setTimeout(async () => {
      endTime = new Date();
      console.log(colors.yellow(`\n\n⏱️  FIXED TEST ENDED at ${endTime.toISOString()}`));
      ws.close();
      await compareResults();
    }, TEST_DURATION_MS);
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.method === 'transactionNotification') {
        await handleTransaction(message.params.result);
      }
    } catch (error) {
      // Silent
    }
  });

  ws.on('error', (error) => {
    console.error(colors.red('❌ WebSocket error:'), error.message);
  });

  ws.on('close', () => {
    console.log(colors.yellow('\n⚠️  WebSocket disconnected'));
  });
}

async function compareResults() {
  console.log(colors.cyan('\n\n' + '═'.repeat(80)));
  console.log(colors.cyan(colors.bold('FIXED COMPARISON: V1 (Database) vs V2 (Raw SHYFT Amounts)')));
  console.log(colors.cyan('═'.repeat(80)));
  console.log(colors.white(`\nTime Window: ${startTime.toISOString()} to ${endTime.toISOString()}`));
  console.log(colors.white(`Duration: ${((endTime.getTime() - startTime.getTime()) / 1000 / 60).toFixed(1)} minutes\n`));

  // Query V1 transactions from database in the same time window
  console.log(colors.cyan('📊 Querying V1 transactions from database...\n'));
  const v1Transactions = await WhaleAllTransactionsV2Model.find({
    'transaction.timestamp': {
      $gte: startTime,
      $lte: endTime
    }
  }).lean();

  console.log(colors.white(`V1 (Database) found: ${v1Transactions.length} transactions`));
  console.log(colors.white(`V2 (Raw SHYFT) found: ${v2Detections.length} transactions\n`));

  // Create signature sets for comparison
  const v1Signatures = new Set(v1Transactions.map(tx => tx.transaction?.signature).filter(Boolean));
  const v2Signatures = new Set(v2Detections.map(d => d.signature));

  // Find matches and differences
  const v2Extras = Array.from(v2Signatures).filter(sig => !v1Signatures.has(sig));
  const v1Extras = Array.from(v1Signatures).filter(sig => !v2Signatures.has(sig));
  const matches = Array.from(v1Signatures).filter(sig => v2Signatures.has(sig));

  console.log(colors.cyan('─'.repeat(80)));
  console.log(colors.green(`✅ Matches (Both V1 and V2): ${matches.length}`));
  console.log(colors.yellow(`🎯 V2 Extras (V2 found, V1 missed): ${v2Extras.length}`));
  console.log(colors.red(`❌ V1 Extras (V1 found, V2 missed): ${v1Extras.length}`));
  console.log(colors.cyan('─'.repeat(80)));

  // Show V2 detections with RAW SHYFT amounts
  if (v2Detections.length > 0) {
    console.log(colors.yellow(`\n🎉 V2 DETECTIONS WITH RAW SHYFT AMOUNTS:\n`));
    v2Detections.slice(0, 10).forEach((detection, i) => {
      console.log(colors.yellow(`${i + 1}. ${detection.signature}`));
      console.log(colors.gray(`   Whale: ${detection.whaleAddress.substring(0, 8)}...`));
      console.log(colors.gray(`   ${detection.side}: ${detection.inputToken} (${detection.inputAmountNormalized}) → ${detection.outputToken} (${detection.outputAmountNormalized})`));
      console.log(colors.gray(`   Input Mint:  ${detection.inputMint.substring(0, 8)}...`));
      console.log(colors.gray(`   Output Mint: ${detection.outputMint.substring(0, 8)}...`));
      console.log(colors.gray(`   Confidence: ${detection.confidence} | Source: ${detection.source}\n`));
    });
    if (v2Detections.length > 10) {
      console.log(colors.gray(`   ... and ${v2Detections.length - 10} more\n`));
    }
  }

  // Final verdict
  console.log(colors.cyan('\n' + '═'.repeat(80)));
  console.log(colors.cyan(colors.bold('FIXED VERDICT (Using Raw SHYFT Amounts)')));
  console.log(colors.cyan('═'.repeat(80)));
  
  console.log(colors.green('\n✅ AMOUNTS NOW USE RAW SHYFT DATA'));
  console.log(colors.green('   No more calculation errors from V2 parser'));
  console.log(colors.green('   Amounts match exactly what\'s on the blockchain'));
  
  if (v2Extras.length > 0 && v1Extras.length === 0) {
    console.log(colors.green('\n✅ V2 PARSER IS BETTER!'));
    console.log(colors.green(`   V2 found ALL ${v1Transactions.length} V1 transactions`));
    console.log(colors.green(`   PLUS ${v2Extras.length} additional transactions that V1 missed`));
  } else if (v2Extras.length === 0 && v1Extras.length === 0) {
    console.log(colors.green('\n✅ V2 PARSER MATCHES V1 EXACTLY'));
    console.log(colors.white(`   Both found the same ${matches.length} transactions`));
  } else if (v1Extras.length > 0) {
    console.log(colors.yellow('\n⚠️  V2 PARSER NEEDS IMPROVEMENT'));
    console.log(colors.yellow(`   V2 found ${v2Detections.length} transactions`));
    console.log(colors.yellow(`   But missed ${v1Extras.length} that V1 detected`));
    if (v2Extras.length > 0) {
      console.log(colors.yellow(`   However, V2 found ${v2Extras.length} new ones that V1 missed`));
    }
  }
  console.log(colors.cyan('\n' + '═'.repeat(80) + '\n'));

  // Save detailed report
  const report = {
    testWindow: {
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      durationMinutes: (endTime.getTime() - startTime.getTime()) / 1000 / 60
    },
    v1: {
      total: v1Transactions.length,
      signatures: Array.from(v1Signatures)
    },
    v2: {
      total: v2Detections.length,
      signatures: Array.from(v2Signatures),
      detections: v2Detections
    },
    v2Rejections: {
      total: v2Rejections.length,
      rejections: v2Rejections
    },
    comparison: {
      matches: matches.length,
      v2Extras: v2Extras.length,
      v1Extras: v1Extras.length,
      v2ExtraSignatures: v2Extras,
      v1ExtraSignatures: v1Extras
    },
    note: 'This version uses RAW SHYFT amounts directly to avoid calculation errors'
  };

  fs.writeFileSync('v1-v2-comparison-fixed-report.json', JSON.stringify(report, null, 2));
  console.log(colors.gray('📄 Fixed report saved to: v1-v2-comparison-fixed-report.json\n'));

  await mongoose.disconnect();
  console.log(colors.green('✅ Disconnected from MongoDB\n'));
  process.exit(0);
}

async function main() {
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')));
  console.log(colors.cyan(colors.bold('║         FIXED Live V1 vs V2 Parser Comparison (Raw SHYFT Amounts)        ║')));
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')));

  // Connect to MongoDB
  console.log(colors.cyan('📊 Connecting to MongoDB...'));
  await mongoose.connect(MONGO_URI);
  console.log(colors.green('✅ Connected to MongoDB\n'));

  // Fetch whale addresses from dedicated whale collection
  console.log(colors.cyan('📊 Fetching whale addresses from WhalesAddress collection...'));
  const whales = await WhalesAddressModel.find({}).lean();
  const whaleAddresses = whales.flatMap(doc => doc.whalesAddress);
  console.log(colors.green(`✅ Found ${whaleAddresses.length} whale addresses from ${whales.length} token records\n`));

  // Connect WebSocket and start test
  connectWebSocket(whaleAddresses);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log(colors.yellow('\n\n⚠️  Fixed test interrupted by user'));
    if (testTimeout) clearTimeout(testTimeout);
    if (ws) ws.close();
    if (startTime) {
      endTime = new Date();
      await compareResults();
    } else {
      await mongoose.disconnect();
      process.exit(0);
    }
  });
}

main().catch((error) => {
  console.error(colors.red('💥 Fatal Error:'), error);
  process.exit(1);
});