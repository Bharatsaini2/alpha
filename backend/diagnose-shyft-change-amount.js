require('dotenv').config()
const mongoose = require('mongoose')

async function diagnoseShyftResponse() {
  try {
    console.log('MONGO_URI:', process.env.MONGO_URI ? 'Found' : 'Not found')
    console.log('SHYFT_API_KEY:', process.env.SHYFT_API_KEY ? 'Found' : 'Not found')
    
    await mongoose.connect(process.env.MONGO_URI)
    console.log('✅ Connected to MongoDB')

    // Get a recent transaction signature
    const WhaleAllTransactionModelV2 = mongoose.model(
      'whalealltransactionv2',
      new mongoose.Schema({}, { strict: false, collection: 'whalealltransactionv2' })
    )

    const recentTx = await WhaleAllTransactionModelV2.findOne()
      .sort({ timestamp: -1 })
      .lean()

    if (!recentTx) {
      console.log('❌ No transactions found in database')
      process.exit(1)
    }

    console.log(`\n📋 Recent transaction: ${recentTx.signature}`)
    console.log(`Timestamp: ${new Date(recentTx.timestamp).toISOString()}`)

    // Fetch from SHYFT API
    const signature = recentTx.signature
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
      process.exit(1)
    }

    console.log(`\n✅ SHYFT Response received`)
    console.log(`\n📊 Token Balance Changes:`)

    const balanceChanges = data.result?.token_balance_changes || []
    console.log(`Total: ${balanceChanges.length}`)

    balanceChanges.forEach((change, idx) => {
      console.log(`\n[${idx}] ${change.symbol || 'Unknown'}`)
      console.log(`  Mint: ${change.mint}`)
      console.log(`  Owner: ${change.owner}`)
      console.log(`  change_amount: ${change.change_amount}`)
      console.log(`  raw_amount: ${change.raw_amount}`)
      console.log(`  pre_balance: ${change.pre_balance}`)
      console.log(`  post_balance: ${change.post_balance}`)
      console.log(`  decimals: ${change.decimals}`)
      
      // Calculate change_amount manually
      const calculated = change.post_balance - change.pre_balance
      console.log(`  ✅ Calculated change: ${calculated}`)
      console.log(`  Match: ${calculated === change.change_amount ? '✅' : '❌'}`)
    })

    await mongoose.disconnect()
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

diagnoseShyftResponse()
