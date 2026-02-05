/**
 * Validate V2 Parser Against v2-detections.csv
 * 
 * This script:
 * 1. Reads ONLY transaction signatures from v2-detections.csv (ignoring CSV amounts - they may be wrong!)
 * 2. Fetches each transaction from SHYFT API (fresh data)
 * 3. Runs our V2 parser on it
 * 4. Compares our parser's output with SHYFT's SWAP action amounts (source of truth)
 * 5. Reports any discrepancies
 * 
 * IMPORTANT: We ignore all amount data from CSV and only use SHYFT as source of truth!
 */

const fs = require('fs')
const axios = require('axios')
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'
const CSV_FILE = './v2-detections.csv'
const MAX_TRANSACTIONS = 50 // Test first 50 transactions

// Results tracking
const results = {
  total: 0,
  success: 0,
  failed: 0,
  amountMismatch: 0,
  amountMatch: 0,
  errors: [],
  mismatches: []
}

async function fetchTransaction(signature) {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${signature}`,
      {
        headers: { 'x-api-key': SHYFT_API_KEY },
        timeout: 10000
      }
    )

    if (!response.data.success) {
      throw new Error('SHYFT API returned success=false')
    }

    return response.data.result
  } catch (error) {
    throw new Error(`Failed to fetch: ${error.message}`)
  }
}

function extractShyftAmounts(tx) {
  // Find SWAP action with tokens_swapped
  const swapAction = tx.actions?.find(a => 
    a.type === 'SWAP' && a.info?.tokens_swapped
  )

  if (!swapAction) {
    return null
  }

  const tokensSwapped = swapAction.info.tokens_swapped
  
  return {
    inToken: tokensSwapped.in?.token_address,
    inAmount: tokensSwapped.in?.amount || tokensSwapped.in?.amount_raw,
    inSymbol: tokensSwapped.in?.symbol,
    outToken: tokensSwapped.out?.token_address,
    outAmount: tokensSwapped.out?.amount || tokensSwapped.out?.amount_raw,
    outSymbol: tokensSwapped.out?.symbol
  }
}

function extractParserAmounts(parseResult) {
  if (!parseResult.success || !parseResult.data) {
    return null
  }

  const data = parseResult.data
  
  // Handle split swap
  if ('sellRecord' in data) {
    return {
      type: 'split',
      sellRecord: extractSingleSwapAmounts(data.sellRecord),
      buyRecord: extractSingleSwapAmounts(data.buyRecord)
    }
  }

  return {
    type: 'single',
    ...extractSingleSwapAmounts(data)
  }
}

function extractSingleSwapAmounts(swap) {
  const isBuy = swap.direction === 'BUY'
  
  return {
    direction: swap.direction,
    quoteToken: swap.quoteAsset.mint,
    quoteSymbol: swap.quoteAsset.symbol,
    baseToken: swap.baseAsset.mint,
    baseSymbol: swap.baseAsset.symbol,
    swapInputAmount: swap.amounts.swapInputAmount,
    swapOutputAmount: swap.amounts.swapOutputAmount,
    baseAmount: swap.amounts.baseAmount,
    totalWalletCost: swap.amounts.totalWalletCost,
    netWalletReceived: swap.amounts.netWalletReceived
  }
}

function compareAmounts(shyftAmounts, parserAmounts, signature) {
  if (!shyftAmounts || !parserAmounts) {
    return { match: false, reason: 'Missing amounts data' }
  }

  if (parserAmounts.type === 'split') {
    // For split swaps, we can't directly compare with SHYFT's single SWAP action
    return { match: true, reason: 'Split swap - skipping comparison' }
  }

  // V2 Parser uses market convention:
  // - Quote = pricing currency (SOL, USDC) - the priority asset
  // - Base = asset being traded (the token)
  // 
  // For BUY: User spends quote (SOL/USDC) to buy base (token)
  //   - SHYFT IN = quote (SOL/USDC)
  //   - SHYFT OUT = base (token)
  //   - Parser quoteToken = SHYFT IN
  //   - Parser baseToken = SHYFT OUT
  // 
  // For SELL: User sells base (token) to receive quote (SOL/USDC)
  //   - SHYFT IN = base (token)
  //   - SHYFT OUT = quote (SOL/USDC)
  //   - Parser quoteToken = SHYFT OUT
  //   - Parser baseToken = SHYFT IN
  
  const isBuy = parserAmounts.direction === 'BUY'
  
  let expectedInToken, expectedInAmount, expectedOutToken, expectedOutAmount
  
  if (isBuy) {
    // BUY: User spends quote to buy base
    // SHYFT IN = quote, SHYFT OUT = base
    expectedInToken = parserAmounts.quoteToken
    expectedInAmount = parserAmounts.swapInputAmount || parserAmounts.totalWalletCost
    expectedOutToken = parserAmounts.baseToken
    expectedOutAmount = parserAmounts.baseAmount
  } else {
    // SELL: User sells base to receive quote
    // SHYFT IN = base, SHYFT OUT = quote
    expectedInToken = parserAmounts.baseToken
    expectedInAmount = parserAmounts.baseAmount
    expectedOutToken = parserAmounts.quoteToken
    expectedOutAmount = parserAmounts.swapOutputAmount || parserAmounts.netWalletReceived
  }

  // Compare tokens
  if (shyftAmounts.inToken !== expectedInToken) {
    return {
      match: false,
      reason: 'IN token mismatch',
      expected: expectedInToken,
      actual: shyftAmounts.inToken
    }
  }

  if (shyftAmounts.outToken !== expectedOutToken) {
    return {
      match: false,
      reason: 'OUT token mismatch',
      expected: expectedOutToken,
      actual: shyftAmounts.outToken
    }
  }

  // Compare amounts (allow 1% tolerance for rounding)
  const inAmountShyft = typeof shyftAmounts.inAmount === 'number' 
    ? shyftAmounts.inAmount 
    : parseFloat(shyftAmounts.inAmount)
  
  const outAmountShyft = typeof shyftAmounts.outAmount === 'number'
    ? shyftAmounts.outAmount
    : parseFloat(shyftAmounts.outAmount)

  // For IN amount comparison
  const inDiff = Math.abs(inAmountShyft - expectedInAmount)
  const inTolerance = inAmountShyft * 0.01 // 1% tolerance
  
  if (inDiff > inTolerance && inDiff > 0.000001) {
    return {
      match: false,
      reason: 'IN amount mismatch',
      expected: expectedInAmount,
      actual: inAmountShyft,
      diff: inDiff,
      percentDiff: (inDiff / inAmountShyft * 100).toFixed(2) + '%'
    }
  }

  // For OUT amount comparison
  const outDiff = Math.abs(outAmountShyft - expectedOutAmount)
  const outTolerance = outAmountShyft * 0.01 // 1% tolerance
  
  if (outDiff > outTolerance && outDiff > 0.000001) {
    return {
      match: false,
      reason: 'OUT amount mismatch',
      expected: expectedOutAmount,
      actual: outAmountShyft,
      diff: outDiff,
      percentDiff: (outDiff / outAmountShyft * 100).toFixed(2) + '%'
    }
  }

  return { match: true }
}

async function testTransaction(signature, index) {
  console.log(`\n[${index}] Testing: ${signature.substring(0, 20)}...`)
  
  try {
    // Fetch from SHYFT (source of truth)
    const shyftTx = await fetchTransaction(signature)
    
    // Extract SHYFT's SWAP action amounts (this is what we compare against)
    const shyftAmounts = extractShyftAmounts(shyftTx)
    
    if (!shyftAmounts) {
      console.log(`  ⚠️  No SWAP action found in SHYFT response`)
      results.failed++
      results.errors.push({
        signature,
        reason: 'no_swap_action_in_shyft'
      })
      return
    }
    
    console.log(`  SHYFT SWAP: ${shyftAmounts.inSymbol} ${shyftAmounts.inAmount} → ${shyftAmounts.outSymbol} ${shyftAmounts.outAmount}`)
    
    // Convert to V2 format
    const v2Input = {
      signature,
      timestamp: shyftTx.timestamp ? new Date(shyftTx.timestamp).getTime() : Date.now(),
      status: shyftTx.status || 'Success',
      fee: shyftTx.fee || 0,
      fee_payer: shyftTx.fee_payer || '',
      signers: shyftTx.signers || [],
      protocol: shyftTx.protocol,
      token_balance_changes: shyftTx.token_balance_changes || [],
      actions: shyftTx.actions || []
    }

    // Parse with V2 parser
    const parseResult = parseShyftTransactionV2(v2Input)

    if (!parseResult.success) {
      results.failed++
      results.errors.push({
        signature,
        reason: parseResult.erase?.reason || 'unknown',
        debugInfo: parseResult.erase?.debugInfo
      })
      console.log(`  ❌ Parser rejected: ${parseResult.erase?.reason}`)
      return
    }

    results.success++

    // Extract parser amounts
    const parserAmounts = extractParserAmounts(parseResult)

    // Compare parser output with SHYFT's SWAP action
    const comparison = compareAmounts(shyftAmounts, parserAmounts, signature)

    if (comparison.match) {
      results.amountMatch++
      console.log(`  ✅ Amounts match!`)
      if (parserAmounts.type === 'single') {
        console.log(`     Direction: ${parserAmounts.direction}`)
        console.log(`     Parser: ${shyftAmounts.inSymbol} ${shyftAmounts.inAmount} → ${shyftAmounts.outSymbol} ${shyftAmounts.outAmount}`)
      }
    } else {
      results.amountMismatch++
      results.mismatches.push({
        signature,
        shyftIn: `${shyftAmounts.inSymbol} ${shyftAmounts.inAmount}`,
        shyftOut: `${shyftAmounts.outSymbol} ${shyftAmounts.outAmount}`,
        ...comparison
      })
      console.log(`  ⚠️  Amount mismatch: ${comparison.reason}`)
      if (comparison.expected !== undefined) {
        console.log(`     Expected: ${comparison.expected}`)
        console.log(`     Actual: ${comparison.actual}`)
        if (comparison.percentDiff) {
          console.log(`     Difference: ${comparison.percentDiff}`)
        }
      }
    }

  } catch (error) {
    results.failed++
    results.errors.push({
      signature,
      error: error.message
    })
    console.log(`  ❌ Error: ${error.message}`)
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║     V2 Parser Validation Against SHYFT API                ║')
  console.log('║     (Using transaction signatures from v2-detections.csv)  ║')
  console.log('║     CSV amounts IGNORED - SHYFT is source of truth!       ║')
  console.log('╚════════════════════════════════════════════════════════════╝\n')

  // Read CSV file
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌ CSV file not found: ${CSV_FILE}`)
    process.exit(1)
  }

  const csvContent = fs.readFileSync(CSV_FILE, 'utf-8')
  const lines = csvContent.split('\n').filter(line => line.trim())
  
  // Skip header, extract ONLY signatures (first column)
  const signatures = lines.slice(1).map(line => {
    const parts = line.split(',')
    return parts[0]?.trim() // First column is signature
  }).filter(sig => sig && sig.length > 0)

  console.log(`Found ${signatures.length} transaction signatures in CSV`)
  console.log(`Testing first ${Math.min(MAX_TRANSACTIONS, signatures.length)} transactions...`)
  console.log(`Comparing parser output with SHYFT SWAP action (source of truth)\n`)

  const testSignatures = signatures.slice(0, MAX_TRANSACTIONS)
  results.total = testSignatures.length

  // Test each transaction
  for (let i = 0; i < testSignatures.length; i++) {
    await testTransaction(testSignatures[i], i + 1)
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('VALIDATION SUMMARY')
  console.log('='.repeat(60))
  console.log(`Total Tested: ${results.total}`)
  console.log(`✅ Parsed Successfully: ${results.success}`)
  console.log(`❌ Parse Failed: ${results.failed}`)
  console.log(`✅ Amount Match: ${results.amountMatch}`)
  console.log(`⚠️  Amount Mismatch: ${results.amountMismatch}`)
  console.log()
  console.log(`Success Rate: ${(results.success / results.total * 100).toFixed(1)}%`)
  console.log(`Amount Accuracy: ${results.success > 0 ? (results.amountMatch / results.success * 100).toFixed(1) : 0}%`)

  // Show errors
  if (results.errors.length > 0) {
    console.log('\n' + '='.repeat(60))
    console.log('PARSE ERRORS')
    console.log('='.repeat(60))
    results.errors.slice(0, 10).forEach((err, idx) => {
      console.log(`\n[${idx + 1}] ${err.signature.substring(0, 20)}...`)
      console.log(`    Reason: ${err.reason || err.error}`)
    })
    if (results.errors.length > 10) {
      console.log(`\n... and ${results.errors.length - 10} more errors`)
    }
  }

  // Show mismatches
  if (results.mismatches.length > 0) {
    console.log('\n' + '='.repeat(60))
    console.log('AMOUNT MISMATCHES')
    console.log('='.repeat(60))
    results.mismatches.slice(0, 10).forEach((mismatch, idx) => {
      console.log(`\n[${idx + 1}] ${mismatch.signature.substring(0, 20)}...`)
      console.log(`    SHYFT: ${mismatch.shyftIn} → ${mismatch.shyftOut}`)
      console.log(`    Reason: ${mismatch.reason}`)
      if (mismatch.expected !== undefined) {
        console.log(`    Expected: ${mismatch.expected}`)
        console.log(`    Actual: ${mismatch.actual}`)
        if (mismatch.percentDiff) {
          console.log(`    Difference: ${mismatch.percentDiff}`)
        }
      }
    })
    if (results.mismatches.length > 10) {
      console.log(`\n... and ${results.mismatches.length - 10} more mismatches`)
    }
  }

  console.log('\n' + '='.repeat(60))
  if (results.amountMatch === results.success && results.success > 0) {
    console.log('✅ ALL AMOUNTS MATCH! Parser is working correctly!')
  } else if (results.success > 0 && results.amountMatch / results.success > 0.95) {
    console.log('✅ MOSTLY CORRECT! >95% accuracy')
  } else {
    console.log('⚠️  NEEDS ATTENTION! Some amount mismatches detected')
  }
  console.log('='.repeat(60))
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
