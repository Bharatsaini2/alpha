/**
 * Diagnose Edge Cases - Understand why V2 behaved differently
 */

const { ShyftParserV2 } = require('./dist/utils/shyftParserV2')
const fs = require('fs')

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

console.log('\n' + '='.repeat(100))
console.log('EDGE CASE DIAGNOSIS')
console.log('='.repeat(100) + '\n')

// ============================================================================
// FALSE NEGATIVE: Untitled - response-6.json
// ============================================================================

console.log('1. FALSE NEGATIVE (V2 missed this valid swap)')
console.log('-'.repeat(100))

const falseNegativeData = JSON.parse(fs.readFileSync('./edge-case-false-negative.json', 'utf8'))
const falseNegativeTx = convertToV2Format(falseNegativeData)

console.log('\nTransaction:', falseNegativeTx.signature)
console.log('Type:', falseNegativeData.result.type)
console.log('Protocol:', falseNegativeData.result.protocol.name)

console.log('\nToken Balance Changes:')
falseNegativeTx.token_balance_changes.forEach((change, i) => {
  console.log(`  ${i + 1}. ${change.mint.substring(0, 8)}... (${change.decimals} decimals)`)
  console.log(`     Owner: ${change.owner.substring(0, 8)}...`)
  console.log(`     Change: ${change.change_amount}`)
})

console.log('\nActions:')
falseNegativeTx.actions.forEach((action, i) => {
  console.log(`  ${i + 1}. ${action.type}`)
  if (action.info) {
    if (action.info.sender && action.info.receiver) {
      console.log(`     ${action.info.sender.substring(0, 8)}... → ${action.info.receiver.substring(0, 8)}...`)
      console.log(`     Amount: ${action.info.amount || action.info.amount_raw}`)
    }
    if (action.info.tokens_swapped) {
      console.log(`     In: ${action.info.tokens_swapped.in.amount} ${action.info.tokens_swapped.in.symbol}`)
      console.log(`     Out: ${action.info.tokens_swapped.out.amount} ${action.info.tokens_swapped.out.symbol}`)
    }
  }
})

console.log('\nParsing with V2...')
const parser = new ShyftParserV2()
const falseNegativeResult = parser.parseTransaction(falseNegativeTx)

console.log('\nV2 Result:')
if (falseNegativeResult.success) {
  console.log('  ✅ SUCCESS')
  console.log('  Direction:', falseNegativeResult.data.direction)
  console.log('  Quote:', falseNegativeResult.data.quoteAsset.symbol)
  console.log('  Base:', falseNegativeResult.data.baseAsset.symbol)
} else {
  console.log('  ❌ ERASE')
  console.log('  Reason:', falseNegativeResult.erase.reason)
  console.log('  Debug:', JSON.stringify(falseNegativeResult.erase.debugInfo, null, 2))
}

console.log('\nExpected: SELL (liberation → SOL)')
console.log('Actual:', falseNegativeResult.success ? `${falseNegativeResult.data.direction}` : 'ERASE')

// ============================================================================
// FALSE POSITIVE: Untitled - response-22.json
// ============================================================================

console.log('\n\n2. FALSE POSITIVE (V2 parsed this non-swap)')
console.log('-'.repeat(100))

const falsePositiveData = JSON.parse(fs.readFileSync('./edge-case-false-positive.json', 'utf8'))
const falsePositiveTx = convertToV2Format(falsePositiveData)

console.log('\nTransaction:', falsePositiveTx.signature)
console.log('Type:', falsePositiveData.result.type)
console.log('Protocol:', falsePositiveData.result.protocol.name)

console.log('\nToken Balance Changes:')
falsePositiveTx.token_balance_changes.forEach((change, i) => {
  console.log(`  ${i + 1}. ${change.mint.substring(0, 8)}... (${change.decimals} decimals)`)
  console.log(`     Owner: ${change.owner.substring(0, 8)}...`)
  console.log(`     Change: ${change.change_amount}`)
})

console.log('\nActions:')
falsePositiveTx.actions.forEach((action, i) => {
  console.log(`  ${i + 1}. ${action.type}`)
  if (action.info) {
    if (action.info.sender && action.info.receiver) {
      console.log(`     ${action.info.sender.substring(0, 8)}... → ${action.info.receiver.substring(0, 8)}...`)
      console.log(`     Amount: ${action.info.amount || action.info.amount_raw}`)
    }
    if (action.info.tokens_swapped) {
      console.log(`     In: ${action.info.tokens_swapped.in.amount} ${action.info.tokens_swapped.in.symbol}`)
      console.log(`     Out: ${action.info.tokens_swapped.out.amount} ${action.info.tokens_swapped.out.symbol}`)
    }
  }
})

console.log('\nParsing with V2...')
const falsePositiveResult = parser.parseTransaction(falsePositiveTx)

console.log('\nV2 Result:')
if (falsePositiveResult.success) {
  console.log('  ✅ SUCCESS')
  console.log('  Direction:', falsePositiveResult.data.direction)
  console.log('  Quote:', falsePositiveResult.data.quoteAsset.symbol)
  console.log('  Base:', falsePositiveResult.data.baseAsset.symbol)
} else {
  console.log('  ❌ ERASE')
  console.log('  Reason:', falsePositiveResult.erase.reason)
}

console.log('\nExpected: ERASE')
console.log('Actual:', falsePositiveResult.success ? `${falsePositiveResult.data.direction}` : 'ERASE')
console.log('\nNote: This looks like a valid SELL swap. Test expectations might be wrong.')

console.log('\n' + '='.repeat(100))
console.log('ANALYSIS COMPLETE')
console.log('='.repeat(100) + '\n')
