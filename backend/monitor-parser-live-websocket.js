/**
 * Live Parser Monitor via WebSocket
 * 
 * Monitors live transactions from SHYFT WebSocket for 5 minutes
 * Tests V2 parser on every transaction and generates detailed CSV report
 */

const WebSocket = require('ws');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import parsers
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');
const { parseShyftTransaction } = require('./dist/utils/shyftParser');

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || 'gUgMlxLLxJPXxvXx';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
const WSS_URL = process.env.WSS_URL || `wss://atlas-mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const TEST_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Known whale addresses to monitor
const WHALE_ADDRESSES = [
  'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
  'C3TdUaDVdE74wYutyCkj7NRXqRfLgq2UFRZFab9MEUBs',
  'ruok2pybjpftuQ75qfzgHgebB91vSbCAK91dkButHdr',
  'CWaTfG6yzJPQRY5P53nQYHdHLjCJGxpC7EWo5wzGqs3n',
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1'
];

// Results storage
const results = {
  transactions: [],
  v2Accepted: 0,
  v2Rejected: 0,
  v2SplitSwaps: 0,
  v2Errors: 0,
  v1Accepted: 0,
  v1Rejected: 0,
  rejectionReasons: {},
  startTime: Date.now(),
  endTime: null,
  totalReceived: 0
};

let ws = null;
let testTimeout = null;

/**
 * Fetch full transaction details from SHYFT API
 */
async function fetchShyftTransaction(signature) {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed`,
      {
        params: {
          network: 'mainnet-beta',
          txn_signature: signature
        },
        headers: {
          'x-api-key': SHYFT_API_KEY
        },
        timeout: 10000
      }
    );

    return response.data?.result || null;
  } catch (error) {
    if (error.response?.status === 429) {
      // Rate limited, wait and retry
      await new Promise(resolve => setTimeout(resolve, 1000));
      return fetchShyftTransaction(signature);
    }
    console.error(`   ❌ Error fetching ${signature.slice(0, 16)}: ${error.message}`);
    return null;
  }
}

/**
 * Test V2 parser
 */
function testV2Parser(tx) {
  try {
    const v2Input = {
      signature: tx.signatures?.[0] || tx.signature || 'unknown',
      timestamp: tx.timestamp ? new Date(tx.timestamp).getTime() : Date.now(),
      status: tx.status || 'Success',
      fee: tx.fee || 0,
      fee_payer: tx.fee_payer || '',
      signers: tx.signers || [],
      protocol: tx.protocol,
      token_balance_changes: tx.token_balance_changes || [],
      actions: tx.actions || []
    };

    const result = parseShyftTransactionV2(v2Input);
    
    return {
      success: result.success,
      data: result.data,
      erase: result.erase,
      processingTimeMs: result.processingTimeMs
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Test V1 parser
 */
function testV1Parser(tx) {
  try {
    const result = parseShyftTransaction(tx);
    
    return {
      success: !!result && result.type !== 'UNKNOWN',
      data: result,
      isBuy: result?.isBuy,
      isSell: result?.isSell
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Analyze a transaction
 */
function analyzeTransaction(tx, index) {
  const signature = tx.signatures?.[0] || tx.signature || `tx_${index}`;
  const txType = tx.type || 'UNKNOWN';
  const protocol = tx.protocol?.name || 'Unknown';
  
  console.log(`\n[${index + 1}] ${signature.slice(0, 16)}... | ${txType} | ${protocol}`);
  
  // Test V2
  const v2Result = testV2Parser(tx);
  
  // Test V1
  const v1Result = testV1Parser(tx);
  
  // Build result object
  const result = {
    signature,
    txType,
    protocol,
    timestamp: tx.timestamp || new Date().toISOString(),
    v2Status: 'UNKNOWN',
    v2Direction: '',
    v2QuoteAsset: '',
    v2BaseAsset: '',
    v2SwapInputAmount: '',
    v2TotalWalletCost: '',
    v2SwapOutputAmount: '',
    v2NetWalletReceived: '',
    v2BaseAmount: '',
    v2RejectionReason: '',
    v2ProcessingTimeMs: v2Result.processingTimeMs || 0,
    v2IsSplit: false,
    v2SplitSellQuote: '',
    v2SplitBuyQuote: '',
    v1Status: 'UNKNOWN',
    v1Direction: '',
    agreement: 'UNKNOWN'
  };
  
  // Process V2 result
  if (v2Result.success && v2Result.data) {
    if ('sellRecord' in v2Result.data) {
      // Split swap
      results.v2SplitSwaps++;
      result.v2Status = 'SPLIT';
      result.v2IsSplit = true;
      result.v2SplitSellQuote = v2Result.data.sellRecord.quoteAsset?.symbol || '';
      result.v2SplitBuyQuote = v2Result.data.buyRecord.quoteAsset?.symbol || '';
      console.log(`  ✅ V2: SPLIT (${result.v2SplitSellQuote} → ${result.v2SplitBuyQuote})`);
    } else {
      // Regular swap
      results.v2Accepted++;
      result.v2Status = 'ACCEPTED';
      result.v2Direction = v2Result.data.direction;
      result.v2QuoteAsset = v2Result.data.quoteAsset?.symbol || '';
      result.v2BaseAsset = v2Result.data.baseAsset?.symbol || '';
      
      const amounts = v2Result.data.amounts || {};
      result.v2SwapInputAmount = amounts.swapInputAmount || '';
      result.v2TotalWalletCost = amounts.totalWalletCost || '';
      result.v2SwapOutputAmount = amounts.swapOutputAmount || '';
      result.v2NetWalletReceived = amounts.netWalletReceived || '';
      result.v2BaseAmount = amounts.baseAmount || '';
      
      console.log(`  ✅ V2: ${result.v2Direction} (${result.v2QuoteAsset} → ${result.v2BaseAsset})`);
    }
  } else if (v2Result.erase) {
    // Rejected
    results.v2Rejected++;
    result.v2Status = 'REJECTED';
    result.v2RejectionReason = v2Result.erase.reason;
    
    // Track rejection reasons
    results.rejectionReasons[result.v2RejectionReason] = 
      (results.rejectionReasons[result.v2RejectionReason] || 0) + 1;
    
    console.log(`  ❌ V2: REJECTED (${result.v2RejectionReason})`);
  } else if (v2Result.error) {
    // Error
    results.v2Errors++;
    result.v2Status = 'ERROR';
    result.v2RejectionReason = v2Result.error;
    console.log(`  ⚠️  V2: ERROR (${v2Result.error})`);
  }
  
  // Process V1 result
  if (v1Result.success && v1Result.data) {
    results.v1Accepted++;
    result.v1Status = 'ACCEPTED';
    result.v1Direction = v1Result.isBuy ? 'BUY' : v1Result.isSell ? 'SELL' : 'UNKNOWN';
    console.log(`  ✅ V1: ${result.v1Direction}`);
  } else {
    results.v1Rejected++;
    result.v1Status = 'REJECTED';
    console.log(`  ❌ V1: REJECTED`);
  }
  
  // Determine agreement
  if (result.v2Status === 'ACCEPTED' && result.v1Status === 'ACCEPTED') {
    result.agreement = result.v2Direction === result.v1Direction ? 'MATCH' : 'MISMATCH';
  } else if (result.v2Status === 'REJECTED' && result.v1Status === 'REJECTED') {
    result.agreement = 'BOTH_REJECT';
  } else if (result.v2Status === 'SPLIT') {
    result.agreement = 'V2_SPLIT';
  } else {
    result.agreement = 'DISAGREE';
  }
  
  results.transactions.push(result);
}

/**
 * Handle incoming WebSocket transaction
 */
async function handleTransaction(message) {
  results.totalReceived++;
  
  const signature = message.signature || message.signatures?.[0];
  if (!signature) {
    console.log(`⚠️  Received transaction without signature`);
    return;
  }
  
  console.log(`\n📥 [${results.totalReceived}] Received: ${signature.slice(0, 16)}...`);
  
  // Fetch full transaction details
  const tx = await fetchShyftTransaction(signature);
  
  if (!tx) {
    console.log(`   ⚠️  Could not fetch transaction details`);
    return;
  }
  
  // Analyze the transaction
  analyzeTransaction(tx, results.transactions.length);
}

/**
 * Generate CSV reports
 */
function generateCSVReports() {
  const timestamp = Date.now();
  const reportDir = path.join(__dirname, 'test-reports');
  
  // Create reports directory
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  // 1. Main detailed report
  const detailedCSV = [
    'Signature,TX_Type,Protocol,Timestamp,V2_Status,V2_Direction,V2_Quote,V2_Base,V2_Swap_Input,V2_Total_Cost,V2_Swap_Output,V2_Net_Received,V2_Base_Amount,V2_Rejection_Reason,V2_Processing_Ms,V2_Is_Split,V2_Split_Sell,V2_Split_Buy,V1_Status,V1_Direction,Agreement',
    ...results.transactions.map(r => 
      `"${r.signature}","${r.txType}","${r.protocol}","${r.timestamp}","${r.v2Status}","${r.v2Direction}","${r.v2QuoteAsset}","${r.v2BaseAsset}","${r.v2SwapInputAmount}","${r.v2TotalWalletCost}","${r.v2SwapOutputAmount}","${r.v2NetWalletReceived}","${r.v2BaseAmount}","${r.v2RejectionReason}","${r.v2ProcessingTimeMs}","${r.v2IsSplit}","${r.v2SplitSellQuote}","${r.v2SplitBuyQuote}","${r.v1Status}","${r.v1Direction}","${r.agreement}"`
    )
  ].join('\n');
  
  fs.writeFileSync(
    path.join(reportDir, `detailed-report-${timestamp}.csv`),
    detailedCSV
  );
  
  // 2. Summary report
  const totalV2 = results.v2Accepted + results.v2Rejected + results.v2SplitSwaps;
  const totalV1 = results.v1Accepted + results.v1Rejected;
  const testDurationSec = (results.endTime - results.startTime) / 1000;
  
  const summaryCSV = [
    'Metric,Value,Percentage',
    `Test Duration (seconds),${testDurationSec.toFixed(2)},N/A`,
    `Total Received,${results.totalReceived},N/A`,
    `Total Analyzed,${results.transactions.length},100%`,
    `V2 Accepted,${results.v2Accepted},${((results.v2Accepted / totalV2) * 100).toFixed(2)}%`,
    `V2 Split Swaps,${results.v2SplitSwaps},${((results.v2SplitSwaps / totalV2) * 100).toFixed(2)}%`,
    `V2 Rejected,${results.v2Rejected},${((results.v2Rejected / totalV2) * 100).toFixed(2)}%`,
    `V2 Errors,${results.v2Errors},N/A`,
    `V1 Accepted,${results.v1Accepted},${((results.v1Accepted / totalV1) * 100).toFixed(2)}%`,
    `V1 Rejected,${results.v1Rejected},${((results.v1Rejected / totalV1) * 100).toFixed(2)}%`
  ].join('\n');
  
  fs.writeFileSync(
    path.join(reportDir, `summary-${timestamp}.csv`),
    summaryCSV
  );
  
  // 3. Rejection reasons report
  const rejectionCSV = [
    'Reason,Count,Percentage',
    ...Object.entries(results.rejectionReasons)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => 
        `"${reason}",${count},${((count / results.v2Rejected) * 100).toFixed(2)}%`
      )
  ].join('\n');
  
  fs.writeFileSync(
    path.join(reportDir, `rejection-reasons-${timestamp}.csv`),
    rejectionCSV
  );
  
  // 4. V1 vs V2 comparison
  const agreements = {
    MATCH: 0,
    MISMATCH: 0,
    BOTH_REJECT: 0,
    V2_SPLIT: 0,
    DISAGREE: 0
  };
  
  results.transactions.forEach(r => {
    agreements[r.agreement] = (agreements[r.agreement] || 0) + 1;
  });
  
  const comparisonCSV = [
    'Agreement_Type,Count,Percentage',
    ...Object.entries(agreements).map(([type, count]) => 
      `${type},${count},${((count / results.transactions.length) * 100).toFixed(2)}%`
    )
  ].join('\n');
  
  fs.writeFileSync(
    path.join(reportDir, `v1-v2-comparison-${timestamp}.csv`),
    comparisonCSV
  );
  
  console.log(`\n📊 Reports generated:`);
  console.log(`   📄 detailed-report-${timestamp}.csv`);
  console.log(`   📄 summary-${timestamp}.csv`);
  console.log(`   📄 rejection-reasons-${timestamp}.csv`);
  console.log(`   📄 v1-v2-comparison-${timestamp}.csv`);
  console.log(`\n📁 Location: ${reportDir}`);
  
  return reportDir;
}

/**
 * Print summary
 */
function printSummary() {
  const totalV2 = results.v2Accepted + results.v2Rejected + results.v2SplitSwaps;
  const totalV1 = results.v1Accepted + results.v1Rejected;
  const testDurationSec = (results.endTime - results.startTime) / 1000;
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`\n⏱️  Test Duration: ${testDurationSec.toFixed(2)} seconds`);
  console.log(`📥 Total Received: ${results.totalReceived}`);
  console.log(`📈 Total Analyzed: ${results.transactions.length}`);
  
  console.log('\n🟢 V2 Parser Results:');
  console.log(`   ✅ Accepted: ${results.v2Accepted} (${((results.v2Accepted / totalV2) * 100).toFixed(2)}%)`);
  console.log(`   🔄 Split Swaps: ${results.v2SplitSwaps} (${((results.v2SplitSwaps / totalV2) * 100).toFixed(2)}%)`);
  console.log(`   ❌ Rejected: ${results.v2Rejected} (${((results.v2Rejected / totalV2) * 100).toFixed(2)}%)`);
  console.log(`   ⚠️  Errors: ${results.v2Errors}`);
  
  console.log('\n🔵 V1 Parser Results:');
  console.log(`   ✅ Accepted: ${results.v1Accepted} (${((results.v1Accepted / totalV1) * 100).toFixed(2)}%)`);
  console.log(`   ❌ Rejected: ${results.v1Rejected} (${((results.v1Rejected / totalV1) * 100).toFixed(2)}%)`);
  
  if (Object.keys(results.rejectionReasons).length > 0) {
    console.log('\n📋 Top Rejection Reasons:');
    Object.entries(results.rejectionReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([reason, count]) => {
        console.log(`   - ${reason}: ${count} (${((count / results.v2Rejected) * 100).toFixed(2)}%)`);
      });
  }
  
  console.log('\n' + '='.repeat(80));
}

/**
 * Stop the test
 */
function stopTest() {
  console.log('\n⏹️  Stopping test...');
  
  if (testTimeout) {
    clearTimeout(testTimeout);
  }
  
  if (ws) {
    ws.close();
  }
  
  results.endTime = Date.now();
  
  // Print summary
  printSummary();
  
  // Generate reports
  generateCSVReports();
  
  console.log('\n✅ Test completed successfully!');
  process.exit(0);
}

/**
 * Start WebSocket connection
 */
function startWebSocket() {
  console.log('\n🔌 Connecting to SHYFT WebSocket...');
  
  ws = new WebSocket(WSS_URL, {
    headers: {
      'x-api-key': SHYFT_API_KEY
    }
  });
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected!');
    
    // Subscribe to whale addresses
    const subscribeMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'transactionSubscribe',
      params: [
        {
          accountInclude: WHALE_ADDRESSES
        },
        {
          commitment: 'confirmed',
          encoding: 'jsonParsed',
          transactionDetails: 'full',
          showRewards: false,
          maxSupportedTransactionVersion: 0
        }
      ]
    };
    
    ws.send(JSON.stringify(subscribeMessage));
    console.log(`📡 Subscribed to ${WHALE_ADDRESSES.length} whale addresses`);
    console.log('\n⏱️  Monitoring for 5 minutes...\n');
    
    // Set timeout to stop after 5 minutes
    testTimeout = setTimeout(stopTest, TEST_DURATION_MS);
  });
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      // Handle subscription confirmation
      if (message.result && typeof message.result === 'number') {
        console.log(`✅ Subscription confirmed (ID: ${message.result})`);
        return;
      }
      
      // Handle transaction notification
      if (message.params && message.params.result) {
        await handleTransaction(message.params.result);
      }
    } catch (error) {
      console.error(`⚠️  Error processing message: ${error.message}`);
    }
  });
  
  ws.on('error', (error) => {
    console.error(`❌ WebSocket error: ${error.message}`);
  });
  
  ws.on('close', () => {
    console.log('\n🔌 WebSocket disconnected');
  });
}

/**
 * Main test function
 */
async function runLiveTest() {
  console.log('🚀 Starting 5-Minute Live Parser Monitor');
  console.log('='.repeat(80));
  console.log(`🔑 SHYFT API Key: ${SHYFT_API_KEY.slice(0, 8)}...`);
  console.log(`🌐 WebSocket URL: ${WSS_URL}`);
  console.log(`⏱️  Duration: 5 minutes`);
  console.log(`👀 Monitoring ${WHALE_ADDRESSES.length} whale addresses`);
  
  results.startTime = Date.now();
  
  // Start WebSocket
  startWebSocket();
  
  // Handle Ctrl+C
  process.on('SIGINT', stopTest);
}

// Run the test
runLiveTest().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
