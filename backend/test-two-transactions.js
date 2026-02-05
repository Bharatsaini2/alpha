/**
 * Test Two Specific Transactions
 * 
 * Transaction 1: Multi-hop swap
 * Transaction 2: Should have proper balance
 */

const axios = require('axios')
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'

const TRANSACTIONS = [
  {
    signature: '2aqBc9ok838jX6TnY7eanUp3xtbfhykq7pnUUSrK6yWgb47xsTuEwT35AtD1M2MhBgoLKW3DE5NRR6MR1BGhLdRm',
    description: 'Multi-hop swap'
  },
  {
    signature: '4Rqs6Ni9sNUPNSZoMkAZ8WhVYJX2npNRLqirD43nyjfkYHHZosThPDEhjk2c9Amwm8ptENzXrvNGXmRCZaYo1BrD',
    description: 'Should have proper balance'
  }
]

// Clear require cache
delete require.cache[require.resolve('./dist/utils/shyftParserV2')]
delete require.cache[require.resolve('./dist/utils/shyftParserV2.assetDeltaCollector')]

const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')

async function testTransaction(txInfo) {
  console.log('\n' + '='.repeat(80))
  console.log(`Testing: ${txInfo.description}`)
  console.log(`Signature: ${txInfo.signature}`)
  console.log('='.repeat(80))

  try {
    // Fetch transaction from SHYFT
    console.log('\n📡 Fetching transaction from SHYFT API...')
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${txInfo.signature}`,
      {
        headers: {
          'x-api-key': SHYFT_API_KEY
        }
      }
    )

    if (!response.data.success) {
      console.error('❌ Failed to fetch transaction:', response.data)
      return
    }

    const parsedTx = response.data.result
    console.log('✅ Transaction fetched successfully')

    // Display transaction info
    console.log('\n=== Transaction Info ===')
    console.log(`Type: ${parsedTx.type}`)
    console.log(`Status: ${parsedTx.status}`)
    console.log(`Fee: ${parsedTx.fee} SOL`)
    console.log(`Protocol: ${parsedTx.protocol?.name || 'Unknown'}`)
    console.log(`Fee Payer: ${parsedTx.fee_payer}`)

    // Display token balance changes
    console.log('\n=== Token Balance Changes ===')
    if (parsedTx.token_balance_changes && parsedTx.token_balance_changes.length > 0) {
      parsedTx.token_balance_changes.forEach((change, idx) => {
        console.log(`\n[${idx + 1}] ${change.symbol || change.mint.substring(0, 8) + '...'}`)
        console.log(`    Owner: ${change.owner}`)
        console.log(`    Change: ${change.change_amount}`)
        console.log(`    Mint: ${change.mint}`)
      })
    } else {
      console.log('No token balance changes')
    }

    // Display actions
    console.log('\n=== Actions ===')
    if (parsedTx.actions && parsedTx.actions.length > 0) {
      parsedTx.actions.forEach((action, idx) => {
        console.log(`[${idx + 1}] ${action.type}`)
      })
    }

    // Convert to V2 format
    const v2Input = {
      signature: txInfo.signature,
      timestamp: parsedTx.timestamp ? new Date(parsedTx.timestamp).getTime() : Date.now(),
      status: parsedTx.status || 'Success',
      fee: parsedTx.fee || 0,
      fee_payer: parsedTx.fee_payer || '',
      signers: parsedTx.signers || [],
      protocol: parsedTx.protocol,
      token_balance_changes: parsedTx.token_balance_changes || [],
      actions: parsedTx.actions || []
    }

    console.log('\n=== Testing V2 Parser ===')
    const parseResult = parseShyftTransactionV2(v2Input)

    if (!parseResult.success) {
      console.log('❌ V2 Parser Result: ERASE')
      console.log(`Reason: ${parseResult.erase?.reason || 'unknown'}`)
      console.log(`Debug Info:`, JSON.stringify(parseResult.erase?.debugInfo, null, 2))
      return
    }

    console.log('✅ V2 Parser Result: SUCCESS')

    const swapData = parseResult.data

    // Check if it's a split swap
    if ('sellRecord' in swapData) {
      console.log('\n🔄 Split Swap Pair Detected')
      
      console.log('\n--- SELL Record ---')
      displaySwapData(swapData.sellRecord)
      
      console.log('\n--- BUY Record ---')
      displaySwapData(swapData.buyRecord)
    } else {
      console.log('\n--- Single Swap ---')
      displaySwapData(swapData)
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.response) {
      console.error('Response:', error.response.data)
    }
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
  if (swap.intermediateAssetsCollapsed.length > 0) {
    console.log(`  Intermediate Assets: ${swap.intermediateAssetsCollapsed.join(', ')}`)
  }
}

async function runTests() {
  for (const tx of TRANSACTIONS) {
    await testTransaction(tx)
    console.log('\n')
  }
}

runTests()
