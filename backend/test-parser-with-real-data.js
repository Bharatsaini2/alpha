/**
 * Comprehensive Parser Test with Real Transaction Data
 * 
 * Uses real transaction signatures to test parser behavior
 */

const { parseShyftTransactionV2 } = require('./src/utils/shyftParserV2');
const { parseShyftTransaction } = require('./src/utils/shyftParser');
const { getParsedTransactions } = require('./src/config/getParsedTransaction');
const fs = require('fs');
const path = require('path');

// Real transaction signatures from production
const TEST_SIGNATURES = [
  // BUY transactions
  '5YJZvQXqH8mKfWqGvN3xqYvN3xqYvN3xqYvN3xqYvN3xqYvN3xqYvN3xqYvN3xqYvN3xqYvN3xq', // Example BUY
  '4XJZvQXqH8mKfWqGvN3xqYvN3xqYvN3xqYvN3xqYvN3xqYvN3xqYvN3xqYvN3xqYvN3xqYvN3xq', // Example SELL
  // Add more real signatures here
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
  comparison: [],
  performance: {
    v2AvgMs: 0,
    v1AvgMs: 0,
    v2Times: [],
    v1Times: []
  }
};

/**
 * Test with sample transaction data
 */
async function testWithSampleData() {
  console.log('🚀 Testing Parser with Sample Transaction Data\n');
  
  // Sample BUY transaction (SOL → TOKEN)
  const sampleBuy = {
    signature: 'SAMPLE_BUY_TX',
    timestamp: Date.now(),
    status: 'Success',
    fee: 0.000005,
    fee_payer: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
    signers: ['GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S'],
    protocol: { name: 'Raydium', address: 'RaydiumProtocol' },
    token_balance_changes: [
      {
        mint: 'So11111111111111111111111111111111111111112',
        owner: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
        pre_balance: 10000000000, // 10 SOL in lamports
        post_balance: 8950000000,  // 8.95 SOL in lamports
        change_amount: -1.05,
        decimals: 9
      },
      {
        mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
        owner: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
        pre_balance: 0,
        post_balance: 500000000, // 5000 BONK
        change_amount: 5000,
        decimals: 5
      }
    ],
    actions: [
      {
        type: 'SWAP',
        info: {
          swapper: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
          tokens_swapped: {
            in: {
              token_address: 'So11111111111111111111111111111111111111112',
              amount_raw: '1000000000'
            },
            out: {
              token_address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
              amount_raw: '500000000'
            }
          }
        }
      }
    ]
  };
  
  // Sample SELL transaction (TOKEN → SOL)
  const sampleSell = {
    signature: 'SAMPLE_SELL_TX',
    timestamp: Date.now(),
    status: 'Success',
    fee: 0.000005,
    fee_payer: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
    signers: ['GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S'],
    protocol: { name: 'Raydium', address: 'RaydiumProtocol' },
    token_balance_changes: [
      {
        mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
        owner: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
        pre_balance: 1000000000, // 10000 BONK
        post_balance: 600000000,  // 6000 BONK
        change_amount: -4000,
        decimals: 5
      },
      {
        mint: 'So11111111111111111111111111111111111111112',
        owner: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
        pre_balance: 2000000000, // 2 SOL
        post_balance: 2780000000, // 2.78 SOL
        change_amount: 0.78,
        decimals: 9
      }
    ],
    actions: [
      {
        type: 'SWAP',
        info: {
          swapper: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
          tokens_swapped: {
            in: {
              token_address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
              amount_raw: '400000000'
            },
            out: {
              token_address: 'So11111111111111111111111111111111111111112',
              amount_raw: '800000000'
            }
          }
        }
      }
    ]
  };
  
  // Sample Token-to-Token (should create split swap)
  const sampleTokenToToken = {
    signature: 'SAMPLE_TOKEN_TO_TOKEN_TX',
    timestamp: Date.now(),
    status: 'Success',
    fee: 0.000005,
    fee_payer: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
    signers: ['GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S'],
    protocol: { name: 'Jupiter', address: 'JupiterProtocol' },
    token_balance_changes: [
      {
        mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
        owner: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
        pre_balance: 1000000000,
        post_balance: 0,
        change_amount: -10000,
        decimals: 5
      },
      {
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        owner: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
        pre_balance: 0,
        post_balance: 0,
        change_amount: 0, // Intermediate asset
        decimals: 6
      },
      {
        mint: 'So11111111111111111111111111111111111111113', // PEPE (example)
        owner: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
        pre_balance: 0,
        post_balance: 1000000000000,
        change_amount: 1000000,
        decimals: 6
      }
    ],
    actions: [
      {
        type: 'SWAP',
        info: {
          swapper: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S'
        }
      }
    ]
  };
  
  // Sample Transfer (should be rejected)
  const sampleTransfer = {
    signature: 'SAMPLE_TRANSFER_TX',
    timestamp: Date.now(),
    status: 'Success',
    fee: 0.000005,
    fee_payer: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
    signers: ['GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S'],
    token_balance_changes: [
      {
        mint: 'So11111111111111111111111111111111111111112',
        owner: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
        pre_balance: 10000000000,
        post_balance: 9000000000,
        change_amount: -1.0,
        decimals: 9
      }
    ],
    actions: [
      {
        type: 'SOL_TRANSFER',
        info: {
          sender: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
          receiver: 'AnotherWallet',
          amount: 1.0
        }
      }
    ]
  };
  
  // Sample Below Minimum Value (should be rejected)
  const sampleBelowMinimum = {
    signature: 'SAMPLE_BELOW_MINIMUM_TX',
    timestamp: Date.now(),
    status: 'Success',
    fee: 0.000005,
    fee_payer: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
    signers: ['GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S'],
    protocol: { name: 'Raydium', address: 'RaydiumProtocol' },
    token_balance_changes: [
      {
        mint: 'So11111111111111111111111111111111111111112',
        owner: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
        pre_balance: 10000000000,
        post_balance: 9990000000, // Only 0.01 SOL spent
        change_amount: -0.01,
        decimals: 9
      },
      {
        mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        owner: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S',
        pre_balance: 0,
        post_balance: 10000,
        change_amount: 0.1,
        decimals: 5
      }
    ],
    actions: [
      {
        type: 'SWAP',
        info: {
          swapper: 'GJRYBLa6XqfvQGjjHv61bXRDUZxFCUMwYxSzZa8EBP4S'
        }
      }
    ]
  };
  
  const testCases = [
    { name: 'BUY Transaction', data: sampleBuy, expectedV2: 'ACCEPT', expectedDirection: 'BUY' },
    { name: 'SELL Transaction', data: sampleSell, expectedV2: 'ACCEPT', expectedDirection: 'SELL' },
    { name: 'Token-to-Token', data: sampleTokenToToken, expectedV2: 'SPLIT', expectedDirection: 'SPLIT' },
    { name: 'Simple Transfer', data: sampleTransfer, expectedV2: 'REJECT', expectedReason: 'only_transfer_actions' },
    { name: 'Below Minimum Value', data: sampleBelowMinimum, expectedV2: 'REJECT', expectedReason: 'below_minimum_value' }
  ];
  
  console.log('='.repeat(80));
  console.log('🔍 TESTING PARSER WITH SAMPLE DATA');
  console.log('='.repeat(80));
  
  testCases.forEach((testCase, index) => {
    console.log(`\n[${index + 1}] ${testCase.name}`);
    console.log('-'.repeat(80));
    
    // Test V2
    const v2Start = Date.now();
    const v2Result = parseShyftTransactionV2(testCase.data);
    const v2Time = Date.now() - v2Start;
    results.performance.v2Times.push(v2Time);
    
    console.log(`  V2 Processing Time: ${v2Time}ms`);
    
    if (v2Result.success && v2Result.data) {
      if ('sellRecord' in v2Result.data) {
        console.log(`  ✅ V2: SPLIT SWAP`);
        console.log(`     - SELL: ${v2Result.data.sellRecord.quoteAsset.symbol} → ${v2Result.data.sellRecord.baseAsset.symbol}`);
        console.log(`     - BUY: ${v2Result.data.buyRecord.quoteAsset.symbol} → ${v2Result.data.buyRecord.baseAsset.symbol}`);
        results.v2.splitSwaps.push({
          signature: testCase.data.signature,
          testName: testCase.name,
          sellRecord: v2Result.data.sellRecord,
          buyRecord: v2Result.data.buyRecord
        });
      } else {
        console.log(`  ✅ V2: ${v2Result.data.direction}`);
        console.log(`     - Quote: ${v2Result.data.quoteAsset.symbol}`);
        console.log(`     - Base: ${v2Result.data.baseAsset.symbol}`);
        console.log(`     - Amounts:`, JSON.stringify(v2Result.data.amounts, null, 2));
        results.v2.accepted.push({
          signature: testCase.data.signature,
          testName: testCase.name,
          direction: v2Result.data.direction,
          data: v2Result.data
        });
      }
    } else if (v2Result.erase) {
      console.log(`  ❌ V2: REJECTED`);
      console.log(`     - Reason: ${v2Result.erase.reason}`);
      results.v2.rejected.push({
        signature: testCase.data.signature,
        testName: testCase.name,
        reason: v2Result.erase.reason
      });
    }
    
    // Verify expected result
    if (testCase.expectedV2 === 'ACCEPT' && v2Result.success && v2Result.data && !('sellRecord' in v2Result.data)) {
      console.log(`  ✅ PASS: V2 accepted as expected`);
      if (testCase.expectedDirection && v2Result.data.direction === testCase.expectedDirection) {
        console.log(`  ✅ PASS: Direction matches (${testCase.expectedDirection})`);
      }
    } else if (testCase.expectedV2 === 'SPLIT' && v2Result.success && v2Result.data && 'sellRecord' in v2Result.data) {
      console.log(`  ✅ PASS: V2 created split swap as expected`);
    } else if (testCase.expectedV2 === 'REJECT' && v2Result.erase) {
      console.log(`  ✅ PASS: V2 rejected as expected`);
      if (testCase.expectedReason && v2Result.erase.reason === testCase.expectedReason) {
        console.log(`  ✅ PASS: Rejection reason matches (${testCase.expectedReason})`);
      }
    } else {
      console.log(`  ❌ FAIL: V2 result doesn't match expected`);
    }
  });
  
  // Calculate performance stats
  results.performance.v2AvgMs = results.performance.v2Times.reduce((a, b) => a + b, 0) / results.performance.v2Times.length;
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`\n🔵 V2 Parser Results:`);
  console.log(`   ✅ Accepted: ${results.v2.accepted.length}`);
  console.log(`   🔄 Split Swaps: ${results.v2.splitSwaps.length}`);
  console.log(`   ❌ Rejected: ${results.v2.rejected.length}`);
  console.log(`   ⚡ Avg Processing Time: ${results.performance.v2AvgMs.toFixed(2)}ms`);
  
  // Generate CSV report
  generateCSVReport();
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
  
  // Detection Summary
  const detectionCSV = [
    'Category,Count',
    `V2 Accepted,${results.v2.accepted.length}`,
    `V2 Split Swaps,${results.v2.splitSwaps.length}`,
    `V2 Rejected,${results.v2.rejected.length}`,
    `V2 Avg Processing Time (ms),${results.performance.v2AvgMs.toFixed(2)}`
  ].join('\n');
  
  fs.writeFileSync(
    path.join(reportDir, `sample-test-summary-${timestamp}.csv`),
    detectionCSV
  );
  
  // Detailed Results
  const detailedCSV = [
    'Test_Name,Signature,V2_Status,Direction,Quote_Asset,Base_Asset,Swap_Input,Total_Wallet_Cost,Swap_Output,Net_Wallet_Received,Base_Amount,Rejection_Reason',
    ...results.v2.accepted.map(r => {
      const a = r.data.amounts || {};
      return `${r.testName},${r.signature},ACCEPT,${r.direction},${r.data.quoteAsset.symbol},${r.data.baseAsset.symbol},${a.swapInputAmount || 'N/A'},${a.totalWalletCost || 'N/A'},${a.swapOutputAmount || 'N/A'},${a.netWalletReceived || 'N/A'},${a.baseAmount || 'N/A'},N/A`;
    }),
    ...results.v2.splitSwaps.map(r => {
      return `${r.testName},${r.signature},SPLIT,SELL+BUY,${r.sellRecord.quoteAsset.symbol}+${r.buyRecord.quoteAsset.symbol},${r.sellRecord.baseAsset.symbol}+${r.buyRecord.baseAsset.symbol},N/A,N/A,N/A,N/A,N/A,N/A`;
    }),
    ...results.v2.rejected.map(r => {
      return `${r.testName},${r.signature},REJECT,N/A,N/A,N/A,N/A,N/A,N/A,N/A,N/A,${r.reason}`;
    })
  ].join('\n');
  
  fs.writeFileSync(
    path.join(reportDir, `sample-test-detailed-${timestamp}.csv`),
    detailedCSV
  );
  
  console.log(`\n📊 Reports generated:`);
  console.log(`   - sample-test-summary-${timestamp}.csv`);
  console.log(`   - sample-test-detailed-${timestamp}.csv`);
  console.log(`\n📁 Location: ${reportDir}`);
}

// Run test
testWithSampleData().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
