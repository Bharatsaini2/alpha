require('dotenv').config()
const mongoose = require('mongoose')
const { parseShyftTransaction } = require('./dist/utils/shyftParser')

async function testParserOnDBTransaction() {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log('✅ Connected to MongoDB')

    // Get a recent transaction from production database
    const WhaleAllTransactionModelV2 = mongoose.model(
      'whalealltransactionv2',
      new mongoose.Schema({}, { strict: false, collection: 'whalealltransactionv2' })
    )

    const recentTx = await WhaleAllTransactionModelV2.findOne({
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    })
      .sort({ timestamp: -1 })
      .lean()

    if (!recentTx) {
      console.log('❌ No recent transactions found in database')
      process.exit(1)
    }

    const signature = recentTx.signature
    console.log(`\n📋 Testing transaction from DB: ${signature}`)
    console.log(`Timestamp: ${new Date(recentTx.timestamp).toISOString()}`)
    console.log(`Whale: ${recentTx.whaleAddress}`)
    console.log(`Token In: ${recentTx.tokenIn?.symbol || 'Unknown'}`)
    console.log(`Token Out: ${recentTx.tokenOut?.symbol || 'Unknown'}`)

    // Fetch from SHYFT API
    const url = `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${signature}`
    
    console.log(`\n🔍 Fetching from SHYFT API...`)
    const response = await fetch(url, {
      headers: {
        'x-api-key': process.env.SHYFT_API_KEY,
      },
    })

    const data = await response.json()

    if (!data.success) {
      console.log('❌ SHYFT API error:', data)
      await mongoose.disconnect()
      process.exit(1)
    }

    console.log(`✅ SHYFT Response received`)
    console.log(`Type: ${data.result.type}`)
    console.log(`Status: ${data.result.status}`)
    
    console.log(`\n📊 Token Balance Changes (${data.result.token_balance_changes?.length || 0} total):`)
    const swapper = data.result.fee_payer || data.result.signers?.[0]
    data.result.token_balance_changes?.forEach((change, idx) => {
      const delta = change.post_balance - change.pre_balance
      const isSwapper = change.owner === swapper ? '👤 SWAPPER' : ''
      console.log(`[${idx}] ${change.symbol || 'Unknown'} ${isSwapper}`)
      console.log(`    Owner: ${change.owner.substring(0, 8)}...`)
      console.log(`    Delta: ${delta}`)
    })

    console.log(`\n🔧 Testing Parser...`)
    const parsed = parseShyftTransaction(data.result)

    if (parsed) {
      console.log(`\n✅ Parser Result:`)
      console.log(`  Side: ${parsed.side}`)
      console.log(`  Input: ${parsed.input.mint.substring(0, 8)}... (${parsed.input.amount})`)
      console.log(`  Output: ${parsed.output.mint.substring(0, 8)}... (${parsed.output.amount})`)
      console.log(`  Source: ${parsed.classification_source}`)
      console.log(`  Confidence: ${parsed.confidence}`)
      
      console.log(`\n✅ Parser ACCEPTED this transaction (matches DB)`)
    } else {
      console.log(`\n❌ Parser returned NULL`)
      console.log(`\n⚠️ REGRESSION: This transaction is in the DB but parser rejects it!`)
      
      // Debug info
      const swapperChanges = data.result.token_balance_changes?.filter(c => c.owner === swapper)
      console.log(`\nDebug:`)
      console.log(`  Swapper: ${swapper}`)
      console.log(`  Swapper balance changes: ${swapperChanges?.length || 0}`)
      swapperChanges?.forEach((change, idx) => {
        const delta = change.post_balance - change.pre_balance
        console.log(`    [${idx}] ${change.mint.substring(0, 8)}... delta=${delta}`)
      })
    }

    await mongoose.disconnect()
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

testParserOnDBTransaction()
