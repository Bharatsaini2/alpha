/**
 * Test SHYFT Response Structure for Different Swap Types
 * 
 * This script examines how SHYFT API returns amounts for:
 * 1. Token → Stable (SELL)
 * 2. Stable → Token (BUY)
 * 3. Token → Token (token-to-token swap)
 * 
 * Goal: Understand the structure of token_balance_changes, SWAP actions,
 * and SOL_TRANSFER/TOKEN_TRANSFER actions for each swap type.
 */

const axios = require('axios')
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' })

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'

// Test transactions for different swap types
const TEST_TRANSACTIONS = {
  // PUMP.fun BUY (Stable → Token) - the problematic one
  PUMP_BUY: 'wce6trqyQt6ixDgiFp8dJupWQFYuPbpdnaMZzPqLKG7UrbbDgMi9WqmimgCjUYutQZkrPYmXfqUDppz6144eZ1h',
  
  // Add more test cases here:
  // TOKEN_SELL: 'signature_for_token_to_stable',
  // TOKEN_TO_TOKEN: 'signature_for_token_to_token',
}

async function analyzeSwapType(signature, label) {
  try {
    console.log('\n' + '='.repeat(80))
    console.log(`ANALYZING: ${label}`)
    console.log('='.repeat(80))
    console.log(`Signature: ${signature}\n`)
    
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${signature}`,
      {
        headers: { 'x-api-key': SHYFT_API_KEY },
        timeout: 10000
      }
    )

    const tx = response.data.result

    // Basic transaction info
    console.log('📋 TRANSACTION METADATA')
    console.log(`   Type: ${tx.type}`)
    console.log(`   Protocol: ${tx.protocol?.name || 'Unknown'}`)
    console.log(`   Status: ${tx.status}`)
    console.log(`   Fee: ${tx.fee} SOL`)
    console.log(`   Fee Payer: ${tx.fee_payer}`)
    console.log()

    // Token balance changes
    console.log('💰 TOKEN BALANCE CHANGES')
    console.log(`   Total: ${tx.token_balance_changes.length} changes`)
    
    const swapper = tx.fee_payer
    const swapperChanges = tx.token_balance_changes.filter(c => c.owner === swapper)
    
    console.log(`   Swapper (${swapper.substring(0, 8)}...) changes:`)
    swapperChanges.forEach((change) => {
      const symbol = change.symbol || change.mint.substring(0, 8) + '...'
      const direction = change.change_amount > 0 ? '📈 RECEIVED' : '📉 SENT'
      console.log(`      ${direction} ${Math.abs(change.change_amount)} ${symbol}`)
      console.log(`         Mint: ${change.mint}`)
      console.log(`         Decimals: ${change.decimals}`)
    })
    console.log()

    // SWAP actions
    console.log('🔄 SWAP ACTIONS')
    const swapActions = tx.actions.filter(a => a.type === 'SWAP')
    
    if (swapActions.length === 0) {
      console.log('   ⚠️  No SWAP actions found')
    } else {
      swapActions.forEach((action, idx) => {
        console.log(`   [${idx}] SWAP Action`)
        
        if (action.info && action.info.tokens_swapped) {
          const tokensIn = action.info.tokens_swapped.in
          const tokensOut = action.info.tokens_swapped.out
          
          if (tokensIn) {
            const symbol = tokensIn.symbol || tokensIn.token_address?.substring(0, 8) + '...'
            console.log(`      IN:  ${tokensIn.amount || 'N/A'} ${symbol}`)
            console.log(`           Mint: ${tokensIn.token_address}`)
            console.log(`           Raw: ${tokensIn.amount_raw || 'N/A'}`)
            console.log(`           Decimals: ${tokensIn.decimals || 'N/A'}`)
          }
          
          if (tokensOut) {
            const symbol = tokensOut.symbol || tokensOut.token_address?.substring(0, 8) + '...'
            console.log(`      OUT: ${tokensOut.amount || 'N/A'} ${symbol}`)
            console.log(`           Mint: ${tokensOut.token_address}`)
            console.log(`           Raw: ${tokensOut.amount_raw || 'N/A'}`)
            console.log(`           Decimals: ${tokensOut.decimals || 'N/A'}`)
          }
        }
      })
    }
    console.log()

    // SOL_TRANSFER actions
    console.log('💸 SOL_TRANSFER ACTIONS')
    const solTransfers = tx.actions.filter(a => a.type === 'SOL_TRANSFER')
    
    if (solTransfers.length === 0) {
      console.log('   ⚠️  No SOL_TRANSFER actions found')
    } else {
      console.log(`   Total: ${solTransfers.length} transfers`)
      
      let totalSent = 0
      let totalReceived = 0
      
      solTransfers.forEach((transfer, idx) => {
        const { sender, receiver, amount } = transfer.info
        const isSender = sender === swapper
        const isReceiver = receiver === swapper
        
        if (isSender) {
          totalSent += amount
          console.log(`   [${idx}] 📤 SENT ${amount} SOL`)
          console.log(`        To: ${receiver.substring(0, 8)}...`)
        } else if (isReceiver) {
          totalReceived += amount
          console.log(`   [${idx}] 📥 RECEIVED ${amount} SOL`)
          console.log(`        From: ${sender.substring(0, 8)}...`)
        } else {
          console.log(`   [${idx}] ↔️  ${amount} SOL (not swapper)`)
        }
      })
      
      console.log()
      console.log(`   Summary for swapper:`)
      console.log(`      Total Sent: ${totalSent} SOL`)
      console.log(`      Total Received: ${totalReceived} SOL`)
      console.log(`      Net Change: ${totalReceived - totalSent} SOL`)
    }
    console.log()

    // TOKEN_TRANSFER actions
    console.log('🎫 TOKEN_TRANSFER ACTIONS')
    const tokenTransfers = tx.actions.filter(a => a.type === 'TOKEN_TRANSFER')
    
    if (tokenTransfers.length === 0) {
      console.log('   ⚠️  No TOKEN_TRANSFER actions found')
    } else {
      console.log(`   Total: ${tokenTransfers.length} transfers`)
      
      tokenTransfers.forEach((transfer, idx) => {
        const { sender, receiver, token_address, amount } = transfer.info
        const isSender = sender === swapper
        const isReceiver = receiver === swapper
        
        if (isSender || isReceiver) {
          const direction = isSender ? '📤 SENT' : '📥 RECEIVED'
          const tokenShort = token_address?.substring(0, 8) + '...'
          console.log(`   [${idx}] ${direction} ${amount || 'N/A'} tokens`)
          console.log(`        Token: ${tokenShort}`)
          console.log(`        ${isSender ? 'To' : 'From'}: ${(isSender ? receiver : sender).substring(0, 8)}...`)
        }
      })
    }
    console.log()

    // Analysis summary
    console.log('📊 ANALYSIS SUMMARY')
    
    // Determine swap type
    const hasSOL = swapperChanges.some(c => 
      c.mint === 'So11111111111111111111111111111111111111112'
    )
    const hasStable = swapperChanges.some(c => 
      c.mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' || // USDC
      c.mint === 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'    // USDT
    )
    
    let swapType = 'UNKNOWN'
    if (hasSOL || hasStable) {
      const stableChange = swapperChanges.find(c => 
        c.mint === 'So11111111111111111111111111111111111111112' ||
        c.mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' ||
        c.mint === 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
      )
      
      if (stableChange) {
        swapType = stableChange.change_amount < 0 ? 'STABLE → TOKEN (BUY)' : 'TOKEN → STABLE (SELL)'
      }
    } else if (swapperChanges.length === 2) {
      swapType = 'TOKEN → TOKEN'
    }
    
    console.log(`   Swap Type: ${swapType}`)
    console.log(`   Has SOL in balance changes: ${hasSOL ? 'YES' : 'NO'}`)
    console.log(`   Has SOL_TRANSFER actions: ${solTransfers.length > 0 ? 'YES' : 'NO'}`)
    console.log(`   Has SWAP action: ${swapActions.length > 0 ? 'YES' : 'NO'}`)
    
    // Key insight
    console.log()
    console.log('🔑 KEY INSIGHT')
    if (!hasSOL && solTransfers.length > 0) {
      console.log('   ⚠️  SOL NOT in token_balance_changes but IS in SOL_TRANSFER actions')
      console.log('   ⚠️  Parser MUST use SOL_TRANSFER actions to calculate SOL amounts')
    } else if (hasSOL && solTransfers.length > 0) {
      console.log('   ✅ SOL in BOTH token_balance_changes AND SOL_TRANSFER actions')
      console.log('   ⚠️  Need to verify which source is more accurate')
    } else if (hasSOL) {
      console.log('   ✅ SOL in token_balance_changes, no SOL_TRANSFER actions')
      console.log('   ✅ Can use token_balance_changes directly')
    }

  } catch (error) {
    console.error(`\n❌ Error analyzing ${label}:`, error.message)
    if (error.response) {
      console.error('Response:', error.response.data)
    }
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║     SHYFT Swap Type Analysis - Amount Structure Study     ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
  
  for (const [label, signature] of Object.entries(TEST_TRANSACTIONS)) {
    await analyzeSwapType(signature, label)
    
    // Add delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  console.log('\n' + '='.repeat(80))
  console.log('ANALYSIS COMPLETE')
  console.log('='.repeat(80))
  console.log('\n💡 Next Steps:')
  console.log('   1. Add more test transaction signatures for different swap types')
  console.log('   2. Compare SWAP action amounts vs SOL_TRANSFER totals')
  console.log('   3. Determine which source is the "source of truth" for each swap type')
  console.log('   4. Update parser augmentation logic accordingly')
}

main()
