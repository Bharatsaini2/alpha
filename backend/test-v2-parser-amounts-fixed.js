/**
 * Test V2 Parser Amount Calculation After Fixes
 * 
 * This test verifies that the V2 parser now correctly calculates normalized amounts
 * after the TypeScript rebuild that applied the decimal normalization fixes.
 */

const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')

// Test transaction with known raw amounts
const testTransaction = {
  signature: 'test123',
  timestamp: Date.now(),
  status: 'Success',
  fee: 5000,
  fee_payer: 'FeePayer123',
  signers: ['Signer123'],
  protocol: {
    name: 'Jupiter',
    address: 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB'
  },
  token_balance_changes: [
    {
      address: 'FeePayer123',
      decimals: 9,
      change_amount: -1021000, // Raw amount: -0.001021 SOL
      post_balance: 0,
      pre_balance: 1021000,
      mint: 'So11111111111111111111111111111111111111112', // SOL
      owner: 'FeePayer123'
    },
    {
      address: 'FeePayer123', 
      decimals: 6,
      change_amount: 20000000, // Raw amount: 20.0 tokens (6 decimals)
      post_balance: 20000000,
      pre_balance: 0,
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      owner: 'FeePayer123'
    }
  ],
  actions: []
}

console.log('🧪 Testing V2 Parser Amount Calculation (After Fixes)')
console.log('=' .repeat(60))

const result = parseShyftTransactionV2(testTransaction)

if (result.success && result.data) {
  const swapData = result.data
  
  console.log('✅ V2 Parser Result:')
  console.log(`   Direction: ${swapData.direction}`)
  console.log(`   Quote Asset: ${swapData.quoteAsset.symbol} (${swapData.quoteAsset.decimals} decimals)`)
  console.log(`   Base Asset: ${swapData.baseAsset.symbol} (${swapData.baseAsset.decimals} decimals)`)
  console.log('')
  
  console.log('💰 Amount Calculations:')
  console.log(`   Swap Input Amount: ${swapData.amounts.swapInputAmount}`)
  console.log(`   Swap Output Amount: ${swapData.amounts.swapOutputAmount}`)
  console.log(`   Base Amount: ${swapData.amounts.baseAmount}`)
  console.log(`   Net Wallet Received: ${swapData.amounts.netWalletReceived}`)
  console.log(`   Total Wallet Cost: ${swapData.amounts.totalWalletCost}`)
  console.log('')
  
  // Verify amounts are normalized (not raw)
  const inputAmount = swapData.amounts.swapInputAmount || swapData.amounts.totalWalletCost || 0
  const outputAmount = swapData.amounts.swapOutputAmount || swapData.amounts.netWalletReceived || 0
  
  console.log('🔍 Amount Verification:')
  console.log(`   Input Amount: ${inputAmount} (should be ~0.001021, not 1021000)`)
  console.log(`   Output Amount: ${outputAmount} (should be ~20.0, not 20000000)`)
  
  // Check if amounts are properly normalized
  const inputNormalized = inputAmount < 10 // Should be small decimal, not large raw number
  const outputNormalized = outputAmount < 100 // Should be reasonable token amount
  
  if (inputNormalized && outputNormalized) {
    console.log('✅ SUCCESS: Amounts appear to be properly normalized!')
  } else {
    console.log('❌ ISSUE: Amounts still appear to be raw (not normalized)')
    console.log(`   Input normalized: ${inputNormalized}`)
    console.log(`   Output normalized: ${outputNormalized}`)
  }
  
} else {
  console.log('❌ V2 Parser Failed:')
  console.log(`   Success: ${result.success}`)
  console.log(`   Reason: ${result.erase?.reason || 'Unknown'}`)
  console.log(`   Debug: ${JSON.stringify(result.erase?.debugInfo, null, 2)}`)
}

console.log('')
console.log('Processing Time:', result.processingTimeMs + 'ms')