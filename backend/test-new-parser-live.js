/**
 * Test New SHYFT Parser Live
 * 
 * This script monitors whale transactions in real-time and shows:
 * 1. Which transactions the NEW parser accepts
 * 2. Which transactions the NEW parser rejects
 * 3. Comparison with what would have been saved with OLD parser
 * 
 * Run this BEFORE deploying to production to verify the new parser works correctly.
 */

require('dotenv').config()
const mongoose = require('mongoose')
const { parseShyftTransaction } = require('./dist/utils/shyftParser')
const { getParsedTransactions } = require('./dist/config/getParsedTransaction')

// Stats tracking
const stats = {
  totalProcessed: 0,
  newParserAccepted: 0,
  newParserRejected: 0,
  rejectionReasons: {},
  acceptedByConfidence: {
    MAX: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  },
  acceptedBySource: {
    tokens_swapped: 0,
    token_balance_changes: 0,
    events: 0,
  },
}

async function testTransaction(signature) {
  try {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`🔍 Testing Transaction: ${signature}`)
    console.log(`${'='.repeat(80)}`)

    // Get parsed transaction from SHYFT
    const parsedData = await getParsedTransactions(signature)
    if (!parsedData) {
      console.log('❌ Could not fetch transaction from SHYFT')
      return
    }

    const parsedTx = JSON.parse(parsedData)
    
    if (!parsedTx.success) {
      console.log('❌ Transaction failed on-chain')
      return
    }

    stats.totalProcessed++

    // Test with NEW parser
    console.log('\n📊 Testing with NEW SHYFT Parser:')
    const parsedSwap = parseShyftTransaction(parsedTx.result)

    if (parsedSwap) {
      stats.newParserAccepted++
      stats.acceptedByConfidence[parsedSwap.confidence]++
      stats.acceptedBySource[parsedSwap.classification_source]++

      console.log('✅ NEW PARSER: ACCEPTED')
      console.log(`   Side: ${parsedSwap.side}`)
      console.log(`   Confidence: ${parsedSwap.confidence}`)
      console.log(`   Source: ${parsedSwap.classification_source}`)
      console.log(`   Input: ${parsedSwap.input.mint.substring(0, 8)}... (${parsedSwap.input.amount})`)
      console.log(`   Output: ${parsedSwap.output.mint.substring(0, 8)}... (${parsedSwap.output.amount})`)
      console.log(`   ATA Created: ${parsedSwap.ata_created}`)
    } else {
      stats.newParserRejected++
      
      console.log('❌ NEW PARSER: REJECTED')
      
      // Analyze why it was rejected
      const txType = parsedTx.result?.type
      const tokenBalanceChanges = parsedTx.result?.token_balance_changes || []
      const actions = parsedTx.result?.actions || []
      const events = parsedTx.result?.events || []

      console.log('\n🔍 Rejection Analysis:')
      console.log(`   Transaction Type: ${txType}`)
      console.log(`   Token Balance Changes: ${tokenBalanceChanges.length}`)
      
      // Check for zero balance changes
      const nonZeroChanges = tokenBalanceChanges.filter(c => c.change_amount !== 0)
      console.log(`   Non-zero Balance Changes: ${nonZeroChanges.length}`)
      
      if (nonZeroChanges.length > 0) {
        console.log('\n   Balance Changes:')
        nonZeroChanges.forEach((change, idx) => {
          console.log(`     [${idx}] ${change.mint?.substring(0, 8)}... change: ${change.change_amount}`)
        })
      }

      // Check for tokens_swapped
      const hasTokensSwapped = actions.some(a => a.info?.tokens_swapped)
      console.log(`   Has tokens_swapped: ${hasTokensSwapped}`)

      // Check for swap events
      const hasSwapEvents = events.some(e => 
        ['BuyEvent', 'SellEvent', 'SwapEvent', 'SwapsEvent'].includes(e.name)
      )
      console.log(`   Has Swap Events: ${hasSwapEvents}`)

      // Determine rejection reason
      let reason = 'Unknown'
      if (tokenBalanceChanges.length === 0) {
        reason = 'No token balance changes'
      } else if (nonZeroChanges.length === 0) {
        reason = 'All balance changes are zero (not a swap)'
      } else if (nonZeroChanges.length === 1) {
        reason = 'Only one-sided balance change (incomplete data)'
      } else if (nonZeroChanges.length >= 2) {
        reason = 'Balance changes present but parser logic rejected (check SOL delta)'
      }

      console.log(`\n   ⚠️  Rejection Reason: ${reason}`)
      
      stats.rejectionReasons[reason] = (stats.rejectionReasons[reason] || 0) + 1
    }

    // Show what OLD parser would have done (manual extraction)
    console.log('\n📊 What OLD Parser Would Do:')
    const actions = parsedTx.result?.actions || []
    const tokenBalanceChanges = parsedTx.result?.token_balance_changes || []
    
    let wouldSaveWithOldParser = false
    
    // Check if old parser would extract tokens
    if (actions.length > 0 && actions[0]?.info?.tokens_swapped) {
      console.log('✅ OLD PARSER: Would ACCEPT (has tokens_swapped)')
      wouldSaveWithOldParser = true
    } else if (tokenBalanceChanges.length >= 2) {
      console.log('✅ OLD PARSER: Would ACCEPT (has balance changes)')
      wouldSaveWithOldParser = true
    } else {
      console.log('❌ OLD PARSER: Would REJECT (no swap data)')
    }

    // Compare parsers
    if (parsedSwap && wouldSaveWithOldParser) {
      console.log('\n✅ BOTH PARSERS AGREE: Transaction is valid')
    } else if (!parsedSwap && !wouldSaveWithOldParser) {
      console.log('\n✅ BOTH PARSERS AGREE: Transaction is invalid')
    } else if (parsedSwap && !wouldSaveWithOldParser) {
      console.log('\n⚠️  NEW PARSER CATCHES MORE: New parser accepts, old would reject')
    } else if (!parsedSwap && wouldSaveWithOldParser) {
      console.log('\n⚠️  REGRESSION: Old parser would accept, new parser rejects!')
      console.log('   THIS IS A PROBLEM - investigate why!')
    }

  } catch (error) {
    console.error('❌ Error testing transaction:', error.message)
  }
}

async function printStats() {
  console.log('\n\n' + '='.repeat(80))
  console.log('📊 PARSER TEST STATISTICS')
  console.log('='.repeat(80))
  console.log(`\nTotal Transactions Tested: ${stats.totalProcessed}`)
  console.log(`✅ Accepted by New Parser: ${stats.newParserAccepted} (${((stats.newParserAccepted / stats.totalProcessed) * 100).toFixed(1)}%)`)
  console.log(`❌ Rejected by New Parser: ${stats.newParserRejected} (${((stats.newParserRejected / stats.totalProcessed) * 100).toFixed(1)}%)`)

  if (stats.newParserAccepted > 0) {
    console.log('\n📈 Accepted Transactions Breakdown:')
    console.log('\n  By Confidence:')
    Object.entries(stats.acceptedByConfidence).forEach(([level, count]) => {
      if (count > 0) {
        console.log(`    ${level}: ${count} (${((count / stats.newParserAccepted) * 100).toFixed(1)}%)`)
      }
    })

    console.log('\n  By Classification Source:')
    Object.entries(stats.acceptedBySource).forEach(([source, count]) => {
      if (count > 0) {
        console.log(`    ${source}: ${count} (${((count / stats.newParserAccepted) * 100).toFixed(1)}%)`)
      }
    })
  }

  if (stats.newParserRejected > 0) {
    console.log('\n❌ Rejection Reasons:')
    Object.entries(stats.rejectionReasons)
      .sort((a, b) => b[1] - a[1])
      .forEach(([reason, count]) => {
        console.log(`    ${reason}: ${count} (${((count / stats.newParserRejected) * 100).toFixed(1)}%)`)
      })
  }

  console.log('\n' + '='.repeat(80))
}

async function main() {
  try {
    console.log('🚀 Starting New Parser Live Test')
    console.log('This will test recent transactions from the database\n')

    await mongoose.connect(process.env.MONGO_URI)
    console.log('✅ Connected to MongoDB\n')

    // Get recent transactions from the database
    const collection = mongoose.connection.db.collection('whalealltransactionv2')
    
    // Get last 20 transactions
    const recentTxs = await collection
      .find({})
      .sort({ timestamp: -1 })
      .limit(20)
      .toArray()

    console.log(`Found ${recentTxs.length} recent transactions to test\n`)

    // Test each transaction
    for (const tx of recentTxs) {
      await testTransaction(tx.signature)
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // Print final statistics
    printStats()

    // Recommendations
    console.log('\n📋 RECOMMENDATIONS:')
    const acceptanceRate = (stats.newParserAccepted / stats.totalProcessed) * 100
    
    if (acceptanceRate >= 80) {
      console.log('✅ Parser acceptance rate is good (>80%)')
      console.log('   Safe to deploy to production')
    } else if (acceptanceRate >= 50) {
      console.log('⚠️  Parser acceptance rate is moderate (50-80%)')
      console.log('   Review rejection reasons before deploying')
    } else {
      console.log('❌ Parser acceptance rate is low (<50%)')
      console.log('   DO NOT deploy - parser is too strict')
      console.log('   Consider applying the bypass fix from QUICK_FIX_PARSER_BYPASS.md')
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

main()
