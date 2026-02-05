/**
 * 5-Minute V2 Parser Live Test
 * 
 * Fetches recent transactions and tests V2 parser
 * Generates detailed CSV reports
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Clear require cache to get latest compiled code
delete require.cache[require.resolve('./dist/utils/shyftParserV2')];
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_';

// Known whale addresses
const WHALE_ADDRESSES = [
  'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
  'C3TdUaDVdE74wYutyCkj7NRXqRfLgq2UFRZFab9MEUBs',
  'ruok2pybjpftuQ75qfzgHgebB91vSbCAK91dkButHdr',
  'CWaTfG6yzJPQRY5P53nQYHdHLjCJGxpC7EWo5wzGqs3n',
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1'
];

const results = {
  transactions: [],
  accepted: 0,
  rejected: 0,
  splitSwaps: 0,
  errors: 0,
  rejectionReasons: {},
  startTime: Date.now()
};

async function fetchRecentTransactions() {
  console.log('\n🔍 Fetching recent transactions from SHYFT API...\n');
  
  const allTransactions = [];
  
  for (const wallet of WHALE_ADDRESSES) {
    try {
      console.log(`   Fetching for ${wallet.slice(0, 8)}...`);
      
      const response = await axios.get(
        `https://api.shyft.to/sol/v1/transaction/history`,
        {
          params: {
            network: 'mainnet-beta',
            tx_num: 25,
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
        console.log(`   ✅ Fetched ${response.data.result.length} transactions`);
        allTransactions.push(...response.data.result);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log(`\n✅ Total transactions fetched: ${allTransactions.length}\n`);
  return allTransactions;
}

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

function analyzeTransaction(tx, index) {
  const signature = tx.signatures?.[0] || tx.signature || `tx_${index}`;
  const txType = tx.type || 'UNKNOWN';
  const protocol = tx.protocol?.name || 'Unknown';
  
  console.log(`[${index + 1}] ${signature.slice(0, 16)}... | ${txType} | ${protocol}`);
  
  const v2Result = testV2Parser(tx);
  
  const result = {
    signature,
    txType,
    protocol,
    timestamp: tx.timestamp || new Date().toISOString(),
    status: 'UNKNOWN',
    direction: '',
    quoteAsset: '',
    baseAsset: '',
    swapInputAmount: '',
    totalWalletCost: '',
    swapOutputAmount: '',
    netWalletReceived: '',
    baseAmount: '',
    rejectionReason: '',
    processingTimeMs: v2Result.processingTimeMs || 0,
    isSplit: false
  };
  
  if (v2Result.success && v2Result.data) {
    if ('sellRecord' in v2Result.data) {
      results.splitSwaps++;
      result.status = 'SPLIT';
      result.isSplit = true;
      console.log(`  ✅ SPLIT SWAP`);
    } else {
      results.accepted++;
      result.status = 'ACCEPTED';
      result.direction = v2Result.data.direction;
      result.quoteAsset = v2Result.data.quoteAsset?.symbol || '';
      result.baseAsset = v2Result.data.baseAsset?.symbol || '';
      
      const amounts = v2Result.data.amounts || {};
      result.swapInputAmount = amounts.swapInputAmount || '';
      result.totalWalletCost = amounts.totalWalletCost || '';
      result.swapOutputAmount = amounts.swapOutputAmount || '';
      result.netWalletReceived = amounts.netWalletReceived || '';
      result.baseAmount = amounts.baseAmount || '';
      
      console.log(`  ✅ ${result.direction} (${result.quoteAsset} → ${result.baseAsset}) | Input: ${result.swapInputAmount}`);
    }
  } else if (v2Result.erase) {
    results.rejected++;
    result.status = 'REJECTED';
    result.rejectionReason = v2Result.erase.reason;
    
    results.rejectionReasons[result.rejectionReason] = 
      (results.rejectionReasons[result.rejectionReason] || 0) + 1;
    
    console.log(`  ❌ REJECTED (${result.rejectionReason})`);
  } else if (v2Result.error) {
    results.errors++;
    result.status = 'ERROR';
    result.rejectionReason = v2Result.error;
    console.log(`  ⚠️  ERROR (${v2Result.error})`);
  }
  
  results.transactions.push(result);
}

function g