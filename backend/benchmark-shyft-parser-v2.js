/**
 * SHYFT Parser V2 - Performance Benchmark
 * 
 * Purpose: Benchmark parser performance across various transaction types
 * 
 * Task 15.2: Run performance benchmarks
 * Requirement: 7.1 - Verify <100ms for 95th percentile
 * 
 * Tests:
 * - Standard SOL↔token swaps
 * - Stablecoin↔token swaps
 * - Token↔token swaps (split protocol)
 * - Multi-hop routes
 * - AMM swaps
 * - ERASE transactions
 * - Batch processing
 */

const fs = require('fs')
const path = require('path')
const { ShyftParserV2 } = require('./dist/utils/shyftParserV2')

const SHYFT_RESPONSE_DIR = path.join(__dirname, '..', 'shyft_response')

// Helper to convert v1 format to v2 format
function convertToV2(txV1) {
  return {
    signature: txV1.signature || 'unknown',
    timestamp: typeof txV1.timestamp === 'string' 
      ? new Date(txV1.timestamp).getTime() / 1000 
      : Date.now() / 1000,
    status: txV1.status || 'Success',
    fee: txV1.fee || 0.000005,
    fee_payer: txV1.fee_payer || '',
    signers: txV1.signers || [],
    protocol: txV1.actions?.[0]?.type 
      ? { name: txV1.actions[0].type, address: 'unknown' }
      : undefined,
    token_balance_changes: txV1.token_balance_changes || [],
    actions: txV1.actions || [],
  }
}

// Load all SHYFT response files
function loadAllTransactions() {
  const files = fs.readdirSync(SHYFT_RESPONSE_DIR)
    .filter(f => f.endsWith('.json'))
  
  const transactions = []
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(SHYFT_RESPONSE_DIR, file), 'utf8')
      const parsed = JSON.parse(content)
      const tx = parsed.result || parsed
      transactions.push({ file, tx: convertToV2(tx) })
    } catch (error) {
      console.error(`Error loading ${file}:`, error.message)
    }
  }
  
  return transactions
}

// Calculate percentiles
function calculatePercentile(values, percentile) {
  const sorted = values.slice().sort((a, b) => a - b)
  const index = Math.ceil((percentile / 100) * sorted.length) - 1
  return sorted[index]
}

// Calculate statistics
function calculateStats(timings) {
  const sorted = timings.slice().sort((a, b) => a - b)
  return {
    count: timings.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: timings.reduce((a, b) => a + b, 0) / timings.length,
    median: sorted[Math.floor(sorted.length / 2)],
    p50: calculatePercentile(timings, 50),
    p75: calculatePercentile(timings, 75),
    p90: calculatePercentile(timings, 90),
    p95: calculatePercentile(timings, 95),
    p99: calculatePercentile(timings, 99),
  }
}

// Format stats for display
function formatStats(stats) {
  return `
  Count:  ${stats.count}
  Min:    ${stats.min.toFixed(2)}ms
  Max:    ${stats.max.toFixed(2)}ms
  Mean:   ${stats.mean.toFixed(2)}ms
  Median: ${stats.median.toFixed(2)}ms
  P50:    ${stats.p50.toFixed(2)}ms
  P75:    ${stats.p75.toFixed(2)}ms
  P90:    ${stats.p90.toFixed(2)}ms
  P95:    ${stats.p95.toFixed(2)}ms ${stats.p95 > 100 ? '⚠️  EXCEEDS TARGET' : '✅ MEETS TARGET'}
  P99:    ${stats.p99.toFixed(2)}ms
  `
}

console.log(`\n${'='.repeat(80)}`)
console.log('SHYFT Parser V2 - Performance Benchmark')
console.log(`${'='.repeat(80)}\n`)

// Initialize parser
const parser = new ShyftParserV2()

// Load transactions
console.log('Loading transactions...')
const transactions = loadAllTransactions()
console.log(`Loaded ${transactions.length} transactions\n`)

// Benchmark 1: Single transaction parsing
console.log(`${'='.repeat(80)}`)
console.log('Benchmark 1: Single Transaction Parsing')
console.log(`${'='.repeat(80)}\n`)

const singleTimings = []
const successTimings = []
const eraseTimings = []
const splitTimings = []

for (const { file, tx } of transactions) {
  const result = parser.parseTransaction(tx)
  singleTimings.push(result.processingTimeMs)
  
  if (result.success) {
    successTimings.push(result.processingTimeMs)
    if ('sellRecord' in result.data) {
      splitTimings.push(result.processingTimeMs)
    }
  } else {
    eraseTimings.push(result.processingTimeMs)
  }
}

console.log('All Transactions:')
console.log(formatStats(calculateStats(singleTimings)))

console.log('\nSuccessful Swaps:')
console.log(formatStats(calculateStats(successTimings)))

if (splitTimings.length > 0) {
  console.log('\nSplit Protocol (Token-to-Token):')
  console.log(formatStats(calculateStats(splitTimings)))
}

console.log('\nERASE Transactions:')
console.log(formatStats(calculateStats(eraseTimings)))

// Benchmark 2: Batch processing
console.log(`\n${'='.repeat(80)}`)
console.log('Benchmark 2: Batch Processing')
console.log(`${'='.repeat(80)}\n`)

const batchSizes = [10, 50, 100]

for (const batchSize of batchSizes) {
  if (batchSize > transactions.length) continue
  
  const batch = transactions.slice(0, batchSize)
  const startTime = Date.now()
  
  for (const { tx } of batch) {
    parser.parseTransaction(tx)
  }
  
  const totalTime = Date.now() - startTime
  const avgTime = totalTime / batchSize
  
  console.log(`Batch size: ${batchSize}`)
  console.log(`  Total time: ${totalTime.toFixed(2)}ms`)
  console.log(`  Avg per tx: ${avgTime.toFixed(2)}ms`)
  console.log(`  Throughput: ${(1000 / avgTime).toFixed(0)} tx/sec`)
  console.log()
}

// Benchmark 3: Repeated parsing (cache effects)
console.log(`${'='.repeat(80)}`)
console.log('Benchmark 3: Repeated Parsing (Cache Effects)')
console.log(`${'='.repeat(80)}\n`)

if (transactions.length > 0) {
  const testTx = transactions[0].tx
  const iterations = 1000
  const timings = []
  
  for (let i = 0; i < iterations; i++) {
    const result = parser.parseTransaction(testTx)
    timings.push(result.processingTimeMs)
  }
  
  console.log(`Iterations: ${iterations}`)
  console.log(formatStats(calculateStats(timings)))
}

// Benchmark 4: Slowest transactions
console.log(`\n${'='.repeat(80)}`)
console.log('Benchmark 4: Slowest Transactions (Top 10)')
console.log(`${'='.repeat(80)}\n`)

const slowest = transactions
  .map(({ file, tx }) => {
    const result = parser.parseTransaction(tx)
    return { file, time: result.processingTimeMs, result }
  })
  .sort((a, b) => b.time - a.time)
  .slice(0, 10)

slowest.forEach((item, index) => {
  const status = item.result.success ? '✅ SWAP' : '❌ ERASE'
  const reason = item.result.success ? '' : ` (${item.result.erase?.reason})`
  console.log(`${index + 1}. ${item.file}`)
  console.log(`   Time: ${item.time.toFixed(2)}ms | ${status}${reason}`)
})

// Summary
console.log(`\n${'='.repeat(80)}`)
console.log('SUMMARY')
console.log(`${'='.repeat(80)}\n`)

const allStats = calculateStats(singleTimings)
const target = 100 // ms

console.log(`Target: <${target}ms for 95th percentile`)
console.log(`Actual: ${allStats.p95.toFixed(2)}ms`)
console.log()

if (allStats.p95 <= target) {
  console.log('✅ PERFORMANCE TARGET MET!')
  console.log(`   95th percentile (${allStats.p95.toFixed(2)}ms) is within target (<${target}ms)`)
} else {
  console.log('⚠️  PERFORMANCE TARGET EXCEEDED')
  console.log(`   95th percentile (${allStats.p95.toFixed(2)}ms) exceeds target (<${target}ms)`)
  console.log(`   Optimization needed: ${(allStats.p95 - target).toFixed(2)}ms over target`)
}

console.log()
console.log(`Mean processing time: ${allStats.mean.toFixed(2)}ms`)
console.log(`Median processing time: ${allStats.median.toFixed(2)}ms`)
console.log(`Max processing time: ${allStats.max.toFixed(2)}ms`)
console.log()

// Breakdown by result type
const successRate = (successTimings.length / singleTimings.length * 100).toFixed(1)
const eraseRate = (eraseTimings.length / singleTimings.length * 100).toFixed(1)
const splitRate = (splitTimings.length / singleTimings.length * 100).toFixed(1)

console.log('Result Distribution:')
console.log(`  Successful swaps: ${successTimings.length} (${successRate}%)`)
console.log(`  ERASE transactions: ${eraseTimings.length} (${eraseRate}%)`)
console.log(`  Split protocol: ${splitTimings.length} (${splitRate}%)`)
console.log()

console.log(`${'='.repeat(80)}\n`)
