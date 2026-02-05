/**
 * Debug V2 Parser Issue
 * 
 * This script debugs why V2 parser is working in the comparison script
 * but failing in our tests.
 */

const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')

console.log('🔍 Debugging V2 Parser Issue')
console.log('=' .repeat(60))

// Let's use the exact same structure as the comparison script
// This is based on a real transaction that worked in the comparison
const workingTransaction = {
  signature: '2r4fT5VvaiCvBoMQx5cEdeehBf7SF8yG7LE1J7X2d6524m6ffHM9aEuv5SikwkxqD5GNTN97zu63tgikrPxWja8C',
  timestamp: Date.now(),
  status: 'Success',
  fee: 5000,
  fee_payer: '9aEBddTQKhKhJKJKhJKJKhJKhJKJKhJKhJKJKhJKhJKJ',
  signers: ['9aEBddTQKhKhJKJKhJKJKhJKhJKJKhJKhJKJKhJKhJKJ'],
  token_balance_changes: [
    // Only the swapper's balance changes (this is what SHYFT API typically returns)
    {
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      token_account: 'swapper_usdc_account',
      owner: '9aEBddTQKhKhJKJKhJKJKhJKhJKJKhJKhJKJKhJKhJKJ', // Swapper
      pre_balance: '1000000000', // 1000 USDC
      post_balance: '500000000',  // 500 USDC
      balance_change: '-500000000' // -500 USDC (spending)
    },
    {
      mint: '4TyZGqRLpump4TyZGqRLpump4TyZGqRLpump4TyZGqRL', // Test token
      token_account: 'swapper_token_account',
      owner: '9aEBddTQKhKhJKJKhJKJKhJKhJKJKhJKhJKJKhJKhJKJ', // Swapper
      pre_balance: '0',
      post_balance: '76361559020000000', // 76,361.559020 tokens (9 decimals)
      balance_change: '76361559020000000' // +76,361.559020 tokens (receiving)
    }
  ],
  actions: []
}

console.log('🔧 Testing with swapper-only balance changes:')
console.log(`   USDC Change: ${workingTransaction.token_balance_changes[0].balance_change} (${workingTransaction.token_balance_changes[0].owner})`)
console.log(`   Token Change: ${workingTransaction.token_balance_changes[1].balance_change} (${workingTransaction.token_balance_changes[1].owner})`)
console.log('')

const result = parseShyftTransactionV2(workingTransaction)

console.log('📊 V2 Parser Result:')
console.log(`   Success: ${result.success}`)

if (result.success && result.data) {
  const swap = result.data
  
  console.log(`   Direction: ${swap.direction}`)
  console.log(`   Swapper: ${swap.swapper}`)
  console.log(`   Confidence: ${swap.confidence}`)
  
  console.log('\n💰 Amount Details:')
  console.log(`   Base Asset: ${swap.baseAsset.symbol} (${swap.baseAsset.mint})`)
  console.log(`   Quote Asset: ${swap.quoteAsset.symbol} (${swap.quoteAsset.mint})`)
  
  console.log('\n📈 Calculated Amounts:')
  if (swap.direction === 'BUY') {
    console.log(`   Swap Input Amount: ${swap.amounts.swapInputAmount} ${swap.quoteAsset.symbol}`)
    console.log(`   Total Wallet Cost: ${swap.amounts.totalWalletCost} ${swap.quoteAsset.symbol}`)
    console.log(`   Base Amount Received: ${swap.amounts.baseAmount} ${swap.baseAsset.symbol}`)
  } else {
    console.log(`   Base Amount Sold: ${swap.amounts.baseAmount} ${swap.baseAsset.symbol}`)
    console.log(`   Swap Output Amount: ${swap.amounts.swapOutputAmount} ${swap.quoteAsset.symbol}`)
    console.log(`   Net Wallet Received: ${swap.amounts.netWalletReceived} ${swap.quoteAsset.symbol}`)
  }
  
  console.log('\n🎉 SUCCESS! V2 Parser is working correctly!')
  
} else {
  console.log(`   Error: ${result.erase?.reason || 'Unknown error'}`)
  console.log('\n❌ V2 Parser failed to parse the transaction')
  
  // Debug the specific error
  if (result.erase?.reason) {
    console.log('\n🔍 Error Analysis:')
    switch (result.erase.reason) {
      case 'no_opposite_deltas':
        console.log('   - The parser detected that balance changes are not in opposite directions')
        console.log('   - This usually means it\'s a transfer, not a swap')
        break
      case 'invalid_delta_signs':
        console.log('   - The parser detected that the two assets don\'t have opposite signs')
        console.log('   - One should be positive (receiving) and one negative (spending)')
        break
      case 'invalid_asset_count':
        console.log('   - The parser detected more or less than 2 assets')
        console.log('   - Swaps should have exactly 2 assets (input and output)')
        break
      case 'swapper_identification_failed':
        console.log('   - The parser could not identify who the swapper is')
        console.log('   - This is usually due to complex transaction structures')
        break
      default:
        console.log(`   - Unknown error: ${result.erase.reason}`)
    }
  }
}

console.log('\n' + '=' .repeat(60))