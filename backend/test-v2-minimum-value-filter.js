/**
 * Test V2 Parser Minimum Value Filter
 * 
 * This test verifies that the V2 parser correctly filters out micro-transactions
 * under $2 USD for BUY/SELL operations, but allows token-to-token swaps through.
 */

const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2')

console.log('🧪 Testing V2 Parser Minimum Value Filter')
console.log('=' .repeat(60))

// Test 1: Micro BUY transaction (should be rejected)
console.log('\n📋 Test 1: Micro BUY Transaction (< $2)')
const microBuyTransaction = {
  signature: 'micro-buy-test',
  timestamp: Date.now(),
  status: 'Success',
  fee: 5000,
  fee_payer: 'FeePayer123',
  signers: ['Signer123'],
  protocol: { name: 'Jupiter' },
  token_balance_changes: [
    {
      address: 'FeePayer123',
      decimals: 9,
      change_amount: -1000, // -0.000001 SOL (~$0.0002)
      post_balance: 0,
      pre_balance: 1000,
      mint: 'So11111111111111111111111111111111111111112', // SOL
      owner: 'FeePayer123'
    },
    {
      address: 'FeePayer123', 
      decimals: 6,
      change_amount: 1000000, // 1.0 USDC
      post_balance: 1000000,
      pre_balance: 0,
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      owner: 'FeePayer123'
    }
  ],
  actions: []
}

const microBuyResult = parseShyftTransactionV2(microBuyTransaction)
console.log(`Result: ${microBuyResult.success ? '✅ ACCEPTED' : '❌ REJECTED'}`)
if (!microBuyResult.success) {
  console.log(`Reason: ${microBuyResult.erase?.reason}`)
  console.log(`USD Value: $${microBuyResult.erase?.debugInfo?.usdValue?.toFixed(4) || 'N/A'}`)
}

// Test 2: Valid BUY transaction (should be accepted)
console.log('\n📋 Test 2: Valid BUY Transaction (> $2)')
const validBuyTransaction = {
  signature: 'valid-buy-test',
  timestamp: Date.now(),
  status: 'Success',
  fee: 5000,
  fee_payer: 'FeePayer123',
  signers: ['Signer123'],
  protocol: { name: 'Jupiter' },
  token_balance_changes: [
    {
      address: 'FeePayer123',
      decimals: 9,
      change_amount: -10000000, // -0.01 SOL (~$2.40)
      post_balance: 0,
      pre_balance: 10000000,
      mint: 'So11111111111111111111111111111111111111112', // SOL
      owner: 'FeePayer123'
    },
    {
      address: 'FeePayer123', 
      decimals: 6,
      change_amount: 1000000, // 1.0 USDC
      post_balance: 1000000,
      pre_balance: 0,
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      owner: 'FeePayer123'
    }
  ],
  actions: []
}

const validBuyResult = parseShyftTransactionV2(validBuyTransaction)
console.log(`Result: ${validBuyResult.success ? '✅ ACCEPTED' : '❌ REJECTED'}`)
if (validBuyResult.success) {
  console.log(`Direction: ${validBuyResult.data.direction}`)
  console.log(`Input Amount: ${validBuyResult.data.amounts.swapInputAmount} SOL`)
}

// Test 3: Micro SELL transaction (should be rejected)
console.log('\n📋 Test 3: Micro SELL Transaction (< $2)')
const microSellTransaction = {
  signature: 'micro-sell-test',
  timestamp: Date.now(),
  status: 'Success',
  fee: 5000,
  fee_payer: 'FeePayer123',
  signers: ['Signer123'],
  protocol: { name: 'Jupiter' },
  token_balance_changes: [
    {
      address: 'FeePayer123',
      decimals: 6,
      change_amount: -500000, // -0.5 USDC
      post_balance: 0,
      pre_balance: 500000,
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      owner: 'FeePayer123'
    },
    {
      address: 'FeePayer123', 
      decimals: 6,
      change_amount: 1000000, // 1.0 tokens
      post_balance: 1000000,
      pre_balance: 0,
      mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', // Valid token address
      owner: 'FeePayer123'
    }
  ],
  actions: []
}

const microSellResult = parseShyftTransactionV2(microSellTransaction)
console.log(`Result: ${microSellResult.success ? '✅ ACCEPTED' : '❌ REJECTED'}`)
if (!microSellResult.success) {
  console.log(`Reason: ${microSellResult.erase?.reason}`)
  console.log(`USD Value: $${microSellResult.erase?.debugInfo?.usdValue?.toFixed(4) || 'N/A'}`)
}

// Test 4: Token-to-Token swap (should be accepted regardless of value)
console.log('\n📋 Test 4: Token-to-Token Swap (should bypass filter)')
const tokenSwapTransaction = {
  signature: 'token-swap-test',
  timestamp: Date.now(),
  status: 'Success',
  fee: 5000,
  fee_payer: 'FeePayer123',
  signers: ['Signer123'],
  protocol: { name: 'Jupiter' },
  token_balance_changes: [
    {
      address: 'FeePayer123',
      decimals: 6,
      change_amount: -1000, // -0.001 TokenA
      post_balance: 0,
      pre_balance: 1000,
      mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', // Valid token A
      owner: 'FeePayer123'
    },
    {
      address: 'FeePayer123', 
      decimals: 6,
      change_amount: 2000, // 0.002 TokenB
      post_balance: 2000,
      pre_balance: 0,
      mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', // Valid token B
      owner: 'FeePayer123'
    }
  ],
  actions: []
}

const tokenSwapResult = parseShyftTransactionV2(tokenSwapTransaction)
console.log(`Result: ${tokenSwapResult.success ? '✅ ACCEPTED' : '❌ REJECTED'}`)
if (tokenSwapResult.success) {
  if ('splitReason' in tokenSwapResult.data) {
    console.log(`Type: Split Swap Pair (${tokenSwapResult.data.splitReason})`)
    console.log(`Sell: ${tokenSwapResult.data.sellRecord.amounts.baseAmount} → Buy: ${tokenSwapResult.data.buyRecord.amounts.baseAmount}`)
  }
}

console.log('\n' + '=' .repeat(60))
console.log('📊 Summary:')
console.log(`• Micro BUY (< $2): ${microBuyResult.success ? 'ACCEPTED ❌' : 'REJECTED ✅'}`)
console.log(`• Valid BUY (> $2): ${validBuyResult.success ? 'ACCEPTED ✅' : 'REJECTED ❌'}`)
console.log(`• Micro SELL (< $2): ${microSellResult.success ? 'ACCEPTED ❌' : 'REJECTED ✅'}`)
console.log(`• Token-to-Token: ${tokenSwapResult.success ? 'ACCEPTED ✅' : 'REJECTED ❌'}`)
console.log('')