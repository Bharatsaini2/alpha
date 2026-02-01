/**
 * Analyze all SHYFT response files using V1 parser
 * 
 * This script tests the v1 parser against all 40 SHYFT response files
 * to understand which transactions are swaps vs non-swaps.
 */

const fs = require('fs')
const path = require('path')
const { parseShyftTransaction } = require('./src/utils/shyftParser')

const SHYFT_RESPONSE_DIR = path.join(__dirname, '..', 'shyft_response')

// Read all JSON files
const files = fs.readdirSync(SHYFT_RESPONSE_DIR)
  .filter(f => f.endsWith('.json'))
  .sort()

console.log(`\n${'='.repeat(80)}`)
console.log(`SHYFT Response Analysis (V1 Parser) - ${files.length} files`)
console.log(`${'='.repeat(80)}\n`)

const results = {
  parsed: 0,
  null: 0,
  errors: 0,
  byType: {},
  byStatus: {},
  swaps: [],
  nonSwaps: [],
}

files.forEach((file, index) => {
  const filePath = path.join(SHYFT_RESPONSE_DIR, file)
  const content = fs.readFileSync(filePath, 'utf8')
  
  let tx
  try {
    const parsed = JSON.parse(content)
    // Handle SHYFT API response format: {success, message, result}
    tx = parsed.result || parsed
  } catch (error) {
    console.log(`❌ ${index + 1}. ${file} - Invalid JSON`)
    results.errors++
    return
  }

  // Test v1 parser
  let result
  try {
    result = parseShyftTransaction(tx)
  } catch (error) {
    console.log(`❌ ${index + 1}. ${file} - Parser error: ${error.message}`)
    results.errors++
    return
  }

  // Count by type and status
  const type = tx.type || 'unknown'
  const status = tx.status || 'unknown'
  results.byType[type] = (results.byType[type] || 0) + 1
  results.byStatus[status] = (results.byStatus[status] || 0) + 1

  // Display result
  if (result !== null) {
    results.parsed++
    results.swaps.push({
      file,
      side: result.side,
      confidence: result.confidence,
      source: result.classification_source,
      type,
      status,
      inputMint: result.input.mint,
      outputMint: result.output.mint,
    })
    
    console.log(`✅ ${String(index + 1).padStart(2)}. ${file}`)
    console.log(`   SWAP: ${result.side} | Confidence: ${result.confidence} | Source: ${result.classification_source}`)
    console.log(`   Type: ${type} | Status: ${status}`)
    console.log(`   Input: ${result.input.mint.substring(0, 8)}... → Output: ${result.output.mint.substring(0, 8)}...`)
  } else {
    results.null++
    results.nonSwaps.push({
      file,
      type,
      status,
      reason: 'Parser returned null',
      balanceChanges: tx.token_balance_changes?.length || 0,
      actions: tx.actions?.length || 0,
      events: tx.events?.length || 0,
    })
    
    console.log(`❌ ${String(index + 1).padStart(2)}. ${file}`)
    console.log(`   NULL (not a swap)`)
    console.log(`   Type: ${type} | Status: ${status}`)
    console.log(`   Balance changes: ${tx.token_balance_changes?.length || 0} | Actions: ${tx.actions?.length || 0} | Events: ${tx.events?.length || 0}`)
  }
  console.log()
})

// Summary
console.log(`\n${'='.repeat(80)}`)
console.log('SUMMARY')
console.log(`${'='.repeat(80)}\n`)

console.log(`Total files analyzed: ${files.length}`)
console.log(`  ✅ Parsed as SWAP: ${results.parsed} (${Math.round(results.parsed / files.length * 100)}%)`)
console.log(`  ❌ Returned NULL: ${results.null} (${Math.round(results.null / files.length * 100)}%)`)
console.log(`  ⚠️  Errors: ${results.errors}`)
console.log()

console.log('By Transaction Type:')
Object.entries(results.byType)
  .sort((a, b) => b[1] - a[1])
  .forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`)
  })
console.log()

console.log('By Transaction Status:')
Object.entries(results.byStatus)
  .sort((a, b) => b[1] - a[1])
  .forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`)
  })
console.log()

if (results.swaps.length > 0) {
  console.log('SWAPS DETECTED:')
  console.log()
  
  const bySide = {}
  const byConfidence = {}
  const bySource = {}
  
  results.swaps.forEach(swap => {
    bySide[swap.side] = (bySide[swap.side] || 0) + 1
    byConfidence[swap.confidence] = (byConfidence[swap.confidence] || 0) + 1
    bySource[swap.source] = (bySource[swap.source] || 0) + 1
  })
  
  console.log('By Side:')
  Object.entries(bySide).forEach(([side, count]) => {
    console.log(`  ${side}: ${count}`)
  })
  console.log()
  
  console.log('By Confidence:')
  Object.entries(byConfidence).forEach(([conf, count]) => {
    console.log(`  ${conf}: ${count}`)
  })
  console.log()
  
  console.log('By Classification Source:')
  Object.entries(bySource).forEach(([source, count]) => {
    console.log(`  ${source}: ${count}`)
  })
  console.log()
}

if (results.nonSwaps.length > 0) {
  console.log('NON-SWAPS (Should be ERASED):')
  console.log()
  
  results.nonSwaps.forEach(ns => {
    console.log(`  ${ns.file}`)
    console.log(`    Type: ${ns.type} | Status: ${ns.status}`)
    console.log(`    Balance changes: ${ns.balanceChanges} | Actions: ${ns.actions} | Events: ${ns.events}`)
  })
  console.log()
}

console.log(`${'='.repeat(80)}\n`)

// Recommendations
console.log('ANALYSIS:')
console.log()
console.log(`Parser detected ${results.parsed} swaps out of ${files.length} transactions.`)
console.log()

if (results.null > 0) {
  console.log(`${results.null} transactions were NOT classified as swaps. These should be ERASED because:`)
  console.log('  - Pure token transfers (no swap)')
  console.log('  - Account creation without swap')
  console.log('  - Failed transactions')
  console.log('  - Insufficient data to determine swap')
  console.log('  - Airdrops, burns, or other non-economic activities')
}
console.log()

console.log('Expected behavior:')
console.log('  ✅ SWAP: Token inflow + SOL/token outflow (or vice versa)')
console.log('  ❌ ERASE: Pure transfers, account creation only, failed tx, airdrops, burns')
console.log()
