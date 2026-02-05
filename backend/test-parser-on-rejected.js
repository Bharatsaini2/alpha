/**
 * Test the V2 parser directly on a "rejected" transaction
 * to see if it actually parses successfully
 */

const axios = require('axios')
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'

// One of the "no_swap_action" transactions
const SIGNATURE = '4RhDCom3V97Ry8DuryGM9qtcM45jqKJYHrupV82tqBS3ot4jgCHZYhhgcudEzrXgCwmnkmMNyZTegVm1CveS3MVW'

async function testParser() {
  console.log('Testing parser on transaction:', SIGNATURE)
  console.log()

  try {
    // Fetch from SHYFT
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${SIGNATURE}`,
      {
        headers: { 'x-api-key': SHYFT_API_KEY },
        timeout: 10000
      }
    )

    const tx = response.data.result

    console.log('Transaction fetched successfully')
    console.log('Protocol:', tx.protocol?.name || 'unknown')
    console.log('Token balance changes:', tx.token_balance_changes?.length || 0)
    console.log()

    // Parse with V2 parser
    const v2Input = {
      signature: SIGNATURE,
      timestamp: tx.timestamp ? new Date(tx.timestamp).getTime() : Date.now(),
      status: tx.status || 'Success',
      fee: tx.fee || 0,
      fee_payer: tx.fee_payer || '',
      signers: tx.signers || [],
      protocol: tx.protocol,
      token_balance_changes: tx.token_balance_changes || [],
      actions: tx.actions || []
    }

    console.log('Running V2 Parser...')
    const parseResult = parseShyftTransactionV2(v2Input)

    console.log()
    console.log('='.repeat(70))
    console.log('PARSER RESULT')
    console.log('='.repeat(70))
    console.log('Success:', parseResult.success)
    console.log()

    if (parseResult.success && parseResult.data) {
      const data = parseResult.data

      if ('sellRecord' in data) {
        console.log('Type: SPLIT SWAP')
        console.log()
        console.log('SELL Record:')
        console.log('  Direction:', data.sellRecord.direction)
        console.log('  Quote:', data.sellRecord.quoteAsset.symbol, data.sellRecord.quoteAsset.mint.substring(0, 8) + '...')
        console.log('  Base:', data.sellRecord.baseAsset.symbol, data.sellRecord.baseAsset.mint.substring(0, 8) + '...')
        console.log('  Amounts:', JSON.stringify(data.sellRecord.amounts, null, 2))
        console.log()
        console.log('BUY Record:')
        console.log('  Direction:', data.buyRecord.direction)
        console.log('  Quote:', data.buyRecord.quoteAsset.symbol, data.buyRecord.quoteAsset.mint.substring(0, 8) + '...')
        console.log('  Base:', data.buyRecord.baseAsset.symbol, data.buyRecord.baseAsset.mint.substring(0, 8) + '...')
        console.log('  Amounts:', JSON.stringify(data.buyRecord.amounts, null, 2))
      } else {
        console.log('Type: SINGLE SWAP')
        console.log('Direction:', data.direction)
        console.log('Quote:', data.quoteAsset.symbol, data.quoteAsset.mint.substring(0, 8) + '...')
        console.log('Base:', data.baseAsset.symbol, data.baseAsset.mint.substring(0, 8) + '...')
        console.log()
        console.log('Amounts:')
        console.log('  swapInputAmount:', data.amounts.swapInputAmount)
        console.log('  swapOutputAmount:', data.amounts.swapOutputAmount)
        console.log('  baseAmount:', data.amounts.baseAmount)
        console.log('  totalWalletCost:', data.amounts.totalWalletCost)
        console.log('  netWalletReceived:', data.amounts.netWalletReceived)
        console.log()
        console.log('Full amounts:', JSON.stringify(data.amounts, null, 2))
      }
    } else if (parseResult.erase) {
      console.log('Type: ERASE (Rejected)')
      console.log('Reason:', parseResult.erase.reason)
      console.log('Debug Info:', JSON.stringify(parseResult.erase.debugInfo, null, 2))
    }

    console.log('='.repeat(70))

  } catch (error) {
    console.error('Error:', error.message)
  }
}

testParser()
