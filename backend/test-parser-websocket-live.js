/**
 * Live WebSocket Parser Test
 * 
 * Tracks whale transactions in real-time using SHYFT WebSocket API
 * Tests V2 parser with live data and generates comprehensive CSV reports
 * 
 * This mimics the production whale tracking system
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
require('dotenv').config();

// Import parsers
delete require.cache[require.resolve('./dist/utils/shyftParserV2')];
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');
const { parseShyftTransaction } = require('./src/utils/shyftParser');

// Configuration from environment
const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_';
const WSS_URL = process.env.WSS_URL || 'wss://rpc.shyft.to?api_key=' + SHYFT_API_KEY;

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
  startTime: Date.now(),
  endTime: null,
  lastTransactionTime: null
};

let ws = null;
let reconnectAttempts = 0;
let statsInterval = null;
let testTimeout = null;

/**
 * Fetch whale addresses from SHYFT API
 */
async function fetchWhaleAddresses() {
  console.log('\n🐋 Fetching whale addresses...');
  
  try {
    // Use a curated list of known whale addresses
    // These are high-volume traders on Solana
    const whaleAddresses = [
      'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
      'C3TdUaDVdE74wYutyCkj7NRXqRfLgq2UFRZFab9MEUBs',
      'ruok2pybjpftuQ75qfzgHgebB91vSbCAK91dkButHdr',
      'CWaTfG6yzJPQRY5P53nQYHdHLjCJGxpC7EWo5wzGqs3n',
      '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
      'HWEoBxYs7ssKuudEjzjmpfJVX7Dvi7wescFsVx2L5yoY',
      'GcAHvLu4gKzqPYD4VqQqQqQqQqQqQqQqQqQqQqQqQqQq',
      '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S',
      'A7WdJZqKqQqQqQqQqQqQqQqQqQqQqQqQqQqQqQqQqQqQ',
      'BQcdHdAQW1hczDbBi9hiegXAR7A98Q73v8T2afhUawHG'
    ];
    
    console.log(`   ✅ Using ${whaleAddresses.length} whale addresses for tracking`);
    return whaleAddresses;
  } catch (error) {
    console.error('   ❌ Error:', error.message);
    throw error;
  }
}

/**
 * Test V2 parser
 */
function testV2Parser(tx) {
  try {
    // Extract account keys from WebSocket format
    const accountKeys = tx.transaction?.message?.accountKeys || [];
    const feePayer = accountKeys.length > 0 ? accountKeys[0] : '';
    const signers = accountKeys.filter((key, idx) => {
      // In WebSocket format, signers are indicated by the signatures array length
      return idx < (tx.transaction?.signatures?.length || 0);
    });
    
    // Build token balance changes from pre/post token balances
    const tokenBalanceChanges = [];
    const postBalances = tx.meta?.postTokenBalances || [];
    const preBalances = tx.meta?.preTokenBalances || [];
    
    // Create a map of pre-balances by account index
    const preBalanceMap = new Map();
    preBalances.forEach(pre => {
      preBalanceMap.set(pre.accountIndex, pre);
    });
    
    // Process post-balances and calculate changes
    postBalances.forEach(post => {
      const pre = preBalanceMap.get(post.accountIndex);
      const postAmount = post.uiTokenAmount?.uiAmount || 0;
      const preAmount = pre?.uiTokenAmount?.uiAmount || 0;
      const changeAmount = postAmount - preAmount;
      
      // Only include if there's a meaningful change
      if (Math.abs(changeAmount) > 0.000001) {
        tokenBalanceChanges.push({
          mint: post.mint,
          owner: accountKeys[post.accountIndex] || '',
          address: accountKeys[post.accountIndex] || '',
          decimals: post.uiTokenAmount?.decimals || 9,
          change_amount: changeAmount,
          pre_balance: preAmount,
          post_balance: postAmount
        });
      }
    });
    
    const v2Input = {
      signature: tx.signature || 'unknown',
      timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
      status: tx.meta?.err ? 'Fail' : 'Success',
      fee: tx.meta?.fee || 0,
      fee_payer: feePayer,
      signers: signers,
      protocol: { name: 'WebSocket' },
      token_balance_changes: tokenBalanceChanges,
      actions: []
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
    // Extract account keys from WebSocket format
    const accountKeys = tx.transaction?.message?.accountKeys || [];
    const feePayer = accountKeys.length > 0 ? accountKeys[0] : '';
    const signers = accountKeys.filter((key, idx) => {
      return idx < (tx.transaction?.signatures?.length || 0);
    });
    
    // Build token balance changes
    const tokenBalanceChanges = [];
    const postBalances = tx.meta?.postTokenBalances || [];
    const preBalances = tx.meta?.preTokenBalances || [];
    
    const preBalanceMap = new Map();
    preBalances.forEach(pre => {
      preBalanceMap.set(pre.accountIndex, pre);
    });
    
    postBalances.forEach(post => {
      const pre = preBalanceMap.get(post.accountIndex);
      const postAmount = post.uiTokenAmount?.uiAmount || 0;
      const preAmount = pre?.uiTokenAmount?.uiAmount || 0;
      const changeAmount = postAmount - preAmount;
      
      if (Math.abs(changeAmount) > 0.000001) {
        tokenBalanceChanges.push({
          mint: post.mint,
          owner: accountKeys[post.accountIndex] || '',
          decimals: post.uiTokenAmount?.decimals || 9,
          change_amount: changeAmount
        });
      }
    });
    
    // Convert to SHYFT REST API format
    const shyftFormat = {
      signature: tx.signature,
      timestamp: tx.blockTime,
      status: tx.meta?.err ? 'Fail' : 'Success',
      fee: tx.meta?.fee || 0,
      fee_payer: feePayer,
      signers: signers,
      token_balance_changes: tokenBalanceChanges
    };
    
    const result = parseShyftTransaction(shyftFormat);
    
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
function analyzeTransaction(tx) {
  const signature = tx.signature || 'unknown';
  const protocol = 'WebSocket';
  const accountKeys = tx.transaction?.message?.accountKeys || [];
  const whale = accountKeys.length > 0 ? accountKeys[0] : 'unknown';
  
  results.lastTransactionTime = Date.now();
  
  // Test V2
  const v2Result = testV2Parser(tx);
  
  // Test V1
  const v1Result = testV1Parser(tx);
  
  // Build result object
  const result = {
    signature,
    whale,
    protocol,
    timestamp: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : new Date().toISOString(),
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
      
      // Track protocol stats
      const protocolName = v2Result.data.protocol || 'Unknown';
      results.protocolStats[protocolName] = (results.protocolStats[protocolName] || 0) + 1;
      
      // Track token stats
      const tokenSymbol = result.v2BaseAsset;
      results.tokenStats[tokenSymbol] = (results.tokenStats[tokenSymbol] || 0) + 1;
      
      // Track whale stats
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
 * Handle incoming transaction
 */
async function handleTransaction(txData) {
  try {
    const signature = txData.transaction?.signatures?.[0] || 'unknown';
    
    console.log(`\n[${results.transactions.length + 1}] ${signature.slice(0, 16)}...`);
    
    analyzeTransaction(txData);
    
  } catch (error) {
    console.error('❌ Error handling transaction:', error.message);
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
  
  if (results.lastTransactionTime) {
    const timeSinceLastTx = (Date.now() - results.lastTransactionTime) / 1000;
    console.log(`🕐 Last Transaction: ${timeSinceLastTx.toFixed(0)}s ago`);
  }
  
  console.log('\n🟢 V2 Parser:');
  console.log(`   ✅ Accepted: ${results.v2Accepted} (${totalV2 > 0 ? ((results.v2Accepted / totalV2) * 100).toFixed(2) : 0}%)`);
  console.log(`   🔄 Split Swaps: ${results.v2SplitSwaps} (${totalV2 > 0 ? ((results.v2SplitSwaps / totalV2) * 100).toFixed(2) : 0}%)`);
  console.log(`   ❌ Rejected: ${results.v2Rejected} (${totalV2 > 0 ? ((results.v2Rejected / totalV2) * 100).toFixed(2) : 0}%)`);
  console.log(`   ⚠️  Errors: ${results.v2Errors}`);
  
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
    'Signature,Whale,Protocol,Timestamp,V2_Status,V2_Direction,V2_Quote,V2_Base,V2_Swap_Input,V2_Total_Cost,V2_Swap_Output,V2_Net_Received,V2_Base_Amount,V2_Rejection_Reason,V2_Processing_Ms,V2_Is_Split,V2_Split_Sell,V2_Split_Buy,V1_Status,V1_Direction,Agreement',
    ...results.transactions.map(r => 
      `"${r.signature}","${r.whale}","${r.protocol}","${r.timestamp}","${r.v2Status}","${r.v2Direction}","${r.v2QuoteAsset}","${r.v2BaseAsset}","${r.v2SwapInputAmount}","${r.v2TotalWalletCost}","${r.v2SwapOutputAmount}","${r.v2NetWalletReceived}","${r.v2BaseAmount}","${r.v2RejectionReason}","${r.v2ProcessingTimeMs}","${r.v2IsSplit}","${r.v2SplitSellQuote}","${r.v2SplitBuyQuote}","${r.v1Status}","${r.v1Direction}","${r.agreement}"`
    )
  ].join('\n');
  
  fs.writeFileSync(path.join(reportDir, `websocket-detailed-${timestamp}.csv`), detailedCSV);
  
  // 2. Summary report
  const totalV2 = results.v2Accepted + results.v2Rejected + results.v2SplitSwaps;
  const totalV1 = results.v1Accepted + results.v1Rejected;
  const testDurationSec = (results.endTime - results.startTime) / 1000;
  
  const summaryCSV = [
    'Metric,Value,Percentage',
    `Test Duration (seconds),${testDurationSec.toFixed(2)},N/A`,
    `Total Transactions,${results.transactions.length},100%`,
    `V2 Accepted,${results.v2Accepted},${totalV2 > 0 ? ((results.v2Accepted / totalV2) * 100).toFixed(2) : 0}%`,
    `V2 Split Swaps,${results.v2SplitSwaps},${totalV2 > 0 ? ((results.v2SplitSwaps / totalV2) * 100).toFixed(2) : 0}%`,
    `V2 Rejected,${results.v2Rejected},${totalV2 > 0 ? ((results.v2Rejected / totalV2) * 100).toFixed(2) : 0}%`,
    `V2 Errors,${results.v2Errors},N/A`,
    `V1 Accepted,${results.v1Accepted},${totalV1 > 0 ? ((results.v1Accepted / totalV1) * 100).toFixed(2) : 0}%`,
    `V1 Rejected,${results.v1Rejected},${totalV1 > 0 ? ((results.v1Rejected / totalV1) * 100).toFixed(2) : 0}%`
  ].join('\n');
  
  fs.writeFileSync(path.join(reportDir, `websocket-summary-${timestamp}.csv`), summaryCSV);
  
  // 3. Rejection reasons
  const rejectionCSV = [
    'Reason,Count,Percentage',
    ...Object.entries(results.rejectionReasons)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => 
        `"${reason}",${count},${results.v2Rejected > 0 ? ((count / results.v2Rejected) * 100).toFixed(2) : 0}%`
      )
  ].join('\n');
  
  fs.writeFileSync(path.join(reportDir, `websocket-rejection-reasons-${timestamp}.csv`), rejectionCSV);
  
  // 4. Protocol stats
  const protocolCSV = [
    'Protocol,Count,Percentage',
    ...Object.entries(results.protocolStats)
      .sort((a, b) => b[1] - a[1])
      .map(([protocol, count]) => 
        `"${protocol}",${count},${results.v2Accepted > 0 ? ((count / results.v2Accepted) * 100).toFixed(2) : 0}%`
      )
  ].join('\n');
  
  fs.writeFileSync(path.join(reportDir, `websocket-protocol-stats-${timestamp}.csv`), protocolCSV);
  
  // 5. Token stats
  const tokenCSV = [
    'Token,Count,Percentage',
    ...Object.entries(results.tokenStats)
      .sort((a, b) => b[1] - a[1])
      .map(([token, count]) => 
        `"${token}",${count},${results.v2Accepted > 0 ? ((count / results.v2Accepted) * 100).toFixed(2) : 0}%`
      )
  ].join('\n');
  
  fs.writeFileSync(path.join(reportDir, `websocket-token-stats-${timestamp}.csv`), tokenCSV);
  
  // 6. Whale stats
  const whaleCSV = [
    'Whale,Count,Percentage',
    ...Object.entries(results.whaleStats)
      .sort((a, b) => b[1] - a[1])
      .map(([whale, count]) => 
        `"${whale}",${count},${results.v2Accepted > 0 ? ((count / results.v2Accepted) * 100).toFixed(2) : 0}%`
      )
  ].join('\n');
  
  fs.writeFileSync(path.join(reportDir, `websocket-whale-stats-${timestamp}.csv`), whaleCSV);
  
  console.log(`\n📊 Reports generated:`);
  console.log(`   📄 websocket-detailed-${timestamp}.csv`);
  console.log(`   📄 websocket-summary-${timestamp}.csv`);
  console.log(`   📄 websocket-rejection-reasons-${timestamp}.csv`);
  console.log(`   📄 websocket-protocol-stats-${timestamp}.csv`);
  console.log(`   📄 websocket-token-stats-${timestamp}.csv`);
  console.log(`   📄 websocket-whale-stats-${timestamp}.csv`);
  console.log(`\n📁 Location: ${reportDir}`);
}

/**
 * Connect to WebSocket
 */
function connectWebSocket(whaleAddresses) {
  console.log('\n🔌 Connecting to SHYFT WebSocket...');
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
function stopTest() {
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
  
  console.log('\n✅ Test completed successfully!');
  process.exit(0);
}

/**
 * Main test function
 */
async function runWebSocketTest() {
  console.log('🚀 Starting Live WebSocket Parser Test');
  console.log('='.repeat(80));
  console.log(`🔑 SHYFT API Key: ${SHYFT_API_KEY.slice(0, 8)}...`);
  console.log(`⏱️  Duration: ${TEST_DURATION_MS / 1000 / 60} minutes`);
  console.log(`📊 Stats Interval: ${STATS_INTERVAL_MS / 1000} seconds`);
  
  try {
    // Fetch whale addresses
    const whaleAddresses = await fetchWhaleAddresses();
    
    if (whaleAddresses.length === 0) {
      console.log('\n❌ No whale addresses found. Exiting.');
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
    process.exit(1);
  }
}

// Run the test
runWebSocketTest().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
