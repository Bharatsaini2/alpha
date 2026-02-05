/**
 * Test SWAP Action Parsing
 */

const axios = require('axios')
require('dotenv').config()

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'
const TEST_SIGNATURE = 'wce6trqyQt6ixDgiFp8dJupWQFYuPbpdnaMZzPqLKG7UrbbDgMi9WqmimgCjUYutQZkrPYmXfqUDppz6144eZ1h'

async function testSwapActionParsing() {
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
    const actions = parsedTx.result.actions || []
    
    // Find SWAP action
    const swapAction = actions.find(a => a.type === 'SWAP')
    
    if (swapAction && swapAction.info && swapAction.info.tokens_swapped) {
      const tokensIn = swapAction.info.tokens_swapped.in
      
      console.log('=== SWAP ACTION DATA ===')
      console.log('tokens_swapped.in.amount_raw:', tokensIn.amount_raw)
      console.log('Type:', typeof tokensIn.amount_raw)
      console.log('tokens_swapped.in.amount:', tokensIn.amount)
      console.log('tokens_swapped.in.decimals:', tokensIn.decimals)
      
      // Test parsing
      const inAmountRaw = typeof tokensIn.amount_raw === 'string'
        ? parseFloat(tokensIn.amount_raw)
        : tokensIn.amount_raw
      
      console.log('\n=== PARSING TEST ===')
      console.log('Parsed amount_raw:', inAmountRaw)
      console.log('Decimals:', tokensIn.decimals || 9)
      
      // Test normalization
      const normalized = inAmountRaw / Math.pow(10, tokensIn.decimals || 9)
      console.log('Normalized (amount_raw / 10^decimals):', normalized)
      
      console.log('\n=== COMPARISON ===')
      console.log('SHYFT amount field:', tokensIn.amount)
      console.log('Our normalized:', normalized)
      console.log('Solscan:', 0.247461329)
      console.log('V2 Parser output:', 0.494442579)
      
      // Check if amount_raw needs decimals
      console.log('\n=== HYPOTHESIS ===')
      console.log('If amount_raw is already in lamports:', inAmountRaw, '/', Math.pow(10, 9), '=', inAmountRaw / Math.pow(10, 9))
      console.log('If amount_raw is in SOL:', inAmountRaw)
      console.log('If we need to multiply by decimals:', inAmountRaw * Math.pow(10, 9))
    }

  } catch (error) {
    console.error('Error:', error.message)
  }
}

testSwapActionParsing()
