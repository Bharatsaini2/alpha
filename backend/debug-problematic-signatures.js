/**
 * Debug Problematic Signatures
 * 
 * This script analyzes the specific signatures mentioned as problematic:
 * - Normal transfers being classified as swaps
 * - Issues with buy/sell classification
 * - Input/output amount logic breaks
 */

const fs = require('fs')
const path = require('path')
const { ShyftParserV2 } = require('./dist/utils/shyftParserV2')

// Initialize V2 parser
const parserV2 = new ShyftParserV2()

// Problematic signatures from the user's message
const PROBLEMATIC_SIGNATURES = [
  '2kVd8mKgz6bKZFSRaMFvgX3BktD94DPEm2fN7ees1u7ubMLT2T3H6SeQKQ2AR4bFdaV6qfrxgEBGe7oG2YSLz5a5',
  'jaDaLjyXwZhrfSijSVFLfRNXhhDVef5MuG4xPjrRWBnm3jRnEqyAi8dXAy336FyXEuJ1ADdUJQyxpLsYDFzieH4',
  '42W5H12g9q7PHLVdYefCSiusmXLkC7LfX3jr5QaC6917YfQBKqxETapcY4E9W8y4mnh11qbt6reT6kHQJxM2Qewu',
  '4Ler1qc7uqxa6r3snM6vdDFWUpQ5ReU87Mw72fxVRWqUPsptd3KtAddWNL3Dx64ngVWpAukYmr2cLxCWykQFMCQa',
  '2eN1t3kAcgLJnZwgfz6sW95gTcf28Jtf4T5vAXRX5n2sGTx7bb94AHwvr5zCuLksLtqssG6v3bQu3EpQSzoF74N',
  '5faiWCQd4fjAXQDHVRxRYCb8tHUdFYQcdLSeVq13fbRhiVWx7YLTaaqyexgu2ACdD25THTRthheZXQVQV7kzMoaC',
  'NpHRo2dUhoXVXf9BoFYtSpaVYNVqgMcLobtvH5wDvmJxMQMqBtCVbffSimyqe6mkiHAyi2s7wwzfEK1PB49yM3W',
  'S45j5GSDpoWdGTggca1MBJcM4MJJL84cMZtFuuxAq9MHHofRPM7feAtR3MYBmeuoJKgo1DBZJdJZS4A84dWFNBQ',
  '29GW9Q2s29CjKkwThD9rWp6rhmfvbPkeKCEw9wtkMD5Dv5e49wVybtacPnQhyH7rCKsHjyB6hRFnoT82y1qvEHLc',
  '4bJjAa73MxizR7buJjLHRRLZRPtz22fHrMwfSpStCAfd59zWfLUuFGVsGY6JKEyZg27Yf5Mj7R5Yjq33QbQwPYsf'
]

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

// Find SHYFT response files for these signatures
const SHYFT_RESPONSE_DIR = path.join(__dirname, '..', 'shyft_response')

console.log(`\n${'='.repeat(100)}`)
console.log(`Debugging Problematic Signatures`)
console.log(`${'='.repeat(100)}\n`)

// Read all JSON files and find matches
const files = fs.readdirSync(SHYFT_RESPONSE_DIR)
  .filter(f => f.endsWith('.json'))

const foundSignatures = new Map()

// First, find the files containing these signatures
for (const file of files) {
  const filePath = path.join(SHYFT_RESPONSE_DIR, file)
  const content = fs.readFileSync(filePath, 'utf8')
  
  try {
    const apiResponse = JSON.parse(content)
    const tx = apiResponse.result || apiResponse
    const signature = tx.signatures?.[0] || tx.signature
    
    if (signature && PROBLEMATIC_SIGNATURES.includes(signature)) {
      foundSignatures.set(signature, { file, apiResponse })
    }
  } catch (error) {
    console.log(`❌ Error parsing ${file}: ${error.message}`)
  }
}

console.log(`Found ${foundSignatures.size} out of ${PROBLEMATIC_SIGNATURES.length} problematic signatures\n`)

// Analyze each found signature
for (const [signature, { file, apiResponse }] of foundSignatures) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`ANALYZING: ${signature}`)
  console.log(`File: ${file}`)
  console.log(`${'='.repeat(80)}`)
  
  const tx = apiResponse.result || apiResponse
  
  // Show raw transaction data
  console.log('\n📋 RAW TRANSACTION DATA:')
  console.log(`Status: ${tx.status}`)
  console.log(`Fee Payer: ${tx.fee_payer}`)
  console.log(`Signers: ${JSON.stringify(tx.signers)}`)
  console.log(`Protocol: ${JSON.stringify(tx.protocol)}`)
  
  // Show token balance changes
  console.log('\n💰 TOKEN BALANCE CHANGES:')
  if (tx.token_balance_changes && tx.token_balance_changes.length > 0) {
    tx.token_balance_changes.forEach((change, i) => {
      console.log(`  ${i + 1}. ${change.mint}`)
      console.log(`     Owner: ${change.owner}`)
      console.log(`     Change: ${change.change_amount}`)
      console.log(`     Pre: ${change.pre_balance} → Post: ${change.post_balance}`)
    })
  } else {
    console.log('  No token balance changes')
  }
  
  // Show actions
  console.log('\n⚡ ACTIONS:')
  if (tx.actions && tx.actions.length > 0) {
    tx.actions.forEach((action, i) => {
      console.log(`  ${i + 1}. Type: ${action.type}`)
      if (action.info) {
        console.log(`     Info: ${JSON.stringify(action.info, null, 6)}`)
      }
    })
  } else {
    console.log('  No actions')
  }
  
  // Test with V2 parser
  console.log('\n🔍 V2 PARSER ANALYSIS:')
  try {
    const txV2 = convertToV2Format(apiResponse)
    const result = parserV2.parseTransaction(txV2, true) // Enable performance tracking
    
    if (result.success) {
      console.log(`✅ PARSED AS SWAP`)
      console.log(`   Direction: ${result.data.direction || result.data.splitReason}`)
      console.log(`   Swapper: ${result.data.swapper}`)
      
      if (result.data.direction) {
        // Standard swap
        console.log(`   Quote: ${result.data.quoteAsset.symbol} (${result.data.quoteAsset.mint})`)
        console.log(`   Base: ${result.data.baseAsset.symbol} (${result.data.baseAsset.mint})`)
        console.log(`   Input Amount: ${result.data.amounts.swapInputAmount}`)
        console.log(`   Output Amount: ${result.data.amounts.swapOutputAmount}`)
      } else if (result.data.splitReason) {
        // Split swap
        console.log(`   Split Reason: ${result.data.splitReason}`)
        console.log(`   Sell Record: ${result.data.sellRecord.quoteAsset.symbol} → ${result.data.sellRecord.baseAsset.symbol}`)
        console.log(`   Buy Record: ${result.data.buyRecord.quoteAsset.symbol} ← ${result.data.buyRecord.baseAsset.symbol}`)
      }
      
      console.log(`   Confidence: ${result.data.confidence || result.data.sellRecord?.confidence}`)
      console.log(`   Method: ${result.data.swapperIdentificationMethod}`)
    } else {
      console.log(`❌ ERASED`)
      console.log(`   Reason: ${result.erase.reason}`)
      console.log(`   Debug: ${JSON.stringify(result.erase.debugInfo, null, 2)}`)
    }
    
    console.log(`   Processing Time: ${result.processingTimeMs}ms`)
    
    if (result.performanceMetrics) {
      console.log('\n⏱️  PERFORMANCE BREAKDOWN:')
      for (const [component, metrics] of Object.entries(result.performanceMetrics)) {
        console.log(`   ${component}: ${metrics.durationMs}ms`)
      }
    }
    
  } catch (error) {
    console.log(`❌ PARSER ERROR: ${error.message}`)
    console.log(`   Stack: ${error.stack}`)
  }
  
  // Analysis questions
  console.log('\n🤔 ANALYSIS QUESTIONS:')
  
  // Check if this looks like a simple transfer
  const hasOnlyOneTokenChange = tx.token_balance_changes && tx.token_balance_changes.length === 1
  const hasNoActions = !tx.actions || tx.actions.length === 0
  const hasOnlyTransferActions = tx.actions && tx.actions.every(a => 
    a.type === 'TOKEN_TRANSFER' || a.type === 'SOL_TRANSFER'
  )
  
  console.log(`   Is this a simple transfer? ${hasOnlyOneTokenChange && (hasNoActions || hasOnlyTransferActions) ? 'YES' : 'NO'}`)
  console.log(`   - Only one token change: ${hasOnlyOneTokenChange}`)
  console.log(`   - No actions or only transfers: ${hasNoActions || hasOnlyTransferActions}`)
  
  // Check for swap indicators
  const hasSwapActions = tx.actions && tx.actions.some(a => a.type === 'SWAP')
  const hasMultipleTokenChanges = tx.token_balance_changes && tx.token_balance_changes.length > 1
  const hasOppositeDeltas = tx.token_balance_changes && tx.token_balance_changes.length >= 2 &&
    tx.token_balance_changes.some(c => c.change_amount > 0) &&
    tx.token_balance_changes.some(c => c.change_amount < 0)
  
  console.log(`   Has swap indicators? ${hasSwapActions || (hasMultipleTokenChanges && hasOppositeDeltas) ? 'YES' : 'NO'}`)
  console.log(`   - Has SWAP actions: ${hasSwapActions}`)
  console.log(`   - Multiple token changes: ${hasMultipleTokenChanges}`)
  console.log(`   - Has opposite deltas: ${hasOppositeDeltas}`)
}

// Summary
console.log(`\n${'='.repeat(100)}`)
console.log('SUMMARY')
console.log(`${'='.repeat(100)}`)

console.log(`\nAnalyzed ${foundSignatures.size} problematic signatures`)
console.log(`Missing signatures: ${PROBLEMATIC_SIGNATURES.length - foundSignatures.size}`)

if (foundSignatures.size < PROBLEMATIC_SIGNATURES.length) {
  const missing = PROBLEMATIC_SIGNATURES.filter(sig => !foundSignatures.has(sig))
  console.log('\nMissing signatures (not found in SHYFT response files):')
  missing.forEach(sig => console.log(`  - ${sig}`))
}

console.log('\n🔧 RECOMMENDED FIXES:')
console.log('1. Add stricter validation in the gate rules')
console.log('2. Improve transfer vs swap detection logic')
console.log('3. Fix input/output amount calculation')
console.log('4. Add better filtering for simple transfers')
console.log('\nRun this script to identify the root causes of false positives.')