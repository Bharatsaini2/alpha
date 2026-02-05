/**
 * Check LASER transaction discrepancy
 * Transaction: ZkD29a4wU...v9mNZzsc8
 */

const axios = require('axios')
require('dotenv').config()

async function checkTransaction() {
  // Full signature provided
  const signature = 'ZkD29a4wUftF4j2fqpyR9GoKrWvnk5iKHxUbr6vBDFoaNwHNadx51P4ECTHRMvWrwbgWkS6KfqAGxPv9mNZzsc8'
  
  console.log('🔍 Fetching transaction from SHYFT API...')
  console.log('Signature:', signature)
  console.log('='.repeat(80))

  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${signature}`,
      {
        headers: {
          'x-api-key': process.env.SHYFT_API_KEY,
        },
      }
    )

    const tx = response.data.result

    console.log('\n📊 Transaction Details:')
    console.log('Status:', tx.status)
    console.log('Timestamp:', new Date(tx.timestamp * 1000).toLocaleString())
    console.log('Fee:', tx.fee, 'lamports =', tx.fee / 1e9, 'SOL')
    console.log('Protocol:', tx.protocol?.name || 'Unknown')
    console.log('Fee Payer:', tx.fee_payer)

    console.log('\n💰 Token Balance Changes:')
    if (tx.token_balance_changes && tx.token_balance_changes.length > 0) {
      tx.token_balance_changes.forEach((change, idx) => {
        const normalized = change.change_amount / Math.pow(10, change.decimals)
        console.log(`\n[${idx + 1}] ${change.symbol || 'Unknown'} (${change.token_address?.slice(0, 8)}...)`)
        console.log(`    Owner: ${change.owner}`)
        console.log(`    Raw Amount: ${change.change_amount}`)
        console.log(`    Decimals: ${change.decimals}`)
        console.log(`    Normalized: ${normalized}`)
        console.log(`    Direction: ${change.change_amount > 0 ? '📈 RECEIVED' : '📉 SPENT'}`)
      })
    } else {
      console.log('  ⚠️  No token balance changes found')
    }

    console.log('\n🔍 Actions:')
    if (tx.actions && tx.actions.length > 0) {
      tx.actions.forEach((action, idx) => {
        console.log(`\n[${idx + 1}] ${action.type}`)
        console.log('    Info:', JSON.stringify(action.info, null, 2))
      })
    }

    // Calculate actual swap amounts
    console.log('\n📊 Swap Analysis:')
    const changes = tx.token_balance_changes || []
    const spent = changes.filter(c => c.change_amount < 0)
    const received = changes.filter(c => c.change_amount > 0)

    console.log('\n  Tokens SPENT:')
    spent.forEach(c => {
      const amount = Math.abs(c.change_amount) / Math.pow(10, c.decimals)
      console.log(`    - ${amount} ${c.symbol || 'Unknown'}`)
    })

    console.log('\n  Tokens RECEIVED:')
    received.forEach(c => {
      const amount = c.change_amount / Math.pow(10, c.decimals)
      console.log(`    + ${amount} ${c.symbol || 'Unknown'}`)
    })

    // Check what your UI is showing
    console.log('\n⚠️  YOUR UI SHOWS:')
    console.log('    Amount: $0.073 USD')
    console.log('    Direction: SOLD SOL for LASER')
    console.log('    Gas Fee: $0.099131')

    console.log('\n❓ QUESTIONS TO INVESTIGATE:')
    console.log('1. Does the normalized amount match $0.073?')
    console.log('2. Is the direction correct (SELL vs BUY)?')
    console.log('3. Are we using the right token for amount calculation?')
    console.log('4. Is there a price conversion issue?')

  } catch (error) {
    console.error('\n❌ Error fetching transaction:')
    if (error.response) {
      console.error('Status:', error.response.status)
      console.error('Data:', error.response.data)
    } else {
      console.error(error.message)
    }
  }
}

checkTransaction()
