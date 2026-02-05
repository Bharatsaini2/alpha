/**
 * Debug SWAP Action Data
 */

const axios = require('axios')
require('dotenv').config()

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'
const TEST_SIGNATURE = 'wce6trqyQt6ixDgiFp8dJupWQFYuPbpdnaMZzPqLKG7UrbbDgMi9WqmimgCjUYutQZkrPYmXfqUDppz6144eZ1h'

async function debugSwapAction() {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${TEST_SIGNATURE}`,
      {
        headers: {
          'x-api-key': SHYFT_API_KEY
        }
      }
    )

    const parsedTx = response.data
    
    console.log('=== SWAP ACTIONS ===\n')
    const actions = parsedTx.result.actions || []
    
    actions.forEach((action, idx) => {
      console.log(`[${idx + 1}] Action Type: ${action.type}`)
      console.log(`    Info:`, JSON.stringify(action.info, null, 2))
      console.log()
    })

    // Find SWAP action
    const swapAction = actions.find(a => a.type === 'SWAP')
    if (swapAction && swapAction.info && swapAction.info.tokens_swapped) {
      console.log('=== TOKENS_SWAPPED DATA ===\n')
      console.log('IN (what was sent):')
      console.log(JSON.stringify(swapAction.info.tokens_swapped.in, null, 2))
      console.log('\nOUT (what was received):')
      console.log(JSON.stringify(swapAction.info.tokens_swapped.out, null, 2))
      
      // Calculate what the amount should be
      const inAmount = swapAction.info.tokens_swapped.in.amount_raw
      const inDecimals = swapAction.info.tokens_swapped.in.decimals || 9
      const normalized = parseFloat(inAmount) / Math.pow(10, inDecimals)
      
      console.log('\n=== CALCULATION ===')
      console.log(`Raw Amount: ${inAmount}`)
      console.log(`Decimals: ${inDecimals}`)
      console.log(`Normalized: ${normalized}`)
      console.log(`Expected (Solscan): 0.247461329`)
      console.log(`Ratio: ${normalized / 0.247461329}x`)
    }

  } catch (error) {
    console.error('Error:', error.message)
  }
}

debugSwapAction()
