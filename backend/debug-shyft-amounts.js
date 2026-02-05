/**
 * Debug SHYFT Amount Fields
 * 
 * Shows all amount-related fields from SHYFT API response
 * to understand how amounts are structured for different swap types
 */

const axios = require('axios')
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'
const TEST_SIGNATURE = 'wce6trqyQt6ixDgiFp8dJupWQFYuPbpdnaMZzPqLKG7UrbbDgMi9WqmimgCjUYutQZkrPYmXfqUDppz6144eZ1h'

async function debugShyftAmounts() {
  try {
    console.log('╔════════════════════════════════════════════════════════════╗')
    console.log('║           SHYFT Amount Fields Debug                        ║')
    console.log('╚════════════════════════════════════════════════════════════╝\n')
    
    console.log(`Fetching: ${TEST_SIGNATURE}\n`)
    
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${TEST_SIGNATURE}`,
      {
        headers: { 'x-api-key': SHYFT_API_KEY }
      }
    )

    const tx = response.data.result

    console.log('=== TRANSACTION METADATA ===')
    console.log(`Type: ${tx.type}`)
    console.log(`Protocol: ${tx.protocol?.name || 'Unknown'}`)
    console.log(`Status: ${tx.status}`)
    console.log(`Fee: ${tx.fee} SOL`)
    console.log(`Fee Payer: ${tx.fee_payer}`)
    console.log(`Signers: ${tx.signers.join(', ')}`)
    console.log()

    console.log('=== TOKEN BALANCE CHANGES ===')
    console.log(`Total: ${tx.token_balance_changes.length} changes\n`)
    
    tx.token_balance_changes.forEach((change, idx) => {
      console.log(`[${idx + 1}] ${change.symbol || change.mint.substring(0, 8) + '...'}`)
      console.log(`    Mint: ${change.mint}`)
      console.log(`    Owner: ${change.owner}`)
      console.log(`    Decimals: ${change.decimals}`)
      console.log(`    change_amount: ${change.change_amount}`)
      console.log(`    pre_balance: ${change.pre_balance}`)
      console.log(`    post_balance: ${change.post_balance}`)
      console.log()
    })

    console.log('=== ACTIONS ===')
    console.log(`Total: ${tx.actions.length} actions\n`)
    
    tx.actions.forEach((action, idx) => {
      console.log(`[${idx}] ${action.type}`)
      
      if (action.type === 'SWAP' && action.info) {
        console.log('  SWAP INFO:')
        console.log(`    swapper: ${action.info.swapper || 'N/A'}`)
        
        if (action.info.tokens_swapped) {
          console.log('    tokens_swapped:')
          
          if (action.info.tokens_swapped.in) {
            console.log('      IN:')
            console.log(`        token_address: ${action.info.tokens_swapped.in.token_address}`)
            console.log(`        symbol: ${action.info.tokens_swapped.in.symbol || 'N/A'}`)
            console.log(`        name: ${action.info.tokens_swapped.in.name || 'N/A'}`)
            console.log(`        amount: ${action.info.tokens_swapped.in.amount || 'N/A'}`)
            console.log(`        amount_raw: ${action.info.tokens_swapped.in.amount_raw || 'N/A'}`)
            console.log(`        decimals: ${action.info.tokens_swapped.in.decimals || 'N/A'}`)
          }
          
          if (action.info.tokens_swapped.out) {
            console.log('      OUT:')
            console.log(`        token_address: ${action.info.tokens_swapped.out.token_address}`)
            console.log(`        symbol: ${action.info.tokens_swapped.out.symbol || 'N/A'}`)
            console.log(`        name: ${action.info.tokens_swapped.out.name || 'N/A'}`)
            console.log(`        amount: ${action.info.tokens_swapped.out.amount || 'N/A'}`)
            console.log(`        amount_raw: ${action.info.tokens_swapped.out.amount_raw || 'N/A'}`)
            console.log(`        decimals: ${action.info.tokens_swapped.out.decimals || 'N/A'}`)
          }
        }
      }
      
      if (action.type === 'SOL_TRANSFER' && action.info) {
        console.log('  SOL_TRANSFER INFO:')
        console.log(`    sender: ${action.info.sender}`)
        console.log(`    receiver: ${action.info.receiver}`)
        console.log(`    amount: ${action.info.amount || 'N/A'}`)
        console.log(`    amount_raw: ${action.info.amount_raw || 'N/A'}`)
      }
      
      if (action.type === 'TOKEN_TRANSFER' && action.info) {
        console.log('  TOKEN_TRANSFER INFO:')
        console.log(`    sender: ${action.info.sender || 'N/A'}`)
        console.log(`    receiver: ${action.info.receiver || 'N/A'}`)
        console.log(`    token_address: ${action.info.token_address || 'N/A'}`)
        console.log(`    amount: ${action.info.amount || 'N/A'}`)
        console.log(`    amount_raw: ${action.info.amount_raw || 'N/A'}`)
      }
      
      console.log()
    })

    console.log('=== AMOUNT CALCULATIONS ===')
    
    // Find swapper
    const swapper = tx.fee_payer
    console.log(`Swapper: ${swapper}\n`)
    
    // Calculate from token_balance_changes
    console.log('FROM TOKEN_BALANCE_CHANGES:')
    const swapperChanges = tx.token_balance_changes.filter(c => c.owner === swapper)
    swapperChanges.forEach(change => {
      console.log(`  ${change.symbol || change.mint.substring(0, 8)}: ${change.change_amount}`)
    })
    console.log()
    
    // Calculate from SWAP action
    console.log('FROM SWAP ACTION:')
    const swapAction = tx.actions.find(a => a.type === 'SWAP')
    if (swapAction && swapAction.info && swapAction.info.tokens_swapped) {
      const tokensIn = swapAction.info.tokens_swapped.in
      const tokensOut = swapAction.info.tokens_swapped.out
      
      if (tokensIn) {
        console.log(`  IN: ${tokensIn.symbol || tokensIn.token_address.substring(0, 8)}`)
        console.log(`      amount: ${tokensIn.amount || 'N/A'}`)
        console.log(`      amount_raw: ${tokensIn.amount_raw || 'N/A'}`)
      }
      
      if (tokensOut) {
        console.log(`  OUT: ${tokensOut.symbol || tokensOut.token_address.substring(0, 8)}`)
        console.log(`      amount: ${tokensOut.amount || 'N/A'}`)
        console.log(`      amount_raw: ${tokensOut.amount_raw || 'N/A'}`)
      }
    }
    console.log()
    
    // Calculate from SOL_TRANSFER actions
    console.log('FROM SOL_TRANSFER ACTIONS:')
    const solTransfers = tx.actions.filter(a => a.type === 'SOL_TRANSFER')
    let totalSolSent = 0
    let totalSolReceived = 0
    
    solTransfers.forEach((transfer, idx) => {
      if (transfer.info.sender === swapper) {
        const amount = transfer.info.amount || 0
        totalSolSent += amount
        console.log(`  [${idx}] SENT ${amount} SOL to ${transfer.info.receiver.substring(0, 8)}...`)
      }
      if (transfer.info.receiver === swapper) {
        const amount = transfer.info.amount || 0
        totalSolReceived += amount
        console.log(`  [${idx}] RECEIVED ${amount} SOL from ${transfer.info.sender.substring(0, 8)}...`)
      }
    })
    
    console.log(`\n  Total SOL Sent: ${totalSolSent}`)
    console.log(`  Total SOL Received: ${totalSolReceived}`)
    console.log(`  Net SOL Change: ${totalSolReceived - totalSolSent}`)
    console.log()
    
    console.log('=== COMPARISON ===')
    console.log(`SWAP action IN amount: ${swapAction?.info?.tokens_swapped?.in?.amount || 'N/A'}`)
    console.log(`SOL_TRANSFER total: ${totalSolSent}`)
    console.log(`Difference: ${totalSolSent - (swapAction?.info?.tokens_swapped?.in?.amount || 0)}`)
    console.log()
    
    console.log('=== SOLSCAN REFERENCE ===')
    console.log('According to Solscan, this transaction shows:')
    console.log('  Swap: 0.247461329 SOL for 1,710,587.013035 CM')
    console.log()
    console.log('Our calculations:')
    console.log(`  SWAP action: ${swapAction?.info?.tokens_swapped?.in?.amount || 'N/A'} SOL`)
    console.log(`  SOL transfers: ${totalSolSent} SOL`)
    console.log(`  Token received: ${swapAction?.info?.tokens_swapped?.out?.amount || 'N/A'} tokens`)

  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.response) {
      console.error('Response:', error.response.data)
    }
  }
}

debugShyftAmounts()
