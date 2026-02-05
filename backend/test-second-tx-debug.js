/**
 * Debug Second Transaction
 */

const axios = require('axios')
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'
const TEST_SIGNATURE = '4Rqs6Ni9sNUPNSZoMkAZ8WhVYJX2npNRLqirD43nyjfkYHHZosThPDEhjk2c9Amwm8ptENzXrvNGXmRCZaYo1BrD'

async function test() {
  try {
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${TEST_SIGNATURE}`,
      {
        headers: { 'x-api-key': SHYFT_API_KEY }
      }
    )

    const parsedTx = response.data.result

    console.log('=== SOL_TRANSFER Actions ===')
    parsedTx.actions.forEach((action, idx) => {
      if (action.type === 'SOL_TRANSFER') {
        console.log(`\n[${idx}] SOL_TRANSFER`)
        console.log('  Sender:', action.info.sender)
        console.log('  Receiver:', action.info.receiver)
        console.log('  Amount:', action.info.amount)
        console.log('  Amount Raw:', action.info.amount_raw)
      }
    })

    console.log('\n=== Fee Payer ===')
    console.log(parsedTx.fee_payer)

  } catch (error) {
    console.error('Error:', error.message)
  }
}

test()
