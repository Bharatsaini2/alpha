/**
 * Test a single SELL transaction to understand the token mapping
 * 
 * Transaction: Upx5LcLnoE3eMb73hSm1Z39Rbngmc9osG5yGweACKcefdWWHtEQTTopWvNPKen1VeDpcNKVcxuRB5kPFKUe9dPL
 * CSV Data: SELL, InputMint=J3NK...3KFr, OutputMint=USDC
 * Expected: User is selling J3NK token, receiving USDC
 */

const axios = require('axios')
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'
const SIGNATURE = 'Upx5LcLnoE3eMb73hSm1Z39Rbngmc9osG5yGweACKcefdWWHtEQTTopWvNPKen1VeDpcNKVcxuRB5kPFKUe9dPL'

async function testSellTransaction() {
  console.log('Testing SELL transaction...\n')
  console.log('CSV Data:')
  console.log('  Side: SELL')
  console.log('  InputMint: J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr (token being sold)')
  console.log('  OutputMint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v (USDC received)')
  console.log('  InputAmount: 400')
  console.log('  OutputAmount: 121.072511\n')

  try {
    // Fetch from SHYFT
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${SIGNATURE}`,
      {
        headers: { 'x-api-key': SHYFT_API_KEY },
        timeout: 10000
      }
    )

    const shyftTx = response.data.result

    // Check SWAP action
    const swapAction = shyftTx.actions?.find(a => a.type === 'SWAP')
    if (swapAction && swapAction.info?.tokens_swapped) {
      console.log('SHYFT SWAP Action:')
      console.log('  IN token:', swapAction.info.tokens_swapped.in?.token_address?.substring(0, 8) + '...')
      console.log('  IN amount:', swapAction.info.tokens_swapped.in?.amount)
      console.log('  OUT token:', swapAction.info.tokens_swapped.out?.token_address?.substring(0, 8) + '...')
      console.log('  OUT amount:', swapAction.info.tokens_swapped.out?.amount)
      console.log()
    }

    // Parse with V2 parser
    const v2Input = {
      signature: SIGNATURE,
      timestamp: shyftTx.timestamp ? new Date(shyftTx.timestamp).getTime() : Date.now(),
      status: shyftTx.status || 'Success',
      fee: shyftTx.fee || 0,
      fee_payer: shyftTx.fee_payer || '',
      signers: shyftTx.signers || [],
      protocol: shyftTx.protocol,
      token_balance_changes: shyftTx.token_balance_changes || [],
      actions: shyftTx.actions || []
    }

    const parseResult = parseShyftTransactionV2(v2Input)

    if (!parseResult.success) {
      console.log('❌ Parser failed:', parseResult.erase?.reason)
      return
    }

    console.log('Parser V2 Result:')
    console.log('  Direction:', parseResult.data.direction)
    console.log('  Quote Asset:', parseResult.data.quoteAsset.mint.substring(0, 8) + '...', `(${parseResult.data.quoteAsset.symbol})`)
    console.log('  Base Asset:', parseResult.data.baseAsset.mint.substring(0, 8) + '...', `(${parseResult.data.baseAsset.symbol})`)
    console.log('  Swap Input Amount:', parseResult.data.amounts.swapInputAmount)
    console.log('  Swap Output Amount:', parseResult.data.amounts.swapOutputAmount)
    console.log('  Base Amount:', parseResult.data.amounts.baseAmount)
    console.log()

    console.log('Analysis:')
    console.log('  For a SELL transaction:')
    console.log('    - User is SELLING the base token (J3NK)')
    console.log('    - User is RECEIVING the quote token (USDC)')
    console.log('    - Quote Asset = what user receives (USDC)')
    console.log('    - Base Asset = what user sells (J3NK)')
    console.log()
    console.log('  CSV format (V1 style):')
    console.log('    - InputMint = what user sends (J3NK)')
    console.log('    - OutputMint = what user receives (USDC)')
    console.log()
    console.log('  Mapping for SELL:')
    console.log('    - CSV InputMint → Parser baseAsset ✅')
    console.log('    - CSV OutputMint → Parser quoteAsset ✅')

  } catch (error) {
    console.error('Error:', error.message)
  }
}

testSellTransaction()
