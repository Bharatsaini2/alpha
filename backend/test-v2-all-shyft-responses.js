/**
 * Test V2 Parser Against All 40 SHYFT Response Files
 * 
 * This script tests if V2 parser correctly identifies all valid swaps
 * including the 11 that V1 missed (AMM swap patterns).
 */

const fs = require('fs')
const path = require('path')
const { ShyftParserV2 } = require('./dist/utils/shyftParserV2')

const SHYFT_RESPONSE_DIR = path.join(__dirname, '..', 'shyft_response')

// Initialize v2 parser
const parserV2 = new ShyftParserV2()

// Helper to convert SHYFT API response to v2 format
function convertToV2Format(apiResponse) {
  const tx = apiResponse.result || apiResponse
  
  return {
    signature: tx.signatures?.[0] || tx.signature || 'unknown',
    timestamp: typeof tx.timestamp === 'string' 
      ? new Date(tx.timestamp).getTime() / 1000 
      : Date.now() / 1000,
    status: tx.status || 'Success',
    fee: tx.fee || 0.000005,
    fee_payer: tx.fee_payer || '',
    signers: tx.signers || [],
    protocol: tx.protocol || (tx.actions?.[0]?.type 
      ? { name: tx.actions[0].type, address: 'unknown' }
      : undefined),
    token_balance_changes: tx.token_balance_changes || [],
    actions: tx.actions || [],  // CRITICAL: Include actions for AMM swap detection!
  }
}

// Expected results based on deep analysis
const EXPECTED_SWAPS = [
  'CREATE_TOKEN_ACCOUNT1.json',
  'CREATE_TOKEN_ACCOUNT2.json',
  'GETACCOUNTDATASIZE4.json',
  'GETACCOUNTDATASIZE6.json',
  'INIT_USER_VOLUME_ACCUMULATOR.json',
  'INIT_USER_VOLUME_ACCUMULATOR2.json', // V1 missed this!
  'TOKEN_TRANSFER2.json',
  'TOKEN_TRANSFER3.json',
  'TokenTransfer.json',
  'Untitled - response-10.json', // V1 missed this!
  'Untitled - response-11.json', // V1 missed this!
  'Untitled - response-12.json',
  'Untitled - response-13.json',
  'Untitled - response-14.json', // V1 missed this!
  'Untitled - response-15.json',
  'Untitled - response-16.json', // V1 missed this!
  'Untitled - response-17.json', // V1 missed this!
  'Untitled - response-18.json', // V1 missed this!
  'Untitled - response-19.json', // V1 missed this!
  'Untitled - response-2.json',
  'Untitled - response-20.json', // V1 missed this!
  'Untitled - response-21.json', // V1 missed this!
  'Untitled - response-23.json', // V1 missed this!
  'Untitled - response-24.json',
  'Untitled - response-25.json',
  'Untitled - response-26.json',
  'Untitled - response-3.json',
  'Untitled - response-4.json',
  'Untitled - response-5.json',
  'Untitled - response-6.json',
  'Untitled - response-7.json',
  'Untitled - response-8.json',
  'Untitled - response-9.json',
  'Untitled - response.json',
  'getaccountdatasize2.json',
  'getaccountdatasize3.json',
  'normal swap withinout2.json',
  'normalswapwithinout1.json',
  'token trasfer1.json',
]

const EXPECTED_ERASE = [
  'Untitled - response-22.json', // Complex SELL, needs review
]

// Read all JSON files
const files = fs.readdirSync(SHYFT_RESPONSE_DIR)
  .filter(f => f.endsWith('.json'))
  .sort()

console.log(`\n${'='.repeat(100)}`)
console.log(`V2 Parser Test - All 40 SHYFT Response Files`)
console.log(`${'='.repeat(100)}\n`)

const results = {
  total: files.length,
  parsed: 0,
  erased: 0,
  errors: 0,
  correctSwaps: 0,
  correctErase: 0,
  falsePositives: 0,
  falseNegatives: 0,
  v1Missed: 0,
  details: [],
}

files.forEach((file, index) => {
  const filePath = path.join(SHYFT_RESPONSE_DIR, file)
  const content = fs.readFileSync(filePath, 'utf8')
  
  let apiResponse
  try {
    apiResponse = JSON.parse(content)
  } catch (error) {
    console.log(`❌ ${index + 1}. ${file} - Invalid JSON`)
    results.errors++
    return
  }

  // Test v2 parser
  let v2Result
  try {
    const txV2 = convertToV2Format(apiResponse)
    v2Result = parserV2.parseTransaction(txV2)
  } catch (error) {
    console.log(`❌ ${index + 1}. ${file} - Parser error: ${error.message}`)
    results.errors++
    results.details.push({
      file,
      expected: EXPECTED_SWAPS.includes(file) ? 'SWAP' : 'ERASE',
      actual: 'ERROR',
      error: error.message,
    })
    return
  }

  // Determine expected result
  const expectedSwap = EXPECTED_SWAPS.includes(file)
  const expectedErase = EXPECTED_ERASE.includes(file)
  const v1Missed = [
    'INIT_USER_VOLUME_ACCUMULATOR2.json',
    'Untitled - response-10.json',
    'Untitled - response-11.json',
    'Untitled - response-14.json',
    'Untitled - response-16.json',
    'Untitled - response-17.json',
    'Untitled - response-18.json',
    'Untitled - response-19.json',
    'Untitled - response-20.json',
    'Untitled - response-21.json',
    'Untitled - response-23.json',
  ].includes(file)

  // Check result
  const v2IsSwap = v2Result.success
  const v2IsErase = !v2Result.success && v2Result.erase

  if (v2IsSwap) results.parsed++
  if (v2IsErase) results.erased++

  // Validate against expectations
  let status = '✅'
  let verdict = 'CORRECT'
  
  if (expectedSwap && v2IsSwap) {
    results.correctSwaps++
    if (v1Missed) {
      results.v1Missed++
      status = '🎯'
      verdict = 'CORRECT (V1 MISSED THIS!)'
    }
  } else if (expectedErase && v2IsErase) {
    results.correctErase++
  } else if (expectedSwap && !v2IsSwap) {
    status = '❌'
    verdict = 'FALSE NEGATIVE (missed swap)'
    results.falseNegatives++
  } else if (!expectedSwap && v2IsSwap) {
    status = '⚠️'
    verdict = 'FALSE POSITIVE (parsed non-swap)'
    results.falsePositives++
  }

  // Display result
  const v2Status = v2IsSwap 
    ? `SWAP (${v2Result.data.direction || v2Result.data.sellRecord?.direction})`
    : v2IsErase 
      ? `ERASE (${v2Result.erase.reason})`
      : 'ERROR'
  
  const expected = expectedSwap ? 'SWAP' : expectedErase ? 'ERASE' : 'UNKNOWN'
  
  console.log(`${status} ${String(index + 1).padStart(2)}. ${file}`)
  console.log(`   Expected: ${expected}`)
  console.log(`   V2 Result: ${v2Status}`)
  console.log(`   Verdict: ${verdict}`)
  console.log()

  results.details.push({
    file,
    expected,
    actual: v2IsSwap ? 'SWAP' : v2IsErase ? 'ERASE' : 'ERROR',
    v2Status,
    verdict,
    v1Missed,
  })
})

// Summary
console.log(`\n${'='.repeat(100)}`)
console.log('SUMMARY')
console.log(`${'='.repeat(100)}\n`)

console.log(`Total files tested: ${results.total}`)
console.log()

console.log('V2 Parser Results:')
console.log(`  ✅ Parsed as SWAP: ${results.parsed}`)
console.log(`  ❌ Returned ERASE: ${results.erased}`)
console.log(`  ⚠️  Errors: ${results.errors}`)
console.log()

console.log('Accuracy:')
console.log(`  ✅ Correct swaps detected: ${results.correctSwaps}/${EXPECTED_SWAPS.length}`)
console.log(`  ✅ Correct ERASE: ${results.correctErase}/${EXPECTED_ERASE.length}`)
console.log(`  ❌ False negatives (missed swaps): ${results.falseNegatives}`)
console.log(`  ⚠️  False positives (parsed non-swaps): ${results.falsePositives}`)
console.log()

console.log('V1 Comparison:')
console.log(`  🎯 V1 missed swaps that V2 caught: ${results.v1Missed}/11`)
console.log()

const accuracy = ((results.correctSwaps + results.correctErase) / results.total * 100).toFixed(1)
console.log(`Overall Accuracy: ${accuracy}%`)
console.log()

// Show issues
if (results.falseNegatives > 0) {
  console.log('FALSE NEGATIVES (V2 missed these swaps):')
  results.details
    .filter(d => d.verdict.includes('FALSE NEGATIVE'))
    .forEach(d => {
      console.log(`  ❌ ${d.file}`)
      console.log(`     Expected: ${d.expected} | Got: ${d.actual}`)
    })
  console.log()
}

if (results.falsePositives > 0) {
  console.log('FALSE POSITIVES (V2 parsed non-swaps):')
  results.details
    .filter(d => d.verdict.includes('FALSE POSITIVE'))
    .forEach(d => {
      console.log(`  ⚠️  ${d.file}`)
      console.log(`     Expected: ${d.expected} | Got: ${d.actual}`)
    })
  console.log()
}

// V1 improvements
if (results.v1Missed > 0) {
  console.log('V2 IMPROVEMENTS OVER V1:')
  results.details
    .filter(d => d.v1Missed && d.verdict.includes('CORRECT'))
    .forEach(d => {
      console.log(`  🎯 ${d.file}`)
      console.log(`     V1: NULL | V2: ${d.actual} ✅`)
    })
  console.log()
}

console.log(`${'='.repeat(100)}\n`)

// Final verdict
if (results.falseNegatives === 0 && results.falsePositives === 0 && results.errors === 0) {
  console.log('🎉 SUCCESS! V2 parser correctly identifies all transactions!')
  console.log(`   - Detected all ${EXPECTED_SWAPS.length} valid swaps`)
  console.log(`   - Correctly ERASED ${EXPECTED_ERASE.length} non-swaps`)
  console.log(`   - Fixed ${results.v1Missed} swaps that V1 missed`)
  process.exit(0)
} else {
  console.log('⚠️  ISSUES FOUND:')
  if (results.falseNegatives > 0) {
    console.log(`   - ${results.falseNegatives} false negatives (missed swaps)`)
  }
  if (results.falsePositives > 0) {
    console.log(`   - ${results.falsePositives} false positives (parsed non-swaps)`)
  }
  if (results.errors > 0) {
    console.log(`   - ${results.errors} parser errors`)
  }
  console.log()
  console.log('Review the issues above and fix the parser.')
  process.exit(1)
}
