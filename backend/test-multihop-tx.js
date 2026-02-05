/**
 * Test Multi-hop Transaction
 */

const axios = require('axios')
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'
const TEST_SIGNATURE = '2aqBc9ok838jX6TnY7eanUp3xtbfhykq7pnUUSrK6yWgb47xsTuEwT35AtD1M2MhBgoLKW3DE5NRR6MR1BGhLdRm'

// Clear require cache
delete require.cache[require.resolve('./dist/utils/shyftParserV2')]
delete require.cache[require.resolve('./dist/utils/shyftParserV2.assetDeltaCollector')]

const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')

async function test() {
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║           Multi-hop Transaction Test                      ║')
  console.log('╚════════════════════════════════════════════════════════════╝\n')
  console.log(`Signature: ${TEST_SIGNATURE}\n`)

  try {
    console.log('📡 Fetching transaction from SHYFT API...')
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${TEST_SIGNATURE}`,
      {
        headers: { 'x-api-key': SHYFT_API_KEY }
      }
    )

    if (!response.data.success) {
      console.error('❌ Failed to fetch transaction')
      return
    }

    const parsedTx = response.data.result
    console.log('✅ Transaction fetched successfully\n')

    console.log('=== Transaction Info ===')
    console.log(`Type: ${parsedTx.type}`)
    console.log(`Status: ${parsedTx.status}`)
    console.log(`Protocol: ${parsedTx.protocol?.name || 'Unknown'}`)
    console.log(`Fee Payer: ${parsedTx.fee_payer}`)

    console.log('\n=== Token Balance Changes ===')
    if (parsedTx.token_balance_changes && parsedTx.token_balance_changes.length > 0) {
      const swapperChanges = parsedTx.token_balance_changes.filter(
        c => c.owner === parsedTx.fee_payer
      )
      console.log(`Total: ${parsedTx.token_balance_changes.length}`)
      console.log(`Swapper's changes: ${swapperChanges.length}`)
      
      swapperChanges.forEach((change, idx) => {
        console.log(`\n[${idx + 1}] ${change.symbol || change.mint.substring(0, 8) + '...'}`)
        console.log(`    Mint: ${change.mint}`)
        console.log(`    Change: ${change.change_amount}`)
      })
    }

    console.log('\n=== Actions ===')
    if (parsedTx.actions && parsedTx.actions.length > 0) {
      parsedTx.actions.forEach((action, idx) => {
        console.log(`[${idx + 1}] ${action.type}`)
      })
    }

    // Convert to V2 format
    const v2Input = {
      signature: TEST_SIGNATURE,
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
      console.log(`\nDebug Info:`)
      console.log(JSON.stringify(parseResult.erase?.debugInfo, null, 2))
      
      // Check if it's a multi-hop that was collapsed
      if (parseResult.erase?.debugInfo?.assetDeltas) {
        const assets = Object.keys(parseResult.erase.debugInfo.assetDeltas)
        console.log(`\nAssets detected: ${assets.length}`)
        assets.forEach(mint => {
          const asset = parseResult.erase.debugInfo.assetDeltas[mint]
          console.log(`  - ${asset.symbol}: ${asset.isIntermediate ? 'INTERMEDIATE' : 'FINAL'} (delta: ${asset.netDelta})`)
        })
      }
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

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

function displaySwapData(swap) {
  console.log(`Direction: ${swap.direction}`)
  console.log(`Protocol: ${swap.protocol}`)
  console.log(`Confidence: ${swap.confidence}`)
  console.log()
  console.log('Quote Asset (payment token):')
  console.log(`  Symbol: ${swap.quoteAsset.symbol}`)
  console.log(`  Mint: ${swap.quoteAsset.mint.substring(0, 8)}...`)
  console.log()
  console.log('Base Asset (token being traded):')
  console.log(`  Symbol: ${swap.baseAsset.symbol}`)
  console.log(`  Mint: ${swap.baseAsset.mint.substring(0, 8)}...`)
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
  console.log(`  Intermediate Assets Collapsed: ${swap.intermediateAssetsCollapsed.length}`)
  if (swap.intermediateAssetsCollapsed.length > 0) {
    console.log(`  Intermediates: ${swap.intermediateAssetsCollapsed.join(', ')}`)
  }
}

test()
