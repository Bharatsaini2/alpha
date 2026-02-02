/**
 * Test Transfer Detection Fix
 * 
 * This script tests the new transfer detection logic to ensure
 * simple transfers are properly filtered out and only real swaps are detected.
 */

const fs = require('fs')
const path = require('path')
const { ShyftParserV2 } = require('./dist/utils/shyftParserV2')

// Initialize V2 parser
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
    actions: tx.actions || [],
  }
}

const SHYFT_RESPONSE_DIR = path.join(__dirname, '..', 'shyft_response')

console.log(`\n${'='.repeat(100)}`)
console.log(`Testing Transfer Detection Fix`)
console.log(`${'='.repeat(100)}\n`)

// Read all JSON files
const files = fs.readdirSync(SHYFT_RESPONSE_DIR)
  .filter(f => f.endsWith('.json'))
  .sort()

const results = {
  total: files.length,
  parsed: 0,
  erased: 0,
  errors: 0,
  transfersDetected: 0,
  realSwaps: 0,
  details: [],
}

console.log(`Testing ${files.length} transactions...\n`)

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

  // Test with V2 parser
  let v2Result
  try {
    const txV2 = convertToV2Format(apiResponse)
    v2Result = parserV2.parseTransaction(txV2)
  } catch (error) {
    console.log(`❌ ${index + 1}. ${file} - Parser error: ${error.message}`)
    results.errors++
    results.details.push({
      file,
      result: 'ERROR',
      error: error.message,
    })
    return
  }

  // Analyze result
  if (v2Result.success) {
    results.parsed++
    results.realSwaps++
    
    const direction = v2Result.data.direction || v2Result.data.splitReason
    console.log(`✅ ${String(index + 1).padStart(3)}. ${file} - SWAP (${direction})`)
    
    results.details.push({
      file,
      result: 'SWAP',
      direction,
      swapper: v2Result.data.swapper,
      confidence: v2Result.data.confidence || v2Result.data.sellRecord?.confidence,
    })
  } else {
    results.erased++
    
    const reason = v2Result.erase.reason
    const isTransferDetected = reason.includes('transfer') || 
                              reason.includes('single_') || 
                              reason.includes('only_transfer') ||
                              reason.includes('no_opposite')
    
    if (isTransferDetected) {
      results.transfersDetected++
      console.log(`🚫 ${String(index + 1).padStart(3)}. ${file} - TRANSFER (${reason})`)
    } else {
      console.log(`❌ ${String(index + 1).padStart(3)}. ${file} - ERASE (${reason})`)
    }
    
    results.details.push({
      file,
      result: 'ERASE',
      reason,
      isTransfer: isTransferDetected,
    })
  }
})

// Summary
console.log(`\n${'='.repeat(100)}`)
console.log('SUMMARY')
console.log(`${'='.repeat(100)}\n`)

console.log(`Total files tested: ${results.total}`)
console.log()

console.log('Results:')
console.log(`  ✅ Real Swaps: ${results.realSwaps}`)
console.log(`  🚫 Transfers Detected: ${results.transfersDetected}`)
console.log(`  ❌ Other ERASE: ${results.erased - results.transfersDetected}`)
console.log(`  ⚠️  Errors: ${results.errors}`)
console.log()

const transferDetectionRate = (results.transfersDetected / results.total * 100).toFixed(1)
const swapDetectionRate = (results.realSwaps / results.total * 100).toFixed(1)

console.log('Detection Rates:')
console.log(`  🚫 Transfer Detection: ${transferDetectionRate}%`)
console.log(`  ✅ Swap Detection: ${swapDetectionRate}%`)
console.log()

// Show transfer detection breakdown
console.log('Transfer Detection Reasons:')
const transferReasons = {}
results.details
  .filter(d => d.result === 'ERASE' && d.isTransfer)
  .forEach(d => {
    transferReasons[d.reason] = (transferReasons[d.reason] || 0) + 1
  })

Object.entries(transferReasons)
  .sort(([,a], [,b]) => b - a)
  .forEach(([reason, count]) => {
    console.log(`  ${reason}: ${count}`)
  })

console.log()

// Show real swaps
console.log('Real Swaps Detected:')
const swapTypes = {}
results.details
  .filter(d => d.result === 'SWAP')
  .forEach(d => {
    swapTypes[d.direction] = (swapTypes[d.direction] || 0) + 1
  })

Object.entries(swapTypes)
  .sort(([,a], [,b]) => b - a)
  .forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`)
  })

console.log(`\n${'='.repeat(100)}`)

// Final verdict
if (results.transfersDetected > results.realSwaps) {
  console.log('🎉 SUCCESS! Transfer detection is working!')
  console.log(`   - Detected ${results.transfersDetected} transfers (filtered out)`)
  console.log(`   - Detected ${results.realSwaps} real swaps (kept)`)
  console.log(`   - Transfer detection rate: ${transferDetectionRate}%`)
} else {
  console.log('⚠️  NEEDS IMPROVEMENT:')
  console.log(`   - Only ${results.transfersDetected} transfers detected`)
  console.log(`   - ${results.realSwaps} transactions still parsed as swaps`)
  console.log(`   - May need to strengthen transfer detection logic`)
}

console.log(`\n${'='.repeat(100)}\n`)