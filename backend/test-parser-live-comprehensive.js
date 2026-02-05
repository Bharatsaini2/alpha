/**
 * Comprehensive Live Parser Test
 * 
 * Tests V2 parser with live SHYFT API data and generates detailed CSV report
 * 
 * Report includes:
 * 1. Detection rate (accepted vs rejected)
 * 2. Rejection reasons breakdown
 * 3. V1 vs V2 comparison
 * 4. Split swap handling verification
 * 5. Amount calculation verification
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Import parsers
const { parseShyftTransactionV2 } = require('./src/utils/shyftParserV2');
const { parseShyftTransaction } = require('./src/utils/shyftParser');

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || 'gUgMlxLLxJPXxvXx';
const TEST_SAMPLE_SIZE = 100; // Number of transactions to test

// Test configuration
const TEST_WALLETS = [
  'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S', // Known whale
  'C3TdUaDVdE74wYutyCkj7NRXqRfLgq2UFRZFab9MEUBs', // Known whale
  'ruok2pybjpftuQ75qfzgHgebB91vSbCAK91dkButHdr', // Known whale
];

// Results storage
const results = {
  v2: {
    accepted: [],
    rejected: [],
    splitSwaps: [],
    errors: []
  },
  v1: {
    accepted: [],
    rejected: [],
    errors: []
  },
  comparison: []
};

/**
 * Fetch recent transactions from SHYFT API
 */
async function fetchRecentTransactions(wallet, limit = 50) {
  try {
    console.log(`\n📡 Fetching transactions for ${wallet.slice(0, 8)}...`);
    
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/history`,
      {
        params: {
          network: 'mainnet-beta',
          tx_num: limit,
          account: wallet,
          enable_raw: false
        },
        headers: {
          'x-api-key': SHYFT_API_KEY
        },
        timeout: 30000
      }
    );

    if (response.data && response.data.result) {
      console.log(`✅ Fetched ${response.data.result.length} transactions`);
      return response.data.result;
    }

    return [];
  } catch (error) {
    console.error(`❌ Error fetching transactions: ${error.message}`);
    return [];
  }
}

/**
 * Test V2 parser with a transaction
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
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Test V1 parser with a transaction
 */
function testV1Parser(tx) {
  try {
    const v1Input = {
      type: tx.type,
      status: tx.status,
      actions: tx.actions || [],
      events: tx.events || {},
      fee: tx.fee || 0,
      fee_payer: tx.fee_payer,
      signers: tx.signers || [],
      signatures: tx.signatures || [],
      protocol: tx.protocol,
      timestamp: tx.timestamp,
      token_balance_changes: tx.token_balance_changes || []
    };

    const result = parseShyftTransaction(v1Input);
    
    return {
      success: !!result,
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
 * Analyze a single transaction
 */
function analyzeTransaction(tx, index) {
  const signature = tx.signatures?.[0] || tx.signature || `tx_${index}`;
  
  console.log(`\n[${index + 1}] Testing: ${signature.slice(0, 16)}...`);
  
  // Test V2
  const v2Result = testV2Parser(tx);
  
  // Test V1
  const v1Result = testV1Parser(tx);
  
  // Categorize V2 result
  if (v2Result.success && v2Result.data) {
    if ('sellRecord' in v2Result.data) {
      // Split swap
      results.v2.splitSwaps.push({
        signature,
        type: tx.type,
        protocol: tx.protocol?.name,
        sellRecord: v2Result.data.sellRecord,
        buyRecord: v2Result.data.buyRecord,
        processingTimeMs: v2Result.processingTimeMs
      });
      console.log(`  ✅ V2: SPLIT SWAP (SELL + BUY)`);
    } else {
      // Regular swap
      results.v2.accepted.push({
        signature,
        type: tx.type,
        protocol: tx.protocol?.name,
        direction: v2Result.data.direction,
        quoteAsset: v2Result.data.quoteAsset,
        baseAsset: v2Result.data.baseAsset,
        amounts: v2Result.data.amounts,
        processingTimeMs: v2Result.processingTimeMs
      });
      console.log(`  ✅ V2: ${v2Result.data.direction}`);
    }
  } else if (v2Result.erase) {
    // Rejected
    results.v2.rejected.push({
      signature,
      type: tx.type,
      protocol: tx.protocol?.name,
      reason: v2Result.erase.reason,
      metadata: v2Result.erase.metadata
    });
    console.log(`  ❌ V2: REJECTED (${v2Result.erase.reason})`);
  } else if (v2Result.error) {
    // Error
    results.v2.errors.push({
      signature,
      error: v2Result.error
    });
    console.log(`  ⚠️  V2: ERROR (${v2Result.error})`);
  }
  
  // Categorize V1 result
  if (v1Result.success && v1Result.data) {
    const direction = v1Result.isBuy ? 'BUY' : v1Result.isSell ? 'SELL' : 'UNKNOWN';
    results.v1.accepted.push({
      signature,
      direction,
      data: v1Result.data
    });
    console.log(`  ✅ V1: ${direction}`);
  } else {
    results.v1.rejected.push({
      signature,
      reason: v1Result.error || 'unknown'
    });
    console.log(`  ❌ V1: REJECTED`);
  }
  
  // Compare V1 vs V2
  const v2Accepted = v2Result.success && v2Result.data;
  const v1Accepted = v1Result.success && v1Result.data;
  
  let agreement = 'DISAGREE';
  if (v2Accepted && v1Accepted) {
    agreement = 'BOTH_ACCEPT';
  } else if (!v2Accepted && !v1Accepted) {
    agreement = 'BOTH_REJECT';
  }
  
  results.comparison.push({
    signature,
    type: tx.type,
    protocol: tx.protocol?.name,
    v2Status: v2Accepted ? 'ACCEPT' : 'REJECT',
    v1Status: v1Accepted ? 'ACCEPT' : 'REJECT',
    agreement,
    v2Reason: v2Result.erase?.reason || 'N/A',
    v1Reason: v1Result.error || 'N/A'
  });
}

/**
 * Generate CSV report
 */
function generateCSVReport() {
  const timestamp = Date.now();
  const reportDir = path.join(__dirname, 'test-reports');
  
  // Create reports directory if it doesn't exist
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  // 1. Detection Report
  const detectionCSV = [
    'Category,Count,Percentage',
    `V2 Accepted,${results.v2.accepted.length},${((results.v2.accepted.length / (results.v2.accepted.length + results.v2.rejected.length + results.v2.splitSwaps.length)) * 100).toFixed(2)}%`,
    `V2 Split Swaps,${results.v2.splitSwaps.length},${((results.v2.splitSwaps.length / (results.v2.accepted.length + results.v2.rejected.length + results.v2.splitSwaps.length)) * 100).toFixed(2)}%`,
    `V2 Rejected,${results.v2.rejected.length},${((results.v2.rejected.length / (results.v2.accepted.length + results.v2.rejected.length + results.v2.splitSwaps.length)) * 100).toFixed(2)}%`,
    `V2 Errors,${results.v2.errors.length},N/A`,
    `V1 Accepted,${results.v1.accepted.length},${((results.v1.accepted.length / (results.v1.accepted.length + results.v1.rejected.length)) * 100).toFixed(2)}%`,
    `V1 Rejected,${results.v1.rejected.length},${((results.v1.rejected.length / (results.v1.accepted.length + results.v1.rejected.length)) * 100).toFixed(2)}%`
  ].join('\n');
  
  fs.writeFileSync(
    path.join(reportDir, `detection-summary-${timestamp}.csv`),
    detectionCSV
  );
  
  // 2. Rejection Reasons Report
  const rejectionReasons = {};
  results.v2.rejected.forEach(r => {
    rejectionReasons[r.reason] = (rejectionReasons[r.reason] || 0) + 1;
  });
  
  const rejectionCSV = [
    'Reason,Count,Percentage',
    ...Object.entries(rejectionReasons).map(([reason, count]) => 
      `${reason},${count},${((count / results.v2.rejected.length) * 100).toFixed(2)}%`
    )
  ].join('\n');
  
  fs.writeFileSync(
    path.join(reportDir, `rejection-reasons-${timestamp}.csv`),
    rejectionCSV
  );
  
  // 3. V1 vs V2 Comparison Report
  const comparisonCSV = [
    'Signature,Type,Protocol,V2_Status,V1_Status,Agreement,V2_Reason,V1_Reason',
    ...results.comparison.map(c => 
      `${c.signature},${c.type || 'N/A'},${c.protocol || 'N/A'},${c.v2Status},${c.v1Status},${c.agreement},${c.v2Reason},${c.v1Reason}`
    )
  ].join('\n');
  
  fs.writeFileSync(
    path.join(reportDir, `v1-v2-comparison-${timestamp}.csv`),
    comparisonCSV
  );
  
  // 4. Detailed Accepted Transactions Report
  const acceptedCSV = [
    'Signature,Type,Protocol,Direction,Quote_Asset,Base_Asset,Swap_Input_Amount,Total_Wallet_Cost,Swap_Output_Amount,Net_Wallet_Received,Base_Amount,Processing_Time_Ms',
    ...results.v2.accepted.map(a => {
      const amounts = a.amounts || {};
      return `${a.signature},${a.type || 'N/A'},${a.protocol || 'N/A'},${a.direction},${a.quoteAsset?.symbol || 'N/A'},${a.baseAsset?.symbol || 'N/A'},${amounts.swapInputAmount || 'N/A'},${amounts.totalWalletCost || 'N/A'},${amounts.swapOutputAmount || 'N/A'},${amounts.netWalletReceived || 'N/A'},${amounts.baseAmount || 'N/A'},${a.processingTimeMs || 'N/A'}`;
    })
  ].join('\n');
  
  fs.writeFileSync(
    path.join(reportDir, `accepted-transactions-${timestamp}.csv`),
    acceptedCSV
  );
  
  // 5. Split Swaps Report
  const splitSwapsCSV = [
    'Signature,Type,Protocol,Sell_Quote,Sell_Base,Sell_Amount,Buy_Quote,Buy_Base,Buy_Amount,Processing_Time_Ms',
    ...results.v2.splitSwaps.map(s => {
      const sell = s.sellRecord || {};
      const buy = s.buyRecord || {};
      return `${s.signature},${s.type || 'N/A'},${s.protocol || 'N/A'},${sell.quoteAsset?.symbol || 'N/A'},${sell.baseAsset?.symbol || 'N/A'},${sell.amounts?.swapOutputAmount || 'N/A'},${buy.quoteAsset?.symbol || 'N/A'},${buy.baseAsset?.symbol || 'N/A'},${buy.amounts?.swapInputAmount || 'N/A'},${s.processingTimeMs || 'N/A'}`;
    })
  ].join('\n');
  
  fs.writeFileSync(
    path.join(reportDir, `split-swaps-${timestamp}.csv`),
    splitSwapsCSV
  );
  
  console.log(`\n📊 Reports generated in: ${reportDir}`);
  console.log(`   - detection-summary-${timestamp}.csv`);
  console.log(`   - rejection-reasons-${timestamp}.csv`);
  console.log(`   - v1-v2-comparison-${timestamp}.csv`);
  console.log(`   - accepted-transactions-${timestamp}.csv`);
  console.log(`   - split-swaps-${timestamp}.csv`);
  
  return reportDir;
}

/**
 * Print summary statistics
 */
function printSummary() {
  const totalV2 = results.v2.accepted.length + results.v2.rejected.length + results.v2.splitSwaps.length;
  const totalV1 = results.v1.accepted.length + results.v1.rejected.length;
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  
  console.log('\n🔵 V2 Parser Results:');
  console.log(`   ✅ Accepted: ${results.v2.accepted.length} (${((results.v2.accepted.length / totalV2) * 100).toFixed(2)}%)`);
  console.log(`   🔄 Split Swaps: ${results.v2.splitSwaps.length} (${((results.v2.splitSwaps.length / totalV2) * 100).toFixed(2)}%)`);
  console.log(`   ❌ Rejected: ${results.v2.rejected.length} (${((results.v2.rejected.length / totalV2) * 100).toFixed(2)}%)`);
  console.log(`   ⚠️  Errors: ${results.v2.errors.length}`);
  
  console.log('\n🔴 V1 Parser Results:');
  console.log(`   ✅ Accepted: ${results.v1.accepted.length} (${((results.v1.accepted.length / totalV1) * 100).toFixed(2)}%)`);
  console.log(`   ❌ Rejected: ${results.v1.rejected.length} (${((results.v1.rejected.length / totalV1) * 100).toFixed(2)}%)`);
  
  console.log('\n🔀 V1 vs V2 Comparison:');
  const bothAccept = results.comparison.filter(c => c.agreement === 'BOTH_ACCEPT').length;
  const bothReject = results.comparison.filter(c => c.agreement === 'BOTH_REJECT').length;
  const disagree = results.comparison.filter(c => c.agreement === 'DISAGREE').length;
  
  console.log(`   ✅ Both Accept: ${bothAccept} (${((bothAccept / results.comparison.length) * 100).toFixed(2)}%)`);
  console.log(`   ❌ Both Reject: ${bothReject} (${((bothReject / results.comparison.length) * 100).toFixed(2)}%)`);
  console.log(`   ⚠️  Disagree: ${disagree} (${((disagree / results.comparison.length) * 100).toFixed(2)}%)`);
  
  console.log('\n📋 Top Rejection Reasons (V2):');
  const rejectionReasons = {};
  results.v2.rejected.forEach(r => {
    rejectionReasons[r.reason] = (rejectionReasons[r.reason] || 0) + 1;
  });
  
  Object.entries(rejectionReasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([reason, count]) => {
      console.log(`   - ${reason}: ${count} (${((count / results.v2.rejected.length) * 100).toFixed(2)}%)`);
    });
  
  console.log('\n' + '='.repeat(80));
}

/**
 * Main test function
 */
async function runComprehensiveTest() {
  console.log('🚀 Starting Comprehensive Parser Test');
  console.log(`📊 Sample Size: ${TEST_SAMPLE_SIZE} transactions`);
  console.log(`🔑 SHYFT API Key: ${SHYFT_API_KEY.slice(0, 8)}...`);
  
  let allTransactions = [];
  
  // Fetch transactions from multiple wallets
  for (const wallet of TEST_WALLETS) {
    const txs = await fetchRecentTransactions(wallet, Math.ceil(TEST_SAMPLE_SIZE / TEST_WALLETS.length));
    allTransactions = allTransactions.concat(txs);
    
    if (allTransactions.length >= TEST_SAMPLE_SIZE) {
      break;
    }
  }
  
  // Limit to sample size
  allTransactions = allTransactions.slice(0, TEST_SAMPLE_SIZE);
  
  console.log(`\n✅ Total transactions fetched: ${allTransactions.length}`);
  console.log('\n' + '='.repeat(80));
  console.log('🔍 ANALYZING TRANSACTIONS');
  console.log('='.repeat(80));
  
  // Analyze each transaction
  allTransactions.forEach((tx, index) => {
    analyzeTransaction(tx, index);
  });
  
  // Print summary
  printSummary();
  
  // Generate CSV reports
  const reportDir = generateCSVReport();
  
  console.log('\n✅ Test completed successfully!');
  console.log(`📁 Reports saved to: ${reportDir}`);
}

// Run the test
runComprehensiveTest().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
