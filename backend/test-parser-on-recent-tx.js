require('dotenv').config()
const { parseShyftTransaction } = require('./dist/utils/shyftParser')

async function testParserOnRecentTx() {
  try {
    // Test with a rejected transaction from the regression test
    const signature = '2wtUN4mn9D2tz18ct7MDZ9SKjMx6CczByFgMzqDUFesTSqK55njJ9TwETE2S8AicqtDYiNRG9o5JYwjpLpbn23Kw'
    
    console.log(`\n🔍 Testing parser on transaction: ${signature}`)
    
    // Fetch from SHYFT API
    const url = `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${signature}`
    
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
    console.log(`Type: ${data.result.type}`)
    console.log(`Status: ${data.result.status}`)
    console.log(`Fee Payer: ${data.result.fee_payer}`)
    console.log(`Signers: ${data.result.signers?.join(', ')}`)
    
    console.log(`\n📊 Token Balance Changes (${data.result.token_balance_changes?.length || 0} total):`)
    data.result.token_balance_changes?.forEach((change, idx) => {
      const delta = change.post_balance - change.pre_balance
      console.log(`\n[${idx}] ${change.symbol || 'Unknown'}`)
      console.log(`  Mint: ${change.mint}`)
      console.log(`  Owner: ${change.owner}`)
      console.log(`  Pre: ${change.pre_balance}`)
      console.log(`  Post: ${change.post_balance}`)
      console.log(`  Delta: ${delta}`)
      console.log(`  Change Amount: ${change.change_amount}`)
    })

    console.log(`\n📋 Actions (${data.result.actions?.length || 0} total):`)
    data.result.actions?.forEach((action, idx) => {
      console.log(`\n[${idx}] Type: ${action.type}`)
      if (action.info) {
        console.log(`  Info:`, JSON.stringify(action.info, null, 2))
      }
    })

    console.log(`\n🔧 Testing Parser...`)
    const parsed = parseShyftTransaction(data.result)

    if (parsed) {
      console.log(`\n✅ Parser Result:`)
      console.log(`  Side: ${parsed.side}`)
      console.log(`  Input: ${parsed.input.mint} (${parsed.input.amount})`)
      console.log(`  Output: ${parsed.output.mint} (${parsed.output.amount})`)
      console.log(`  Source: ${parsed.classification_source}`)
      console.log(`  Confidence: ${parsed.confidence}`)
    } else {
      console.log(`\n❌ Parser returned NULL`)
      console.log(`\nDebugging:`)
      console.log(`  Status check: ${data.result.status === 'Success' ? '✅' : '❌'}`)
      console.log(`  Swapper: ${data.result.fee_payer || data.result.signers?.[0]}`)
      
      // Check balance changes for swapper
      const swapper = data.result.fee_payer || data.result.signers?.[0]
      const swapperChanges = data.result.token_balance_changes?.filter(c => c.owner === swapper)
      console.log(`  Swapper balance changes: ${swapperChanges?.length || 0}`)
      
      swapperChanges?.forEach((change, idx) => {
        const delta = change.post_balance - change.pre_balance
        console.log(`    [${idx}] ${change.mint.substring(0, 8)}... delta=${delta}`)
      })
      
      // Check for non-zero deltas
      const nonZeroDeltas = swapperChanges?.filter(c => (c.post_balance - c.pre_balance) !== 0)
      console.log(`  Non-zero deltas: ${nonZeroDeltas?.length || 0}`)
    }

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

testParserOnRecentTx()
