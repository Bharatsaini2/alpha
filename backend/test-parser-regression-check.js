require('dotenv').config()
const mongoose = require('mongoose')
const { parseShyftTransaction } = require('./dist/utils/shyftParser')

async function testParserRegression() {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log('✅ Connected to MongoDB\n')

    const WhaleAllTransactionModelV2 = mongoose.model(
      'whalealltransactionv2',
      new mongoose.Schema({}, { strict: false, collection: 'whalealltransactionv2' })
    )

    // Get 20 recent transactions from production database
    const recentTxs = await WhaleAllTransactionModelV2.find({
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    })
      .sort({ timestamp: -1 })
      .limit(20)
      .lean()

    console.log(`📋 Testing ${recentTxs.length} transactions from production DB\n`)

    let accepted = 0
    let rejected = 0
    const regressions = []

    for (const tx of recentTxs) {
      const signature = tx.signature
      
      // Fetch from SHYFT API
      const url = `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${signature}`
      
      try {
        const response = await fetch(url, {
          headers: {
            'x-api-key': process.env.SHYFT_API_KEY,
          },
        })

        const data = await response.json()

        if (!data.success) {
          console.log(`⚠️  ${signature.substring(0, 16)}... - SHYFT API error`)
          continue
        }

        // Test parser
        const parsed = parseShyftTransaction(data.result)

        if (parsed) {
          accepted++
          console.log(`✅ ${signature.substring(0, 16)}... - ${parsed.side} (${parsed.confidence})`)
        } else {
          rejected++
          regressions.push({
            signature,
            type: data.result.type,
            tokenIn: tx.tokenIn?.symbol,
            tokenOut: tx.tokenOut?.symbol,
          })
          console.log(`❌ ${signature.substring(0, 16)}... - REJECTED (was in DB)`)
        }

        // Rate limit: wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        console.log(`⚠️  ${signature.substring(0, 16)}... - Error: ${error.message}`)
      }
    }

    console.log(`\n📊 Results:`)
    console.log(`  ✅ Accepted: ${accepted} (${Math.round(accepted / recentTxs.length * 100)}%)`)
    console.log(`  ❌ Rejected: ${rejected} (${Math.round(rejected / recentTxs.length * 100)}%)`)

    if (regressions.length > 0) {
      console.log(`\n⚠️  REGRESSIONS FOUND: ${regressions.length} transactions`)
      console.log(`\nRejected transactions that were in DB:`)
      regressions.forEach((reg, idx) => {
        console.log(`  [${idx + 1}] ${reg.signature.substring(0, 16)}...`)
        console.log(`      Type: ${reg.type}`)
        console.log(`      ${reg.tokenIn || 'Unknown'} → ${reg.tokenOut || 'Unknown'}`)
      })
    } else {
      console.log(`\n✅ NO REGRESSIONS - All DB transactions accepted by parser`)
    }

    await mongoose.disconnect()
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

testParserRegression()
