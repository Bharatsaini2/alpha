/**
 * Verify V2 Parser Detections
 * 
 * Check if the transactions detected by V2 parser are:
 * 1. Already in the database (V1 detected them)
 * 2. New discoveries (V2 found them, V1 missed them)
 */

require('dotenv').config()
const mongoose = require('mongoose')
const whaleAllTransactionModelV2 = require('./src/models/whaleAllTransactionsV2.model').default

// The 5 transactions detected by V2 parser in the live test
const v2Detections = [
  'SD1n2ZpyZFEYvoB38DD9iFnVum3nhmSuoj2Zjrd1kxvvvCPvCPvCPvCPvCPvCPvCPvCP',
  '2xE56A9hHAu4CZfB2GzSrwxyTjBcuz9cceLjNsnyNsnyNsnyNsnyNsnyNsnyNsny',
  '3QTUFYYuJXnWSME5Wfh31XGE5nFU52hxmzavjeGtjeGtjeGtjeGtjeGtjeGtjeGt',
  '4e9FRhw5ht38R3QdqdxtgxVyyKCfmUD28y92pbbUpbbUpbbUpbbUpbbUpbbUpbbU',
  '4KwrG2mW83Sk17Lu3GF7DGPMYhk9nTQgLXHiYRTJYRTJYRTJYRTJYRTJYRTJYRTJ'
]

// Actual full signatures from the output
const actualSignatures = [
  'SD1n2ZpyZFEYvoB38DD9iFnVum3nhmSuoj2Zjrd1',
  '2xE56A9hHAu4CZfB2GzSrwxyTjBcuz9cceLjNsny',
  '3QTUFYYuJXnWSME5Wfh31XGE5nFU52hxmzavjeGt',
  '4e9FRhw5ht38R3QdqdxtgxVyyKCfmUD28y92pbbU',
  '4KwrG2mW83Sk17Lu3GF7DGPMYhk9nTQgLXHiYRTJ'
]

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗')
  console.log('║         V2 Parser Detection Verification                                  ║')
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n')

  // Connect to MongoDB
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI)
  console.log('✅ Connected to MongoDB\n')

  console.log(`Checking ${actualSignatures.length} transactions detected by V2 parser...\n`)

  let foundInDb = 0
  let notFoundInDb = 0
  const results = []

  for (const sig of actualSignatures) {
    console.log(`\n${'─'.repeat(80)}`)
    console.log(`Signature: ${sig}...`)
    console.log('─'.repeat(80))

    // Search for this transaction in the database
    const dbTransaction = await whaleAllTransactionModelV2.findOne({
      'transaction.signature': { $regex: `^${sig}` }
    })

    if (dbTransaction) {
      foundInDb++
      console.log('✅ FOUND IN DATABASE (V1 already detected this)')
      console.log(`   Whale: ${dbTransaction.whale?.name || 'Unknown'} (${dbTransaction.whale?.address?.substring(0, 8)}...)`)
      console.log(`   Type: ${dbTransaction.transaction?.type || 'Unknown'}`)
      console.log(`   Token In: ${dbTransaction.transaction?.tokenIn?.symbol || 'Unknown'}`)
      console.log(`   Token Out: ${dbTransaction.transaction?.tokenOut?.symbol || 'Unknown'}`)
      console.log(`   Amount In: ${dbTransaction.transaction?.tokenIn?.amount || 0}`)
      console.log(`   Amount Out: ${dbTransaction.transaction?.tokenOut?.amount || 0}`)
      console.log(`   Timestamp: ${dbTransaction.transaction?.timestamp || 'Unknown'}`)
      
      results.push({
        signature: sig,
        status: 'V1_DETECTED',
        dbRecord: dbTransaction
      })
    } else {
      notFoundInDb++
      console.log('❌ NOT FOUND IN DATABASE')
      console.log('   🎯 This is a NEW DISCOVERY by V2 parser!')
      console.log('   V1 parser missed this transaction')
      
      results.push({
        signature: sig,
        status: 'V2_NEW_DISCOVERY',
        dbRecord: null
      })
    }
  }

  // Summary
  console.log('\n\n' + '═'.repeat(80))
  console.log('SUMMARY')
  console.log('═'.repeat(80))
  console.log(`Total V2 Detections: ${actualSignatures.length}`)
  console.log(`✅ Already in DB (V1 detected): ${foundInDb} (${((foundInDb / actualSignatures.length) * 100).toFixed(1)}%)`)
  console.log(`🎯 New Discoveries (V2 only): ${notFoundInDb} (${((notFoundInDb / actualSignatures.length) * 100).toFixed(1)}%)`)
  
  if (notFoundInDb > 0) {
    console.log('\n🎉 V2 PARSER FOUND MORE TRANSACTIONS THAN V1!')
    console.log(`   V2 detected ${notFoundInDb} additional swap(s) that V1 missed`)
  } else if (foundInDb === actualSignatures.length) {
    console.log('\n✅ V2 PARSER MATCHES V1 DETECTION')
    console.log('   All V2 detections were already found by V1')
  }

  console.log('\n' + '═'.repeat(80))

  // Now let's check if V1 has MORE transactions in the last hour
  console.log('\n\nChecking if V1 detected MORE transactions in the same time period...\n')
  
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const v1RecentTransactions = await whaleAllTransactionModelV2.countDocuments({
    'transaction.timestamp': { $gte: oneHourAgo }
  })

  console.log(`V1 transactions in last hour: ${v1RecentTransactions}`)
  console.log(`V2 valid swaps detected: ${actualSignatures.length}`)
  console.log(`V2 total transactions processed: 202`)
  console.log(`V2 detection rate: ${((actualSignatures.length / 202) * 100).toFixed(1)}%`)

  await mongoose.disconnect()
  console.log('\n✅ Disconnected from MongoDB\n')
}

main().catch(console.error)
