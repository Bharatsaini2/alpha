/**
 * Compare Database Whale Transactions vs V2 Parser
 * 
 * This script:
 * 1. Fetches whale transactions from MongoDB (saved by V1 parser on server)
 * 2. Re-parses them with V2 parser
 * 3. Compares results to find discrepancies
 * 4. Identifies transactions V1 missed that V2 would catch
 */

require('dotenv').config()
const mongoose = require('mongoose')
const axios = require('axios')
const { ShyftParserV2 } = require('./dist/utils/shyftParserV2')

const SHYFT_API_KEY = process.env.SHYFT_API_KEY
const MONGODB_URI = process.env.MONGODB_URI

// Initialize v2 parser
const parserV2 = new ShyftParserV2()

// Whale Transaction Schema (from database)
const whaleTransactionSchema = new mongoose.Schema({
  signature: String,
  whale_address: String,
  token_address: String,
  token_symbol: String,
  side: String, // BUY or SELL
  amount: Number,
  sol_amount: Number,
  timestamp: Date,
  confidence: String,
  classification_source: String,
}, { collection: 'whale_transactions' })

const WhaleTransaction = mongoose.model('WhaleTransaction', whaleTransactionSchema)

// Helper to fetch transaction from SHYFT API
async function fetchTransactionFromShyft(signature) {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed`,
      {
        params: { network: 'mainnet-beta', txn_signature: signature },
        headers: { 'x-api-key': SHYFT_API_KEY },
      }
    )
    return response.data
  } catch (error) {
    console.error(`Error fetching ${signature}:`, error.message)
    return null
  }
}

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
  }
}

async function main() {
  console.log(`\n${'='.repeat(100)}`)
  console.log(`Database vs V2 Parser Comparison`)
  console.log(`${'='.repeat(100)}\n`)

  // Connect to MongoDB
  console.log('Connecting to MongoDB...')
  await mongoose.connect(MONGODB_URI)
  console.log('✅ Connected to MongoDB\n')

  // Get sample of whale transactions from database
  const sampleSize = 100
  console.log(`Fetching ${sampleSize} whale transactions from database...`)
  
  const dbTransactions = await WhaleTransaction.find()
    .sort({ timestamp: -1 })
    .limit(sampleSize)
    .lean()

  console.log(`✅ Found ${dbTransactions.length} transactions\n`)

  if (dbTransactions.length === 0) {
    console.log('No transactions found in database. Exiting.')
    await mongoose.disconnect()
    return
  }

  const results = {
    total: dbTransactions.length,
    fetched: 0,
    fetchErrors: 0,
    v2Parsed: 0,
    v2Erased: 0,
    v2Errors: 0,
    matches: 0,
    discrepancies: [],
    v2Improvements: [],
    v2Regressions: [],
  }

  console.log('Processing transactions...\n')

  for (let i = 0; i < dbTransactions.length; i++) {
    const dbTx = dbTransactions[i]
    const progress = `[${i + 1}/${dbTransactions.length}]`
    
    console.log(`${progress} ${dbTx.signature}`)
    console.log(`   DB: ${dbTx.side} | ${dbTx.token_symbol || 'UNKNOWN'} | Confidence: ${dbTx.confidence}`)

    // Fetch transaction from SHYFT API
    const shyftData = await fetchTransactionFromShyft(dbTx.signature)
    
    if (!shyftData || !shyftData.success) {
      console.log(`   ❌ Failed to fetch from SHYFT API`)
      results.fetchErrors++
      console.log()
      continue
    }

    results.fetched++

    // Parse with V2
    let v2Result
    try {
      const txV2 = convertToV2Format(shyftData)
      v2Result = parserV2.parseTransaction(txV2)
    } catch (error) {
      console.log(`   ❌ V2 parser error: ${error.message}`)
      results.v2Errors++
      results.discrepancies.push({
        signature: dbTx.signature,
        dbSide: dbTx.side,
        v2Result: 'ERROR',
        issue: error.message,
      })
      console.log()
      continue
    }

    // Compare results
    const v2IsSwap = v2Result.success
    const v2Side = v2IsSwap 
      ? (v2Result.data.direction || v2Result.data.sellRecord?.direction)
      : null

    if (v2IsSwap) {
      results.v2Parsed++
      
      if (v2Side === dbTx.side) {
        results.matches++
        console.log(`   ✅ V2: ${v2Side} - MATCH`)
      } else {
        console.log(`   ⚠️  V2: ${v2Side} - MISMATCH (DB says ${dbTx.side})`)
        results.discrepancies.push({
          signature: dbTx.signature,
          dbSide: dbTx.side,
          v2Side,
          issue: 'Side mismatch',
        })
      }
    } else {
      results.v2Erased++
      console.log(`   ❌ V2: ERASE (${v2Result.erase?.reason}) - DB had ${dbTx.side}`)
      results.v2Regressions.push({
        signature: dbTx.signature,
        dbSide: dbTx.side,
        v2Reason: v2Result.erase?.reason,
        issue: 'V2 erased what V1 parsed',
      })
    }

    console.log()

    // Rate limiting
    if (i < dbTransactions.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  // Summary
  console.log(`\n${'='.repeat(100)}`)
  console.log('SUMMARY')
  console.log(`${'='.repeat(100)}\n`)

  console.log(`Total DB transactions: ${results.total}`)
  console.log(`Successfully fetched from SHYFT: ${results.fetched}`)
  console.log(`Fetch errors: ${results.fetchErrors}`)
  console.log()

  console.log('V2 Parser Results:')
  console.log(`  ✅ Parsed as SWAP: ${results.v2Parsed}`)
  console.log(`  ❌ Returned ERASE: ${results.v2Erased}`)
  console.log(`  ⚠️  Parser errors: ${results.v2Errors}`)
  console.log()

  console.log('Comparison:')
  console.log(`  ✅ Matches (same side): ${results.matches}/${results.fetched}`)
  console.log(`  ⚠️  Discrepancies: ${results.discrepancies.length}`)
  console.log(`  ❌ V2 regressions (erased what V1 parsed): ${results.v2Regressions.length}`)
  console.log()

  const accuracy = results.fetched > 0 
    ? (results.matches / results.fetched * 100).toFixed(1)
    : 0
  console.log(`Agreement Rate: ${accuracy}%`)
  console.log()

  // Show discrepancies
  if (results.discrepancies.length > 0) {
    console.log('DISCREPANCIES (Side Mismatch):')
    results.discrepancies.slice(0, 10).forEach(d => {
      console.log(`  ⚠️  ${d.signature}`)
      console.log(`     DB: ${d.dbSide} | V2: ${d.v2Side || 'ERROR'}`)
      console.log(`     Issue: ${d.issue}`)
    })
    if (results.discrepancies.length > 10) {
      console.log(`  ... and ${results.discrepancies.length - 10} more`)
    }
    console.log()
  }

  // Show regressions
  if (results.v2Regressions.length > 0) {
    console.log('V2 REGRESSIONS (Erased what V1 parsed):')
    results.v2Regressions.slice(0, 10).forEach(r => {
      console.log(`  ❌ ${r.signature}`)
      console.log(`     DB had: ${r.dbSide}`)
      console.log(`     V2 ERASE reason: ${r.v2Reason}`)
    })
    if (results.v2Regressions.length > 10) {
      console.log(`  ... and ${results.v2Regressions.length - 10} more`)
    }
    console.log()
  }

  console.log(`${'='.repeat(100)}\n`)

  // Final verdict
  if (results.v2Regressions.length === 0 && results.discrepancies.length === 0) {
    console.log('🎉 SUCCESS! V2 parser matches all database transactions!')
    console.log(`   - ${results.matches} transactions parsed identically`)
    console.log(`   - No regressions detected`)
  } else {
    console.log('⚠️  ISSUES FOUND:')
    if (results.v2Regressions.length > 0) {
      console.log(`   - ${results.v2Regressions.length} regressions (V2 erased what V1 parsed)`)
      console.log(`     These need investigation - may be V1 false positives or V2 bugs`)
    }
    if (results.discrepancies.length > 0) {
      console.log(`   - ${results.discrepancies.length} side mismatches (BUY vs SELL)`)
      console.log(`     These need investigation - may indicate parser logic differences`)
    }
  }

  await mongoose.disconnect()
  console.log('\n✅ Disconnected from MongoDB')
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
