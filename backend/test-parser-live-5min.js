/**
 * 5-Minute Live Parser Test
 * 
 * Monitors live transactions from SHYFT API for 5 minutes
 * Tests V2 parser in real-time and generates CSV report
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Import parsers
const { parseShyftTransactionV2 } = require('./src/utils/shyftParserV2');
const { parseShyftTransaction } = require('./src/utils/shyftParser');

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || 'gUgMlxLLxJPXxvXx';
const TEST_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 10000; // Poll every 10 seconds

// Known active wallets to monitor
const MONITOR_WALLETS = [
  'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
  'C3TdUaDVdE74wYutyCkj7NRXqRfLgq2UFRZFab9MEUBs',
  'ruok2pybjpftuQ75qfzgHgebB91vSbCAK91dkButHdr',
  'CWaTfG6yzJPQRY5P53nQYHdHLjCJGxpC7EWo5wzGqs3n',
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1'
];

// Results storage
const results = {
  transactions: [],
  v2Accepted: [],
  v2Rejected: [],
  v2SplitSwaps: [],
  v2Errors: [],
  v1Accepted: [],
  v1Rejected: [],
  processedSignatures: new Set(),
  startTime: Date.now(),
  endTime: null
};

/**
 * Fetch latest transaction for a wallet
 */
async function fetchLatestTransaction(wallet) {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/history`,
      {
        params: {
          network: 'mainnet-beta',
          tx_num: 1,
          account: wallet,
          enable_raw: false
        },
        headers: {
          'x-api-key': SHYFT_API_KEY
        },
        timeout: 10000
      }
    );

    if (response.data && response.data.result && response.data.result.length > 0) {
      return response.data.result[0];
    }
    return null;
  } catch (error) {
    // Silently fail - API rate limits are expected
    return null;
  }
}

/**
 * Test transaction with both parsers
 */
function testTransaction(tx) {
  const signature = tx.signatures?.[0] || tx.signature || 'unknown';
  
  // Skip if already processed
  if (results.processedSignatures.has(signature)) {
    return null;
  }
  
  results.processedSignatures.add(signature);
  
  const result = {
    signature,
    timestamp: tx.timestamp || new Date().toISOString(),
    type: tx.type,
    protocol: tx.protocol?.name || 'Unknown',
    v2Status: 'UNKNOWN',
    v2Direction: null,
    v2QuoteSymbol: null,
    v2BaseSymbol: null,
    v2SwapInput: null,
    v2TotalCost: null,
    v2SwapOutput: null,
    v2NetReceived: null,
    v2RejectionReason: null,
    v2IsSplit: false,
    v2SplitSellSymbol: null,
    v2SplitBuySymbol: null,
    v1Status: 'UNKNOWN',
    v1Direction: null,
    agreement: 'UNKNOWN'
  };
  
  // Test V2 Parser
  try {
    const v2Input = {
      signature,
      timestamp: tx.timestamp ? new Date(tx.timestamp).getTime() : Date.now(),
      status: tx.status || 'Success',
      fee: tx.fee || 0,
      fee_payer: tx.fee_payer || '',
      signers: tx.signers || [],
      protocol: tx.protocol,
      token_balance_changes: tx.token_balance_changes || [],
      actions: tx.actions || []
    };

    const v2Result = parseShyftTransactionV2(v2Input);
    
    if (v2Result.success && v2Result.data) {
      if ('sellRecord' in v2Result.data) {
        // Split swap
        result.v2Status = 'SPLIT';
        result.v2IsSplit = true;
        result.v2SplitSellSymbol = v2Result.data.sellRecord.quoteAsset.symbol;
        result.v2SplitBuySymbol = v2Result.data.buyRecord.quoteAsset.symbol;
        results.v2SplitSwaps.push(result);
      } else {
        // Regular swap
        result.v2Status = 'ACCEPTED';
        result.v2Direction = v2Result.data.direction;
        result.v2QuoteSymbol = v2Result.data.quoteAsset.symbol;
        result.v2BaseSymbol = v2Result.data.baseAsset.symbol;
        
        if (v2Result.data.direction === 'BUY') {
          result.v2SwapInput = v2Result.data.amounts.swapInputAmount;
          result.v2TotalCost = v2Result.data.amounts.totalWalletCost;
        } else {
          result.v2SwapOutput = v2Result.data.amounts.swapOutputAmount;
          result.v2NetReceived = v2Result.data.amounts.netWalletReceived;
        }
        
        results.v2Accepted.push(result);
      }
    } else if (v2Result.erase) {
      result.v2Status = 'REJECTED';
      result.v2RejectionReason = v2Result.erase.reason;
      results.v2Rejected.push(result);
    }
  } catch (error) {
    result.v2Status = 'ERROR';
    result.v2RejectionReason = error.message;
    results.v2Errors.push(result);
  }
  
  // Test V1 Parser
  try {
    const v1Result = parseShyftTransaction(tx);
    
    if (v1Result && (v1Result.isBuy || v1Result.isSell)) {
      result.v1Status = 'ACCEPTED';
      result.v1Direction = v1Result.isBuy ? 'BUY' : 'SELL';
      results.v1Accepted.push(result);
    } else {
      result.v1Status = 'REJECTED';
      results.v1Rejected.push(result);
    }
  } catch (error) {
    result.v1Status = 'ERROR';
    results.v1Rejected.push(result);
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
  return result;
}

/**
 * Monitor transactions for specified duration
 */
async function monitorTransactions() {
  console.log('🚀 Starting 5-Minute Live Parser Test');
  console.log('=' .repeat(80));
  console.log(`⏱️  Duration: 5 minutes`);
  console.log(`📡 Monitoring ${MONITOR_WALLETS.length} wallets`);
  console.log(`🔄 Poll interval: ${POLL_INTERVAL_MS / 1000} seconds`);
  console.log('=' .repeat(80));
  
  const endTime = Date.now() + TEST_DURATION_MS;
  let pollCount = 0;
  
  while (Date.now() < endTime) {
    pollCount++;
    const remainingMs = endTime - Date.now();
    const remainingMin = Math.floor(remainingMs / 60000);
    const remainingSec = Math.floor((remainingMs % 60000) / 1000);
    
    console.log(`\n[Poll ${pollCount}] ⏰ Time remaining: ${remainingMin}m ${remainingSec}s`);
    console.log(`📊 Processed: ${results.transactions.length} transactions`);
    
    // Fetch latest transactions from all wallets
    const fetchPromises = MONITOR_WALLETS.map(wallet => fetchLatestTransaction(wallet));
    const transactions = await Promise.all(fetchPromises);
    
    // Process new transactions
    let newCount = 0;
    for (const tx of transactions) {
      if (tx) {
        const result = testTransaction(tx);
        if (result) {
          newCount++;
          console.log(`  ✅ New: ${result.signature.slice(0, 16)}... | V2: ${result.v2Status} | V1: ${result.v1Status}`);
        }
      }
    }
    
    if (newCount === 0) {
      console.log(`  ℹ️  No new transactions`);
    }
    
    // Wait before next poll
    if (Date.now() < endTime) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
  
  results.endTime = Date.now();
  console.log('\n' + '='.repeat(80));
  console.log('✅ Monitoring completed!');
  console.log('=' .repeat(80));
}

/**
 * Generate CSV reports
 */
function generateReports() {
  const timestamp = Date.now();
  const reportDir = path.join(__dirname, 'test-reports');
  
  // Create reports directory
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  // 1. Main Report - All Transactions
  const mainCSV = [
    'Signature,Timestamp,Type,Protocol,V2_Status,V2_Direction,V2_Quote,V2_Base,V2_SwapInput,V2_TotalCost,V2_SwapOutput,V2_NetReceived,V2_IsSplit,V2_SplitSell,V2_SplitBuy,V2_RejectionReason,V1_Status,V1_Direction,Agreement',
    ...results.transactions.map(r => 
      `${r.signature},${r.timestamp},${r.type || 'N/A'},${r.protocol},${r.v2Status},${r.v2Direction || ''},${r.v2QuoteSymbol || ''},${r.v2BaseSymbol || ''},${r.v2SwapInput || ''},${r.v2TotalCost || ''},${r.v2SwapOutput || ''},${r.v2NetReceived || ''},${r.v2IsSplit},${r.v2SplitSellSymbol || ''},${r.v2SplitBuySymbol || ''},${r.v2RejectionReason || ''},${r.v1Status},${r.v1Direction || ''},${r.agreement}`
    )
  ].join('\n');
  
  fs.writeFileSync(path.join(reportDir, `live-test-main-${timestamp}.csv`), mainCSV);
  
  // 2. Summary Report
  const totalV2 = results.v2Accepted.length + results.v2Rejected.length + results.v2SplitSwaps.length;
  const totalV1 = results.v1Accepted.length + results.v1Rejected.length;
  
  const summaryCSV = [
    'Metric,Count,Percentage',
    `Total Transactions,${results.transactions.length},100%`,
    `Test Duration (minutes),${((results.endTime - results.startTime) / 60000).toFixed(2)},N/A`,
    '',
    'V2 Parser Results,,',
    `V2 Accepted,${results.v2Accepted.length},${totalV2 > 0 ? ((results.v2Accepted.length / totalV2) * 100).toFixed(2) : 0}%`,
    `V2 Split Swaps,${results.v2SplitSwaps.length},${totalV2 > 0 ? ((results.v2SplitSwaps.length / totalV2) * 100).toFixed(2) : 0}%`,
    `V2 Rejected,${results.v2Rejected.length},${totalV2 > 0 ? ((results.v2Rejected.length / totalV2) * 100).toFixed(2) : 0}%`,
    `V2 Errors,${results.v2Errors.length},N/A`,
    '',
    'V1 Parser Results,,',
    `V1 Accepted,${results.v1Accepted.length},${totalV1 > 0 ? ((results.v1Accepted.length / totalV1) * 100).toFixed(2) : 0}%`,
    `V1 Rejected,${results.v1Rejected.length},${totalV1 > 0 ? ((results.v1Rejected.length / totalV1) * 100).toFixed(2) : 0}%`,
    '',
    'Agreement Analysis,,',
    `Both Accept,${results.transactions.filter(r => r.agreement === 'MATCH').length},${results.transactions.length > 0 ? ((results.transactions.filter(r => r.agreement === 'MATCH').length / results.transactions.length) * 100).toFixed(2) : 0}%`,
    `Both Reject,${results.transactions.filter(r => r.agreement === 'BOTH_REJECT').length},${results.transactions.length > 0 ? ((results.transactions.filter(r => r.agreement === 'BOTH_REJECT').length / results.transactions.length) * 100).toFixed(2) : 0}%`,
    `Disagree,${results.transactions.filter(r => r.agreement === 'DISAGREE').length},${results.transactions.length > 0 ? ((results.transactions.filter(r => r.agreement === 'DISAGREE').length / results.transactions.length) * 100).toFixed(2) : 0}%`,
    `V2 Split,${results.transactions.filter(r => r.agreement === 'V2_SPLIT').length},${results.transactions.length > 0 ? ((results.transactions.filter(r => r.agreement === 'V2_SPLIT').length / results.transactions.length) * 100).toFixed(2) : 0}%`
  ].join('\n');
  
  fs.writeFileSync(path.join(reportDir, `live-test-summary-${timestamp}.csv`), summaryCSV);
  
  // 3. Rejection Reasons Report
  const rejectionReasons = {};
  results.v2Rejected.forEach(r => {
    if (r.v2RejectionReason) {
      rejectionReasons[r.v2RejectionReason] = (rejectionReasons[r.v2RejectionReason] || 0) + 1;
    }
  });
  
  const rejectionCSV = [
    'Reason,Count,Percentage',
    ...Object.entries(rejectionReasons)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => 
        `${reason},${count},${results.v2Rejected.length > 0 ? ((count / results.v2Rejected.length) * 100).toFixed(2) : 0}%`
      )
  ].join('\n');
  
  fs.writeFileSync(path.join(reportDir, `live-test-rejections-${timestamp}.csv`), rejectionCSV);
  
  console.log(`\n📊 Reports generated:`);
  console.log(`   📄 live-test-main-${timestamp}.csv`);
  console.log(`   📄 live-test-summary-${timestamp}.csv`);
  console.log(`   📄 live-test-rejections-${timestamp}.csv`);
  console.log(`\n📁 Location: ${reportDir}`);
  
  return reportDir;
}

/**
 * Print summary
 */
function printSummary() {
  const totalV2 = results.v2Accepted.length + results.v2Rejected.length + results.v2SplitSwaps.length;
  const totalV1 = results.v1Accepted.length + results.v1Rejected.length;
  const durationMin = ((results.endTime - results.startTime) / 60000).toFixed(2);
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  
  console.log(`\n⏱️  Test Duration: ${durationMin} minutes`);
  console.log(`📈 Total Transactions: ${results.transactions.length}`);
  console.log(`📡 Unique Signatures: ${results.processedSignatures.size}`);
  
  console.log('\n🟢 V2 Parser:');
  console.log(`   ✅ Accepted: ${results.v2Accepted.length} (${totalV2 > 0 ? ((results.v2Accepted.length / totalV2) * 100).toFixed(1) : 0}%)`);
  console.log(`   🔄 Split Swaps: ${results.v2SplitSwaps.length} (${totalV2 > 0 ? ((results.v2SplitSwaps.length / totalV2) * 100).toFixed(1) : 0}%)`);
  console.log(`   ❌ Rejected: ${results.v2Rejected.length} (${totalV2 > 0 ? ((results.v2Rejected.length / totalV2) * 100).toFixed(1) : 0}%)`);
  console.log(`   ⚠️  Errors: ${results.v2Errors.length}`);
  
  console.log('\n🔵 V1 Parser:');
  console.log(`   ✅ Accepted: ${results.v1Accepted.length} (${totalV1 > 0 ? ((results.v1Accepted.length / totalV1) * 100).toFixed(1) : 0}%)`);
  console.log(`   ❌ Rejected: ${results.v1Rejected.length} (${totalV1 > 0 ? ((results.v1Rejected.length / totalV1) * 100).toFixed(1) : 0}%)`);
  
  console.log('\n🔀 Agreement:');
  const matches = results.transactions.filter(r => r.agreement === 'MATCH').length;
  const bothReject = results.transactions.filter(r => r.agreement === 'BOTH_REJECT').length;
  const disagree = results.transactions.filter(r => r.agreement === 'DISAGREE').length;
  const splits = results.transactions.filter(r => r.agreement === 'V2_SPLIT').length;
  
  console.log(`   ✅ Both Accept (Match): ${matches} (${results.transactions.length > 0 ? ((matches / results.transactions.length) * 100).toFixed(1) : 0}%)`);
  console.log(`   ❌ Both Reject: ${bothReject} (${results.transactions.length > 0 ? ((bothReject / results.transactions.length) * 100).toFixed(1) : 0}%)`);
  console.log(`   ⚠️  Disagree: ${disagree} (${results.transactions.length > 0 ? ((disagree / results.transactions.length) * 100).toFixed(1) : 0}%)`);
  console.log(`   🔄 V2 Split: ${splits} (${results.transactions.length > 0 ? ((splits / results.transactions.length) * 100).toFixed(1) : 0}%)`);
  
  if (results.v2Rejected.length > 0) {
    console.log('\n📋 Top Rejection Reasons:');
    const rejectionReasons = {};
    results.v2Rejected.forEach(r => {
      if (r.v2RejectionReason) {
        rejectionReasons[r.v2RejectionReason] = (rejectionReasons[r.v2RejectionReason] || 0) + 1;
      }
    });
    
    Object.entries(rejectionReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([reason, count]) => {
        console.log(`   - ${reason}: ${count} (${((count / results.v2Rejected.length) * 100).toFixed(1)}%)`);
      });
  }
  
  console.log('\n' + '='.repeat(80));
}

/**
 * Main function
 */
async function main() {
  try {
    await monitorTransactions();
    printSummary();
    generateReports();
    
    console.log('\n✅ Test completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
main();
