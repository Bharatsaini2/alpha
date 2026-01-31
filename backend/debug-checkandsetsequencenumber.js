require('dotenv').config()
const axios = require('axios')

const signature = 'fzQcJF9ZvtYxVz5AJfFrjuF8uQPeovAyC28BhwM3BuuZegXJuqnisYvh4BaAadDgvRWutFtKEur3kwxedSByA2J'

async function debug() {
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
    
    console.log('\n=== TRANSACTION DEBUG ===')
    console.log('Signature:', signature)
    console.log('Type:', tx.type)
    console.log('Status:', tx.status)
    console.log('Fee Payer:', tx.fee_payer)
    console.log('Signers:', tx.signers)
    
    console.log('\n=== TOKEN BALANCE CHANGES ===')
    console.log('Total changes:', tx.token_balance_changes?.length || 0)
    
    if (tx.token_balance_changes) {
      tx.token_balance_changes.forEach((change, idx) => {
        const delta = change.post_balance - change.pre_balance
        console.log(`\n[${idx}] ${change.mint.substring(0, 8)}...`)
        console.log('  Owner:', change.owner)
        console.log('  Pre:', change.pre_balance)
        console.log('  Post:', change.post_balance)
        console.log('  Delta:', delta)
        console.log('  Decimals:', change.decimals)
        console.log('  Symbol:', change.symbol || 'Unknown')
      })
    }
    
    console.log('\n=== ACTIONS ===')
    if (tx.actions) {
      tx.actions.forEach((action, idx) => {
        console.log(`\n[${idx}] ${action.type}`)
        if (action.info?.tokens_swapped) {
          console.log('  tokens_swapped:', JSON.stringify(action.info.tokens_swapped, null, 2))
        }
        if (action.type === 'SOL_TRANSFER' && action.info) {
          console.log('  SOL_TRANSFER info:', JSON.stringify(action.info, null, 2))
        }
      })
    }
    
    console.log('\n=== EVENTS ===')
    if (tx.events) {
      tx.events.forEach((event, idx) => {
        console.log(`\n[${idx}] ${event.name || event.type}`)
      })
    }
    
  } catch (error) {
    console.error('Error:', error.message)
  }
}

debug()
