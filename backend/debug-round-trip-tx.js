/**
 * Debug Round-Trip Transaction
 * 
 * Investigate why transactions with 4 balance changes (2 tokens, each appearing twice)
 * are being rejected by the parser.
 */

require('dotenv').config()
const { parseShyftTransaction } = require('./dist/utils/shyftParser')
const { getParsedTransactions } = require('./dist/config/getParsedTransaction')

async function debugTransaction() {
  // One of the rejected transactions
  const signature = '5Gys27CfqQqPPvPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPqPq'
  
  // Use a real signature from the test
  const realSig = '3C9xewswE1qyghvjGn4vsNtYefXnctkBzpQPWGozB3WrSqeGs53vmBoHUmZwDLqtMi35rWxGBgzs9mQY8GBSZj'
  
  try {
    console.log('Fetching transaction:', realSig)
    const parsedData = await getParsedTransactions(realSig)
    const parsedTx = JSON.parse(parsedData)
    
    console.log('\n📊 Transaction Details:')
    console.log('Type:', parsedTx.result?.type)
    console.log('Status:', parsedTx.success ? 'Success' : 'Failed')
    
    const tokenBalanceChanges = parsedTx.result?.token_balance_changes || []
    console.log('\n💰 Token Balance Changes:')
    
    // Group by owner
    const byOwner = {}
    tokenBalanceChanges.forEach(change => {
      if (!byOwner[change.owner]) {
        byOwner[change.owner] = []
      }
      byOwner[change.owner].push(change)
    })
    
    Object.entries(byOwner).forEach(([owner, changes]) => {
      console.log(`\n  Owner: ${owner.substring(0, 8)}...`)
      changes.forEach(change => {
        console.log(`    ${change.mint.substring(0, 8)}... delta: ${change.change_amount}`)
      })
      
      // Calculate net deltas for this owner
      const netDeltas = {}
      changes.forEach(change => {
        const delta = change.post_balance - change.pre_balance
        netDeltas[change.mint] = (netDeltas[change.mint] || 0) + delta
      })
      
      console.log('    Net deltas:')
      Object.entries(netDeltas).forEach(([mint, delta]) => {
        console.log(`      ${mint.substring(0, 8)}...: ${delta}`)
      })
    })
    
    // Test with parser
    console.log('\n🔍 Parser Test:')
    const result = parseShyftTransaction(parsedTx.result)
    
    if (result) {
      console.log('✅ ACCEPTED')
      console.log('  Side:', result.side)
      console.log('  Input:', result.input.mint.substring(0, 8), result.input.amount)
      console.log('  Output:', result.output.mint.substring(0, 8), result.output.amount)
    } else {
      console.log('❌ REJECTED')
      console.log('\nThis is a round-trip transaction where:')
      console.log('- Tokens go through multiple accounts')
      console.log('- Net delta for swapper might be zero')
      console.log('- But there IS a swap happening (just not for the fee payer)')
    }
    
  } catch (error) {
    console.error('Error:', error.message)
  }
}

debugTransaction()
