/**
 * Debug script to check for SOL_TRANSFER actions
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
    console.log('\nAll Actions:')
    
    shyftData.actions.forEach((action, i) => {
      console.log(`\n${i + 1}. ${action.type}`)
      if (action.type === 'SOL_TRANSFER') {
        console.log('   *** SOL_TRANSFER FOUND ***')
        console.log('   Sender:', action.info?.sender)
        console.log('   Receiver:', action.info?.receiver)
        console.log('   Amount:', action.info?.amount)
      }
    })

    const solTransfers = shyftData.actions.filter(a => a.type === 'SOL_TRANSFER')
    console.log(`\n\nTotal SOL_TRANSFER actions: ${solTransfers.length}`)

  } catch (error) {
    console.error('Error:', error.message)
  }
}

debugTransaction()
