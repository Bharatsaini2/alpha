/**
 * Debug script to see exact balance changes with mint addresses
 */

const axios = require('axios')
require('dotenv').config()

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'
const SIGNATURE = 'qT782VrA189oVftw5zaAsrf5xfxr5jMU9iNpFg6U3Mxb21cx4S9ATLHz1EbQJJHUi4WEzdUTmdCcvoes6gjGDWf'

async function debugTransaction() {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed`,
      {
        params: {
          network: 'mainnet-beta',
          txn_signature: SIGNATURE,
        },
        headers: {
          'x-api-key': SHYFT_API_KEY,
        },
      }
    )

    const shyftData = response.data.result
    const swapper = shyftData.fee_payer

    console.log('Swapper:', swapper)
    console.log('\nToken Balance Changes (with mint addresses):')
    
    shyftData.token_balance_changes.forEach((change, i) => {
      console.log(`\n${i + 1}.`)
      console.log(`   Mint: ${change.mint}`)
      console.log(`   Symbol: ${change.symbol}`)
      console.log(`   Owner: ${change.owner}`)
      console.log(`   Change: ${change.change_amount}`)
      console.log(`   Is Swapper: ${change.owner === swapper}`)
    })

    // Count SOL entries for swapper
    const SOL_MINT = 'So11111111111111111111111111111111111111112'
    const swapperSolChanges = shyftData.token_balance_changes.filter(
      c => c.owner === swapper && c.mint === SOL_MINT
    )

    console.log(`\n\nSOL entries for swapper: ${swapperSolChanges.length}`)
    swapperSolChanges.forEach((change, i) => {
      console.log(`  ${i + 1}. Change: ${change.change_amount} (${change.change_amount / 1e9} SOL)`)
    })

  } catch (error) {
    console.error('Error:', error.message)
  }
}

debugTransaction()
