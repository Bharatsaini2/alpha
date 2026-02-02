/**
 * Fix Transfer vs Swap Detection
 * 
 * This script identifies the core issues with the V2 parser incorrectly
 * classifying simple transfers as swaps and provides fixes.
 */

const fs = require('fs')
const path = require('path')

console.log(`\n${'='.repeat(100)}`)
console.log(`TRANSFER vs SWAP DETECTION ANALYSIS`)
console.log(`${'='.repeat(100)}\n`)

// Read the CSV to analyze current detections
const csvPath = path.join(__dirname, 'v2-detections.csv')
const csvContent = fs.readFileSync(csvPath, 'utf8')
const lines = csvContent.split('\n').slice(1) // Skip header

console.log(`Total detections in CSV: ${lines.length - 1}`) // -1 for empty last line

// Analyze patterns
const patterns = {
  transfers: 0,
  realSwaps: 0,
  unknownTokens: 0,
  lowConfidence: 0,
  tokenBalanceChangesSource: 0,
  tokensSwappedSource: 0
}

const suspiciousTransfers = []

lines.forEach((line, index) => {
  if (!line.trim()) return
  
  const cols = line.split(',')
  if (cols.length < 13) return
  
  const [signature, timestamp, side, whale, inputMint, outputMint, inputSymbol, outputSymbol, inputAmountRaw, outputAmountRaw, inputAmountNormalized, outputAmountNormalized, confidence, source] = cols
  
  // Count by source
  if (source === 'token_balance_changes') {
    patterns.tokenBalanceChangesSource++
  } else if (source === 'tokens_swapped') {
    patterns.tokensSwappedSource++
  }
  
  // Count unknown tokens
  if (inputSymbol === 'UNKNOWN' || outputSymbol === 'UNKNOWN') {
    patterns.unknownTokens++
  }
  
  // Count low confidence
  if (confidence === 'LOW') {
    patterns.lowConfidence++
  }
  
  // Identify suspicious transfers (likely false positives)
  const isSuspiciousTransfer = (
    // Only one side has amount (input OR output, not both)
    (inputAmountRaw && !outputAmountRaw) || (!inputAmountRaw && outputAmountRaw)
  ) && (
    // Low confidence
    confidence === 'LOW'
  ) && (
    // From token_balance_changes (not from actual swap actions)
    source === 'token_balance_changes'
  )
  
  if (isSuspiciousTransfer) {
    patterns.transfers++
    suspiciousTransfers.push({
      signature,
      side,
      inputSymbol,
      outputSymbol,
      inputAmount: inputAmountRaw,
      outputAmount: outputAmountRaw,
      confidence
    })
  } else {
    patterns.realSwaps++
  }
})

console.log('PATTERN ANALYSIS:')
console.log(`📊 Real Swaps: ${patterns.realSwaps}`)
console.log(`🔄 Suspicious Transfers: ${patterns.transfers}`)
console.log(`❓ Unknown Tokens: ${patterns.unknownTokens}`)
console.log(`📉 Low Confidence: ${patterns.lowConfidence}`)
console.log(`🏦 From token_balance_changes: ${patterns.tokenBalanceChangesSource}`)
console.log(`⚡ From tokens_swapped: ${patterns.tokensSwappedSource}`)

console.log(`\n${'='.repeat(80)}`)
console.log('SUSPICIOUS TRANSFERS (First 10):')
console.log(`${'='.repeat(80)}`)

suspiciousTransfers.slice(0, 10).forEach((transfer, i) => {
  console.log(`${i + 1}. ${transfer.signature}`)
  console.log(`   Side: ${transfer.side}`)
  console.log(`   Input: ${transfer.inputSymbol} (${transfer.inputAmount || 'empty'})`)
  console.log(`   Output: ${transfer.outputSymbol} (${transfer.outputAmount || 'empty'})`)
  console.log(`   Confidence: ${transfer.confidence}`)
  console.log()
})

console.log(`\n${'='.repeat(100)}`)
console.log('IDENTIFIED ISSUES:')
console.log(`${'='.repeat(100)}`)

console.log(`
1. 🚨 TRANSFER DETECTION ISSUE:
   - ${patterns.transfers} transactions look like simple transfers
   - They have only input OR output amount, not both
   - All are LOW confidence from token_balance_changes
   - These should be ERASED, not parsed as swaps

2. 🚨 GATE RULE ISSUE:
   - Current logic: "IF number_of_assets_with_delta < 2 → ERASE"
   - Missing: "IF only one asset has meaningful change → ERASE"
   - Missing: "IF no counter-asset gained by swapper → ERASE"

3. 🚨 SOURCE VALIDATION ISSUE:
   - ${patterns.tokenBalanceChangesSource} from token_balance_changes
   - ${patterns.tokensSwappedSource} from tokens_swapped
   - token_balance_changes can include simple transfers
   - Need to validate actual swap occurred

4. 🚨 AMOUNT LOGIC ISSUE:
   - Many transactions have empty input or output amounts
   - This indicates the amount calculation is broken
   - Should have both input AND output for valid swaps
`)

console.log(`\n${'='.repeat(100)}`)
console.log('RECOMMENDED FIXES:')
console.log(`${'='.repeat(100)}`)

console.log(`
1. 🔧 ADD TRANSFER DETECTION GATE:
   - Before quote/base detection, check if this is a simple transfer
   - If only one token changes hands without counter-asset → ERASE
   - If no actual swap action occurred → ERASE

2. 🔧 STRENGTHEN GATE RULES:
   - Current: number_of_assets_with_delta < 2 → ERASE
   - Add: no_counter_asset_gained → ERASE
   - Add: only_transfer_actions → ERASE
   - Add: single_sided_amount → ERASE

3. 🔧 FIX AMOUNT CALCULATION:
   - Ensure both input and output amounts are calculated
   - If either is missing/zero, investigate why
   - Validate amounts make sense for the detected direction

4. 🔧 IMPROVE SOURCE VALIDATION:
   - Prioritize tokens_swapped over token_balance_changes
   - Validate that actual swap actions exist
   - Don't rely solely on balance changes for swap detection
`)

console.log(`\nNext steps:`)
console.log(`1. Run the V2 test script to see current behavior`)
console.log(`2. Implement the transfer detection gate`)
console.log(`3. Fix the amount calculation logic`)
console.log(`4. Re-test with the problematic signatures`)