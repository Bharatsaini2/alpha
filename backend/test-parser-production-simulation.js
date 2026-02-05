/**
 * Production Parser Test - Simulates Live Website Tracking
 * 
 * Mimics the exact production flow:
 * 1. Connects to Helius WebSocket for real-time transaction notifications
 * 2. Fetches full transaction details from SHYFT REST API
 * 3. Tests both V1 and V2 parsers
 * 4. Generates comprehensive CSV reports with rejection reasons
 * 
 * This is exactly how the live website tracks whale transactions
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const mongoose = require('mongoose');
require('dotenv').config();

// Import parsers
delete require.cache[require.resolve('./dist/utils/shyftParserV2')];
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');
const { parseShyftTransaction } = require('./src/utils/shyftParser');

// Import models to fetch whale addresses
const whaleAllTransactionModelV2 = require('./src/models/whaleAllTransactionsV2.model').default;

// Configuration from environment
const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '';
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';
const WSS_URL = process.env.WSS_URL || ''; // Helius WebSocket URL

// Test configuration
const TEST_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const STATS_INTERVAL_MS = 30 * 1000; // Print stats every 30 seconds
const MAX_RECONNECT_ATTEMPTS = 5;

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
  protocolStats: {},
  tokenStats: {},
  whaleStats: {},
  directionStats: { BUY: 0, SELL: 0, SPLIT: 0 },
  startTime: Date.now(),
  endTime: null,
  lastTransactionTime: null,
  shyftApiCalls: 0,
  shyftApiErrors: 0
};

let ws = null;
let reconnectAttempts = 0;
let statsInterval = null;
let testTimeout = null;

/**
 * Connect to MongoDB and fetch whale addresses
 */
async function fetchWhaleAddresses() {
  console.log('\n🐋 Fetching whale addresses from database...');
  
  try {
    await mongoose.connect(MONGO_URI);
    console.log('   ✅ Connected to MongoDB');
    
    // Get unique whale addresses from transactions
    const whaleAddresses = await whaleAllTransactionModelV2.distinct('whale.address');
    
    console.log(`   ✅ Found ${whaleAddresses.length} unique whale addresses`);
    console.log(`   📊 Tracking ALL ${whaleAddresses.length} addresses (production simulation)`);
    
    return whaleAddresses;
  } catch (error) {
    console.error('   ❌ Error:', error.message);
    throw error;
  }
}

/**
 * Fetch transaction details from SHYFT REST API
 * This is exactly how the production system works
 */
async function fetchShyftTransaction(signature) {
  results.shyftApiCalls++;
  
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed`,
      {
        params: {
          network: 'mainnet-beta',
          txn_signature: signature,
        },
        headers: {
          'x-api-key': SHYFT_API_KEY,
        },
        timeout: 10000
      }
    );
    
    return response.data?.result || null;
  } catch (error) {
    results.shyftApiErrors++;
    
    if (error.response?.status === 429) {
      // Rate limited - wait and retry
      await new Promise(resolve => setTimeout(resolve, 1000));
      return fetchShyftTransaction(signature);
    }
    
    console.error(`   ⚠️  SHYFT API error: ${error.message}`);
    return null;
  }
}

/**
 * Test V2 parser with SHYFT data
 */
function testV2Parser(shyftData) {
  try {
    const v2Input = {
      signature: shyftData.signatures?.[0] || shyftData.signature || 'unknown',
      timestamp: shyftData.timestamp ? new Date(shyftData.timestamp).getTime() : Date.now(),
      status: shyftData.status || 'Success',
      fee: shyftData.fee || 0,
      fee_payer: shyftData.fee_payer || '',
      signers: shyftData.signers || [],
      protocol: shyftData.protocol,
      token_balance_changes: shyftData.token_balance_changes || [],
      actions: shyftData.actions || []
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
 * Test V1 parser with SHYFT data
 */
function testV1Parser(shyftData) {
  try {
    const result = parseShyftTransaction(shyftData);
    
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
function analyzeTransaction(signature, shyftData) {
  const protocol = shyftData.protocol?.name || 'Unknown';
  const whale = shyftData.fee_payer || 'unknown';
  
  results.lastTransactionTime = Date.now();
  
  // Test V2
  const v2Result = testV2Parser(shyftData);
  
  // Test V1
  const v1Result = testV1Parser(shyftData);
  
  // Build result object
  const result = {
    signature,
    whale,
    protocol,
    timestamp: shyftData.timestamp || new Date().toISOString(),
    txType: shyftData.type || 'UNKNOWN',
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
      results.directionStats.SPLIT++;
      result.v2Status = 'SPLIT';
      result.v2IsSplit = true;
      result.v2SplitSellQuote = v2Result.data.sellRecord.quoteAsset?.symbol || '';
      result.v2SplitBuyQuote = v2Result.data.buyRecord.quoteAsset?.symbol || '';
      
      // Track protocol stats
      const protocolName = v2Result.data.protocol || 'Unknown';
      results.protocolStats[protocolName] = (results.protocolStats[protocolName] || 0) + 1;
      
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
      
      // Track stats
      results.directionStats[result.v2Direction]++;
      const protocolName = v2Result.data.protocol || 'Unknown';
      results.protocolStats[protocolName] = (results.protocolStats[protocolName] || 0) + 1;
      const tokenSymbol = result.v2BaseAsset;
      results.tokenStats[tokenSymbol] = (results.tokenStats[tokenSymbol] || 0) + 1;
      results.whaleStats[whale] = (results.whaleStats[whale] || 0) + 1;
      
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
 * Handle incoming transaction from WebSocket
 */
async function handleTransaction(tx) {
  try {
    const signature = tx.signature;
    if (!signature) return;
    
    console.log(`\n[${results.transactions.length + 1}] ${signature.slice(0, 16)}...`);
    
    // Fetch full transaction details from SHYFT API (production flow)
    const shyftData = await fetchShyftTransaction(signature);
    
    if (!shyftData) {
      console.log('  ⚠️  Failed to fetch from SHYFT API');
      return;
    }
    
    // Analyze with both parsers
    analyzeTransaction(signature, shyftData);
    
  } catch (error) {
    console.error('  ❌ Error handling transaction:', error.message);
    results.v2Errors++;
  }
}

/**
 * Print live statistics
 */
function printStats() {
  const totalV2 = results.v2Accepted + results.v2Rejected + results.v2SplitSwaps;
  const totalV1 = results.v1Accepted + results.v1Rejected;
  const elapsedSec = (Date.now() - results.startTime) / 1000;
  const txPerMin = (results.transactions.length / elapsedSec) * 60;
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 LIVE STATISTICS');
  console.log('='.repeat(80));
  console.log(`⏱️  Elapsed Time: ${elapsedSec.toFixed(0)}s`);
  console.log(`📈 Total Transactions: ${results.transactions.length} (${txPerMin.toFixed(2)}/min)`);
  console.log(`🔌 SHYFT API Calls: ${results.shyftApiCalls} (${results.shyftApiErrors} errors)`);
  
  if (results.lastTransactionTime) {
    const timeSinceLastTx = (Date.now() - results.lastTransactionTime) / 1000;
    console.log(`🕐 Last Transaction: ${timeSinceLastTx.toFixed(0)}s ago`);
  }
  
  console.log('\n🟢 V2 Parser:');
  console.log(`   ✅ Accepted: ${results.v2Accepted} (${totalV2 > 0 ? ((results.v2Accepted / totalV2) * 100).toFixed(2) : 0}%)`);
  console.log(`   🔄 Split Swaps: ${results.v2SplitSwaps} (${totalV2 > 0 ? ((results.v2SplitSwaps / totalV2) * 100).toFixed(2) : 0}%)`);
  console.log(`   ❌ Rejected: ${results.v2Rejected} (${totalV2 > 0 ? ((results.v2Rejected / totalV2) * 100).toFixed(2) : 0}%)`);
  console.log(`   ⚠️  Errors: ${results.v2Errors}`);
  
  console.log('\n📊 Direction Stats:');
  console.log(`   📈 BUY: ${results.directionStats.BUY}`);
  console.log(`   📉 SELL: ${results.directionStats.SELL}`);
  console.log(`   🔄 SPLIT: ${results.directionStats.SPLIT}`);
  
  console.log('\n🔵 V1 Parser:');
  console.log(`   ✅ Accepted: ${results.v1Accepted} (${totalV1 > 0 ? ((results.v1Accepted / totalV1) * 100).toFixed(2) : 0}%)`);
  console.log(`   ❌ Rejected: ${results.v1Rejected} (${totalV1 > 0 ? ((results.v1Rejected / totalV1) * 100).toFixed(2) : 0}%)`);
  
  if (Object.keys(results.rejectionReasons).length > 0) {
    console.log('\n📋 Top Rejection Reasons:');
    Object.entries(results.rejectionReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([reason, count]) => {
        console.log(`   - ${reason}: ${count}`);
      });
  }
  
  if (Object.keys(results.protocolStats).length > 0) {
    console.log('\n🔧 Top Protocols:');
    Object.entries(results.protocolStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([protocol, count]) => {
        console.log(`   - ${protocol}: ${count}`);
      });
  }
  
  console.log('='.repeat(80) + '\n');
}

/**
 * Start stats display interval
 */
function startStatsDisplay() {
  statsInterval = setInterval(printStats, STATS_INTERVAL_MS);
}

/**
 * Generate CSV reports
 */
function generateCSVReports() {
  const timestamp = Date.now();
  const reportDir = path.join(__dirname, 'test-reports');
  
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  // 1. Detailed report
  const detailedCSV = [
    'Signature,Whale,Protocol,TX_Type,Timestamp,V2_Status,V2_Direction,V2_Quote,V2_Base,V2_Swap_Input,V2_Total_Cost,V2_Swap_Output,V2_Net_Received,V2_Base_Amount,V2_Rejection_Reason,V2_Processing_Ms,V2_Is_Split,V2_Split_Sell,V2_Split_Buy,V1_Status,V1_Direction,Agreement',
    ...results.transactions.map(r => 
      `"${r.signature}","${r.whale}","${r.protocol}","${r.txType}","${r.timestamp}","${r.v2Status}","${r.v2Direction}","${r.v2QuoteAsset}","${r.v2BaseAsset}","${r.v2SwapInputAmount}","${r.v2TotalWalletCost}","${r.v2SwapOutputAmount}","${r.v2NetWalletReceived}","${r.v2BaseAmount}","${r.v2RejectionReason}","${r.v2ProcessingTimeMs}","${r.v2IsSplit}","${r.v2SplitSellQuote}","${r.v2SplitBuyQuote}","${r.v1Status}","${r.v1Direction}","${r.agreement}"`
    )
  ].join('\n');
  
  fs.writeFileSync(path.join(reportDir, `production-detailed-${timestamp}.csv`), detailedCSV);
  
  // 2. Summary report
  const totalV2 = results.v2Accepted + results.v2Rejected + results.v2SplitSwaps;
  const totalV1 = results.v1Accepted + results.v1Rejected;
  const testDurationSec = (results.endTime - results.startTime) / 1000;
  
  const summaryCSV = [
    'Metric,Value,Percentage',
    `Test Duration (seconds),${testDurationSec.toFixed(2)},N/A`,
    `Total Transactions,${results.transactions.length},100%`,
    `SHYFT API Calls,${results.shyftApiCalls},N/A`,
    `SHYFT API Errors,${results.shyftApiErrors},N/A`,
    `V2 Accepted,${results.v2Accepted},${totalV2 > 0 ? ((results.v2Accepted / totalV2) * 100).toFixed(2) : 0}%`,
    `V2 Split Swaps,${results.v2SplitSwaps},${totalV2 > 0 ? ((results.v2SplitSwaps / totalV2) * 100).toFixed(2) : 0}%`,
    `V2 Rejected,${results.v2Rejected},${totalV2 > 0 ? ((results.v2Rejected / totalV2) * 100).toFixed(2) : 0}%`,
    `V2 Errors,${results.v2Errors},N/A`,
    `V2 BUY,${results.directionStats.BUY},N/A`,
    `V2 SELL,${results.directionStats.SELL},N/A`,
    `V2 SPLIT,${results.directionStats.SPLIT},N/A`,
    `V1 Accepted,${results.v1Accepted},${totalV1 > 0 ? ((results.v1Accepted / totalV1) * 100).toFixed(2) : 0}%`,
    `V1 Rejected,${results.v1Rejected},${totalV1 > 0 ? ((results.v1Rejected / totalV1) * 100).toFixed(2) : 0}%`
  ].join('\n');
  
  fs.writeFileSync(path.join(reportDir, `production-summary-${timestamp}.csv`), summaryCSV);
  
  // 3. Rejection reasons
  const rejectionCSV = [
    'Reason,Count,Percentage',
    ...Object.entries(results.rejectionReasons)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => 
        `"${reason}",${count},${results.v2Rejected > 0 ? ((count / results.v2Rejected) * 100).toFixed(2) : 0}%`
      )
  ].join('\n');
  
  fs.writeFileSync(path.join(reportDir, `production-rejection-reasons-${timestamp}.csv`), rejectionCSV);
  
  // 4. Protocol stats
  const protocolCSV = [
    'Protocol,Count,Percentage',
    ...Object.entries(results.protocolStats)
      .sort((a, b) => b[1] - a[1])
      .map(([protocol, count]) => 
        `"${protocol}",${count},${results.v2Accepted > 0 ? ((count / results.v2Accepted) * 100).toFixed(2) : 0}%`
      )
  ].join('\n');
  
  fs.writeFileSync(path.join(reportDir, `production-protocol-stats-${timestamp}.csv`), protocolCSV);
  
  // 5. Token stats
  const tokenCSV = [
    'Token,Count,Percentage',
    ...Object.entries(results.tokenStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50) // Top 50 tokens
      .map(([token, count]) => 
        `"${token}",${count},${results.v2Accepted > 0 ? ((count / results.v2Accepted) * 100).toFixed(2) : 0}%`
      )
  ].join('\n');
  
  fs.writeFileSync(path.join(reportDir, `production-token-stats-${timestamp}.csv`), tokenCSV);
  
  // 6. Whale stats
  const whaleCSV = [
    'Whale,Count,Percentage',
    ...Object.entries(results.whaleStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20) // Top 20 whales
      .map(([whale, count]) => 
        `"${whale}",${count},${results.v2Accepted > 0 ? ((count / results.v2Accepted) * 100).toFixed(2) : 0}%`
      )
  ].join('\n');
  
  fs.writeFileSync(path.join(reportDir, `production-whale-stats-${timestamp}.csv`), whaleCSV);
  
  console.log(`\n📊 Reports generated:`);
  console.log(`   📄 production-detailed-${timestamp}.csv`);
  console.log(`   📄 production-summary-${timestamp}.csv`);
  console.log(`   📄 production-rejection-reasons-${timestamp}.csv`);
  console.log(`   📄 production-protocol-stats-${timestamp}.csv`);
  console.log(`   📄 production-token-stats-${timestamp}.csv`);
  console.log(`   📄 production-whale-stats-${timestamp}.csv`);
  console.log(`\n📁 Location: ${reportDir}`);
}

/**
 * Connect to Helius WebSocket
 */
function connectWebSocket(whaleAddresses) {
  console.log('\n🔌 Connecting to Helius WebSocket...');
  console.log(`   URL: ${WSS_URL.split('?')[0]}...`);
  console.log(`   Tracking: ${whaleAddresses.length} whale addresses\n`);
  
  ws = new WebSocket(WSS_URL);
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected!');
    reconnectAttempts = 0;
    
    // Subscribe to whale addresses
    const subscribeMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'transactionSubscribe',
      params: [
        {
          accountInclude: whaleAddresses
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
    console.log(`📡 Subscribed to ${whaleAddresses.length} whale addresses`);
    console.log('⏳ Waiting for transactions...\n');
    
    // Start stats display
    startStatsDisplay();
    
    // Set test timeout
    testTimeout = setTimeout(() => {
      console.log('\n⏰ Test duration reached. Stopping...');
      stopTest();
    }, TEST_DURATION_MS);
  });
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.method === 'transactionNotification') {
        await handleTransaction(message.params.result);
      }
    } catch (error) {
      console.error('❌ Error processing message:', error.message);
      results.v2Errors++;
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });
  
  ws.on('close', () => {
    console.log('\n⚠️  WebSocket disconnected');
    
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && !results.endTime) {
      reconnectAttempts++;
      console.log(`🔄 Reconnecting... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
      setTimeout(() => connectWebSocket(whaleAddresses), 5000);
    } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('❌ Max reconnection attempts reached. Stopping test...');
      stopTest();
    }
  });
}

/**
 * Stop test and generate reports
 */
async function stopTest() {
  results.endTime = Date.now();
  
  // Clear intervals and timeouts
  if (statsInterval) clearInterval(statsInterval);
  if (testTimeout) clearTimeout(testTimeout);
  
  // Close WebSocket
  if (ws) {
    ws.close();
    ws = null;
  }
  
  // Print final stats
  printStats();
  
  // Generate reports
  generateCSVReports();
  
  // Disconnect from MongoDB
  await mongoose.disconnect();
  console.log('\n✅ Disconnected from MongoDB');
  
  console.log('\n✅ Test completed successfully!');
  process.exit(0);
}

/**
 * Main test function
 */
async function runProductionSimulation() {
  console.log('🚀 Starting Production Parser Test');
  console.log('='.repeat(80));
  console.log(`🔑 SHYFT API Key: ${SHYFT_API_KEY.slice(0, 8)}...`);
  console.log(`🔌 Helius WebSocket: ${WSS_URL.split('?')[0]}...`);
  console.log(`⏱️  Duration: ${TEST_DURATION_MS / 1000 / 60} minutes`);
  console.log(`📊 Stats Interval: ${STATS_INTERVAL_MS / 1000} seconds`);
  
  try {
    // Fetch whale addresses from database
    const whaleAddresses = await fetchWhaleAddresses();
    
    if (whaleAddresses.length === 0) {
      console.log('\n❌ No whale addresses found. Exiting.');
      await mongoose.disconnect();
      return;
    }
    
    // Connect to WebSocket
    connectWebSocket(whaleAddresses);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\n⚠️  Received SIGINT. Stopping test...');
      stopTest();
    });
    
    process.on('SIGTERM', () => {
      console.log('\n\n⚠️  Received SIGTERM. Stopping test...');
      stopTest();
    });
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the test
runProductionSimulation().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
