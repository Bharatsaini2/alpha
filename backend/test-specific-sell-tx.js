/**
 * Test specific SELL transaction to verify amounts
 */

const axios = require('axios')
require('dotenv').config()

const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'

// Transaction: qT782VrA189oVftw5zaAsrf5xfxr5jMU9iNpFg6U3Mxb21cx4S9ATLHz1EbQJJHUi4WEzdUTmdCcvoes6gjGDWf
// Expected: SELL HUMA → SOL
// Solscan shows: User sold HUMA tokens to receive SOL

const SIGNATURE = 'qT782VrA189oVftw5zaAsrf5xfxr5jMU9iNpFg6U3Mxb21cx4S9ATLHz1EbQJJHUi4WEzdUTmdCcvoes6gjGDWf'

async function testTransaction() {
  console.log('Testing SELL transaction:', SIGNATURE)
  console.log('Expected: User SELLS HUMA tokens to receive SOL\n')

  try {
    // Fetch from SHYFT
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

    console.log('='.repeat(80))
    console.log('SHYFT RAW DATA')
    console.log('='.repeat(80))
    console.log('Fee Payer:', shyftData.fee_payer)
    console.log('Signers:', shyftData.signers)
    console.log('\nToken Balance Changes:')
    shyftData.token_balance_changes.forEach((change, i) => {
      console.log(`\n${i + 1}. ${change.token_address}`)
      console.log(`   Symbol: ${change.symbol}`)
      console.log(`   Owner: ${change.owner}`)
      console.log(`   Change: ${change.change_amount}`)
    })

    console.log('\nActions:')
    shyftData.actions.forEach((action, i) => {
      console.log(`\n${i + 1}. ${action.type}`)
      if (action.info) {
        console.log('   Info:', JSON.stringify(action.info, null, 2))
      }
    })

    // Parse with V2
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

    console.log('\n' + '='.repeat(80))
    console.log('V2 PARSER RESULT')
    console.log('='.repeat(80))

    const parseResult = parseShyftTransactionV2(v2Input)

    if (parseResult.success) {
      const swap = parseResult.data
      console.log('✅ SUCCESS')
      console.log('\nDirection:', swap.direction)
      console.log('Quote Asset:', swap.quoteAsset.symbol, '(', swap.quoteAsset.mint.substring(0, 8), '...)')
      console.log('Base Asset:', swap.baseAsset.symbol, '(', swap.baseAsset.mint.substring(0, 8), '...)')
      console.log('\nAmounts:')
      console.log('  Base Amount:', swap.amounts.baseAmount)
      console.log('  Swap Input Amount:', swap.amounts.swapInputAmount)
      console.log('  Swap Output Amount:', swap.amounts.swapOutputAmount)
      console.log('  Total Wallet Cost:', swap.amounts.totalWalletCost)
      console.log('  Net Wallet Received:', swap.amounts.netWalletReceived)

      console.log('\n' + '='.repeat(80))
      console.log('INTERPRETATION')
      console.log('='.repeat(80))
      
      if (swap.direction === 'SELL') {
        console.log(`User SOLD ${swap.amounts.baseAmount} ${swap.baseAsset.symbol}`)
        console.log(`User RECEIVED ${swap.amounts.netWalletReceived} ${swap.quoteAsset.symbol}`)
        console.log('\nCSV Output:')
        console.log(`  Input Token: ${swap.baseAsset.symbol}`)
        console.log(`  Output Token: ${swap.quoteAsset.symbol}`)
        console.log(`  Input Amount: ${swap.amounts.baseAmount}`)
        console.log(`  Output Amount: ${swap.amounts.netWalletReceived}`)
      } else {
        console.log(`User BOUGHT ${swap.amounts.baseAmount} ${swap.baseAsset.symbol}`)
        console.log(`User SPENT ${swap.amounts.totalWalletCost} ${swap.quoteAsset.symbol}`)
      }

      console.log('\n' + '='.repeat(80))
      console.log('VERIFICATION')
      console.log('='.repeat(80))
      console.log('Check on Solscan:')
      console.log(`https://solscan.io/tx/${SIGNATURE}`)
      console.log('\nExpected:')
      console.log('  User sells HUMA tokens')
      console.log('  User receives SOL')
      console.log('\nActual V2 Output:')
      console.log(`  Direction: ${swap.direction}`)
      console.log(`  Sold: ${swap.amounts.baseAmount} ${swap.baseAsset.symbol}`)
      console.log(`  Received: ${swap.amounts.netWalletReceived} ${swap.quoteAsset.symbol}`)

    } else {
      console.log('❌ FAILED')
      console.log('Erase Reason:', parseResult.erase?.reason)
      console.log('Debug Info:', JSON.stringify(parseResult.erase?.debugInfo, null, 2))
    }

  } catch (error) {
    console.error('Error:', error.message)
  }
}

testTransaction()
