/**
 * Test Live V2 Detection
 * 
 * This script tests the V2 parser against live transactions to see
 * what's currently being detected and identify transfer vs swap issues.
 */

const fs = require('fs')
const path = require('path')
const { ShyftParserV2 } = require('./dist/utils/shyftParserV2')

// Initialize V2 parser
const parserV2 = new ShyftParserV2()

console.log(`\n${'='.repeat(100)}`)
console.log(`Testing Live V2 Detection - Sample Analysis`)
console.log(`${'='.repeat(100)}\n`)

// Create some test cases that represent the problematic patterns
const testCases = [
  {
    name: 'Simple Token Transfer (should be ERASED)',
    transaction: {
      signature: 'test_simple_transfer_1',
      timestamp: Date.now() / 1000,
      status: 'Success',
      fee: 0.000005,
      fee_payer: 'wallet1',
      signers: ['wallet1'],
      token_balance_changes: [
        {
          address: 'wallet1',
          decimals: 9,
          change_amount: -100, // Only one meaningful change
          post_balance: 0,
          pre_balance: 100,
          mint: 'TokenA',
          owner: 'wallet1',
        }
      ],
      actions: [
        {
          type: 'TOKEN_TRANSFER',
          info: {
            sender: 'wallet1',
            receiver: 'wallet2',
            amount: 100,
            token_address: 'TokenA'
          }
        }
      ]
    }
  },
  {
    name: 'SOL Transfer (should be ERASED)',
    transaction: {
      signature: 'test_sol_transfer_1',
      timestamp: Date.now() / 1000,
      status: 'Success',
      fee: 0.000005,
      fee_payer: 'wallet1',
      signers: ['wallet1'],
      token_balance_changes: [
        {
          address: 'wallet1',
          decimals: 9,
          change_amount: -1.5, // Only SOL change
          post_balance: 8.5,
          pre_balance: 10,
          mint: 'So11111111111111111111111111111111111111112',
          owner: 'wallet1',
        }
      ],
      actions: [
        {
          type: 'SOL_TRANSFER',
          info: {
            sender: 'wallet1',
            receiver: 'wallet2',
            amount: 1.5
          }
        }
      ]
    }
  },
  {
    name: 'Real Swap (should be PARSED)',
    transaction: {
      signature: 'test_real_swap_1',
      timestamp: Date.now() / 1000,
      status: 'Success',
      fee: 0.000005,
      fee_payer: 'wallet1',
      signers: ['wallet1'],
      token_balance_changes: [
        {
          address: 'wallet1',
          decimals: 9,
          change_amount: -1.0, // SOL out
          post_balance: 9.0,
          pre_balance: 10.0,
          mint: 'So11111111111111111111111111111111111111112',
          owner: 'wallet1',
        },
        {
          address: 'wallet1',
          decimals: 6,
          change_amount: 1000, // USDC in
          post_balance: 1000,
          pre_balance: 0,
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          owner: 'wallet1',
        }
      ],
      actions: [
        {
          type: 'SWAP',
          info: {
            swapper: 'wallet1',
            tokens_swapped: {
              in: {
                token_address: 'So11111111111111111111111111111111111111112',
                amount_raw: 1000000000 // 1 SOL
              },
              out: {
                token_address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                amount_raw: 1000000000 // 1000 USDC
              }
            }
          }
        }
      ]
    }
  },
  {
    name: 'Dust Transaction (should be ERASED)',
    transaction: {
      signature: 'test_dust_1',
      timestamp: Date.now() / 1000,
      status: 'Success',
      fee: 0.000005,
      fee_payer: 'wallet1',
      signers: ['wallet1'],
      token_balance_changes: [
        {
          address: 'wallet1',
          decimals: 9,
          change_amount: -0.000000001, // Dust amount
          post_balance: 10,
          pre_balance: 10.000000001,
          mint: 'So11111111111111111111111111111111111111112',
          owner: 'wallet1',
        },
        {
          address: 'wallet1',
          decimals: 6,
          change_amount: 0.000001, // Dust amount
          post_balance: 0.000001,
          pre_balance: 0,
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          owner: 'wallet1',
        }
      ],
      actions: []
    }
  },
  {
    name: 'Unidirectional Change (should be ERASED)',
    transaction: {
      signature: 'test_unidirectional_1',
      timestamp: Date.now() / 1000,
      status: 'Success',
      fee: 0.000005,
      fee_payer: 'wallet1',
      signers: ['wallet1'],
      token_balance_changes: [
        {
          address: 'wallet1',
          decimals: 9,
          change_amount: 1.0, // Only positive changes
          post_balance: 11.0,
          pre_balance: 10.0,
          mint: 'So11111111111111111111111111111111111111112',
          owner: 'wallet1',
        },
        {
          address: 'wallet1',
          decimals: 6,
          change_amount: 100, // Only positive changes
          post_balance: 100,
          pre_balance: 0,
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          owner: 'wallet1',
        }
      ],
      actions: []
    }
  }
]

console.log(`Testing ${testCases.length} synthetic test cases...\n`)

testCases.forEach((testCase, index) => {
  console.log(`${'='.repeat(80)}`)
  console.log(`${index + 1}. ${testCase.name}`)
  console.log(`${'='.repeat(80)}`)
  
  try {
    const result = parserV2.parseTransaction(testCase.transaction, true)
    
    if (result.success) {
      console.log(`✅ PARSED AS SWAP`)
      console.log(`   Direction: ${result.data.direction || result.data.splitReason}`)
      console.log(`   Swapper: ${result.data.swapper}`)
      console.log(`   Confidence: ${result.data.confidence || result.data.sellRecord?.confidence}`)
      
      if (result.data.direction) {
        console.log(`   Quote: ${result.data.quoteAsset.symbol}`)
        console.log(`   Base: ${result.data.baseAsset.symbol}`)
        console.log(`   Input Amount: ${result.data.amounts.swapInputAmount || 'N/A'}`)
        console.log(`   Output Amount: ${result.data.amounts.swapOutputAmount || 'N/A'}`)
      }
    } else {
      console.log(`❌ ERASED`)
      console.log(`   Reason: ${result.erase.reason}`)
      console.log(`   Debug: ${JSON.stringify(result.erase.debugInfo, null, 2)}`)
    }
    
    console.log(`   Processing Time: ${result.processingTimeMs}ms`)
    
    if (result.performanceMetrics) {
      console.log('\n   Performance Breakdown:')
      for (const [component, metrics] of Object.entries(result.performanceMetrics)) {
        console.log(`     ${component}: ${metrics.durationMs}ms`)
      }
    }
    
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`)
  }
  
  console.log()
})

console.log(`${'='.repeat(100)}`)
console.log('ANALYSIS SUMMARY')
console.log(`${'='.repeat(100)}`)

console.log(`
Expected Results:
1. Simple Token Transfer → ERASED (transfer detection)
2. SOL Transfer → ERASED (transfer detection)  
3. Real Swap → PARSED (legitimate swap)
4. Dust Transaction → ERASED (dust amounts)
5. Unidirectional Change → ERASED (no opposite deltas)

If any transfers are being parsed as swaps, the transfer detection logic needs improvement.
If real swaps are being erased, the swap detection logic is too strict.
`)

console.log(`${'='.repeat(100)}\n`)