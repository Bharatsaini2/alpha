/**
 * Test AMM Swap Detection Fix
 * 
 * This script tests that V2 parser correctly detects swaps where SOL goes to AMM/pool
 * instead of being recorded as a balance change for the swapper.
 * 
 * Bug: V1 parser missed 11 swaps because it only looked at balance changes
 * Fix: V2 parser now looks at actions to find SOL transfers
 */

const fs = require('fs')
const path = require('path')
const { ShyftParserV2 } = require('./dist/utils/shyftParserV2')

const SHYFT_RESPONSE_DIR = path.join(__dirname, '..', 'shyft_response')

// The 11 files that V1 missed but should be detected as swaps
const MISSED_SWAPS = [
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
]

// Initialize v2 parser
const parserV2 = new ShyftParserV2()

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

console.log(`\n${'='.repeat(80)}`)
console.log(`Testing AMM Swap Detection Fix - ${MISSED_SWAPS.length} files`)
console.log(`${'='.repeat(80)}\n`)

let detected = 0
let stillMissed = 0
const results = []

MISSED_SWAPS.forEach((file, index) => {
  const filePath = path.join(SHYFT_RESPONSE_DIR, file)
  
  if (!fs.existsSync(filePath)) {
    console.log(`❌ ${index + 1}. ${file} - File not found`)
    return
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const parsed = JSON.parse(content)
  const tx = parsed.result || parsed

  // Test v2 parser
  const txV2 = convertToV2(tx)
  const result = parserV2.parseTransaction(txV2)

  if (result.success) {
    detected++
    const swap = 'sellRecord' in result.data ? result.data.buyRecord : result.data
    
    console.log(`✅ ${index + 1}. ${file}`)
    console.log(`   DETECTED: ${swap.direction}`)
    console.log(`   Confidence: ${swap.confidence}`)
    console.log(`   Quote: ${swap.quoteAsset.symbol} | Base: ${swap.baseAsset.symbol}`)
    console.log(`   Swapper: ${swap.swapper.substring(0, 8)}...`)
    
    results.push({
      file,
      detected: true,
      direction: swap.direction,
      confidence: swap.confidence,
    })
  } else {
    stillMissed++
    
    console.log(`❌ ${index + 1}. ${file}`)
    console.log(`   STILL MISSED: ${result.erase?.reason || 'unknown'}`)
    if (result.erase?.debugInfo) {
      console.log(`   Debug: ${JSON.stringify(result.erase.debugInfo).substring(0, 100)}...`)
    }
    
    results.push({
      file,
      detected: false,
      reason: result.erase?.reason,
    })
  }
  console.log()
})

// Summary
console.log(`\n${'='.repeat(80)}`)
console.log('SUMMARY')
console.log(`${'='.repeat(80)}\n`)

console.log(`Total files tested: ${MISSED_SWAPS.length}`)
console.log(`✅ Now detected: ${detected} (${Math.round(detected / MISSED_SWAPS.length * 100)}%)`)
console.log(`❌ Still missed: ${stillMissed} (${Math.round(stillMissed / MISSED_SWAPS.length * 100)}%)`)
console.log()

if (detected === MISSED_SWAPS.length) {
  console.log('🎉 SUCCESS! All 11 previously missed swaps are now detected!')
} else if (detected > 0) {
  console.log(`⚠️  PARTIAL FIX: Detected ${detected} out of ${MISSED_SWAPS.length} swaps`)
  console.log('   Some swaps still need additional logic')
} else {
  console.log('❌ FIX FAILED: No additional swaps detected')
  console.log('   The AMM detection logic needs more work')
}

console.log()
console.log(`${'='.repeat(80)}\n`)

// Expected vs Actual
console.log('EXPECTED BEHAVIOR:')
console.log('  All 11 files should be detected as BUY swaps')
console.log('  Pattern: Fee payer sends SOL to pool + receives tokens')
console.log()

console.log('ACTUAL RESULTS:')
results.forEach((r, i) => {
  if (r.detected) {
    console.log(`  ✅ ${i + 1}. ${r.file} - ${r.direction} (confidence: ${r.confidence})`)
  } else {
    console.log(`  ❌ ${i + 1}. ${r.file} - ${r.reason}`)
  }
})
console.log()
