/**
 * Comprehensive Live Parser Test
 * 
 * Fetches whale addresses from database and tests live transactions from SHYFT API
 * Tests V2 parser with real-world data and generates detailed reports
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Import parsers
delete require.cache[require.resolve('./dist/utils/shyftParserV2')];
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');
const { parseShyftTransaction } = require('./src/utils/shyftParser');

// Import models
const WhalesAddressModel = require('./src/models/solana-tokens-whales').default;
const whaleAllTransactionModelV2 = require('./src/models/whaleAllTransactionsV2.model').default;

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_';
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

// Test configuration
const MAX_WHALE_ADDRESSES = 100; // Test with 100 whale addresses
const TRANSACTIONS_PER_WHALE = 10; // Fetch 10 recent transactions per whale
const BATCH_SIZE = 10; // Process 10 whales at a time to avoid rate limiting

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
  whaleAddresses: [],
  startTime: Date.now(),
  endTime: null
};

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    throw error;
  }
}

/**
 * Fetch whale addresses from database
 */
async function fetchWhaleAddresses() {
  console.log('\n🐋 Fetching whale addresses from database...');
  
  try {
    // Get unique whale addresses from transactions
    const whaleAddresses = await whaleAllTransactionModelV2.distinct('whale.address');
    
    console.log(`   ✅ Found ${whaleAddresses.length} unique whale addresses`);
    
    // Limit to MAX_WHALE_ADDRESSES for testing
    const selectedAddresses = whaleAddresses.slice(0, MAX_WHALE_ADDRESSES);
    console.log(`   📊 Selected ${selectedAddresses.length} addresses for testing`);
    
    return selectedAddresses;
  } catch (error) {
    console.error('   ❌ Error fetching whale addresses:', error.message);
    throw error;
  }
}

/**
 * Fetch recent transactions for a whale address
 */
async function fetchTransactionsForWhale(whaleAddress) {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/history`,
      {
        params: {
          network: 'mainnet-beta',
          tx_num: TRANSACTIONS_PER_WHALE,
          account: whaleAddress,
          enable_raw: false
        },
        headers: {
          'x-api-key': SHYFT_API_KEY
        },
        timeout: 15000
      }
    );

    if (response.data && response.data.result) {
      return response.data.result;
    }
    
    return [];
  } catch (error) {
    if (error.response?.status === 429) {
      console.log(`   ⏳ Rate limited, waiting 2 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return fetchTransactionsForWhale(whaleAddress); // Retry
    }
    console.error(`   ❌ Error fetching transactions: ${error.message}`);
    return [];
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
function analyzeTransaction(tx, whaleAddress) {
  const signature = tx.signatures?.[0] || tx.signature || 'unknown';
  const txType = tx.type || 'UNKNOWN';
  const protocol = tx.protocol?.name || 'Unknown';
  
  // Test V2
  const v2Result = testV2Parser(tx);
  
  // Test V1
  const v1Result = testV1Parser(tx);
  
  // Build result object
  const result = {
    signature,
    whaleAddress,
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
    }
  } else if (v2Result.erase) {
    // Rejected
    results.v2Rejected++;
    result.v2Status = 'REJECTED';
    result.v2RejectionReason = v2Result.erase.reason;
    
    // Track rejection reasons
    results.rejectionReasons[result.v2RejectionReason] = 
      (results.rejectionReasons[result.v2RejectionReason] || 0) + 1;
  } else if (v2Result.error) {
    // Error
    results.v2Errors++;
    result.v2Status = 'ERROR';
    result.v2RejectionReason = v2Result.error;
  }
  
  // Process V1 result
  if (v1Result.success && v1Result.data) {
    results.v1Accepted++;
    result.v1Status = 'ACCEPTED';
    result.v1Direction = v1Result.isBuy ? 'BUY' : v1Result.isSell ? 'SELL' : 'UNKNOWN';
  } else {
    results.v1Rejected++;
    result.v1Status = 'REJECTED';
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
    'Signature,Whale_Address,TX_Type,Protocol,Timestamp,V2_Status,V2_Direction,V2_Quote,V2_Base,V2_Swap_Input,V2_Total_Cost,V2_Swap_Output,V2_Net_Received,V2_Base_Amount,V2_Rejection_Reason,V2_Processing_Ms,V2_Is_Split,V2_Split_Sell,V2_Split_Buy,V1_Status,V1_Direction,Agreement',
    ...results.transactions.map(r => 
      `"${r.signature}","${r.whaleAddress}","${r.txType}","${r.protocol}","${r.timestamp}","${r.v2Status}","${r.v2Direction}","${r.v2QuoteAsset}","${r.v2BaseAsset}","${r.v2SwapInputAmount}","${r.v2TotalWalletCost}","${r.v2SwapOutputAmount}","${r.v2NetWalletReceived}","${r.v2BaseAmount}","${r.v2RejectionReason}","${r.v2ProcessingTimeMs}","${r.v2IsSplit}","${r.v2SplitSellQuote}","${r.v2SplitBuyQuote}","${r.v1Status}","${r.v1Direction}","${r.agreement}"`
    )
  ].join('\n');
  
  fs.writeFileSync(
    path.join(reportDir, `comprehensive-detailed-${timestamp}.csv`),
    detailedCSV
  );
  
  // 2. Summary report
  const totalV2 = results.v2Accepted + results.v2Rejected + results.v2SplitSwaps;
  const totalV1 = results.v1Accepted + results.v1Rejected;
  const testDurationSec = (results.endTime - results.startTime) / 1000;
  
  const summaryCSV = [
    'Metric,Value,Percentage',
    `Test Duration (seconds),${testDurationSec.toFixed(2)},N/A`,
    `Total Transactions,${results.transactions.length},100%`,
    `Whale Addresses Tested,${results.whaleAddresses.length},N/A`,
    `V2 Accepted,${results.v2Accepted},${((results.v2Accepted / totalV2) * 100).toFixed(2)}%`,
    `V2 Split Swaps,${results.v2SplitSwaps},${((results.v2SplitSwaps / totalV2) * 100).toFixed(2)}%`,
    `V2 Rejected,${results.v2Rejected},${((results.v2Rejected / totalV2) * 100).toFixed(2)}%`,
    `V2 Errors,${results.v2Errors},N/A`,
    `V1 Accepted,${results.v1Accepted},${((results.v1Accepted / totalV1) * 100).toFixed(2)}%`,
    `V1 Rejected,${results.v1Rejected},${((results.v1Rejected / totalV1) * 100).toFixed(2)}%`
  ].join('\n');
  
  fs.writeFileSync(
    path.join(reportDir, `comprehensive-summary-${timestamp}.csv`),
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
    path.join(reportDir, `comprehensive-rejection-reasons-${timestamp}.csv`),
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
    path.join(reportDir, `comprehensive-v1-v2-comparison-${timestamp}.csv`),
    comparisonCSV
  );
  
  console.log(`\n📊 Reports generated:`);
  console.log(`   📄 comprehensive-detailed-${timestamp}.csv`);
  console.log(`   📄 comprehensive-summary-${timestamp}.csv`);
  console.log(`   📄 comprehensive-rejection-reasons-${timestamp}.csv`);
  console.log(`   📄 comprehensive-v1-v2-comparison-${timestamp}.csv`);
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
  console.log('📊 COMPREHENSIVE TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`\n⏱️  Test Duration: ${testDurationSec.toFixed(2)} seconds`);
  console.log(`🐋 Whale Addresses Tested: ${results.whaleAddresses.length}`);
  console.log(`📈 Total Transactions: ${results.transactions.length}`);
  
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
 * Main test function
 */
async function runComprehensiveTest() {
  console.log('🚀 Starting Comprehensive Live Parser Test');
  console.log('='.repeat(80));
  console.log(`🔑 SHYFT API Key: ${SHYFT_API_KEY.slice(0, 8)}...`);
  console.log(`🐋 Max Whale Addresses: ${MAX_WHALE_ADDRESSES}`);
  console.log(`📊 Transactions per Whale: ${TRANSACTIONS_PER_WHALE}`);
  console.log(`⚡ Batch Size: ${BATCH_SIZE}`);
  
  results.startTime = Date.now();
  
  try {
    // Connect to database
    await connectDB();
    
    // Fetch whale addresses
    const whaleAddresses = await fetchWhaleAddresses();
    results.whaleAddresses = whaleAddresses;
    
    if (whaleAddresses.length === 0) {
      console.log('\n❌ No whale addresses found. Exiting.');
      await mongoose.disconnect();
      return;
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('🔍 FETCHING AND ANALYZING TRANSACTIONS');
    console.log('='.repeat(80));
    
    let totalFetched = 0;
    
    // Process whales in batches
    for (let i = 0; i < whaleAddresses.length; i += BATCH_SIZE) {
      const batch = whaleAddresses.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(whaleAddresses.length / BATCH_SIZE);
      
      console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} whales)`);
      
      // Fetch transactions for all whales in batch
      const batchPromises = batch.map(async (whaleAddress, idx) => {
        console.log(`   [${i + idx + 1}/${whaleAddresses.length}] ${whaleAddress.slice(0, 8)}...`);
        const transactions = await fetchTransactionsForWhale(whaleAddress);
        
        if (transactions.length > 0) {
          console.log(`      ✅ Fetched ${transactions.length} transactions`);
          totalFetched += transactions.length;
          
          // Analyze each transaction
          transactions.forEach(tx => {
            analyzeTransaction(tx, whaleAddress);
          });
        } else {
          console.log(`      ⚠️  No transactions found`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      });
      
      await Promise.all(batchPromises);
      
      // Delay between batches
      if (i + BATCH_SIZE < whaleAddresses.length) {
        console.log(`   ⏳ Waiting 2 seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`\n✅ Total transactions fetched: ${totalFetched}`);
    console.log(`✅ Total transactions analyzed: ${results.transactions.length}`);
    
    results.endTime = Date.now();
    
    // Print summary
    printSummary();
    
    // Generate reports
    generateCSVReports();
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
  } finally {
    // Disconnect from database
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run the test
runComprehensiveTest().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
