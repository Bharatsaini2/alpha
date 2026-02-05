/**
 * V1 vs V2 Parser Comparison - All Whales
 * 
 * Fetches all whale addresses from DB and tests recent transactions
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

// Import parsers
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');
const { parseShyftTransaction } = require('./dist/utils/shyftParser');

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_';
const MONGO_URI = process.env.MONGO_URI;
const TRANSACTIONS_PER_WHALE = 10; // Fetch 10 recent transactions per whale
const MAX_WHALES = 100; // Start with 100 whales for testing

// Hardcoded list of known active whale addresses
const KNOWN_WHALES = [
  'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
  'C3TdUaDVdE74wYutyCkj7NRXqRfLgq2UFRZFab9MEUBs',
  'ruok2pybjpftuQ75qfzgHgebB91vSbCAK91dkButHdr',
  'CWaTfG6yzJPQRY5P53nQYHdHLjCJGxpC7EWo5wzGqs3n',
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
  'HWEoBxYs7ssKuudEjzjmpfJVX7Dvi7wescFsVx2L5yoY',
  '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S',
  'GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ',
  'A9WYcz4bXLxXbZmQqYxJqvqKqBqYqKqBqYqKqBqYqKqB',
  'BQcdHdAQW1hczDbBi9hiegXAR7A9pJvoy4oy4oy4oy4o'
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
  agreements: {
    MATCH: 0,
    MISMATCH: 0,
    BOTH_REJECT: 0,
    V2_SPLIT: 0,
    DISAGREE: 0
  },
  rejectionReasons: {},
  startTime: Date.now(),
  whalesProcessed: 0,
  totalWhales: 0
};

/**
 * Fetch whale addresses from MongoDB
 */
async function fetchWhaleAddresses() {
  console.log('\n📊 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');
  
  console.log('\n🐋 Fetching whale addresses...');
  
  // Import the WhalesAddress model
  const WhalesAddress = mongoose.model('WhalesAddress', new mongoose.Schema({
    address: String,
    tokenAddress: String
  }, { collection: 'whalesaddresses' }));
  
  const whales = await WhalesAddress.find({}).lean();
  
  // Get unique addresses
  const uniqueAddresses = [...new Set(whales.map(w => w.address).filter(a => a))];
  
  // Limit to MAX_WHALES
  const limitedAddresses = uniqueAddresses.slice(0, MAX_WHALES);
  
  console.log(`✅ Found ${whales.length} total records`);
  console.log(`✅ Found ${uniqueAddresses.length} unique whale addresses`);
  console.log(`✅ Using ${limitedAddresses.length} addresses for testing`);
  
  return limitedAddresses;
}

/**
 * Fetch recent transactions for a whale
 */
async function fetchWhaleTransactions(wallet) {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/history`,
      {
        params: {
          network: 'mainnet-beta',
          tx_num: TRANSACTIONS_PER_WHALE,
          account: wallet,
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
      // Rate limited, wait and retry
      await new Promise(resolve => setTimeout(resolve, 2000));
      return fetchWhaleTransactions(wallet);
    }
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
function analyzeTransaction(tx) {
  const signature = tx.signatures?.[0] || tx.signature || 'unknown';
  
  // Test V2
  const v2Result = testV2Parser(tx);
  
  // Test V1
  const v1Result = testV1Parser(tx);
  
  // Build result object
  const result = {
    signature,
    txType: tx.type || 'UNKNOWN',
    protocol: tx.protocol?.name || 'Unknown',
    timestamp: tx.timestamp || new Date().toISOString(),
    v2Status: 'UNKNOWN',
    v2Direction: '',
    v2QuoteAsset: '',
    v2BaseAsset: '',
    v2SwapInputAmount: '',
    v2TotalWalletCost: '',
    v2BaseAmount: '',
    v2RejectionReason: '',
    v2ProcessingTimeMs: v2Result.processingTimeMs || 0,
    v2IsSplit: false,
    v1Status: 'UNKNOWN',
    v1Direction: '',
    agreement: 'UNKNOWN'
  };
  
  // Process V2 result
  if (v2Result.success && v2Result.data) {
    if ('sellRecord' in v2Result.data) {
      results.v2SplitSwaps++;
      result.v2Status = 'SPLIT';
      result.v2IsSplit = true;
      result.agreement = 'V2_SPLIT';
    } else {
      results.v2Accepted++;
      result.v2Status = 'ACCEPTED';
      result.v2Direction = v2Result.data.direction;
      result.v2QuoteAsset = v2Result.data.quoteAsset?.symbol || '';
      result.v2BaseAsset = v2Result.data.baseAsset?.symbol || '';
      
      const amounts = v2Result.data.amounts || {};
      result.v2SwapInputAmount = amounts.swapInputAmount || '';
      result.v2TotalWalletCost = amounts.totalWalletCost || '';
      result.v2BaseAmount = amounts.baseAmount || '';
    }
  } else if (v2Result.erase) {
    results.v2Rejected++;
    result.v2Status = 'REJECTED';
    result.v2RejectionReason = v2Result.erase.reason;
    results.rejectionReasons[result.v2RejectionReason] = 
      (results.rejectionReasons[result.v2RejectionReason] || 0) + 1;
  } else if (v2Result.error) {
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
  
  results.agreements[result.agreement]++;
  results.transactions.push(result);
}

/**
 * Print progress
 */
function printProgress() {
  const elapsed = (Date.now() - results.startTime) / 1000;
  const rate = results.whalesProcessed / elapsed;
  const eta = (results.totalWhales - results.whalesProcessed) / rate;
  
  process.stdout.write(`\r🐋 Progress: ${results.whalesProcessed}/${results.totalWhales} whales | ` +
    `📊 Transactions: ${results.transactions.length} | ` +
    `✅ V2: ${results.v2Accepted} | ❌ V2: ${results.v2Rejected} | ` +
    `⏱️  ETA: ${Math.round(eta)}s`);
}

/**
 * Print summary
 */
function printSummary() {
  const totalV2 = results.v2Accepted + results.v2Rejected + results.v2SplitSwaps;
  const totalV1 = results.v1Accepted + results.v1Rejected;
  const testDurationSec = (Date.now() - results.startTime) / 1000;
  
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`\n⏱️  Test Duration: ${testDurationSec.toFixed(2)} seconds`);
  console.log(`🐋 Whales Processed: ${results.whalesProcessed}/${results.totalWhales}`);
  console.log(`📈 Total Transactions: ${results.transactions.length}`);
  
  console.log('\n🟢 V2 Parser Results:');
  console.log(`   ✅ Accepted: ${results.v2Accepted} (${((results.v2Accepted / totalV2) * 100).toFixed(2)}%)`);
  console.log(`   🔄 Split Swaps: ${results.v2SplitSwaps} (${((results.v2SplitSwaps / totalV2) * 100).toFixed(2)}%)`);
  console.log(`   ❌ Rejected: ${results.v2Rejected} (${((results.v2Rejected / totalV2) * 100).toFixed(2)}%)`);
  console.log(`   ⚠️  Errors: ${results.v2Errors}`);
  
  console.log('\n🔵 V1 Parser Results:');
  console.log(`   ✅ Accepted: ${results.v1Accepted} (${((results.v1Accepted / totalV1) * 100).toFixed(2)}%)`);
  console.log(`   ❌ Rejected: ${results.v1Rejected} (${((results.v1Rejected / totalV1) * 100).toFixed(2)}%)`);
  
  console.log('\n🔀 Agreement Analysis:');
  Object.entries(results.agreements).forEach(([type, count]) => {
    const pct = ((count / results.transactions.length) * 100).toFixed(2);
    console.log(`   ${type}: ${count} (${pct}%)`);
  });
  
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
 * Generate CSV report
 */
function generateCSVReport() {
  const timestamp = Date.now();
  const reportDir = path.join(__dirname, 'test-reports');
  
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  const detailedCSV = [
    'Signature,TX_Type,Protocol,Timestamp,V2_Status,V2_Direction,V2_Quote,V2_Base,V2_Swap_Input,V2_Total_Cost,V2_Base_Amount,V2_Rejection_Reason,V2_Processing_Ms,V2_Is_Split,V1_Status,V1_Direction,Agreement',
    ...results.transactions.map(r => 
      `"${r.signature}","${r.txType}","${r.protocol}","${r.timestamp}","${r.v2Status}","${r.v2Direction}","${r.v2QuoteAsset}","${r.v2BaseAsset}","${r.v2SwapInputAmount}","${r.v2TotalWalletCost}","${r.v2BaseAmount}","${r.v2RejectionReason}","${r.v2ProcessingTimeMs}","${r.v2IsSplit}","${r.v1Status}","${r.v1Direction}","${r.agreement}"`
    )
  ].join('\n');
  
  const filename = `all-whales-comparison-${timestamp}.csv`;
  fs.writeFileSync(path.join(reportDir, filename), detailedCSV);
  
  console.log(`\n📊 Report generated: ${filename}`);
  console.log(`📁 Location: ${reportDir}`);
  
  return filename;
}

/**
 * Main test function
 */
async function runTest() {
  console.log('🚀 Starting V1 vs V2 Parser Comparison - All Whales');
  console.log('='.repeat(80));
  console.log(`🔑 SHYFT API Key: ${SHYFT_API_KEY.slice(0, 8)}...`);
  console.log(`📊 MongoDB: ${MONGO_URI.split('@')[1]?.split('/')[0] || 'Connected'}`);
  console.log(`🐋 Max Whales: ${MAX_WHALES}`);
  console.log(`📈 Transactions per whale: ${TRANSACTIONS_PER_WHALE}`);
  
  // Fetch whale addresses
  const whaleAddresses = await fetchWhaleAddresses();
  results.totalWhales = whaleAddresses.length;
  
  console.log('\n' + '='.repeat(80));
  console.log('🔍 FETCHING AND ANALYZING TRANSACTIONS');
  console.log('='.repeat(80));
  
  // Process whales in batches to avoid rate limiting
  const BATCH_SIZE = 10;
  for (let i = 0; i < whaleAddresses.length; i += BATCH_SIZE) {
    const batch = whaleAddresses.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (wallet) => {
      const transactions = await fetchWhaleTransactions(wallet);
      transactions.forEach(tx => analyzeTransaction(tx));
      results.whalesProcessed++;
      printProgress();
    }));
    
    // Small delay between batches to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n');
  
  // Close MongoDB connection
  await mongoose.connection.close();
  
  // Print summary
  printSummary();
  
  // Generate report
  generateCSVReport();
  
  console.log('\n✅ Test completed successfully!');
}

// Run the test
runTest().catch(error => {
  console.error('\n❌ Test failed:', error);
  mongoose.connection.close();
  process.exit(1);
});
