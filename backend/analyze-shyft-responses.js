/**
 * Analyze all SHYFT response files to determine which should be parsed vs ERASED
 * 
 * This script tests both v1 and v2 parsers against all 40 SHYFT response files
 * to understand the parsing behavior and identify any discrepancies.
 */

const fs = require('fs')
const path = require('path')
const { parseShyftTransaction } = require('./src/utils/shyftParser')
const { ShyftParserV2 } = require('./dist/utils/shyftParserV2')

const SHYFT_RESPONSE_DIR = path.join(__dirname, '..', 'shyft_response')

// Initialize v2 parser
const parserV2 = new ShyftParserV2()

// Helper to convert v1 format to v2 format
function convertV1ToV2(txV1) {
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
  }
}

// Read all JSON files
const files = fs.readdirSync(SHYFT_RESPONSE_DIR)
  .filter(f => f.endsWith('.json'))
  .sort()

console.log(`\n${'='.repeat(80)}`)
console.log(`SHYFT Response Analysis - ${files.length} files`)
console.log(`${'='.repeat(80)}\n`)

const results = {
  v1Parsed: 0,
  v1Null: 0,
  v2Parsed: 0,
  v2Erase: 0,
  v2Error: 0,
  matches: 0,
  discrepancies: [],
  eraseReasons: {},
}

files.forEach((file, index) => {
  const filePath = path.join(SHYFT_RESPONSE_DIR, file)
  const content = fs.readFileSync(filePath, 'utf8')
  
  let tx
  try {
    tx = JSON.parse(content)
  } catch (error) {
    console.log(`❌ ${index + 1}. ${file} - Invalid JSON`)
    return
  }

  // Test v1 parser
  let v1Result
  try {
    v1Result = parseShyftTransaction(tx)
  } catch (error) {
    v1Result = null
  }

  // Test v2 parser
  let v2Result
  try {
    const txV2 = convertV1ToV2(tx)
    v2Result = parserV2.parseTransaction(txV2)
  } catch (error) {
    v2Result = { success: false, error: error.message }
    results.v2Error++
  }

  // Count results
  if (v1Result !== null) results.v1Parsed++
  else results.v1Null++

  if (v2Result.success) results.v2Parsed++
  else if (v2Result.erase) {
    results.v2Erase++
    const reason = v2Result.erase.reason
    results.eraseReasons[reason] = (results.eraseReasons[reason] || 0) + 1
  }

  // Check if results match
  const v1IsSwap = v1Result !== null
  const v2IsSwap = v2Result.success
  const match = v1IsSwap === v2IsSwap

  if (match) results.matches++
  else {
    results.discrepancies.push({
      file,
      v1: v1IsSwap ? 'SWAP' : 'NULL',
      v2: v2IsSwap ? 'SWAP' : v2Result.erase?.reason || 'ERROR',
      type: tx.type,
      status: tx.status,
    })
  }

  // Display result
  const icon = match ? '✅' : '⚠️'
  const v1Status = v1Result ? `SWAP (${v1Result.side})` : 'NULL'
  const v2Status = v2Result.success 
    ? `SWAP (${v2Result.data.direction || v2Result.data.sellRecord?.direction})`
    : v2Result.erase 
      ? `ERASE (${v2Result.erase.reason})`
      : 'ERROR'
  
  console.log(`${icon} ${String(index + 1).padStart(2)}. ${file}`)
  console.log(`   V1: ${v1Status}`)
  console.log(`   V2: ${v2Status}`)
  console.log(`   Type: ${tx.type || 'unknown'} | Status: ${tx.status || 'unknown'}`)
  console.log()
})

// Summary
console.log(`\n${'='.repeat(80)}`)
console.log('SUMMARY')
console.log(`${'='.repeat(80)}\n`)

console.log(`Total files analyzed: ${files.length}`)
console.log()

console.log('V1 Parser Results:')
console.log(`  ✅ Parsed as SWAP: ${results.v1Parsed}`)
console.log(`  ❌ Returned NULL: ${results.v1Null}`)
console.log()

console.log('V2 Parser Results:')
console.log(`  ✅ Parsed as SWAP: ${results.v2Parsed}`)
console.log(`  ❌ Returned ERASE: ${results.v2Erase}`)
console.log(`  ⚠️  Errors: ${results.v2Error}`)
console.log()

console.log('ERASE Reasons:')
Object.entries(results.eraseReasons)
  .sort((a, b) => b[1] - a[1])
  .forEach(([reason, count]) => {
    console.log(`  - ${reason}: ${count}`)
  })
console.log()

console.log(`Agreement: ${results.matches}/${files.length} (${Math.round(results.matches / files.length * 100)}%)`)
console.log()

if (results.discrepancies.length > 0) {
  console.log('Discrepancies:')
  results.discrepancies.forEach(d => {
    console.log(`  ⚠️  ${d.file}`)
    console.log(`     V1: ${d.v1} | V2: ${d.v2}`)
    console.log(`     Type: ${d.type} | Status: ${d.status}`)
  })
  console.log()
}

console.log(`${'='.repeat(80)}\n`)

// Recommendations
console.log('RECOMMENDATIONS:')
console.log()
if (results.v2Parsed < results.v1Parsed) {
  console.log('⚠️  V2 is more strict than V1 (parsing fewer transactions)')
  console.log('   This is expected - V2 has enhanced validation')
} else if (results.v2Parsed > results.v1Parsed) {
  console.log('✅ V2 is detecting more swaps than V1')
  console.log('   Review discrepancies to ensure they are valid swaps')
} else {
  console.log('✅ V1 and V2 have same detection rate')
}
console.log()

if (results.eraseReasons.invalid_input > 0) {
  console.log(`ℹ️  ${results.eraseReasons.invalid_input} transactions failed input validation`)
  console.log('   These may have malformed data or missing required fields')
}
console.log()

console.log('Expected ERASE categories:')
console.log('  - invalid_input: Malformed data, missing fields')
console.log('  - transaction_failed: Status not "Success"')
console.log('  - swapper_identification_failed: Cannot determine swapper')
console.log('  - invalid_asset_count: Not exactly 2 active assets')
console.log('  - both_positive_airdrop: Both deltas positive (airdrop)')
console.log('  - both_negative_burn: Both deltas negative (burn)')
console.log('  - Pure transfers: Should be ERASED (not swaps)')
console.log()
