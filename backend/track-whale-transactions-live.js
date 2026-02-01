/**
 * Live Whale Transaction Tracker
 * 
 * This script:
 * 1. Fetches recent transactions for tracked whale addresses from SHYFT API
 * 2. Parses them with both V1 and V2 parsers
 * 3. Compares results and generates detailed report
 * 4. Identifies improvements and regressions
 */

require('dotenv').config()
const axios = require('axios')
const { parseShyftTransaction } = require('./src/utils/shyftParser')
const { ShyftParserV2 } = require('./dist/utils/shyftParserV2')

const SHYFT_API_KEY = process.env.SHYFT_API_KEY

// Tracked whale addresses (add your whale addresses here)
const WHALE_ADDRESSES = [
  'GF1BrtbZoFKsBs7dCbAxSri1M9xA9hKhswKQd1KZmWUb', // Example whale
  'FhVo3mqLvXPRFCGbdpe4KvLvvPPvf5JzqQvJqQvJqQv', // Example whale
  // Add more whale addresses from your database
]

// Initialize v2 parser
const parserV2 = new ShyftParserV2()

// Helper to fetch transactions for a wallet
async function fetchWalletTransactions(walletAddress, limit = 20) {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/wallet/transaction_history`,
      {
        params: {
          network: 'mainnet-beta',
          wallet: walletAddress,
          tx_num: limit,
        },
        headers: { 'x-api-key': SHYFT_API_KEY },
      }
    )
    return response.data.result || []
  } catch (error) {
    console.error(`Error fetching transactions for ${walletAddress}:`, error.message)
    return []
  }
}

// Helper to convert to v2 format
function convertToV2Format(tx) {
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
  }
}

async function main() {
  console.log(`\n${'='.repeat(100)}`)
  console.log(`Live Whale Transaction Tracker - V1 vs V2 Parser Comparison`)
  console.log(`${'='.repeat(100)}\n`)

  if (!SHYFT_API_KEY) {
    console.error('❌ SHYFT_API_KEY not found in environment variables')
    process.exit(1)
  }

  console.log(`Tracking ${WHALE_ADDRESSES.length} whale addresses`)
  console.log(`Fetching recent transactions...\n`)

  const allResults = {
    totalWhales: WHALE_ADDRESSES.length,
    totalTransactions: 0,
    v1Parsed: 0,
    v1Null: 0,
    v2Parsed: 0,
    v2Erased: 0,
    v2Errors: 0,
    matches: 0,
    v1Missed: 0, // V1 null, V2 parsed
    v2Improvements: [],
    v2Regressions: [], // V1 parsed, V2 erased
    sideMismatches: [],
  }

  for (const whaleAddress of WHALE_ADDRESSES) {
    console.log(`\n${'─'.repeat(100)}`)
    console.log(`Whale: ${whaleAddress}`)
    console.log(`${'─'.repeat(100)}\n`)

    const transactions = await fetchWalletTransactions(whaleAddress, 20)
    console.log(`Found ${transactions.length} transactions\n`)

    allResults.totalTransactions += transactions.length

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i]
      const signature = tx.signatures?.[0] || tx.signature || 'unknown'
      
      console.log(`[${i + 1}/${transactions.length}] ${signature}`)
      console.log(`   Type: ${tx.type || 'unknown'} | Status: ${tx.status || 'unknown'}`)

      // Parse with V1
      let v1Result
      try {
        v1Result = parseShyftTransaction(tx)
      } catch (error) {
        v1Result = null
      }

      // Parse with V2
      let v2Result
      try {
        const txV2 = convertToV2Format(tx)
        v2Result = parserV2.parseTransaction(txV2)
      } catch (error) {
        v2Result = { success: false, error: error.message }
        allResults.v2Errors++
      }

      // Count results
      const v1IsSwap = v1Result !== null
      const v2IsSwap = v2Result.success

      if (v1IsSwap) allResults.v1Parsed++
      else allResults.v1Null++

      if (v2IsSwap) allResults.v2Parsed++
      else if (v2Result.erase) allResults.v2Erased++

      // Compare
      if (v1IsSwap && v2IsSwap) {
        const v1Side = v1Result.side
        const v2Side = v2Result.data.direction || v2Result.data.sellRecord?.direction
        
        if (v1Side === v2Side) {
          allResults.matches++
          console.log(`   ✅ V1: ${v1Side} | V2: ${v2Side} - MATCH`)
        } else {
          console.log(`   ⚠️  V1: ${v1Side} | V2: ${v2Side} - SIDE MISMATCH`)
          allResults.sideMismatches.push({
            signature,
            whale: whaleAddress,
            v1Side,
            v2Side,
            type: tx.type,
          })
        }
      } else if (!v1IsSwap && v2IsSwap) {
        allResults.v1Missed++
        const v2Side = v2Result.data.direction || v2Result.data.sellRecord?.direction
        console.log(`   🎯 V1: NULL | V2: ${v2Side} - V2 IMPROVEMENT!`)
        allResults.v2Improvements.push({
          signature,
          whale: whaleAddress,
          v2Side,
          type: tx.type,
        })
      } else if (v1IsSwap && !v2IsSwap) {
        console.log(`   ❌ V1: ${v1Result.side} | V2: ERASE (${v2Result.erase?.reason}) - V2 REGRESSION`)
        allResults.v2Regressions.push({
          signature,
          whale: whaleAddress,
          v1Side: v1Result.side,
          v2Reason: v2Result.erase?.reason,
          type: tx.type,
        })
      } else {
        console.log(`   ⚪ V1: NULL | V2: ERASE (${v2Result.erase?.reason || 'error'}) - BOTH AGREE`)
      }
    }

    // Rate limiting between whales
    if (WHALE_ADDRESSES.indexOf(whaleAddress) < WHALE_ADDRESSES.length - 1) {
      console.log('\nWaiting 2 seconds before next whale...')
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  // Final Summary
  console.log(`\n\n${'='.repeat(100)}`)
  console.log('FINAL SUMMARY')
  console.log(`${'='.repeat(100)}\n`)

  console.log(`Whales tracked: ${allResults.totalWhales}`)
  console.log(`Total transactions: ${allResults.totalTransactions}`)
  console.log()

  console.log('V1 Parser Results:')
  console.log(`  ✅ Parsed as SWAP: ${allResults.v1Parsed}`)
  console.log(`  ❌ Returned NULL: ${allResults.v1Null}`)
  console.log()

  console.log('V2 Parser Results:')
  console.log(`  ✅ Parsed as SWAP: ${allResults.v2Parsed}`)
  console.log(`  ❌ Returned ERASE: ${allResults.v2Erased}`)
  console.log(`  ⚠️  Errors: ${allResults.v2Errors}`)
  console.log()

  console.log('Comparison:')
  console.log(`  ✅ Matches (both parsed, same side): ${allResults.matches}`)
  console.log(`  🎯 V2 improvements (V1 missed, V2 caught): ${allResults.v1Missed}`)
  console.log(`  ❌ V2 regressions (V1 parsed, V2 erased): ${allResults.v2Regressions.length}`)
  console.log(`  ⚠️  Side mismatches (both parsed, different side): ${allResults.sideMismatches.length}`)
  console.log()

  const swapTransactions = allResults.v1Parsed + allResults.v1Missed
  const v2DetectionRate = swapTransactions > 0 
    ? (allResults.v2Parsed / swapTransactions * 100).toFixed(1)
    : 0
  const improvementRate = swapTransactions > 0
    ? (allResults.v1Missed / swapTransactions * 100).toFixed(1)
    : 0

  console.log(`V2 Detection Rate: ${v2DetectionRate}%`)
  console.log(`V2 Improvement Over V1: +${improvementRate}% more swaps detected`)
  console.log()

  // Show improvements
  if (allResults.v2Improvements.length > 0) {
    console.log('V2 IMPROVEMENTS (Caught swaps V1 missed):')
    allResults.v2Improvements.slice(0, 10).forEach(imp => {
      console.log(`  🎯 ${imp.signature}`)
      console.log(`     Whale: ${imp.whale.substring(0, 8)}...`)
      console.log(`     V2 detected: ${imp.v2Side} | Type: ${imp.type}`)
    })
    if (allResults.v2Improvements.length > 10) {
      console.log(`  ... and ${allResults.v2Improvements.length - 10} more`)
    }
    console.log()
  }

  // Show regressions
  if (allResults.v2Regressions.length > 0) {
    console.log('V2 REGRESSIONS (Erased what V1 parsed):')
    allResults.v2Regressions.slice(0, 10).forEach(reg => {
      console.log(`  ❌ ${reg.signature}`)
      console.log(`     Whale: ${reg.whale.substring(0, 8)}...`)
      console.log(`     V1: ${reg.v1Side} | V2 ERASE: ${reg.v2Reason}`)
    })
    if (allResults.v2Regressions.length > 10) {
      console.log(`  ... and ${allResults.v2Regressions.length - 10} more`)
    }
    console.log()
  }

  // Show side mismatches
  if (allResults.sideMismatches.length > 0) {
    console.log('SIDE MISMATCHES (Both parsed but different direction):')
    allResults.sideMismatches.slice(0, 10).forEach(mis => {
      console.log(`  ⚠️  ${mis.signature}`)
      console.log(`     Whale: ${mis.whale.substring(0, 8)}...`)
      console.log(`     V1: ${mis.v1Side} | V2: ${mis.v2Side}`)
    })
    if (allResults.sideMismatches.length > 10) {
      console.log(`  ... and ${allResults.sideMismatches.length - 10} more`)
    }
    console.log()
  }

  console.log(`${'='.repeat(100)}\n`)

  // Final verdict
  if (allResults.v2Regressions.length === 0 && allResults.sideMismatches.length === 0) {
    console.log('🎉 SUCCESS! V2 parser performs as well or better than V1!')
    console.log(`   - No regressions detected`)
    console.log(`   - ${allResults.v1Missed} additional swaps detected`)
    console.log(`   - ${allResults.matches} transactions match V1`)
  } else {
    console.log('⚠️  ISSUES FOUND:')
    if (allResults.v2Regressions.length > 0) {
      console.log(`   - ${allResults.v2Regressions.length} regressions`)
    }
    if (allResults.sideMismatches.length > 0) {
      console.log(`   - ${allResults.sideMismatches.length} side mismatches`)
    }
    console.log()
    console.log('However, V2 improvements:')
    console.log(`   + ${allResults.v1Missed} additional swaps detected`)
  }
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
