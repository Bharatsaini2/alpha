/**
 * Live Whale Transaction Tracking Test
 * 
 * Tracks all 4000 whale wallets in real-time using:
 * - Helius WebSocket for transaction notifications
 * - Shyft API for transaction parsing
 * - V2 Parser for swap detection
 * 
 * Generates comprehensive CSV reports with:
 * - Detections (accepted transactions)
 * - Rejections (filtered transactions with reasons)
 * - Common patterns
 * - Wrong detections
 * - Protocol statistics
 * - Token statistics
 */

require('dotenv').config();
const WebSocket = require('ws');
const axios = require('axios');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Import models
const WhalesAddress = require('./src/models/solana-tokens-whales').default;

// Import V2 parser
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');

// Configuration
const SHYFT_API_KEY = process.env.SHYFT_API_KEY;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const WSS_URL = process.env.WSS_URL;
const TEST_DURATION_MS = 10 * 60 * 1000; // 10 minutes default

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

// Statistics
const stats = {
  totalTransactions: 0,
  v2Accepted: 0,
  v2Rejected: 0,
  v2Errors: 0,
  splitSwaps: 0,
  regularSwaps: 0,
  startTime: null,
  lastTransactionTime: null,
  protocolStats: {},
  tokenStats: {},
  rejectionReasons: {},
  confidenceLevels: {},
};

// Data storage
const detections = [];
const rejections = [];
const errors = [];

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
      // Rate limited, wait and retry
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
  if (!signature) return;

  stats.totalTransactions++;
  stats.lastTransactionTime = Date.now();

  try {
    // Fetch from Shyft API
    const shyftResponse = await fetchShyftTransaction(signature);
    if (!shyftResponse) {
      stats.v2Errors++;
      errors.push({
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
      // ACCEPTED
      stats.v2Accepted++;
      const swapData = parseResult.data;

      // Track protocol
      const protocol = shyftResponse.protocol?.name || 'Unknown';
      stats.protocolStats[protocol] = (stats.protocolStats[protocol] || 0) + 1;

      // Determine if split swap
      const isSplitSwap = 'sellRecord' in swapData;
      if (isSplitSwap) {
        stats.splitSwaps++;
      } else {
        stats.regularSwaps++;
      }

      // Extract detection data
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
          whaleAddress: sellRecord.swapper || 'UNKNOWN',
          confidence: sellRecord.confidence,
          protocol: protocol,
          protocolVersion: shyftResponse.protocol?.version || '',
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
          whaleAddress: swapData.swapper || 'UNKNOWN',
          confidence: swapData.confidence,
          protocol: protocol,
          protocolVersion: shyftResponse.protocol?.version || '',
        };
      }

      detections.push(detection);

      // Track confidence levels
      stats.confidenceLevels[detection.confidence] = (stats.confidenceLevels[detection.confidence] || 0) + 1;

      // Track tokens
      stats.tokenStats[detection.inputToken] = (stats.tokenStats[detection.inputToken] || 0) + 1;
      stats.tokenStats[detection.outputToken] = (stats.tokenStats[detection.outputToken] || 0) + 1;

      console.log(colors.green(`✅ DETECTED: ${detection.side} | ${detection.inputToken} → ${detection.outputToken}`));
      console.log(colors.gray(`   Sig: ${signature.substring(0, 20)}... | Confidence: ${detection.confidence} | Protocol: ${protocol}`));

    } else {
      // REJECTED
      stats.v2Rejected++;
      const reason = parseResult.erase?.reason || 'unknown_rejection';
      
      stats.rejectionReasons[reason] = (stats.rejectionReasons[reason] || 0) + 1;

      const rejection = {
        signature,
        timestamp: new Date(),
        whaleAddress: v2Input.fee_payer || 'UNKNOWN',
        reason: reason,
        protocol: shyftResponse.protocol?.name || 'Unknown',
        protocolVersion: shyftResponse.protocol?.version || '',
        hasActions: (shyftResponse.actions || []).length > 0,
        hasTokenBalanceChanges: (shyftResponse.token_balance_changes || []).length > 0,
      };

      rejections.push(rejection);

      console.log(colors.red(`❌ REJECTED: ${reason}`));
      console.log(colors.gray(`   Sig: ${signature.substring(0, 20)}... | Protocol: ${rejection.protocol}`));
    }

  } catch (error) {
    stats.v2Errors++;
    errors.push({
      signature,
      timestamp: new Date(),
      error: error.message,
      type: 'processing_error',
    });
    console.log(colors.red(`⚠️  ERROR: ${error.message}`));
    console.log(colors.gray(`   Sig: ${signature.substring(0, 20)}...`));
  }
}

/**
 * Connect to Helius WebSocket
 */
function connectWebSocket(whaleAddresses) {
  console.log(colors.cyan(`\n📡 Connecting to Helius WebSocket...`));
  console.log(colors.gray(`   URL: ${WSS_URL.substring(0, 50)}...`));

  ws = new WebSocket(WSS_URL);

  ws.on('open', () => {
    console.log(colors.green('✅ WebSocket connected!'));

    // Subscribe to whale addresses
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

    // Start tracking
    stats.startTime = Date.now();
    stats.lastTransactionTime = Date.now();

    console.log(colors.yellow(`⏱️  TEST STARTED at ${new Date().toISOString()}`));
    console.log(colors.yellow(`   Will run for ${TEST_DURATION_MS / 1000 / 60} minutes\n`));
    console.log(colors.cyan('🔍 Monitoring for transactions...\n'));

    // Start stats display
    startStatsDisplay();

    // Set timeout to end test
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
    const elapsed = Math.floor((Date.now() - stats.startTime) / 1000);
    const txPerMin = stats.totalTransactions / (elapsed / 60);
    const timeSinceLastTx = Math.floor((Date.now() - stats.lastTransactionTime) / 1000);

    console.log(colors.cyan('\n' + '='.repeat(80)));
    console.log(colors.cyan(colors.bold('📊 LIVE STATISTICS')));
    console.log(colors.cyan('='.repeat(80)));
    console.log(colors.white(`⏱️  Elapsed Time: ${elapsed}s`));
    console.log(colors.white(`📈 Total Transactions: ${stats.totalTransactions} (${txPerMin.toFixed(2)}/min)`));
    console.log(colors.white(`🕐 Last Transaction: ${timeSinceLastTx}s ago`));
    console.log(colors.green(`✅ V2 Accepted: ${stats.v2Accepted} (${((stats.v2Accepted / stats.totalTransactions) * 100 || 0).toFixed(1)}%)`));
    console.log(colors.blue(`   Regular Swaps: ${stats.regularSwaps}`));
    console.log(colors.blue(`   Split Swaps: ${stats.splitSwaps}`));
    console.log(colors.red(`❌ V2 Rejected: ${stats.v2Rejected} (${((stats.v2Rejected / stats.totalTransactions) * 100 || 0).toFixed(1)}%)`));
    console.log(colors.yellow(`⚠️  Errors: ${stats.v2Errors}`));
    
    // Top rejection reasons
    if (Object.keys(stats.rejectionReasons).length > 0) {
      console.log(colors.magenta('\n🚫 Top Rejection Reasons:'));
      Object.entries(stats.rejectionReasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([reason, count]) => {
          console.log(colors.gray(`   ${reason}: ${count}`));
        });
    }

    // Top protocols
    if (Object.keys(stats.protocolStats).length > 0) {
      console.log(colors.blue('\n📊 Top Protocols:'));
      Object.entries(stats.protocolStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([protocol, count]) => {
          console.log(colors.gray(`   ${protocol}: ${count}`));
        });
    }

    console.log(colors.cyan('='.repeat(80) + '\n'));
  }, 30000); // Every 30 seconds
}

/**
 * Stop test and generate reports
 */
async function stopTest() {
  // Clear intervals and timeouts
  if (statsInterval) clearInterval(statsInterval);
  if (testTimeout) clearTimeout(testTimeout);
  
  // Close WebSocket
  if (ws) ws.close();

  console.log(colors.cyan('\n\n' + '='.repeat(80)));
  console.log(colors.cyan(colors.bold('📊 FINAL REPORT')));
  console.log(colors.cyan('='.repeat(80)));

  const elapsed = Math.floor((Date.now() - stats.startTime) / 1000);
  const txPerMin = stats.totalTransactions / (elapsed / 60);

  console.log(colors.white(`\n⏱️  Total Duration: ${elapsed}s (${(elapsed / 60).toFixed(1)} minutes)`));
  console.log(colors.white(`📈 Total Transactions: ${stats.totalTransactions} (${txPerMin.toFixed(2)}/min)`));
  console.log(colors.green(`✅ V2 Accepted: ${stats.v2Accepted} (${((stats.v2Accepted / stats.totalTransactions) * 100 || 0).toFixed(1)}%)`));
  console.log(colors.blue(`   Regular Swaps: ${stats.regularSwaps}`));
  console.log(colors.blue(`   Split Swaps: ${stats.splitSwaps}`));
  console.log(colors.red(`❌ V2 Rejected: ${stats.v2Rejected} (${((stats.v2Rejected / stats.totalTransactions) * 100 || 0).toFixed(1)}%)`));
  console.log(colors.yellow(`⚠️  Errors: ${stats.v2Errors}\n`));

  // Generate CSV reports
  await generateReports();

  // Disconnect from MongoDB
  await mongoose.disconnect();
  console.log(colors.green('\n✅ Disconnected from MongoDB'));
  console.log(colors.green('✅ Test completed successfully!\n'));

  process.exit(0);
}

/**
 * Generate CSV reports
 */
async function generateReports() {
  const timestamp = Date.now();
  const reportDir = path.join(__dirname, 'test-reports');

  // Create reports directory if it doesn't exist
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  console.log(colors.cyan('\n📄 Generating CSV reports...\n'));

  // 1. Detailed detections CSV
  const detectionsCSV = [
    'Signature,Timestamp,Type,Side,Input_Token,Output_Token,Input_Mint,Output_Mint,Input_Amount,Output_Amount,Whale_Address,Confidence,Protocol,Protocol_Version',
    ...detections.map(d =>
      `"${d.signature}","${d.timestamp.toISOString()}","${d.type}","${d.side}","${d.inputToken}","${d.outputToken}","${d.inputMint}","${d.outputMint}","${d.inputAmount}","${d.outputAmount}","${d.whaleAddress}","${d.confidence}","${d.protocol}","${d.protocolVersion}"`
    ),
  ].join('\n');

  const detectionsFile = path.join(reportDir, `whale-detections-${timestamp}.csv`);
  fs.writeFileSync(detectionsFile, detectionsCSV);
  console.log(colors.gray(`📄 ${detectionsFile}`));

  // 2. Rejections CSV
  const rejectionsCSV = [
    'Signature,Timestamp,Whale_Address,Rejection_Reason,Protocol,Protocol_Version,Has_Actions,Has_Token_Balance_Changes',
    ...rejections.map(r =>
      `"${r.signature}","${r.timestamp.toISOString()}","${r.whaleAddress}","${r.reason}","${r.protocol}","${r.protocolVersion}","${r.hasActions}","${r.hasTokenBalanceChanges}"`
    ),
  ].join('\n');

  const rejectionsFile = path.join(reportDir, `whale-rejections-${timestamp}.csv`);
  fs.writeFileSync(rejectionsFile, rejectionsCSV);
  console.log(colors.gray(`📄 ${rejectionsFile}`));

  // 3. Errors CSV
  const errorsCSV = [
    'Signature,Timestamp,Error,Type',
    ...errors.map(e =>
      `"${e.signature}","${e.timestamp.toISOString()}","${e.error}","${e.type}"`
    ),
  ].join('\n');

  const errorsFile = path.join(reportDir, `whale-errors-${timestamp}.csv`);
  fs.writeFileSync(errorsFile, errorsCSV);
  console.log(colors.gray(`📄 ${errorsFile}`));

  // 4. Summary CSV
  const elapsed = Math.floor((Date.now() - stats.startTime) / 1000);
  const summaryCSV = [
    'Metric,Value',
    `Test Duration (seconds),${elapsed}`,
    `Test Duration (minutes),${(elapsed / 60).toFixed(2)}`,
    `Total Transactions,${stats.totalTransactions}`,
    `Transactions Per Minute,${(stats.totalTransactions / (elapsed / 60)).toFixed(2)}`,
    `V2 Accepted,${stats.v2Accepted}`,
    `V2 Accepted Percentage,${((stats.v2Accepted / stats.totalTransactions) * 100 || 0).toFixed(2)}`,
    `Regular Swaps,${stats.regularSwaps}`,
    `Split Swaps,${stats.splitSwaps}`,
    `V2 Rejected,${stats.v2Rejected}`,
    `V2 Rejected Percentage,${((stats.v2Rejected / stats.totalTransactions) * 100 || 0).toFixed(2)}`,
    `Errors,${stats.v2Errors}`,
  ].join('\n');

  const summaryFile = path.join(reportDir, `whale-summary-${timestamp}.csv`);
  fs.writeFileSync(summaryFile, summaryCSV);
  console.log(colors.gray(`📄 ${summaryFile}`));

  // 5. Rejection reasons CSV
  const rejectionReasonsCSV = [
    'Reason,Count,Percentage',
    ...Object.entries(stats.rejectionReasons)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) =>
        `"${reason}",${count},${((count / stats.v2Rejected) * 100 || 0).toFixed(2)}`
      ),
  ].join('\n');

  const rejectionReasonsFile = path.join(reportDir, `whale-rejection-reasons-${timestamp}.csv`);
  fs.writeFileSync(rejectionReasonsFile, rejectionReasonsCSV);
  console.log(colors.gray(`📄 ${rejectionReasonsFile}`));

  // 6. Protocol stats CSV
  const protocolStatsCSV = [
    'Protocol,Count,Percentage',
    ...Object.entries(stats.protocolStats)
      .sort((a, b) => b[1] - a[1])
      .map(([protocol, count]) =>
        `"${protocol}",${count},${((count / stats.v2Accepted) * 100 || 0).toFixed(2)}`
      ),
  ].join('\n');

  const protocolStatsFile = path.join(reportDir, `whale-protocol-stats-${timestamp}.csv`);
  fs.writeFileSync(protocolStatsFile, protocolStatsCSV);
  console.log(colors.gray(`📄 ${protocolStatsFile}`));

  // 7. Token stats CSV
  const tokenStatsCSV = [
    'Token,Count',
    ...Object.entries(stats.tokenStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100) // Top 100 tokens
      .map(([token, count]) => `"${token}",${count}`),
  ].join('\n');

  const tokenStatsFile = path.join(reportDir, `whale-token-stats-${timestamp}.csv`);
  fs.writeFileSync(tokenStatsFile, tokenStatsCSV);
  console.log(colors.gray(`📄 ${tokenStatsFile}`));

  // 8. Confidence levels CSV
  const confidenceCSV = [
    'Confidence,Count,Percentage',
    ...Object.entries(stats.confidenceLevels)
      .sort((a, b) => b[1] - a[1])
      .map(([confidence, count]) =>
        `"${confidence}",${count},${((count / stats.v2Accepted) * 100 || 0).toFixed(2)}`
      ),
  ].join('\n');

  const confidenceFile = path.join(reportDir, `whale-confidence-levels-${timestamp}.csv`);
  fs.writeFileSync(confidenceFile, confidenceCSV);
  console.log(colors.gray(`📄 ${confidenceFile}`));

  console.log(colors.green(`\n✅ All reports generated in: ${reportDir}\n`));
}

/**
 * Main function
 */
async function main() {
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')));
  console.log(colors.cyan(colors.bold('║         Live Whale Transaction Tracking Test                              ║')));
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')));

  // Validate environment
  if (!SHYFT_API_KEY) {
    console.error(colors.red('❌ SHYFT_API_KEY not found in .env'));
    process.exit(1);
  }
  if (!MONGO_URI) {
    console.error(colors.red('❌ MONGO_URI not found in .env'));
    process.exit(1);
  }
  if (!WSS_URL) {
    console.error(colors.red('❌ WSS_URL not found in .env'));
    process.exit(1);
  }

  console.log(colors.green('✅ Environment validated\n'));

  // Connect to MongoDB
  console.log(colors.cyan('📊 Connecting to MongoDB...'));
  await mongoose.connect(MONGO_URI);
  console.log(colors.green('✅ Connected to MongoDB\n'));

  // Fetch whale addresses
  console.log(colors.cyan('📊 Fetching whale addresses from database...'));
  const whales = await WhalesAddress.find({}).lean();
  const whaleAddresses = whales.flatMap((doc) => doc.whalesAddress || []);
  console.log(colors.green(`✅ Found ${whaleAddresses.length} whale addresses from ${whales.length} token records\n`));

  if (whaleAddresses.length === 0) {
    console.error(colors.red('❌ No whale addresses found in database'));
    await mongoose.disconnect();
    process.exit(1);
  }

  // Connect WebSocket and start tracking
  connectWebSocket(whaleAddresses);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log(colors.yellow('\n\n⚠️  Test interrupted by user'));
    await stopTest();
  });
}

// Run
main().catch((error) => {
  console.error(colors.red('💥 Fatal Error:'), error);
  process.exit(1);
});
