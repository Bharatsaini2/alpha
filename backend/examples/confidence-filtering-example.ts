/**
 * Example: Confidence-Based Filtering for Swap Detection
 * 
 * This example demonstrates how the confidence filtering works
 * and how to use it in your application.
 * 
 * Task 3.3: Add confidence-based filtering (optional)
 */

import { parseShyftTransaction, meetsMinimumConfidence, ShyftTransaction } from '../src/utils/shyftParser'

// Example 1: Parse a transaction and check confidence
function example1_BasicUsage() {
  console.log('\n=== Example 1: Basic Usage ===\n')

  const transaction: ShyftTransaction = {
    signature: 'example-sig-1',
    status: 'Success',
    fee_payer: 'buyer123',
    signers: ['buyer123'],
    type: 'SWAP',
    timestamp: '2026-01-23T20:36:46.000Z',
    token_balance_changes: [
      {
        address: 'token-account-1',
        decimals: 6,
        change_amount: 1000000000,
        post_balance: 1000000000,
        pre_balance: 0,
        mint: 'TokenMint123',
        owner: 'buyer123',
      },
      {
        address: 'sol-account-1',
        decimals: 9,
        change_amount: -5000000000,
        post_balance: 1000000000,
        pre_balance: 6000000000,
        mint: 'So11111111111111111111111111111111111111112',
        owner: 'buyer123',
      },
    ],
    actions: [],
    events: [],
  }

  const parsedSwap = parseShyftTransaction(transaction)

  if (parsedSwap) {
    console.log('Parsed Swap:')
    console.log(`  Side: ${parsedSwap.side}`)
    console.log(`  Confidence: ${parsedSwap.confidence}`)
    console.log(`  Classification Source: ${parsedSwap.classification_source}`)
    console.log(`  Input: ${parsedSwap.input.amount} ${parsedSwap.input.mint}`)
    console.log(`  Output: ${parsedSwap.output.amount} ${parsedSwap.output.mint}`)
  }
}

// Example 2: Filter by confidence level
function example2_ConfidenceFiltering() {
  console.log('\n=== Example 2: Confidence Filtering ===\n')

  // Create swaps with different confidence levels
  const swaps = [
    {
      name: 'Event-only swap',
      swap: {
        swapper: 'test',
        side: 'BUY' as const,
        input: { mint: 'SOL', amount_raw: '1000', decimals: 9, amount: 0.000001 },
        output: { mint: 'TOKEN', amount_raw: '1000', decimals: 6, amount: 0.001 },
        ata_created: false,
        classification_source: 'events' as const,
        confidence: 'LOW' as const,
      },
    },
    {
      name: 'Balance-only swap',
      swap: {
        swapper: 'test',
        side: 'BUY' as const,
        input: { mint: 'SOL', amount_raw: '1000', decimals: 9, amount: 0.000001 },
        output: { mint: 'TOKEN', amount_raw: '1000', decimals: 6, amount: 0.001 },
        ata_created: false,
        classification_source: 'token_balance_changes' as const,
        confidence: 'MEDIUM' as const,
      },
    },
    {
      name: 'Balance + events swap',
      swap: {
        swapper: 'test',
        side: 'BUY' as const,
        input: { mint: 'SOL', amount_raw: '1000', decimals: 9, amount: 0.000001 },
        output: { mint: 'TOKEN', amount_raw: '1000', decimals: 6, amount: 0.001 },
        ata_created: false,
        classification_source: 'token_balance_changes' as const,
        confidence: 'HIGH' as const,
      },
    },
    {
      name: 'tokens_swapped + balances + events',
      swap: {
        swapper: 'test',
        side: 'BUY' as const,
        input: { mint: 'SOL', amount_raw: '1000', decimals: 9, amount: 0.000001 },
        output: { mint: 'TOKEN', amount_raw: '1000', decimals: 6, amount: 0.001 },
        ata_created: false,
        classification_source: 'tokens_swapped' as const,
        confidence: 'MAX' as const,
      },
    },
  ]

  const minConfidenceLevels = ['LOW', 'MEDIUM', 'HIGH', 'MAX']

  for (const minConfidence of minConfidenceLevels) {
    console.log(`\nMinimum Confidence: ${minConfidence}`)
    console.log('─'.repeat(50))

    for (const { name, swap } of swaps) {
      const passes = meetsMinimumConfidence(swap, minConfidence)
      const status = passes ? '✓ PASS' : '✗ FILTERED'
      console.log(`  ${status} - ${name} (${swap.confidence})`)
    }
  }
}

// Example 3: Real-world usage in a controller
function example3_ControllerUsage() {
  console.log('\n=== Example 3: Controller Usage ===\n')

  // Simulate environment variable
  const MIN_ALERT_CONFIDENCE = 'MEDIUM' // or process.env.MIN_ALERT_CONFIDENCE

  // Simulate parsing a transaction
  const transaction: ShyftTransaction = {
    signature: 'example-sig-3',
    status: 'Success',
    fee_payer: 'buyer123',
    signers: ['buyer123'],
    type: 'SWAP',
    timestamp: '2026-01-23T20:36:46.000Z',
    token_balance_changes: [],
    actions: [],
    events: [
      {
        name: 'BuyEvent',
        data: {
          swap_events: [
            {
              input_mint: 'So11111111111111111111111111111111111111112',
              input_amount: 5000000000,
              output_mint: 'TokenMint123',
              output_amount: 1000000000,
            },
          ],
        },
      },
    ],
  }

  const parsedSwap = parseShyftTransaction(transaction)

  if (!parsedSwap) {
    console.log('❌ Transaction could not be parsed')
    return
  }

  console.log(`Parsed swap with confidence: ${parsedSwap.confidence}`)

  // Apply confidence filtering
  if (MIN_ALERT_CONFIDENCE) {
    if (!meetsMinimumConfidence(parsedSwap, MIN_ALERT_CONFIDENCE)) {
      console.log(
        `❌ FILTERED: Confidence ${parsedSwap.confidence} below minimum ${MIN_ALERT_CONFIDENCE}`
      )
      return
    }
  }

  console.log('✓ Transaction passes confidence filter')
  console.log('  Processing alert...')
}

// Example 4: Statistics on confidence distribution
function example4_ConfidenceStatistics() {
  console.log('\n=== Example 4: Confidence Statistics ===\n')

  // Simulate a batch of transactions
  const transactions = [
    { confidence: 'LOW', count: 5 },
    { confidence: 'MEDIUM', count: 35 },
    { confidence: 'HIGH', count: 40 },
    { confidence: 'MAX', count: 20 },
  ]

  const total = transactions.reduce((sum, t) => sum + t.count, 0)

  console.log('Transaction Distribution:')
  console.log('─'.repeat(50))

  for (const { confidence, count } of transactions) {
    const percentage = ((count / total) * 100).toFixed(1)
    const bar = '█'.repeat(Math.floor(count / 2))
    console.log(`  ${confidence.padEnd(6)} ${bar} ${count} (${percentage}%)`)
  }

  console.log('\nFiltering Impact:')
  console.log('─'.repeat(50))

  const filters = [
    { level: 'MEDIUM', threshold: 2 },
    { level: 'HIGH', threshold: 3 },
    { level: 'MAX', threshold: 4 },
  ]

  for (const { level, threshold } of filters) {
    const filtered = transactions
      .filter((t, i) => i + 1 < threshold)
      .reduce((sum, t) => sum + t.count, 0)
    const remaining = total - filtered
    const percentage = ((remaining / total) * 100).toFixed(1)

    console.log(`  MIN_ALERT_CONFIDENCE=${level}`)
    console.log(`    Remaining: ${remaining}/${total} (${percentage}%)`)
    console.log(`    Filtered: ${filtered}/${total} (${((filtered / total) * 100).toFixed(1)}%)`)
  }
}

// Run all examples
if (require.main === module) {
  console.log('╔════════════════════════════════════════════════╗')
  console.log('║  Confidence-Based Filtering Examples          ║')
  console.log('╚════════════════════════════════════════════════╝')

  example1_BasicUsage()
  example2_ConfidenceFiltering()
  example3_ControllerUsage()
  example4_ConfidenceStatistics()

  console.log('\n✓ All examples completed\n')
}

export {
  example1_BasicUsage,
  example2_ConfidenceFiltering,
  example3_ControllerUsage,
  example4_ConfidenceStatistics,
}
