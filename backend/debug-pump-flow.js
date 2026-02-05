/**
 * Debug PUMP.fun Transaction Flow
 * 
 * Traces the exact flow through augmentation → rent filter → delta collector
 */

const axios = require('axios')
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'
const TEST_SIGNATURE = 'wce6trqyQt6ixDgiFp8dJupWQFYuPbpdnaMZzPqLKG7UrbbDgMi9WqmimgCjUYutQZkrPYmXfqUDppz6144eZ1h'

async function debugPumpFlow() {
  try {
    // Fetch transaction
    console.log('📡 Fetching transaction...\n')
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${TEST_SIGNATURE}`,
      {
        headers: { 'x-api-key': SHYFT_API_KEY }
      }
    )

    const parsedTx = response.data.result

    console.log('=== ACTIONS ===')
    parsedTx.actions.forEach((action, idx) => {
      console.log(`\n[${idx}] ${action.type}`)
      if (action.type === 'SWAP' && action.info.tokens_swapped) {
        console.log('  IN:', action.info.tokens_swapped.in)
        console.log('  OUT:', action.info.tokens_swapped.out)
      }
      if (action.type === 'SOL_TRANSFER') {
        console.log('  Sender:', action.info.sender)
        console.log('  Receiver:', action.info.receiver)
        console.log('  Amount:', action.info.amount)
      }
    })

    console.log('\n=== TOKEN BALANCE CHANGES (Original) ===')
    parsedTx.token_balance_changes.forEach((change, idx) => {
      console.log(`\n[${idx}] ${change.symbol || change.mint.substring(0, 8)}`)
      console.log('  Owner:', change.owner)
      console.log('  Change:', change.change_amount)
      console.log('  Mint:', change.mint)
    })

    // Now manually trace through the parser logic
    const swapper = parsedTx.fee_payer
    console.log(`\n=== SWAPPER: ${swapper} ===`)

    // Check for transfer actions
    const hasTransferActions = parsedTx.actions.some(a => 
      (a.type === 'SOL_TRANSFER' || a.type === 'TOKEN_TRANSFER') &&
      a.info &&
      (a.info.sender === swapper || a.info.receiver === swapper)
    )

    console.log(`\nHas Transfer Actions: ${hasTransferActions}`)

    if (hasTransferActions) {
      console.log('\n✅ SELECTIVE SWAP PROCESSING SHOULD TRIGGER')
      console.log('Expected behavior:')
      console.log('  - Skip SOL from SWAP action (handled by transfers)')
      console.log('  - Add TOKEN from SWAP action (not in balance changes)')
      
      // Find SWAP action
      const swapAction = parsedTx.actions.find(a => a.type === 'SWAP')
      if (swapAction && swapAction.info.tokens_swapped) {
        const inIsSol = swapAction.info.tokens_swapped.in.token_address === 'So11111111111111111111111111111111111111112'
        const outIsSol = swapAction.info.tokens_swapped.out.token_address === 'So11111111111111111111111111111111111111112'
        
        console.log(`\n  IN is SOL: ${inIsSol}`)
        console.log(`  OUT is SOL: ${outIsSol}`)
        
        if (inIsSol) {
          console.log(`  ❌ SHOULD SKIP: IN (SOL) - ${swapAction.info.tokens_swapped.in.amount_raw}`)
        } else {
          console.log(`  ✅ SHOULD ADD: IN (Token) - ${swapAction.info.tokens_swapped.in.amount_raw}`)
        }
        
        if (outIsSol) {
          console.log(`  ❌ SHOULD SKIP: OUT (SOL) - ${swapAction.info.tokens_swapped.out.amount_raw}`)
        } else {
          console.log(`  ✅ SHOULD ADD: OUT (Token) - ${swapAction.info.tokens_swapped.out.amount_raw}`)
        }
      }
    }

    // Check what AssetDeltaCollector will see
    console.log('\n=== ASSET DELTA COLLECTOR INPUT ===')
    const swapperChanges = parsedTx.token_balance_changes.filter(c => c.owner === swapper)
    console.log(`Swapper balance changes: ${swapperChanges.length}`)
    swapperChanges.forEach(c => {
      console.log(`  - ${c.symbol || c.mint.substring(0, 8)}: ${c.change_amount}`)
    })

    console.log(`\nAsset count: ${swapperChanges.length}`)
    if (swapperChanges.length === 1) {
      console.log('⚠️  FALLBACK WILL TRIGGER (only 1 asset)')
      console.log('    This will add BOTH tokens from SWAP action')
      console.log('    → DOUBLE COUNTING!')
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

debugPumpFlow()
