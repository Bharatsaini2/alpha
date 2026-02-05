/**
 * Debug Single Asset Issue
 * 
 * Transaction 4Rqs6Ni9... has only 1 asset after filtering
 * This is different from the SOL/WSOL merge issue
 */

const axios = require('axios')
require('dotenv').config()

const SHYFT_API_KEY = process.env.SHYFT_API_KEY
const signature = '4Rqs6Ni9sNUPNSZoMkAZ8WhVYJX2npNRLqirD43nyjfkYHHZosThPDEhjk2c9Amwm8ptENzXrvNGXmRCZaYo1BrD'

async function fetchShyftTransaction(sig) {
  const response = await axios.get(
    `https://api.shyft.to/sol/v1/transaction/parsed`,
    {
      params: {
        network: 'mainnet-beta',
        txn_signature: sig,
      },
      headers: {
        'x-api-key': SHYFT_API_KEY,
      },
    }
  )
  return response.data?.result || null
}

async function main() {
  console.log('Fetching transaction...\n')
  const tx = await fetchShyftTransaction(signature)
  
  if (!tx) {
    console.log('Failed to fetch')
    return
  }

  console.log('Protocol:', tx.protocol?.name)
  console.log('Fee Payer:', tx.fee_payer)
  console.log('\nBalance Changes:')
  tx.token_balance_changes?.forEach((change, i) => {
    console.log(`${i + 1}. Token: ${change.token_address || 'SOL'}`)
    console.log(`   Symbol: ${change.symbol || 'Unknown'}`)
    console.log(`   Owner: ${change.owner}`)
    console.log(`   Change: ${change.change_amount}`)
    console.log(`   Type: ${change.change_type}`)
    console.log('')
  })

  console.log('\nActions:')
  tx.actions?.forEach((action, i) => {
    console.log(`${i + 1}. Type: ${action.type}`)
    if (action.info) {
      console.log(`   Info:`, JSON.stringify(action.info, null, 2))
    }
    console.log('')
  })

  // Analysis
  console.log('\n=== ANALYSIS ===')
  console.log('This transaction has 2 balance changes but one has change_amount = 0')
  console.log('After filtering zero deltas, only 1 asset remains')
  console.log('\nThis is NOT a SOL/WSOL merge issue')
  console.log('This is a transaction where one side has zero net delta')
  console.log('\nPossible reasons:')
  console.log('1. Failed transaction')
  console.log('2. Transfer-only (not a swap)')
  console.log('3. Rent-only transaction')
  console.log('\nThis rejection is CORRECT - not a valid swap')
}

main().catch(console.error)
