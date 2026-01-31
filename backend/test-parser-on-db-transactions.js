/**
 * Test parser acceptance rate on database transactions
 */

require('dotenv').config()
const mongoose = require('mongoose')
const { parseShyftTransaction } = require('./dist/utils/shyftParser')

const MONGODB_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker'

async function testParserOnDB() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    const collection = db.collection('whalealltransactionv2')

    console.log('📊 Fetching 50 most recent transactions...\n')
    const transactions = await collection
      .find({})
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray()

    console.log(`Found ${transactions.length} transactions\n`)

    let accepted = 0
    let rejected = 0
    const rejectionReasons = {}

    for (const tx of transactions) {
      // Reconstruct SHYFT format
      const shyftTx = {
        signature: tx.signature,
        timestamp: tx.timestamp,
        status: 'Success',
        fee_payer: tx.whaleAddress,
        signers: [tx.whaleAddress],
        type: tx.type || 'UNKNOWN',
        token_balance_changes: tx.token_balance_changes || [],
        actions: tx.actions || [],
        events: tx.events || [],
      }

      const result = parseShyftTransaction(shyftTx)

      if (result) {
        accepted++
        console.log(`✅ ${tx.signature.substring(0, 15)}... | ${result.side} | ${result.confidence} | ${result.classification_source}`)
      } else {
        rejected++
        
        let reason = 'Unknown'
        
        if (!shyftTx.token_balance_changes || shyftTx.token_balance_changes.length === 0) {
          reason = 'No balance changes'
        } else {
          const allZero = shyftTx.token_balance_changes.every(
            c => c.post_balance === c.pre_balance
          )
          if (allZero) {
            reason = 'All balances unchanged'
          } else {
            reason = 'Parser classification failed'
          }
        }
        
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1
        console.log(`❌ ${tx.signature.substring(0, 15)}... | ${reason}`)
      }
    }

    console.log('\n' + '='.repeat(70))
    console.log('📊 SUMMARY')
    console.log('='.repeat(70))
    console.log(`Total: ${transactions.length}`)
    console.log(`✅ Accepted: ${accepted} (${((accepted / transactions.length) * 100).toFixed(1)}%)`)
    console.log(`❌ Rejected: ${rejected} (${((rejected / transactions.length) * 100).toFixed(1)}%)`)
    console.log('\n📋 Rejection Reasons:')
    Object.entries(rejectionReasons)
      .sort((a, b) => b[1] - a[1])
      .forEach(([reason, count]) => {
        console.log(`  - ${reason}: ${count}`)
      })
    console.log('='.repeat(70))

    await mongoose.connection.close()
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

testParserOnDB()
