/**
 * Debug script to see what augmentation does
 */

const axios = require('axios')
require('dotenv').config()

const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')

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
    const SOL_MINT = 'So11111111111111111111111111111111111111112'

    console.log('=== BEFORE AUGMENTATION ===')
    console.log('Balance changes for swapper:')
    shyftData.token_balance_changes
      .filter(c => c.owner === swapper)
      .forEach(c => {
        console.log(`  ${c.mint === SOL_MINT ? 'SOL' : c.mint.substring(0, 8)}: ${c.change_amount}`)
      })

    // Parse with V2 (this will trigger augmentation)
    const v2Input = {
      signature: SIGNATURE,
      timestamp: new Date(shyftData.timestamp).getTime(),
      status: shyftData.status,
      fee: shyftData.fee,
      fee_payer: shyftData.fee_payer,
      signers: shyftData.signers,
      protocol: shyftData.protocol,
      token_balance_changes: shyftData.token_balance_changes,
      actions: shyftData.actions
    }

    const parseResult = parseShyftTransactionV2(v2Input)

    if (parseResult.success) {
      const swap = parseResult.data
      console.log('\n=== AFTER PARSING ===')
      console.log(`Net Wallet Received: ${swap.amounts.netWalletReceived} SOL`)
      console.log(`Expected: 1.001245114 SOL`)
      console.log(`Difference: ${swap.amounts.netWalletReceived - 1.001245114} SOL`)
    }

  } catch (error) {
    console.error('Error:', error.message)
  }
}

debugTransaction()
