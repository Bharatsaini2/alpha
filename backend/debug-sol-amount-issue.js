/**
 * Debug SOL Amount Issue
 * 
 * Investigates why V2 parser shows 0.494 SOL but Solscan shows 0.247 SOL
 */

const axios = require('axios')
require('dotenv').config()

const SHYFT_API_KEY = process.env.SHYFT_API_KEY || '_Lulx-rD8Ibrmvp_'
const TEST_SIGNATURE = 'wce6trqyQt6ixDgiFp8dJupWQFYuPbpdnaMZzPqLKG7UrbbDgMi9WqmimgCjUYutQZkrPYmXfqUDppz6144eZ1h'

console.log('╔════════════════════════════════════════════════════════════╗')
console.log('║          Debug SOL Amount Issue - V2 Parser               ║')
console.log('╚════════════════════════════════════════════════════════════╝\n')

console.log(`Testing signature: ${TEST_SIGNATURE}`)
console.log(`Expected (Solscan): 0.247461329 SOL`)
console.log(`V2 Parser shows: 0.494442579 SOL\n`)

async function debugSolAmount() {
  try {
    // Fetch transaction from SHYFT
    console.log('📡 Fetching transaction from SHYFT API...\n')
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
    const swapper = parsedTx.result.signers[0]

    console.log('=== Swapper Info ===')
    console.log(`Swapper: ${swapper}\n`)

    // Analyze token balance changes
    console.log('=== Token Balance Changes (Raw from SHYFT) ===')
    const balanceChanges = parsedTx.result.token_balance_changes || []
    
    let swapperSOLChanges = []
    let swapperTokenChanges = []
    
    balanceChanges.forEach((change, idx) => {
      const isSwapper = change.owner === swapper
      const isSOL = change.mint === 'So11111111111111111111111111111111111111112'
      
      console.log(`\n[${idx + 1}] ${change.symbol || change.mint.substring(0, 8) + '...'}`)
      console.log(`    Mint: ${change.mint}`)
      console.log(`    Owner: ${change.owner}`)
      console.log(`    Is Swapper: ${isSwapper ? '✅ YES' : '❌ NO'}`)
      console.log(`    Is SOL: ${isSOL ? '✅ YES' : '❌ NO'}`)
      console.log(`    Change (raw): ${change.change_amount}`)
      console.log(`    Change (normalized): ${change.change_amount / Math.pow(10, change.decimals)}`)
      console.log(`    Pre: ${change.pre_balance} → Post: ${change.post_balance}`)
      
      if (isSwapper && isSOL) {
        swapperSOLChanges.push(change)
      }
      if (isSwapper && !isSOL) {
        swapperTokenChanges.push(change)
      }
    })

    console.log('\n' + '='.repeat(60))
    console.log('=== Swapper\'s Balance Changes ===\n')
    
    console.log(`SOL changes for swapper: ${swapperSOLChanges.length}`)
    swapperSOLChanges.forEach((change, idx) => {
      console.log(`  [${idx + 1}] ${change.change_amount / Math.pow(10, 9)} SOL`)
    })
    
    console.log(`\nToken changes for swapper: ${swapperTokenChanges.length}`)
    swapperTokenChanges.forEach((change, idx) => {
      console.log(`  [${idx + 1}] ${change.symbol}: ${change.change_amount / Math.pow(10, change.decimals)}`)
    })

    // Analyze actions
    console.log('\n' + '='.repeat(60))
    console.log('=== Actions (from SHYFT) ===\n')
    
    const actions = parsedTx.result.actions || []
    actions.forEach((action, idx) => {
      console.log(`\n[${idx + 1}] Type: ${action.type}`)
      if (action.info) {
        console.log(`    Info:`, JSON.stringify(action.info, null, 6))
      }
    })

    // Check for SOL transfers in actions
    console.log('\n' + '='.repeat(60))
    console.log('=== SOL Transfers in Actions ===\n')
    
    const solTransfers = actions.filter(a => 
      a.type === 'SOL_TRANSFER' && 
      (a.info?.sender === swapper || a.info?.receiver === swapper)
    )
    
    console.log(`Found ${solTransfers.length} SOL transfers involving swapper:`)
    solTransfers.forEach((transfer, idx) => {
      const amount = transfer.info?.amount || 0
      const sender = transfer.info?.sender
      const receiver = transfer.info?.receiver
      const direction = sender === swapper ? 'SENT' : 'RECEIVED'
      
      console.log(`\n  [${idx + 1}] ${direction}: ${amount} SOL`)
      console.log(`      From: ${sender}`)
      console.log(`      To: ${receiver}`)
    })

    // Check for SWAP actions
    console.log('\n' + '='.repeat(60))
    console.log('=== SWAP Actions ===\n')
    
    const swapActions = actions.filter(a => a.type === 'SWAP')
    console.log(`Found ${swapActions.length} SWAP actions:`)
    
    swapActions.forEach((swap, idx) => {
      console.log(`\n  [${idx + 1}] SWAP Action`)
      if (swap.info?.swapper) {
        console.log(`      Swapper: ${swap.info.swapper}`)
        console.log(`      Is our swapper: ${swap.info.swapper === swapper ? '✅ YES' : '❌ NO'}`)
      }
      if (swap.info?.tokens_swapped) {
        const tokensIn = swap.info.tokens_swapped.in
        const tokensOut = swap.info.tokens_swapped.out
        
        if (tokensIn) {
          console.log(`      IN:`)
          console.log(`        Token: ${tokensIn.token_address}`)
          console.log(`        Symbol: ${tokensIn.symbol || 'Unknown'}`)
          console.log(`        Amount (raw): ${tokensIn.amount_raw}`)
          if (tokensIn.amount_raw) {
            const amount = typeof tokensIn.amount_raw === 'string' 
              ? parseFloat(tokensIn.amount_raw) 
              : tokensIn.amount_raw
            console.log(`        Amount (normalized): ${amount / Math.pow(10, 9)} SOL`)
          }
        }
        
        if (tokensOut) {
          console.log(`      OUT:`)
          console.log(`        Token: ${tokensOut.token_address}`)
          console.log(`        Symbol: ${tokensOut.symbol || 'Unknown'}`)
          console.log(`        Amount (raw): ${tokensOut.amount_raw}`)
        }
      }
    })

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('=== ANALYSIS SUMMARY ===\n')
    
    console.log('1. Swapper\'s SOL balance changes in token_balance_changes:')
    if (swapperSOLChanges.length === 0) {
      console.log('   ❌ NONE - This is the problem!')
      console.log('   The swapper\'s SOL balance change is NOT in token_balance_changes')
    } else {
      const totalSOL = swapperSOLChanges.reduce((sum, c) => sum + c.change_amount, 0) / Math.pow(10, 9)
      console.log(`   ✅ Found ${swapperSOLChanges.length} change(s)`)
      console.log(`   Total: ${totalSOL} SOL`)
    }
    
    console.log('\n2. SOL transfers in actions:')
    if (solTransfers.length === 0) {
      console.log('   ❌ NONE')
    } else {
      const totalTransferred = solTransfers.reduce((sum, t) => {
        const amount = t.info?.amount || 0
        const direction = t.info?.sender === swapper ? -1 : 1
        return sum + (amount * direction)
      }, 0)
      console.log(`   ✅ Found ${solTransfers.length} transfer(s)`)
      console.log(`   Net: ${totalTransferred} SOL`)
    }
    
    console.log('\n3. SWAP action tokens_swapped:')
    if (swapActions.length === 0) {
      console.log('   ❌ NONE')
    } else {
      swapActions.forEach((swap, idx) => {
        if (swap.info?.tokens_swapped?.in) {
          const inAmount = swap.info.tokens_swapped.in.amount_raw
          if (inAmount) {
            const amount = typeof inAmount === 'string' ? parseFloat(inAmount) : inAmount
            console.log(`   ✅ SWAP ${idx + 1} IN: ${amount / Math.pow(10, 9)} SOL`)
          }
        }
      })
    }

    console.log('\n' + '='.repeat(60))
    console.log('CONCLUSION:')
    console.log('If V2 parser shows 0.494 SOL but Solscan shows 0.247 SOL,')
    console.log('the parser might be DOUBLE-COUNTING the SOL amount.')
    console.log('Check if augmentBalanceChangesWithActions is adding SOL')
    console.log('that already exists in token_balance_changes.')
    console.log('='.repeat(60))

  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.response) {
      console.error('Response:', error.response.data)
    }
    process.exit(1)
  }
}

debugSolAmount()
