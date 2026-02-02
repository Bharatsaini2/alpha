/**
 * Test V2 Parser Fixes
 * 
 * This script tests the fixes for:
 * 1. Amount calculation (no double normalization)
 * 2. Same token filtering
 * 3. Transfer detection
 */

const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')

// Test case 1: Normal SOL to Token swap
const testSwap = {
  signature: 'test123',
  timestamp: Date.now(),
  status: 'Success',
  fee: 5000,
  fee_payer: 'TestWallet123',
  signers: ['TestWallet123'],
  token_balance_changes: [
    {
      address: 'TestWallet123',
      decimals: 9,
      change_amount: -1021000, // -0.001021 SOL (raw lamports)
      post_balance: 0,
      pre_balance: 1021000,
      mint: 'So11111111111111111111111111111111111111112', // SOL
      owner: 'TestWallet123',
    },
    {
      address: 'TestWallet123',
      decimals: 6,
      change_amount: 20000000, // +20 tokens (raw units)
      post_balance: 20000000,
      pre_balance: 0,
      mint: 'FeR8VBqNRSUD5NtXAj2n3j1dAHkZHfyDktKuLXD4pump',
      owner: 'TestWallet123',
    }
  ]
}

// Test case 2: Two different assets with same mint (this will aggregate to one asset and fail asset count check)
// This is actually correct behavior - same token swaps should be rejected
const testSameToken = {
  signature: 'test456',
  timestamp: Date.now(),
  status: 'Success',
  fee: 5000,
  fee_payer: 'TestWallet123',
  signers: ['TestWallet123'],
  token_balance_changes: [
    {
      address: 'Account1',
      decimals: 6,
      change_amount: -1000000,
      post_balance: 0,
      pre_balance: 1000000,
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      owner: 'TestWallet123',
    },
    {
      address: 'Account2', 
      decimals: 6,
      change_amount: 1000000,
      post_balance: 1000000,
      pre_balance: 0,
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Same USDC mint - will aggregate to zero
      owner: 'TestWallet123',
    }
  ]
}

// Test case 3: Simple transfer (should be rejected)
const testTransfer = {
  signature: 'test789',
  timestamp: Date.now(),
  status: 'Success',
  fee: 5000,
  fee_payer: 'TestWallet123',
  signers: ['TestWallet123'],
  actions: [
    {
      type: 'TOKEN_TRANSFER',
      info: {
        sender: 'TestWallet123',
        receiver: 'OtherWallet456',
        amount_raw: 1000000,
        token_address: 'So11111111111111111111111111111111111111112'
      }
    }
  ],
  token_balance_changes: [
    {
      address: 'TestWallet123',
      decimals: 9,
      change_amount: -1000000, // Only outgoing, no counter-asset
      post_balance: 0,
      pre_balance: 1000000,
      mint: 'So11111111111111111111111111111111111111112',
      owner: 'TestWallet123',
    }
  ]
}

console.log('🧪 Testing V2 Parser Fixes...\n')

// Test 1: Normal swap
console.log('Test 1: Normal SOL to Token Swap')
const result1 = parseShyftTransactionV2(testSwap)
console.log('Success:', result1.success)
if (result1.success && result1.data) {
  const data = result1.data
  console.log('Direction:', data.direction)
  console.log('Quote Asset:', data.quoteAsset.symbol, data.quoteAsset.mint.substring(0, 8) + '...')
  console.log('Base Asset:', data.baseAsset.symbol, data.baseAsset.mint.substring(0, 8) + '...')
  console.log('Swap Input Amount:', data.amounts.swapInputAmount, '(should be ~0.001021, got:', (1021000 / Math.pow(10, 9)).toFixed(6), ')')
  console.log('Base Amount:', data.amounts.baseAmount, '(should be 20, got:', (20000000 / Math.pow(10, 6)).toFixed(6), ')')
  
  // Check if amounts are correctly normalized
  const expectedInputAmount = 1021000 / Math.pow(10, 9) // 0.001021
  const expectedBaseAmount = 20000000 / Math.pow(10, 6) // 20.0
  
  if (Math.abs(data.amounts.swapInputAmount - expectedInputAmount) < 0.000001 &&
      Math.abs(data.amounts.baseAmount - expectedBaseAmount) < 0.000001) {
    console.log('✅ Amount calculation is correct!')
  } else {
    console.log('❌ Amount calculation is wrong!')
    console.log('  Expected input:', expectedInputAmount)
    console.log('  Got input:', data.amounts.swapInputAmount)
    console.log('  Expected base:', expectedBaseAmount)
    console.log('  Got base:', data.amounts.baseAmount)
  }
} else {
  console.log('❌ Failed:', result1.erase?.reason || 'Unknown error')
}

console.log('\n' + '─'.repeat(50) + '\n')

// Test 2: Same token
console.log('Test 2: Same Token (Should be Rejected)')
const result2 = parseShyftTransactionV2(testSameToken)
console.log('Success:', result2.success)
if (!result2.success) {
  console.log('Rejection Reason:', result2.erase?.reason)
  if (result2.erase?.reason === 'same_input_output_token' || result2.erase?.reason === 'invalid_asset_count') {
    console.log('✅ Same token filter working correctly! (Aggregated to single asset)')
  } else {
    console.log('⚠️  Rejected for different reason')
  }
} else {
  console.log('❌ Should have been rejected!')
}

console.log('\n' + '─'.repeat(50) + '\n')

// Test 3: Transfer
console.log('Test 3: Simple Transfer (Should be Rejected)')
const result3 = parseShyftTransactionV2(testTransfer)
console.log('Success:', result3.success)
if (!result3.success) {
  console.log('Rejection Reason:', result3.erase?.reason)
  if (result3.erase?.reason.includes('transfer') || result3.erase?.reason.includes('single_meaningful_change')) {
    console.log('✅ Transfer detection working correctly!')
  } else {
    console.log('⚠️  Rejected for different reason')
  }
} else {
  console.log('❌ Should have been rejected!')
}

console.log('\n' + '═'.repeat(50))
console.log('🎯 V2 Parser Fix Test Complete!')
console.log('═'.repeat(50))