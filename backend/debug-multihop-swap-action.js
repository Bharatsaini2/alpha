/**
 * Debug Multi-hop SWAP Action
 */

const axios = require('axios')
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'
const TEST_SIGNATURE = '2aqBc9ok838jX6TnY7eanUp3xtbfhykq7pnUUSrK6yWgb47xsTuEwT35AtD1M2MhBgoLKW3DE5NRR6MR1BGhLdRm'

async function test() {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${TEST_SIGNATURE}`,
      {
        headers: { 'x-api-key': SHYFT_API_KEY }
      }
    )

    const parsedTx = response.data.result

    console.log('=== SWAP Action ===')
    const swapAction = parsedTx.actions.find(a => a.type === 'SWAP')
    if (swapAction) {
      console.log('Swapper:', swapAction.info.swapper)
      console.log('\nTokens Swapped:')
      console.log(JSON.stringify(swapAction.info.tokens_swapped, null, 2))
    } else {
      console.log('No SWAP action found')
    }

    console.log('\n=== TOKEN_TRANSFER Actions (first 3) ===')
    const tokenTransfers = parsedTx.actions.filter(a => a.type === 'TOKEN_TRANSFER')
    tokenTransfers.slice(0, 3).forEach((action, idx) => {
      console.log(`\n[${idx + 1}]`)
      console.log('  Sender:', action.info.sender)
      console.log('  Receiver:', action.info.receiver)
      console.log('  Token:', action.info.token_address?.substring(0, 8) + '...')
      console.log('  Amount:', action.info.amount)
    })

    console.log('\n=== All Balance Changes for Swapper ===')
    const swapperChanges = parsedTx.token_balance_changes.filter(
      c => c.owner === parsedTx.fee_payer
    )
    swapperChanges.forEach((change, idx) => {
      console.log(`\n[${idx + 1}] ${change.symbol || change.mint.substring(0, 8) + '...'}`)
      console.log(`    Mint: ${change.mint}`)
      console.log(`    Change: ${change.change_amount}`)
      console.log(`    Pre: ${change.pre_balance} → Post: ${change.post_balance}`)
    })

  } catch (error) {
    console.error('Error:', error.message)
  }
}

test()
