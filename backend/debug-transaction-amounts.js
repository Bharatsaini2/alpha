/**
 * Debug Transaction Amount Calculation
 * 
 * Analyzes the specific transaction to understand the 2x discrepancy
 */

const axios = require('axios')
require('dotenv').config()

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'
const TEST_SIGNATURE = 'wce6trqyQt6ixDgiFp8dJupWQFYuPbpdnaMZzPqLKG7UrbbDgMi9WqmimgCjUYutQZkrPYmXfqUDppz6144eZ1h'

console.log('╔════════════════════════════════════════════════════════════╗')
console.log('║         Debug Transaction Amount Calculation              ║')
console.log('╚════════════════════════════════════════════════════════════╝\n')

async function debugTransaction() {
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

    // Display ALL token balance changes in detail
    console.log('=== ALL Token Balance Changes (Raw Data) ===')
    const changes = parsedTx.result.token_balance_changes || []
    
    changes.forEach((change, idx) => {
      console.log(`\n[${idx + 1}] ${change.symbol || change.mint}`)
      console.log(`    Mint: ${change.mint}`)
      console.log(`    Owner: ${change.owner}`)
      console.log(`    Change Amount: ${change.change_amount}`)
      console.log(`    Pre Balance: ${change.pre_balance}`)
      console.log(`    Post Balance: ${change.post_balance}`)
      console.log(`    Decimals: ${change.decimals || 'unknown'}`)
      
      // Calculate normalized change
      if (change.decimals) {
        const normalizedChange = parseFloat(change.change_amount) / Math.pow(10, change.decimals)
        console.log(`    Normalized Change: ${normalizedChange}`)
      }
    })

    // Group by owner
    console.log('\n\n=== Grouped by Owner ===')
    const byOwner = {}
    changes.forEach(change => {
      if (!byOwner[change.owner]) {
        byOwner[change.owner] = []
      }
      byOwner[change.owner].push(change)
    })

    Object.entries(byOwner).forEach(([owner, ownerChanges]) => {
      console.log(`\nOwner: ${owner}`)
      ownerChanges.forEach(change => {
        const normalizedChange = change.decimals 
          ? parseFloat(change.change_amount) / Math.pow(10, change.decimals)
          : parseFloat(change.change_amount)
        console.log(`  ${change.symbol || change.mint.substring(0, 8)}: ${normalizedChange}`)
      })
    })

    // Now run V2 parser and show its calculation
    console.log('\n\n=== V2 Parser Calculation ===')
    const { parseShyftTransactionV2 } = require('./src/utils/shyftParserV2')
    
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

    const parseResult = parseShyftTransactionV2(v2Input)

    if (!parseResult.success) {
      console.log('❌ V2 Parser failed')
      return
    }

    const swapData = parseResult.data
    const swap = 'sellRecord' in swapData ? swapData.sellRecord : swapData

    console.log(`\nDirection: ${swap.direction}`)
    console.log(`\nQuote Asset (${swap.quoteAsset.symbol}):`)
    console.log(`  Mint: ${swap.quoteAsset.mint}`)
    console.log(`  Decimals: ${swap.quoteAsset.decimals}`)
    
    console.log(`\nBase Asset (${swap.baseAsset.symbol}):`)
    console.log(`  Mint: ${swap.baseAsset.mint}`)
    console.log(`  Decimals: ${swap.baseAsset.decimals}`)
    
    console.log(`\nAmounts:`)
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

    // Show fee breakdown
    if (swap.amounts.feeBreakdown) {
      console.log(`\nFee Breakdown:`)
      console.log(`  Transaction Fee (SOL): ${swap.amounts.feeBreakdown.transactionFeeSOL}`)
      console.log(`  Transaction Fee (Quote): ${swap.amounts.feeBreakdown.transactionFeeQuote}`)
      console.log(`  Platform Fee: ${swap.amounts.feeBreakdown.platformFee}`)
      console.log(`  Priority Fee: ${swap.amounts.feeBreakdown.priorityFee}`)
      console.log(`  Total Fee (Quote): ${swap.amounts.feeBreakdown.totalFeeQuote}`)
    }

    // Compare with Solscan
    console.log('\n\n=== Comparison ===')
    console.log(`Solscan shows: 0.247461329 SOL for 1,710,587.013035 tokens`)
    console.log(`V2 Parser shows: ${swap.amounts.swapInputAmount} SOL for ${swap.amounts.baseAmount} tokens`)
    console.log(`Discrepancy: ${(swap.amounts.swapInputAmount / 0.247461329).toFixed(2)}x`)

    // Check if there are multiple SOL balance changes
    const solChanges = changes.filter(c => 
      c.mint === 'So11111111111111111111111111111111111111112' ||
      c.symbol === 'SOL' ||
      c.symbol === 'WSOL'
    )
    
    console.log(`\n\nSOL-related balance changes: ${solChanges.length}`)
    solChanges.forEach((change, idx) => {
      const normalizedChange = change.decimals 
        ? Math.abs(parseFloat(change.change_amount)) / Math.pow(10, change.decimals)
        : Math.abs(parseFloat(change.change_amount))
      console.log(`  [${idx + 1}] Owner: ${change.owner}, Change: ${normalizedChange} SOL`)
    })

  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.response) {
      console.error('Response:', error.response.data)
    }
    process.exit(1)
  }
}

debugTransaction()
