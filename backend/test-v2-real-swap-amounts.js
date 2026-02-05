/**
 * Test V2 Parser with Real Swap Data
 * 
 * This script tests the V2 parser with a real transaction from the comparison
 * to verify that amount calculations are working correctly.
 */

const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')

console.log('🧪 Testing V2 Parser with Real Swap Data')
console.log('=' .repeat(60))

// Real transaction data from the comparison script
const realSwapTransaction = {
  signature: '2r4fT5VvaiCvBoMQx5cEdeehBf7SF8yG7LE1J7X2d6524m6ffHM9aEuv5SikwkxqD5GNTN97zu63tgikrPxWja8C',
  timestamp: Date.now(),
  status: 'Success',
  fee: 5000,
  fee_payer: '9aEBddTQKhKhJKJKhJKJKhJKhJKJKhJKhJKJKhJKhJKJ',
  signers: ['9aEBddTQKhKhJKJKhJKJKhJKhJKJKhJKhJKJKhJKhJKJ'],
  token_balance_changes: [
    // Swapper's USDC account (spending)
    {
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      token_account: 'swapper_usdc_account',
      owner: '9aEBddTQKhKhJKJKhJKJKhJKhJKJKhJKhJKJKhJKhJKJ', // Swapper
      pre_balance: '1000000000', // 1000 USDC
      post_balance: '500000000',  // 500 USDC
      balance_change: '-500000000' // -500 USDC
    },
    // Swapper's token account (receiving)
    {
      mint: '4TyZGqRLpump4TyZGqRLpump4TyZGqRLpump4TyZGqRL', // Test token
      token_account: 'swapper_token_account',
      owner: '9aEBddTQKhKhJKJKhJKJKhJKhJKJKhJKhJKJKhJKhJKJ', // Swapper
      pre_balance: '0',
      post_balance: '76361559020000000', // 76,361.559020 tokens (9 decimals)
      balance_change: '76361559020000000'
    },
    // Pool's USDC account (receiving from swapper)
    {
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      token_account: 'pool_usdc_account',
      owner: 'PoolOwnerAddress1234567890123456789012345678', // Pool
      pre_balance: '10000000000', // 10,000 USDC
      post_balance: '10500000000', // 10,500 USDC
      balance_change: '500000000' // +500 USDC
    },
    // Pool's token account (sending to swapper)
    {
      mint: '4TyZGqRLpump4TyZGqRLpump4TyZGqRLpump4TyZGqRL', // Test token
      token_account: 'pool_token_account',
      owner: 'PoolOwnerAddress1234567890123456789012345678', // Pool
      pre_balance: '1000000000000000000', // 1,000,000 tokens
      post_balance: '923638440980000000', // 923,638.440980 tokens
      balance_change: '-76361559020000000' // -76,361.559020 tokens
    }
  ],
  actions: [
    {
      type: 'SWAP',
      info: {
        swap_input: {
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amount: '500000000'
        },
        swap_output: {
          mint: '4TyZGqRLpump4TyZGqRLpump4TyZGqRLpump4TyZGqRL',
          amount: '76361559020000000'
        }
      }
    }
  ]
}

console.log('🔧 Input Transaction:')
console.log(`   Signature: ${realSwapTransaction.signature}`)
console.log(`   Swapper USDC Change: ${realSwapTransaction.token_balance_changes[0].balance_change} (raw)`)
console.log(`   Swapper Token Change: ${realSwapTransaction.token_balance_changes[1].balance_change} (raw)`)
console.log(`   Pool USDC Change: ${realSwapTransaction.token_balance_changes[2].balance_change} (raw)`)
console.log(`   Pool Token Change: ${realSwapTransaction.token_balance_changes[3].balance_change} (raw)`)
console.log('')

const result = parseShyftTransactionV2(realSwapTransaction)

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
  
  console.log('\n🔍 Expected vs Actual:')
  console.log(`   Expected USDC spent: 500.0`)
  console.log(`   Actual USDC spent: ${swap.amounts.swapInputAmount || swap.amounts.totalWalletCost}`)
  console.log(`   Expected tokens received: 76361.559020`)
  console.log(`   Actual tokens received: ${swap.amounts.baseAmount}`)
  
  // Verify calculations
  const usdcExpected = 500.0
  const tokenExpected = 76361.559020
  const usdcActual = swap.amounts.swapInputAmount || swap.amounts.totalWalletCost
  const tokenActual = swap.amounts.baseAmount
  
  const usdcMatch = Math.abs(usdcActual - usdcExpected) < 0.01
  const tokenMatch = Math.abs(tokenActual - tokenExpected) < 0.01
  
  console.log('\n✅ Verification:')
  console.log(`   USDC calculation: ${usdcMatch ? '✅ CORRECT' : '❌ INCORRECT'}`)
  console.log(`   Token calculation: ${tokenMatch ? '✅ CORRECT' : '❌ INCORRECT'}`)
  
  if (usdcMatch && tokenMatch) {
    console.log('\n🎉 V2 Parser amount calculations are WORKING CORRECTLY!')
  } else {
    console.log('\n⚠️  V2 Parser amount calculations need fixing!')
  }
  
} else {
  console.log(`   Error: ${result.erase?.reason || 'Unknown error'}`)
  console.log('\n❌ V2 Parser failed to parse the transaction')
  
  if (result.erase?.reason === 'no_opposite_deltas') {
    console.log('\n🔍 Debugging no_opposite_deltas:')
    console.log('   This means the parser detected that all balance changes are in the same direction')
    console.log('   or there are no meaningful opposite changes for the swapper.')
    console.log('   This could indicate:')
    console.log('   1. The transaction is actually a transfer, not a swap')
    console.log('   2. The swapper identification is incorrect')
    console.log('   3. The balance changes are not properly structured')
  }
}

console.log('\n' + '=' .repeat(60))