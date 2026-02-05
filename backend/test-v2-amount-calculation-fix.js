/**
 * Test V2 Parser Amount Calculation Fix
 * 
 * This script tests the V2 parser with a known transaction to verify
 * that amount calculations are working correctly.
 */

const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')

console.log('🧪 Testing V2 Parser Amount Calculation Fix')
console.log('=' .repeat(60))

// Test transaction with known amounts
const testTransaction = {
  signature: '2r4fT5VvaiCvBoMQx5cEdeehBf7SF8yG7LE1J7X2d6524m6ffHM9aEuv5SikwkxqD5GNTN97zu63tgikrPxWja8C',
  timestamp: Date.now(),
  status: 'Success',
  fee: 5000,
  fee_payer: '9aEBddTQKhKhJKJKhJKJKhJKhJKJKhJKhJKJKhJKhJKJ',
  signers: ['9aEBddTQKhKhJKJKhJKJKhJKhJKJKhJKhJKJKhJKhJKJ'],
  token_balance_changes: [
    {
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      token_account: 'test1',
      owner: '9aEBddTQKhKhJKJKhJKJKhJKhJKJKhJKhJKJKhJKhJKJ',
      pre_balance: '1000000000', // 1000 USDC (6 decimals)
      post_balance: '500000000',  // 500 USDC (6 decimals)
      balance_change: '-500000000' // -500 USDC
    },
    {
      mint: '4TyZGqRLpump4TyZGqRLpump4TyZGqRLpump4TyZGqRL', // Test token
      token_account: 'test2',
      owner: '9aEBddTQKhKhJKJKhJKJKhJKhJKJKhJKhJKJKhJKhJKJ',
      pre_balance: '0',
      post_balance: '76361559020000000', // 76,361.559020 tokens (9 decimals)
      balance_change: '76361559020000000'
    }
  ],
  actions: []
}

console.log('🔧 Input Transaction:')
console.log(`   Signature: ${testTransaction.signature}`)
console.log(`   USDC Change: ${testTransaction.token_balance_changes[0].balance_change} (raw)`)
console.log(`   Token Change: ${testTransaction.token_balance_changes[1].balance_change} (raw)`)
console.log('')

const result = parseShyftTransactionV2(testTransaction)

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
}

console.log('\n' + '=' .repeat(60))