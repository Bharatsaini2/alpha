/**
 * V1 vs V2 Parser Regression Test (Live)
 * 
 * This test:
 * 1. Runs V2 parser LIVE on all whale transactions (WebSocket + Shyft API)
 * 2. Compares with V1 transactions already saved in database
 * 3. Detects regressions (transactions V1 caught but V2 missed)
 * 4. Analyzes swapper identification differences
 * 5. Generates comprehensive CSV reports
 * 
 * Reports include:
 * - V2 detections vs V1 database
 * - Regressions (V1 found, V2 missed)
 * - V2 improvements (V2 found, V1 missed)
 * - Swapper identification comparison
 * - Rejection reason analysis
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const WebSocket = require('ws');
const axios = require('axios');
const mongoose = require('mongoose');
const fs = require('fs');

// Import models
const WhalesAddress = require('./src/models/solana-tokens-whales').default;
const WhaleAllTransactionsV2 = require('./src/models/whaleAllTransactionsV2.model').default;

// Import V2 parser
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');

// Configuration
const SHYFT_API_KEY = process.env.SHYFT_API_KEY;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const WSS_URL = process.env.WSS_URL;
const TEST_DURATION_MS = 10 * 60 * 1000; // 10 minutes

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

// Test state
const state = {
  startTime: null,
  endTime: null,
  v2Detections: [],
  v2Rejections: [],
  v2Errors: [],
  v1Transactions: [],
  processedSignatures: new Set(),
};

// Statistics
const stats = {
  totalTransactions: 0,
  v2Accepted: 0,
  v2Rejected: 0,
  v2Errors: 0,
  v1Total: 0,
  matches: 0,
  regressions: 0, // V1 found, V2 missed
  improvements: 0, // V2 found, V1 missed
  swapperMismatches: 0,
};

let ws = null;
let testTimeout = null;
let statsInterval = null;

/**
 * Fetch transaction from Shyft API
 */
async function fetchShyftTransaction(signature) {
  try {
    const response = await axios.get(
      'https://api.shyft.to/sol/v1/transaction/parsed',
      {
        params: {
          network: 'mainnet-beta',
          txn_signature: signature,
        },
        headers: {
          'x-api-key': SHYFT_API_KEY,
        },
        timeout: 10000,
      }
    );
    return response.data?.result || null;
  } catch (error) {
    if (error.response?.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return fetchShyftTransaction(signature);
    }
    throw error;
  }
}

/**
 * Handle incoming transaction
 */
async function handleTransaction(tx) {
  const signature = tx.signature;
  if (!signature || state.processedSignatures.has(signature)) return;

  state.processedSignatures.add(signature);
  stats.totalTransactions++;

  try {
    // Fetch from Shyft API
    const shyftResponse = await fetchShyftTransaction(signature);
    if (!shyftResponse) {
      stats.v2Errors++;
      state.v2Errors.push({
        signature,
        timestamp: new Date(),
        error: 'No Shyft response',
        type: 'shyft_api_error',
      });
      return;
    }

    // Map to V2 parser input format
    const v2Input = {
      signature: signature,
      timestamp: shyftResponse.timestamp ? new Date(shyftResponse.timestamp).getTime() : Date.now(),
      status: shyftResponse.status || 'Success',
      fee: shyftResponse.fee || 0,
      fee_payer: shyftResponse.fee_payer || shyftResponse.signers?.[0] || '',
      signers: shyftResponse.signers || [],
      protocol: shyftResponse.protocol,
      token_balance_changes: shyftResponse.token_balance_changes || [],
      actions: shyftResponse.actions || [],
    };

    // Parse with V2 parser
    const parseResult = parseShyftTransactionV2(v2Input);

    if (parseResult.success && parseResult.data) {
      // V2 ACCEPTED
      stats.v2Accepted++;
      const swapData = parseResult.data;
      const isSplitSwap = 'sellRecord' in swapData;

      let detection;
      if (isSplitSwap) {
        const sellRecord = swapData.sellRecord;
        detection = {
          signature,
          timestamp: new Date(),
          type: 'split_swap',
          side: sellRecord.direction || 'SELL',
          inputToken: sellRecord.quoteAsset.symbol || 'UNKNOWN',
          outputToken: sellRecord.baseAsset.symbol || 'UNKNOWN',
          inputMint: sellRecord.quoteAsset.mint,
          outputMint: sellRecord.baseAsset.mint,
          inputAmount: Math.abs(sellRecord.amounts.baseAmount || 0).toFixed(6),
          outputAmount: Math.abs(sellRecord.amounts.netWalletReceived || 0).toFixed(6),
          swapper: sellRecord.swapper || 'UNKNOWN',
          swapperMethod: 'split_swap_record',
          confidence: sellRecord.confidence,
          protocol: shyftResponse.protocol?.name || 'Unknown',
        };
      } else {
        const inputAmount = swapData.direction === 'BUY' 
          ? swapData.amounts.swapInputAmount || 0
          : swapData.amounts.baseAmount || 0;
        const outputAmount = swapData.direction === 'BUY'
          ? swapData.amounts.baseAmount || 0
          : swapData.amounts.netWalletReceived || 0;

        detection = {
          signature,
          timestamp: new Date(),
          type: 'regular_swap',
          side: swapData.direction || 'UNKNOWN',
          inputToken: swapData.direction === 'BUY' 
            ? (swapData.quoteAsset.symbol || 'UNKNOWN')
            : (swapData.baseAsset.symbol || 'UNKNOWN'),
          outputToken: swapData.direction === 'BUY'
            ? (swapData.baseAsset.symbol || 'UNKNOWN')
            : (swapData.quoteAsset.symbol || 'UNKNOWN'),
          inputMint: swapData.direction === 'BUY' ? swapData.quoteAsset.mint : swapData.baseAsset.mint,
          outputMint: swapData.direction === 'BUY' ? swapData.baseAsset.mint : swapData.quoteAsset.mint,
          inputAmount: Math.abs(inputAmount).toFixed(6),
          outputAmount: Math.abs(outputAmount).toFixed(6),
          swapper: swapData.swapper || 'UNKNOWN',
          swapperMethod: 'regular_swap',
          confidence: swapData.confidence,
          protocol: shyftResponse.protocol?.name || 'Unknown',
        };
      }

      state.v2Detections.push(detection);
      console.log(colors.green(`✅ V2 DETECTED: ${detection.side} | ${detection.inputToken} → ${detection.outputToken}`));
      console.log(colors.gray(`   Sig: ${signature.substring(0, 20)}... | Swapper: ${detection.swapper.substring(0, 8)}...`));

    } else {
      // V2 REJECTED
      stats.v2Rejected++;
      const reason = parseResult.erase?.reason || 'unknown_rejection';

      const rejection = {
        signature,
        timestamp: new Date(),
        feePayer: v2Input.fee_payer || 'UNKNOWN',
        signers: v2Input.signers,
        reason: reason,
        protocol: shyftResponse.protocol?.name || 'Unknown',
        hasActions: (shyftResponse.actions || []).length > 0,
        hasTokenBalanceChanges: (shyftResponse.token_balance_changes || []).length > 0,
      };

      state.v2Rejections.push(rejection);
      console.log(colors.red(`❌ V2 REJECTED: ${reason}`));
      console.log(colors.gray(`   Sig: ${signature.substring(0, 20)}...`));
    }

  } catch (error) {
    stats.v2Errors++;
    state.v2Errors.push({
      signature,
      timestamp: new Date(),
      error: error.message,
      type: 'processing_error',
    });
    console.log(colors.red(`⚠️  ERROR: ${error.message}`));
  }
}

/**
 * Connect to Helius WebSocket
 */
function connectWebSocket(whaleAddresses) {
  console.log(colors.cyan(`\n📡 Connecting to Helius WebSocket...`));
  ws = new WebSocket(WSS_URL);

  ws.on('open', () => {
    console.log(colors.green('✅ WebSocket connected!'));

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
    console.log(colors.cyan(`📡 Subscribed to ${whaleAddresses.length} whale addresses\n`));

    state.startTime = Date.now();
    console.log(colors.yellow(`⏱️  TEST STARTED at ${new Date().toISOString()}`));
    console.log(colors.yellow(`   Will run for ${TEST_DURATION_MS / 1000 / 60} minutes\n`));

    startStatsDisplay();

    testTimeout = setTimeout(async () => {
      console.log(colors.yellow(`\n\n⏱️  TEST DURATION REACHED`));
      await stopTest();
    }, TEST_DURATION_MS);
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.method === 'transactionNotification') {
        await handleTransaction(message.params.result.transaction);
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

/**
 * Display live statistics
 */
function startStatsDisplay() {
  statsInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const txPerMin = stats.totalTransactions / (elapsed / 60);

    console.log(colors.cyan('\n' + '='.repeat(80)));
    console.log(colors.cyan(colors.bold('📊 LIVE STATISTICS')));
    console.log(colors.cyan('='.repeat(80)));
    console.log(colors.white(`⏱️  Elapsed: ${elapsed}s | Tx Rate: ${txPerMin.toFixed(2)}/min`));
    console.log(colors.white(`📈 Total: ${stats.totalTransactions}`));
    console.log(colors.green(`✅ V2 Accepted: ${stats.v2Accepted} (${((stats.v2Accepted / stats.totalTransactions) * 100 || 0).toFixed(1)}%)`));
    console.log(colors.red(`❌ V2 Rejected: ${stats.v2Rejected} (${((stats.v2Rejected / stats.totalTransactions) * 100 || 0).toFixed(1)}%)`));
    console.log(colors.yellow(`⚠️  Errors: ${stats.v2Errors}`));
    console.log(colors.cyan('='.repeat(80) + '\n'));
  }, 30000);
}

/**
 * Query V1 transactions from database
 */
async function queryV1Transactions() {
  console.log(colors.cyan('\n📊 Querying V1 transactions from database...'));
  console.log(colors.gray(`   Time window: ${new Date(state.startTime).toISOString()} to ${new Date(state.endTime).toISOString()}`));

  state.v1Transactions = await WhaleAllTransactionsV2.find({
    'transaction.timestamp': {
      $gte: new Date(state.startTime),
      $lte: new Date(state.endTime),
    }
  }).lean();

  stats.v1Total = state.v1Transactions.length;
  console.log(colors.green(`✅ Found ${stats.v1Total} V1 transactions in database\n`));
}

/**
 * Compare V1 and V2 results
 */
function compareResults() {
  console.log(colors.cyan('\n' + '='.repeat(80)));
  console.log(colors.cyan(colors.bold('🔍 REGRESSION ANALYSIS')));
  console.log(colors.cyan('='.repeat(80) + '\n'));

  // Create signature sets
  const v1Signatures = new Set(state.v1Transactions.map(tx => tx.transaction?.signature).filter(Boolean));
  const v2Signatures = new Set(state.v2Detections.map(d => d.signature));

  // Find matches and differences
  const matches = [];
  const regressions = []; // V1 found, V2 missed
  const improvements = []; // V2 found, V1 missed
  const swapperMismatches = [];

  // Check matches and swapper identification
  for (const sig of v1Signatures) {
    if (v2Signatures.has(sig)) {
      const v1Tx = state.v1Transactions.find(tx => tx.transaction?.signature === sig);
      const v2Tx = state.v2Detections.find(d => d.signature === sig);
      
      matches.push({ v1: v1Tx, v2: v2Tx });
      stats.matches++;

      // Compare swapper identification
      const v1Swapper = v1Tx.whale?.address || v1Tx.whaleAddress;
      const v2Swapper = v2Tx.swapper;

      if (v1Swapper && v2Swapper && v1Swapper !== v2Swapper) {
        swapperMismatches.push({
          signature: sig,
          v1Swapper,
          v2Swapper,
          v2Method: v2Tx.swapperMethod,
          protocol: v2Tx.protocol,
        });
        stats.swapperMismatches++;
      }
    } else {
      // REGRESSION: V1 found it, V2 missed it
      const v1Tx = state.v1Transactions.find(tx => tx.transaction?.signature === sig);
      const v2Rejection = state.v2Rejections.find(r => r.signature === sig);
      
      regressions.push({
        signature: sig,
        v1: v1Tx,
        v2Rejection: v2Rejection || null,
      });
      stats.regressions++;
    }
  }

  // Check improvements
  for (const sig of v2Signatures) {
    if (!v1Signatures.has(sig)) {
      const v2Tx = state.v2Detections.find(d => d.signature === sig);
      improvements.push({
        signature: sig,
        v2: v2Tx,
      });
      stats.improvements++;
    }
  }

  // Display results
  console.log(colors.white(`V1 (Database): ${stats.v1Total} transactions`));
  console.log(colors.white(`V2 (Live): ${stats.v2Accepted} accepted, ${stats.v2Rejected} rejected\n`));

  console.log(colors.green(`✅ Matches: ${stats.matches} (both V1 and V2 detected)`));
  console.log(colors.yellow(`🎯 Improvements: ${stats.improvements} (V2 found, V1 missed)`));
  console.log(colors.red(`⚠️  Regressions: ${stats.regressions} (V1 found, V2 missed)`));
  console.log(colors.magenta(`🔄 Swapper Mismatches: ${stats.swapperMismatches}\n`));

  // Show regression details
  if (regressions.length > 0) {
    console.log(colors.red(`\n⚠️  REGRESSIONS (V1 found, V2 missed): ${regressions.length}\n`));
    regressions.slice(0, 10).forEach((reg, i) => {
      console.log(colors.red(`${i + 1}. ${reg.signature}`));
      console.log(colors.gray(`   V1 Type: ${reg.v1.type}`));
      console.log(colors.gray(`   V1 Tokens: ${reg.v1.transaction?.tokenIn?.symbol} → ${reg.v1.transaction?.tokenOut?.symbol}`));
      if (reg.v2Rejection) {
        console.log(colors.gray(`   V2 Rejection Reason: ${reg.v2Rejection.reason}`));
      } else {
        console.log(colors.gray(`   V2: Not processed`));
      }
      console.log();
    });
    if (regressions.length > 10) {
      console.log(colors.gray(`   ... and ${regressions.length - 10} more\n`));
    }
  }

  // Show swapper mismatches
  if (swapperMismatches.length > 0) {
    console.log(colors.magenta(`\n🔄 SWAPPER IDENTIFICATION MISMATCHES: ${swapperMismatches.length}\n`));
    swapperMismatches.slice(0, 10).forEach((mismatch, i) => {
      console.log(colors.magenta(`${i + 1}. ${mismatch.signature.substring(0, 20)}...`));
      console.log(colors.gray(`   V1 Swapper: ${mismatch.v1Swapper.substring(0, 8)}...`));
      console.log(colors.gray(`   V2 Swapper: ${mismatch.v2Swapper.substring(0, 8)}...`));
      console.log(colors.gray(`   V2 Method: ${mismatch.v2Method}`));
      console.log(colors.gray(`   Protocol: ${mismatch.protocol}\n`));
    });
    if (swapperMismatches.length > 10) {
      console.log(colors.gray(`   ... and ${swapperMismatches.length - 10} more\n`));
    }
  }

  return { matches, regressions, improvements, swapperMismatches };
}

/**
 * Stop test and generate reports
 */
async function stopTest() {
  if (statsInterval) clearInterval(statsInterval);
  if (testTimeout) clearTimeout(testTimeout);
  if (ws) ws.close();

  state.endTime = Date.now();

  // Query V1 transactions
  await queryV1Transactions();

  // Compare results
  const comparison = compareResults();

  // Generate reports
  await generateReports(comparison);

  await mongoose.disconnect();
  console.log(colors.green('\n✅ Test completed!\n'));
  process.exit(0);
}

/**
 * Generate CSV reports
 */
async function generateReports(comparison) {
  const timestamp = Date.now();
  const reportDir = path.join(__dirname, 'test-reports');

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  console.log(colors.cyan('\n📄 Generating reports...\n'));

  // 1. Regressions CSV
  const regressionsCSV = [
    'Signature,V1_Type,V1_Input_Token,V1_Output_Token,V1_Swapper,V2_Rejection_Reason,V2_Fee_Payer',
    ...comparison.regressions.map(r => {
      const v1Swapper = r.v1.whale?.address || r.v1.whaleAddress || 'UNKNOWN';
      const v2Reason = r.v2Rejection?.reason || 'not_processed';
      const v2FeePayer = r.v2Rejection?.feePayer || 'UNKNOWN';
      return `"${r.signature}","${r.v1.type}","${r.v1.transaction?.tokenIn?.symbol || 'UNKNOWN'}","${r.v1.transaction?.tokenOut?.symbol || 'UNKNOWN'}","${v1Swapper}","${v2Reason}","${v2FeePayer}"`;
    }),
  ].join('\n');

  fs.writeFileSync(path.join(reportDir, `regressions-${timestamp}.csv`), regressionsCSV);
  console.log(colors.gray(`📄 regressions-${timestamp}.csv`));

  // 2. Swapper Mismatches CSV
  const swapperCSV = [
    'Signature,V1_Swapper,V2_Swapper,V2_Method,Protocol',
    ...comparison.swapperMismatches.map(m =>
      `"${m.signature}","${m.v1Swapper}","${m.v2Swapper}","${m.v2Method}","${m.protocol}"`
    ),
  ].join('\n');

  fs.writeFileSync(path.join(reportDir, `swapper-mismatches-${timestamp}.csv`), swapperCSV);
  console.log(colors.gray(`📄 swapper-mismatches-${timestamp}.csv`));

  // 3. Summary CSV
  const elapsed = Math.floor((state.endTime - state.startTime) / 1000);
  const summaryCSV = [
    'Metric,Value',
    `Test Duration (seconds),${elapsed}`,
    `V1 Total,${stats.v1Total}`,
    `V2 Accepted,${stats.v2Accepted}`,
    `V2 Rejected,${stats.v2Rejected}`,
    `V2 Errors,${stats.v2Errors}`,
    `Matches,${stats.matches}`,
    `Regressions,${stats.regressions}`,
    `Improvements,${stats.improvements}`,
    `Swapper Mismatches,${stats.swapperMismatches}`,
    `Regression Rate,${((stats.regressions / stats.v1Total) * 100 || 0).toFixed(2)}%`,
  ].join('\n');

  fs.writeFileSync(path.join(reportDir, `summary-${timestamp}.csv`), summaryCSV);
  console.log(colors.gray(`📄 summary-${timestamp}.csv`));

  console.log(colors.green(`\n✅ Reports saved to: ${reportDir}\n`));
}

/**
 * Main function
 */
async function main() {
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')));
  console.log(colors.cyan(colors.bold('║         V1 vs V2 Parser Regression Test (Live)                            ║')));
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')));

  if (!SHYFT_API_KEY || !MONGO_URI || !WSS_URL) {
    console.error(colors.red('❌ Missing environment variables'));
    process.exit(1);
  }

  console.log(colors.green('✅ Environment validated\n'));

  await mongoose.connect(MONGO_URI);
  console.log(colors.green('✅ Connected to MongoDB\n'));

  const whales = await WhalesAddress.find({}).lean();
  const whaleAddresses = whales.flatMap((doc) => doc.whalesAddress || []);
  console.log(colors.green(`✅ Found ${whaleAddresses.length} whale addresses\n`));

  connectWebSocket(whaleAddresses);

  process.on('SIGINT', async () => {
    console.log(colors.yellow('\n\n⚠️  Test interrupted'));
    await stopTest();
  });
}

main().catch((error) => {
  console.error(colors.red('💥 Fatal Error:'), error);
  process.exit(1);
});
