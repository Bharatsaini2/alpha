/**
 * Test the relaxed parser rules
 * This tests that the parser now accepts one-sided transactions and complex swaps
 */

const { parseShyftTransaction } = require('./dist/utils/shyftParser')

console.log('🧪 Testing Relaxed Parser Rules\n')
console.log('='.repeat(70))

// Test 1: One-sided token send (USDC transfer)
console.log('\n📝 Test 1: One-sided token send (USDC transfer)')
const test1 = {
  signature: 'test1',
  timestamp: '2025-01-30T00:00:00Z',
  status: 'Success',
  fee_payer: 'whale123',
  signers: ['whale123'],
  type: 'TOKEN_TRANSFER',
  token_balance_changes: [
    {
      address: 'account1',
      decimals: 6,
      change_amount: -113918,
      post_balance: 1000000,
      pre_balance: 1113918,
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      owner: 'whale123',
    },
  ],
  actions: [],
  events: [],
}

const result1 = parseShyftTransaction(test1)
if (result1) {
  console.log(`✅ ACCEPTED: side=${result1.side}, confidence=${result1.confidence}`)
  console.log(`   Input: ${result1.input.mint.substring(0, 8)}... (${result1.input.amount})`)
  console.log(`   Output: ${result1.output.mint}`)
} else {
  console.log('❌ REJECTED')
}

// Test 2: One-sided token receive
console.log('\n📝 Test 2: One-sided token receive')
const test2 = {
  signature: 'test2',
  timestamp: '2025-01-30T00:00:00Z',
  status: 'Success',
  fee_payer: 'whale123',
  signers: ['whale123'],
  type: 'TOKEN_TRANSFER',
  token_balance_changes: [
    {
      address: 'account1',
      decimals: 6,
      change_amount: 2410330000,
      post_balance: 2410330000,
      pre_balance: 0,
      mint: 'TokenMint123',
      owner: 'whale123',
    },
  ],
  actions: [],
  events: [],
}

const result2 = parseShyftTransaction(test2)
if (result2) {
  console.log(`✅ ACCEPTED: side=${result2.side}, confidence=${result2.confidence}`)
  console.log(`   Input: ${result2.input.mint}`)
  console.log(`   Output: ${result2.output.mint.substring(0, 8)}... (${result2.output.amount})`)
} else {
  console.log('❌ REJECTED')
}

// Test 3: Traditional BUY (should still work)
console.log('\n📝 Test 3: Traditional BUY (token inflow + SOL outflow)')
const test3 = {
  signature: 'test3',
  timestamp: '2025-01-30T00:00:00Z',
  status: 'Success',
  fee_payer: 'whale123',
  signers: ['whale123'],
  type: 'SWAP',
  token_balance_changes: [
    {
      address: 'account1',
      decimals: 9,
      change_amount: -1000000000, // -1 SOL
      post_balance: 5000000000,
      pre_balance: 6000000000,
      mint: 'So11111111111111111111111111111111111111112',
      owner: 'whale123',
    },
    {
      address: 'account2',
      decimals: 6,
      change_amount: 1000000, // +1 token
      post_balance: 1000000,
      pre_balance: 0,
      mint: 'TokenMint456',
      owner: 'whale123',
    },
  ],
  actions: [],
  events: [],
}

const result3 = parseShyftTransaction(test3)
if (result3) {
  console.log(`✅ ACCEPTED: side=${result3.side}, confidence=${result3.confidence}`)
  console.log(`   Input: ${result3.input.mint.substring(0, 8)}... (${result3.input.amount})`)
  console.log(`   Output: ${result3.output.mint.substring(0, 8)}... (${result3.output.amount})`)
} else {
  console.log('❌ REJECTED')
}

// Test 4: Traditional SELL (should still work)
console.log('\n📝 Test 4: Traditional SELL (token outflow + SOL inflow)')
const test4 = {
  signature: 'test4',
  timestamp: '2025-01-30T00:00:00Z',
  status: 'Success',
  fee_payer: 'whale123',
  signers: ['whale123'],
  type: 'SWAP',
  token_balance_changes: [
    {
      address: 'account1',
      decimals: 6,
      change_amount: -1000000, // -1 token
      post_balance: 0,
      pre_balance: 1000000,
      mint: 'TokenMint789',
      owner: 'whale123',
    },
    {
      address: 'account2',
      decimals: 9,
      change_amount: 1000000000, // +1 SOL
      post_balance: 6000000000,
      pre_balance: 5000000000,
      mint: 'So11111111111111111111111111111111111111112',
      owner: 'whale123',
    },
  ],
  actions: [],
  events: [],
}

const result4 = parseShyftTransaction(test4)
if (result4) {
  console.log(`✅ ACCEPTED: side=${result4.side}, confidence=${result4.confidence}`)
  console.log(`   Input: ${result4.input.mint.substring(0, 8)}... (${result4.input.amount})`)
  console.log(`   Output: ${result4.output.mint.substring(0, 8)}... (${result4.output.amount})`)
} else {
  console.log('❌ REJECTED')
}

// Test 5: SPL-to-SPL swap (should still work)
console.log('\n📝 Test 5: SPL-to-SPL swap (USDC → Token)')
const test5 = {
  signature: 'test5',
  timestamp: '2025-01-30T00:00:00Z',
  status: 'Success',
  fee_payer: 'whale123',
  signers: ['whale123'],
  type: 'SWAP',
  token_balance_changes: [
    {
      address: 'account1',
      decimals: 6,
      change_amount: -100000000, // -100 USDC
      post_balance: 900000000,
      pre_balance: 1000000000,
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      owner: 'whale123',
    },
    {
      address: 'account2',
      decimals: 6,
      change_amount: 50000000, // +50 tokens
      post_balance: 50000000,
      pre_balance: 0,
      mint: 'TokenMintABC',
      owner: 'whale123',
    },
  ],
  actions: [],
  events: [],
}

const result5 = parseShyftTransaction(test5)
if (result5) {
  console.log(`✅ ACCEPTED: side=${result5.side}, confidence=${result5.confidence}`)
  console.log(`   Input: ${result5.input.mint.substring(0, 8)}... (${result5.input.amount})`)
  console.log(`   Output: ${result5.output.mint.substring(0, 8)}... (${result5.output.amount})`)
} else {
  console.log('❌ REJECTED')
}

// Test 6: Zero balance change (routing - should reject)
console.log('\n📝 Test 6: Zero balance change (routing transaction)')
const test6 = {
  signature: 'test6',
  timestamp: '2025-01-30T00:00:00Z',
  status: 'Success',
  fee_payer: 'whale123',
  signers: ['whale123'],
  type: 'SWAP',
  token_balance_changes: [
    {
      address: 'account1',
      decimals: 9,
      change_amount: 0,
      post_balance: 5000000000,
      pre_balance: 5000000000,
      mint: 'So11111111111111111111111111111111111111112',
      owner: 'whale123',
    },
    {
      address: 'account2',
      decimals: 6,
      change_amount: 0,
      post_balance: 1000000,
      pre_balance: 1000000,
      mint: 'TokenMint456',
      owner: 'whale123',
    },
  ],
  actions: [],
  events: [],
}

const result6 = parseShyftTransaction(test6)
if (result6) {
  console.log(`✅ ACCEPTED: side=${result6.side}, confidence=${result6.confidence}`)
} else {
  console.log('❌ REJECTED (correct - no balance change)')
}

console.log('\n' + '='.repeat(70))
console.log('📊 SUMMARY')
console.log('='.repeat(70))

const tests = [result1, result2, result3, result4, result5]
const accepted = tests.filter(r => r !== null).length
const rejected = tests.filter(r => r === null).length

console.log(`Total tests: ${tests.length + 1}`)
console.log(`✅ Accepted: ${accepted}/${tests.length} valid transactions`)
console.log(`❌ Rejected: ${rejected}/${tests.length} valid transactions`)
console.log(`✅ Correctly rejected: ${result6 ? 0 : 1}/1 routing transaction`)

if (accepted === tests.length && !result6) {
  console.log('\n🎉 ALL TESTS PASSED! Parser is now less strict.')
} else {
  console.log('\n⚠️  Some tests failed. Parser may still be too strict.')
}
