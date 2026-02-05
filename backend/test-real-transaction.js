/**
 * Test Real Transaction with V2 Parser
 * 
 * Tests the actual transaction signature to verify V2 parser integration
 */

const axios = require('axios')
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'
const TEST_SIGNATURE = 'wce6trqyQt6ixDgiFp8dJupWQFYuPbpdnaMZzPqLKG7UrbbDgMi9WqmimgCjUYutQZkrPYmXfqUDppz6144eZ1h'

console.log('╔════════════════════════════════════════════════════════════╗')
console.log('║       Real Transaction Test - V2 Parser Integration       ║')
console.log('╚════════════════════════════════════════════════════════════╝\n')

console.log(`Testing signature: ${TEST_SIGNATURE}\n`)

async function testRealTransaction() {
  try {
    // Fetch transaction from SHYFT
    console.log('📡 Fetching transaction from SHYFT API...')
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${TEST_SIGNATURE}`,
      {
        headers: {
          'x-api-key': SHYFT_API_KEY
        }
      }
    )

    if (!response.data.success) {
      console.error('❌ Failed to fetch transaction:', response.data)
      process.exit(1)
    }

    const parsedTx = response.data
    console.log('✅ Transaction fetched successfully\n')

    // Display transaction info
    console.log('=== Transaction Info ===')
    console.log(`Type: ${parsedTx.result.type}`)
    console.log(`Status: ${parsedTx.result.status}`)
    console.log(`Fee: ${parsedTx.result.fee} SOL`)
    console.log(`Protocol: ${parsedTx.result.protocol?.name || 'Unknown'}`)
    console.log(`Timestamp: ${parsedTx.result.timestamp}`)
    console.log(`Fee Payer: ${parsedTx.result.fee_payer}`)
    console.log(`Signers: ${parsedTx.result.signers.join(', ')}`)
    console.log()

    // Display token balance changes
    console.log('=== Token Balance Changes ===')
    if (parsedTx.result.token_balance_changes && parsedTx.result.token_balance_changes.length > 0) {
      parsedTx.result.token_balance_changes.forEach((change, idx) => {
        console.log(`\n[${idx + 1}] ${change.symbol || change.mint.substring(0, 8) + '...'}`)
        console.log(`    Owner: ${change.owner}`)
        console.log(`    Change: ${change.change_amount}`)
        console.log(`    Pre: ${change.pre_balance} → Post: ${change.post_balance}`)
      })
    } else {
      console.log('No token balance changes')
    }
    console.log()

    // Now test with V2 parser
    console.log('=== Testing V2 Parser ===')
    
    // Clear require cache to ensure we get the latest compiled code
    delete require.cache[require.resolve('./dist/utils/shyftParserV2')]
    delete require.cache[require.resolve('./dist/utils/shyftParserV2.assetDeltaCollector')]
    
    // Import V2 parser from dist
    const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')
    
    // Convert to V2 format
    const v2Input = {
      signature: TEST_SIGNATURE,
      timestamp: parsedTx.result.timestamp ? new Date(parsedTx.result.timestamp).getTime() : Date.now(),
      status: parsedTx.result.status || 'Success',
      fee: parsedTx.result.fee || 0,
      fee_payer: parsedTx.result.fee_payer || '',
      signers: parsedTx.result.signers || [],
      protocol: parsedTx.result.protocol,
      token_balance_changes: parsedTx.result.token_balance_changes || [],
      actions: parsedTx.result.actions || []
    }

    console.log('🔍 Calling V2 parser...\n')
    const parseResult = parseShyftTransactionV2(v2Input)

    if (!parseResult.success) {
      console.log('❌ V2 Parser Result: ERASE')
      console.log(`Reason: ${parseResult.erase?.reason || 'unknown'}`)
      console.log(`Debug Info:`, JSON.stringify(parseResult.erase?.debugInfo, null, 2))
      return
    }

    console.log('✅ V2 Parser Result: SUCCESS\n')

    const swapData = parseResult.data

    // Check if it's a split swap
    if ('sellRecord' in swapData) {
      console.log('🔄 Split Swap Pair Detected\n')
      
      console.log('--- SELL Record ---')
      displaySwapData(swapData.sellRecord)
      
      console.log('\n--- BUY Record ---')
      displaySwapData(swapData.buyRecord)
    } else {
      console.log('--- Single Swap ---')
      displaySwapData(swapData)
    }

    // Now test controller extraction logic
    console.log('\n' + '='.repeat(60))
    console.log('=== Testing Controller Extraction Logic ===\n')

    const parsedSwap = 'sellRecord' in swapData ? swapData.sellRecord : swapData

    // Extract token data (same logic as whale controller)
    const tokenIn = {
      token_address: parsedSwap.direction === 'BUY' ? parsedSwap.quoteAsset.mint : parsedSwap.baseAsset.mint,
      amount: parsedSwap.direction === 'BUY' 
        ? (parsedSwap.amounts.swapInputAmount || parsedSwap.amounts.totalWalletCost || 0)
        : (parsedSwap.amounts.baseAmount || 0),
      symbol: parsedSwap.direction === 'BUY' ? (parsedSwap.quoteAsset.symbol || 'Unknown') : (parsedSwap.baseAsset.symbol || 'Unknown'),
      name: parsedSwap.direction === 'BUY' ? (parsedSwap.quoteAsset.symbol || 'Unknown') : (parsedSwap.baseAsset.symbol || 'Unknown'),
    }

    const tokenOut = {
      token_address: parsedSwap.direction === 'BUY' ? parsedSwap.baseAsset.mint : parsedSwap.quoteAsset.mint,
      amount: parsedSwap.direction === 'BUY' 
        ? (parsedSwap.amounts.baseAmount || 0)
        : (parsedSwap.amounts.swapOutputAmount || parsedSwap.amounts.netWalletReceived || 0),
      symbol: parsedSwap.direction === 'BUY' ? (parsedSwap.baseAsset.symbol || 'Unknown') : (parsedSwap.quoteAsset.symbol || 'Unknown'),
      name: parsedSwap.direction === 'BUY' ? (parsedSwap.baseAsset.symbol || 'Unknown') : (parsedSwap.quoteAsset.symbol || 'Unknown'),
    }

    const isBuy = parsedSwap.direction === 'BUY'
    const isSell = parsedSwap.direction === 'SELL'

    console.log(`Direction: ${parsedSwap.direction}`)
    console.log(`isBuy: ${isBuy} | isSell: ${isSell}`)
    console.log()
    console.log('Token IN (what was spent/sold):')
    console.log(`  Address: ${tokenIn.token_address}`)
    console.log(`  Symbol: ${tokenIn.symbol}`)
    console.log(`  Amount: ${tokenIn.amount}`)
    console.log()
    console.log('Token OUT (what was received):')
    console.log(`  Address: ${tokenOut.token_address}`)
    console.log(`  Symbol: ${tokenOut.symbol}`)
    console.log(`  Amount: ${tokenOut.amount}`)
    console.log()

    // Validation
    let passed = true
    if (tokenIn.amount === undefined || tokenIn.amount === null || isNaN(tokenIn.amount)) {
      console.log('❌ FAILED: tokenIn.amount is invalid')
      passed = false
    }
    if (tokenOut.amount === undefined || tokenOut.amount === null || isNaN(tokenOut.amount)) {
      console.log('❌ FAILED: tokenOut.amount is invalid')
      passed = false
    }
    if (tokenIn.amount < 0) {
      console.log('❌ FAILED: tokenIn.amount is negative')
      passed = false
    }
    if (tokenOut.amount < 0) {
      console.log('❌ FAILED: tokenOut.amount is negative')
      passed = false
    }

    if (passed) {
      console.log('✅ All validations PASSED')
      console.log('✅ Controller extraction logic working correctly')
    } else {
      console.log('❌ Some validations FAILED')
    }

    console.log('\n' + '='.repeat(60))
    console.log('FINAL RESULT: ' + (passed ? '✅ SUCCESS' : '❌ FAILED'))
    console.log('='.repeat(60))

    process.exit(passed ? 0 : 1)

  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.response) {
      console.error('Response:', error.response.data)
    }
    process.exit(1)
  }
}

function displaySwapData(swap) {
  console.log(`Signature: ${swap.signature}`)
  console.log(`Swapper: ${swap.swapper}`)
  console.log(`Direction: ${swap.direction}`)
  console.log(`Protocol: ${swap.protocol}`)
  console.log(`Confidence: ${swap.confidence}`)
  console.log()
  console.log('Quote Asset (payment token):')
  console.log(`  Mint: ${swap.quoteAsset.mint}`)
  console.log(`  Symbol: ${swap.quoteAsset.symbol}`)
  console.log(`  Decimals: ${swap.quoteAsset.decimals}`)
  console.log()
  console.log('Base Asset (token being traded):')
  console.log(`  Mint: ${swap.baseAsset.mint}`)
  console.log(`  Symbol: ${swap.baseAsset.symbol}`)
  console.log(`  Decimals: ${swap.baseAsset.decimals}`)
  console.log()
  console.log('Amounts:')
  console.log(`  Base Amount: ${swap.amounts.baseAmount}`)
  if (swap.amounts.swapInputAmount !== undefined) {
    console.log(`  Swap Input Amount: ${swap.amounts.swapInputAmount}`)
  }
  if (swap.amounts.totalWalletCost !== undefined) {
    console.log(`  Total Wallet Cost: ${swap.amounts.totalWalletCost}`)
  }
  if (swap.amounts.swapOutputAmount !== undefined) {
    console.log(`  Swap Output Amount: ${swap.amounts.swapOutputAmount}`)
  }
  if (swap.amounts.netWalletReceived !== undefined) {
    console.log(`  Net Wallet Received: ${swap.amounts.netWalletReceived}`)
  }
  console.log()
  console.log('Metadata:')
  console.log(`  Swapper Method: ${swap.swapperIdentificationMethod}`)
  console.log(`  Rent Refunds Filtered: ${swap.rentRefundsFiltered}`)
  console.log(`  Intermediate Assets Collapsed: ${swap.intermediateAssetsCollapsed.length}`)
}

testRealTransaction()
