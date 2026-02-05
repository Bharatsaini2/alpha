/**
 * Debug a rejected transaction to see what SHYFT actually returns
 */

const axios = require('axios')
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'

// Pick one of the "no_swap_action" transactions
const SIGNATURE = '4RhDCom3V97Ry8DuryGM9qtcM45jqKJYHrupV82tqBS3ot4jgCHZYhhgcudEzrXgCwmnkmMNyZTegVm1CveS3MVW'

async function debugTransaction() {
  console.log('Debugging transaction:', SIGNATURE)
  console.log()

  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${SIGNATURE}`,
      {
        headers: { 'x-api-key': SHYFT_API_KEY },
        timeout: 10000
      }
    )

    const tx = response.data.result

    console.log('Transaction Status:', tx.status)
    console.log('Protocol:', tx.protocol?.name || 'unknown')
    console.log()

    console.log('Actions:')
    if (tx.actions && tx.actions.length > 0) {
      tx.actions.forEach((action, idx) => {
        console.log(`  [${idx + 1}] Type: ${action.type}`)
        if (action.info) {
          console.log('      Info:', JSON.stringify(action.info, null, 2))
        }
      })
    } else {
      console.log('  No actions found')
    }
    console.log()

    console.log('Token Balance Changes:')
    if (tx.token_balance_changes && tx.token_balance_changes.length > 0) {
      tx.token_balance_changes.forEach((change, idx) => {
        console.log(`  [${idx + 1}] ${change.owner}`)
        console.log(`      Token: ${change.mint}`)
        console.log(`      Symbol: ${change.symbol || 'Unknown'}`)
        console.log(`      Change: ${change.change_amount}`)
      })
    } else {
      console.log('  No token balance changes found')
    }

  } catch (error) {
    console.error('Error:', error.message)
  }
}

debugTransaction()
