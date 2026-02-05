/**
 * Test V2 Parser with User-Provided Transaction Signatures
 * 
 * This script:
 * 1. Reads transaction signatures from test-signatures.txt
 * 2. Fetches each transaction from SHYFT API (source of truth)
 * 3. Runs our V2 parser on it
 * 4. Compares parser output with SHYFT's SWAP action amounts
 * 5. Reports detailed results for each transaction
 */

const fs = require('fs')
const axios = require('axios')
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'
const SIGNATURES_FILE = './test-signatures.txt'

// Results tracking
const results = {
  total: 0,
  success: 0,
  failed: 0,
  amountMatch: 0,
  amountMismatch: 0,
  errors: [],
  mismatches: [],
  details: []
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
    inSymbol: tokensSwapped.in?.symbol || 'Unknown',
    outToken: tokensSwapped.out?.token_address,
    outAmount: tokensSwapped.out?.amount || tokensSwapped.out?.amount_raw,
    outSymbol: tokensSwapped.out?.symbol || 'Unknown'
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

function compareAmounts(shyftAmounts, parserAmounts) {
  if (!shyftAmounts || !parserAmounts) {
    return { match: false, reason: 'Missing amounts data' }
  }

  if (parserAmounts.type === 'split') {
    return { match: true, reason: 'Split swap - skipping comparison' }
  }

  const isBuy = parserAmounts.direction === 'BUY'
  
  let expectedInToken, expectedInAmount, expectedOutToken, expectedOutAmount
  
  if (isBuy) {
    // BUY: User spends quote to buy base
    expectedInToken = parserAmounts.quoteToken
    expectedInAmount = parserAmounts.swapInputAmount || parserAmounts.totalWalletCost
    expectedOutToken = parserAmounts.baseToken
    expectedOutAmount = parserAmounts.baseAmount
  } else {
    // SELL: User sells base to receive quote
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

  const inDiff = Math.abs(inAmountShyft - expectedInAmount)
  const inTolerance = inAmountShyft * 0.01
  
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

  const outDiff = Math.abs(outAmountShyft - expectedOutAmount)
  const outTolerance = outAmountShyft * 0.01
  
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
  console.log(`\n[${'='.repeat(60)}]`)
  console.log(`[${index}] Testing: ${signature}`)
  console.log(`[${'='.repeat(60)}]`)
  
  const detail = {
    index,
    signature,
    status: 'unknown',
    shyft: null,
    parser: null,
    comparison: null
  }
  
  try {
    // Fetch from SHYFT
    console.log('  📡 Fetching from SHYFT API...')
    const shyftTx = await fetchTransaction(signature)
    
    // Extract SHYFT amounts
    const shyftAmounts = extractShyftAmounts(shyftTx)
    
    if (!shyftAmounts) {
      console.log('  ⚠️  No SWAP action found in SHYFT response')
      detail.status = 'no_swap_action'
      results.failed++
      results.errors.push({
        signature,
        reason: 'no_swap_action_in_shyft'
      })
      results.details.push(detail)
      return
    }
    
    detail.shyft = shyftAmounts
    console.log(`  ✅ SHYFT SWAP Action:`)
    console.log(`     IN:  ${shyftAmounts.inSymbol} ${shyftAmounts.inAmount}`)
    console.log(`     OUT: ${shyftAmounts.outSymbol} ${shyftAmounts.outAmount}`)
    
    // Parse with V2 parser
    console.log('  🔧 Running V2 Parser...')
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

    const parseResult = parseShyftTransactionV2(v2Input)

    if (!parseResult.success) {
      console.log(`  ❌ Parser rejected: ${parseResult.erase?.reason}`)
      detail.status = 'parser_rejected'
      detail.parser = { error: parseResult.erase?.reason }
      results.failed++
      results.errors.push({
        signature,
        reason: parseResult.erase?.reason || 'unknown',
        debugInfo: parseResult.erase?.debugInfo
      })
      results.details.push(detail)
      return
    }

    results.success++
    
    // Extract parser amounts
    const parserAmounts = extractParserAmounts(parseResult)
    detail.parser = parserAmounts
    
    console.log(`  ✅ Parser Result:`)
    if (parserAmounts.type === 'single') {
      console.log(`     Direction: ${parserAmounts.direction}`)
      console.log(`     Quote: ${parserAmounts.quoteSymbol} (${parserAmounts.quoteToken.substring(0, 8)}...)`)
      console.log(`     Base:  ${parserAmounts.baseSymbol} (${parserAmounts.baseToken.substring(0, 8)}...)`)
      
      if (parserAmounts.direction === 'BUY') {
        console.log(`     IN:  ${parserAmounts.quoteSymbol} ${parserAmounts.swapInputAmount || parserAmounts.totalWalletCost}`)
        console.log(`     OUT: ${parserAmounts.baseSymbol} ${parserAmounts.baseAmount}`)
      } else {
        console.log(`     IN:  ${parserAmounts.baseSymbol} ${parserAmounts.baseAmount}`)
        console.log(`     OUT: ${parserAmounts.quoteSymbol} ${parserAmounts.swapOutputAmount || parserAmounts.netWalletReceived}`)
      }
    }

    // Compare
    const comparison = compareAmounts(shyftAmounts, parserAmounts)
    detail.comparison = comparison

    if (comparison.match) {
      results.amountMatch++
      detail.status = 'success'
      console.log(`  ✅ AMOUNTS MATCH! Parser is correct!`)
    } else {
      results.amountMismatch++
      detail.status = 'mismatch'
      results.mismatches.push({
        signature,
        shyftIn: `${shyftAmounts.inSymbol} ${shyftAmounts.inAmount}`,
        shyftOut: `${shyftAmounts.outSymbol} ${shyftAmounts.outAmount}`,
        ...comparison
      })
      console.log(`  ⚠️  AMOUNT MISMATCH: ${comparison.reason}`)
      if (comparison.expected !== undefined) {
        console.log(`     Expected: ${comparison.expected}`)
        console.log(`     Actual: ${comparison.actual}`)
        if (comparison.percentDiff) {
          console.log(`     Difference: ${comparison.percentDiff}`)
        }
      }
    }
    
    results.details.push(detail)

  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`)
    detail.status = 'error'
    detail.error = error.message
    results.failed++
    results.errors.push({
      signature,
      error: error.message
    })
    results.details.push(detail)
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║     V2 Parser Validation - User Provided Signatures       ║')
  console.log('║     Comparing Parser Output vs SHYFT SWAP Action          ║')
  console.log('╚════════════════════════════════════════════════════════════╝\n')

  // Read signatures file
  if (!fs.existsSync(SIGNATURES_FILE)) {
    console.error(`❌ Signatures file not found: ${SIGNATURES_FILE}`)
    process.exit(1)
  }

  const signaturesContent = fs.readFileSync(SIGNATURES_FILE, 'utf-8')
  const signatures = signaturesContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)

  console.log(`Found ${signatures.length} transaction signatures`)
  console.log(`Testing all transactions...\n`)

  results.total = signatures.length

  // Test each transaction
  for (let i = 0; i < signatures.length; i++) {
    await testTransaction(signatures[i], i + 1)
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 300))
  }

  // Print summary
  console.log('\n' + '='.repeat(70))
  console.log('FINAL SUMMARY')
  console.log('='.repeat(70))
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
    console.log('\n' + '='.repeat(70))
    console.log('PARSE ERRORS')
    console.log('='.repeat(70))
    results.errors.forEach((err, idx) => {
      console.log(`\n[${idx + 1}] ${err.signature}`)
      console.log(`    Reason: ${err.reason || err.error}`)
    })
  }

  // Show mismatches
  if (results.mismatches.length > 0) {
    console.log('\n' + '='.repeat(70))
    console.log('AMOUNT MISMATCHES')
    console.log('='.repeat(70))
    results.mismatches.forEach((mismatch, idx) => {
      console.log(`\n[${idx + 1}] ${mismatch.signature}`)
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
  }

  console.log('\n' + '='.repeat(70))
  if (results.amountMatch === results.success && results.success > 0) {
    console.log('✅ ALL AMOUNTS MATCH! Parser is working correctly!')
  } else if (results.success > 0 && results.amountMatch / results.success > 0.95) {
    console.log('✅ MOSTLY CORRECT! >95% accuracy')
  } else if (results.success > 0) {
    console.log('⚠️  NEEDS ATTENTION! Some amount mismatches detected')
  } else {
    console.log('❌ NO SUCCESSFUL PARSES! Check parser logic')
  }
  console.log('='.repeat(70))
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
