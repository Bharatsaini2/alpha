/**
 * Test a single BUY transaction to verify quote/base assignment
 * 
 * Transaction: 4WrnttJRA1M7kgc71huNh2EcL7HYzzfZtKLBc6upV45Ene9BEQcC4PZELsWQFs856747XLUCjKRwXQZYNR6FVAq7
 * CSV Data: BUY, InputMint=USDC, OutputMint=A7bd...QXaS
 * Expected: User is buying A7bd token with USDC
 */

const axios = require('axios')
const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'
const SIGNATURE = '4WrnttJRA1M7kgc71huNh2EcL7HYzzfZtKLBc6upV45Ene9BEQcC4PZELsWQFs856747XLUCjKRwXQZYNR6FVAq7'

async function testBuyTransaction() {
  console.log('Testing BUY transaction...\n')
  console.log('CSV Data:')
  console.log('  Side: BUY')
  console.log('  InputMint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v (USDC spent)')
  console.log('  OutputMint: A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS (token received)')
  console.log('  InputAmount: 55.629024')
  console.log('  OutputAmount: 0.19920058\n')

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
    console.log('  For a BUY transaction:')
    console.log('    - User is BUYING the base token (A7bd)')
    console.log('    - User is SPENDING the quote token (USDC)')
    console.log('    - Quote Asset = what user spends (USDC)')
    console.log('    - Base Asset = what user buys (A7bd)')
    console.log()
    console.log('  CSV format (V1 style):')
    console.log('    - InputMint = what user sends (USDC)')
    console.log('    - OutputMint = what user receives (A7bd)')
    console.log()
    console.log('  Mapping for BUY:')
    console.log('    - CSV InputMint → Parser quoteAsset ✅')
    console.log('    - CSV OutputMint → Parser baseAsset ✅')

  } catch (error) {
    console.error('Error:', error.message)
  }
}

testBuyTransaction()
