/**
 * Task 4.1: Verify Zero Regression on Existing Alerts
 * 
 * This script uses the 14 test fixtures to verify zero regression.
 * It compares the old parser logic (excluded tokens approach) 
 * with the new canonical SHYFT parser.
 */

const fs = require('fs')
const path = require('path')
const { parseShyftTransaction } = require('./dist/utils/shyftParser')

// Old parser logic (recreated from TASK_3.1_IMPLEMENTATION_SUMMARY.md)
const EXCLUDED_TOKENS = [
  'So11111111111111111111111111111111111111112', // SOL
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  '4Cnk9EPnW5ixfLZatCPJjDB1PUtcRpVVgTQukm9epump', // USD1
]

function oldParserLogic(transaction) {
  try {
    // Extract input/output tokens from the transaction
    const actions = transaction.actions || []
    let tokenIn = null
    let tokenOut = null

    // Try to get tokens from tokens_swapped
    for (const action of actions) {
      if (action.info?.tokens_swapped) {
        const swapped = action.info.tokens_swapped
        if (Array.isArray(swapped) && swapped.length >= 2) {
          tokenIn = swapped[0]?.mint || swapped[0]?.token_address
          tokenOut = swapped[1]?.mint || swapped[1]?.token_address
          break
        } else if (swapped.in && swapped.out) {
          tokenIn = swapped.in.mint || swapped.in.token_address
          tokenOut = swapped.out.mint || swapped.out.token_address
          break
        }
      }
    }

    // If no tokens_swapped, try balance changes
    if (!tokenIn || !tokenOut) {
      const balanceChanges = transaction.token_balance_changes || []
      const swapper = transaction.fee_payer || transaction.signers?.[0]
      
      if (!swapper || balanceChanges.length === 0) {
        return null
      }

      const relevantChanges = balanceChanges.filter(c => c.owner === swapper)
      if (relevantChanges.length < 2) {
        return null
      }

      // Find tokens with positive and negative deltas
      const positiveChange = relevantChanges.find(c => c.post_balance > c.pre_balance)
      const negativeChange = relevantChanges.find(c => c.post_balance < c.pre_balance)

      if (positiveChange && negativeChange) {
        tokenIn = negativeChange.mint
        tokenOut = positiveChange.mint
      } else {
        return null
      }
    }

    if (!tokenIn || !tokenOut) {
      return null
    }

    // Old logic: Check excluded tokens
    const inputExcluded = EXCLUDED_TOKENS.includes(tokenIn)
    const outputExcluded = EXCLUDED_TOKENS.includes(tokenOut)
    const bothNonExcluded = !inputExcluded && !outputExcluded

    // Old classification logic
    const isBuy = bothNonExcluded || (!outputExcluded && inputExcluded)
    const isSell = bothNonExcluded || (outputExcluded && !inputExcluded)

    if (!isBuy && !isSell) {
      return null
    }

    return {
      detected: true,
      isBuy,
      isSell,
      tokenIn,
      tokenOut,
      logic: 'excluded_tokens'
    }
  } catch (error) {
    return null
  }
}

function newParserLogic(transaction) {
  try {
    const result = parseShyftTransaction(transaction)
    if (!result) {
      return null
    }

    return {
      detected: true,
      isBuy: result.side === 'BUY' || result.side === 'SWAP',
      isSell: result.side === 'SELL' || result.side === 'SWAP',
      tokenIn: result.input.mint,
      tokenOut: result.output.mint,
      side: result.side,
      confidence: result.confidence,
      source: result.classification_source,
      logic: 'canonical_shyft'
    }
  } catch (error) {
    return null
  }
}

function loadFixtures() {
  const fixturesDir = path.join(__dirname, '..', 'shyft_response')
  
  if (!fs.existsSync(fixturesDir)) {
    console.error(`❌ Fixtures directory not found: ${fixturesDir}`)
    return []
  }

  const files = fs.readdirSync(fixturesDir)
    .filter(file => file.endsWith('.json'))
    .sort()

  const fixtures = []
  for (const file of files) {
    try {
      const filePath = path.join(fixturesDir, file)
      const content = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)
      fixtures.push({
        filename: file,
        transaction: data.result
      })
    } catch (error) {
      console.error(`❌ Error loading ${file}:`, error.message)
    }
  }

  return fixtures
}

function runRegressionTest() {
  console.log('🔍 Starting Parser Regression Test (Task 4.1)')
  console.log('=' .repeat(80))
  console.log()

  const fixtures = loadFixtures()
  
  if (fixtures.length === 0) {
    console.error('❌ No fixtures found. Cannot run regression test.')
    process.exit(1)
  }

  console.log(`✅ Loaded ${fixtures.length} test fixtures`)
  console.log()

  const results = {
    total: fixtures.length,
    oldDetected: 0,
    newDetected: 0,
    bothDetected: 0,
    onlyOldDetected: 0,
    onlyNewDetected: 0,
    neitherDetected: 0,
    discrepancies: [],
    details: []
  }

  console.log(`📊 Analyzing ${fixtures.length} transactions...\n`)

  for (const { filename, transaction } of fixtures) {
    const oldResult = oldParserLogic(transaction)
    const newResult = newParserLogic(transaction)

    const oldDetected = oldResult !== null
    const newDetected = newResult !== null

    if (oldDetected) results.oldDetected++
    if (newDetected) results.newDetected++

    const detail = {
      filename,
      signature: transaction.signature,
      type: transaction.type,
      oldDetected,
      newDetected,
      oldResult,
      newResult
    }
    results.details.push(detail)

    if (oldDetected && newDetected) {
      results.bothDetected++
      
      // Check for classification discrepancies
      if (oldResult.isBuy !== newResult.isBuy || oldResult.isSell !== newResult.isSell) {
        results.discrepancies.push({
          filename,
          signature: transaction.signature,
          type: 'classification_mismatch',
          old: { isBuy: oldResult.isBuy, isSell: oldResult.isSell },
          new: { isBuy: newResult.isBuy, isSell: newResult.isSell, side: newResult.side },
          confidence: newResult.confidence,
          source: newResult.source
        })
      }
    } else if (oldDetected && !newDetected) {
      // REGRESSION: Old parser detected, new parser missed
      results.onlyOldDetected++
      results.discrepancies.push({
        filename,
        signature: transaction.signature,
        type: 'REGRESSION',
        old: oldResult,
        new: null,
        severity: 'HIGH'
      })
    } else if (!oldDetected && newDetected) {
      // IMPROVEMENT: New parser detected, old parser missed
      results.onlyNewDetected++
    } else {
      results.neitherDetected++
    }
  }

  // Print detailed results
  console.log('📋 DETAILED RESULTS PER FIXTURE')
  console.log('=' .repeat(80))
  console.log()

  for (const detail of results.details) {
    const status = detail.oldDetected && detail.newDetected ? '✅ Both' :
                   detail.oldDetected && !detail.newDetected ? '❌ REGRESSION' :
                   !detail.oldDetected && detail.newDetected ? '✨ Improvement' :
                   '⚪ Neither'
    
    console.log(`${status} | ${detail.filename}`)
    console.log(`   Type: ${detail.type}`)
    console.log(`   Signature: ${detail.signature?.substring(0, 20)}...`)
    
    if (detail.oldDetected) {
      console.log(`   Old: isBuy=${detail.oldResult.isBuy}, isSell=${detail.oldResult.isSell}`)
    } else {
      console.log(`   Old: NOT DETECTED`)
    }
    
    if (detail.newDetected) {
      console.log(`   New: side=${detail.newResult.side}, confidence=${detail.newResult.confidence}, source=${detail.newResult.source}`)
    } else {
      console.log(`   New: NOT DETECTED`)
    }
    console.log()
  }

  // Print summary
  console.log('📈 REGRESSION TEST SUMMARY')
  console.log('=' .repeat(80))
  console.log()
  console.log(`Total Transactions Analyzed: ${results.total}`)
  console.log()
  console.log('Detection Rates:')
  console.log(`  Old Parser Detected:       ${results.oldDetected} (${(results.oldDetected / results.total * 100).toFixed(1)}%)`)
  console.log(`  New Parser Detected:       ${results.newDetected} (${(results.newDetected / results.total * 100).toFixed(1)}%)`)
  console.log()
  console.log('Comparison:')
  console.log(`  Both Detected:             ${results.bothDetected}`)
  console.log(`  Only Old Detected:         ${results.onlyOldDetected} ${results.onlyOldDetected > 0 ? '⚠️  REGRESSION!' : '✅'}`)
  console.log(`  Only New Detected:         ${results.onlyNewDetected} ✨ (Improvement)`)
  console.log(`  Neither Detected:          ${results.neitherDetected}`)
  console.log()

  // Calculate improvement
  const improvement = results.newDetected - results.oldDetected
  const improvementPercent = results.oldDetected > 0 
    ? ((improvement / results.oldDetected) * 100).toFixed(1)
    : 'N/A'
  
  console.log('Improvement Metrics:')
  console.log(`  Additional Swaps Detected: ${improvement} (+${improvementPercent}%)`)
  console.log(`  False Negative Reduction:  ${results.onlyNewDetected} swaps`)
  console.log()

  // Report discrepancies
  if (results.discrepancies.length > 0) {
    console.log('⚠️  DISCREPANCIES FOUND')
    console.log('=' .repeat(80))
    console.log()

    const regressions = results.discrepancies.filter(d => d.type === 'REGRESSION')
    const mismatches = results.discrepancies.filter(d => d.type === 'classification_mismatch')

    if (regressions.length > 0) {
      console.log(`❌ REGRESSIONS (${regressions.length}):`)
      console.log('   New parser missed swaps that old parser detected!')
      console.log()
      regressions.forEach((d, i) => {
        console.log(`   ${i + 1}. File: ${d.filename}`)
        console.log(`      Signature: ${d.signature?.substring(0, 40)}...`)
        console.log(`      Old: isBuy=${d.old.isBuy}, isSell=${d.old.isSell}`)
        console.log(`      New: NOT DETECTED`)
        console.log()
      })
    }

    if (mismatches.length > 0) {
      console.log(`⚠️  CLASSIFICATION MISMATCHES (${mismatches.length}):`)
      console.log('   Both detected, but classified differently')
      console.log()
      mismatches.forEach((d, i) => {
        console.log(`   ${i + 1}. File: ${d.filename}`)
        console.log(`      Signature: ${d.signature?.substring(0, 40)}...`)
        console.log(`      Old: isBuy=${d.old.isBuy}, isSell=${d.old.isSell}`)
        console.log(`      New: isBuy=${d.new.isBuy}, isSell=${d.new.isSell}, side=${d.new.side}`)
        console.log(`      Confidence: ${d.confidence}, Source: ${d.source}`)
        console.log()
      })
    }
  }

  // Final verdict
  console.log('=' .repeat(80))
  console.log()
  if (results.onlyOldDetected === 0) {
    console.log('✅ ZERO REGRESSION VERIFIED')
    console.log('   New parser catches all swaps that old parser detected')
    console.log(`   Plus ${results.onlyNewDetected} additional swaps (${improvementPercent}% improvement)`)
    console.log()
    console.log('✅ Task 4.1 COMPLETE - Safe to proceed with deployment')
  } else {
    console.log('❌ REGRESSION DETECTED')
    console.log(`   New parser missed ${results.onlyOldDetected} swaps that old parser detected`)
    console.log('   DO NOT PROCEED - Fix regressions before deployment')
  }
  console.log()

  return results
}

// Run the test
const results = runRegressionTest()
process.exit(results.onlyOldDetected === 0 ? 0 : 1)
