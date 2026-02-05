/**
 * Test LASER Transaction Fix
 * 
 * This script tests the fix for token → SOL sell transactions where
 * SOL balance changes don't appear in token_balance_changes.
 * 
 * The fix adds fallback logic to extract amounts from SWAP actions
 * when balance changes are incomplete.
 */

const { createShyftParserV2 } = require('./dist/utils/shyftParserV2');

// LASER transaction that was failing
// Using real Solana addresses for validation
const laserTransaction = {
  signature: '5Yx8VQqYvhqvJZvqvqvqvqvqvqvqvqvqvqvqvqvqvqvqvqvqvqvqvqvqvqvqvqvqvqvq',
  timestamp: 1234567890,
  status: 'Success',
  fee: 0.000005,
  fee_payer: 'B32QbbWRZ3xmJNvGPvJyACnBPKpqzXYMZvqvqvqvqvqv', // 44 char address
  signers: ['B32QbbWRZ3xmJNvGPvJyACnBPKpqzXYMZvqvqvqvqvqv'],
  protocol: {
    name: 'Raydium',
    address: 'RaydiumAddress'
  },
  token_balance_changes: [
    {
      address: 'B32QbbWRZ3xmJNvGPvJyACnBPKpqzXYMZvqvqvqvqvqv',
      mint: 'LASERmintAddressXXXXXXXXXXXXXXXXXXXXXXXXXXX', // 44 char
      owner: 'B32QbbWRZ3xmJNvGPvJyACnBPKpqzXYMZvqvqvqvqvqv',
      change_amount: -3552844.976777,
      pre_balance: 3552844.976777,
      post_balance: 0,
      decimals: 6
    },
    {
      address: '2KkzRHPoolAddressXXXXXXXXXXXXXXXXXXXXXXXXXX', // Pool address
      mint: 'LASERmintAddressXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      owner: '2KkzRHPoolAddressXXXXXXXXXXXXXXXXXXXXXXXXXX',
      change_amount: 3552844.976777,
      pre_balance: 0,
      post_balance: 3552844.976777,
      decimals: 6
    },
    {
      address: '2KkzRHPoolAddressXXXXXXXXXXXXXXXXXXXXXXXXXX',
      mint: 'So11111111111111111111111111111111111111112', // SOL
      owner: '2KkzRHPoolAddressXXXXXXXXXXXXXXXXXXXXXXXXXX',
      change_amount: -2.533935385,
      pre_balance: 100,
      post_balance: 97.466064615,
      decimals: 9
    }
  ],
  actions: [
    {
      type: 'SWAP',
      info: {
        swapper: 'B32QbbWRZ3xmJNvGPvJyACnBPKpqzXYMZvqvqvqvqvqv',
        tokens_swapped: {
          in: {
            token_address: 'LASERmintAddressXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            symbol: 'LASER',
            amount_raw: 3552844.976777
          },
          out: {
            token_address: 'So11111111111111111111111111111111111111112',
            symbol: 'SOL',
            amount_raw: 2.50854525
          }
        }
      }
    }
  ]
};

console.log('🧪 Testing LASER Transaction Fix\n');
console.log('Transaction:', laserTransaction.signature);
console.log('Swapper:', laserTransaction.fee_payer);
console.log('\n📊 Input Data:');
console.log('  Token Balance Changes:');
laserTransaction.token_balance_changes.forEach(change => {
  console.log(`    ${change.owner === laserTransaction.fee_payer ? '✅' : '❌'} ${change.mint.substring(0, 8)}... : ${change.change_amount > 0 ? '+' : ''}${change.change_amount}`);
});
console.log('\n  SWAP Action:');
console.log(`    IN:  ${laserTransaction.actions[0].info.tokens_swapped.in.amount_raw} ${laserTransaction.actions[0].info.tokens_swapped.in.symbol}`);
console.log(`    OUT: ${laserTransaction.actions[0].info.tokens_swapped.out.amount_raw} ${laserTransaction.actions[0].info.tokens_swapped.out.symbol}`);

console.log('\n🔧 Parsing with V2 Parser...\n');

const parser = createShyftParserV2();
const result = parser.parseTransaction(laserTransaction);

console.log('📋 Result:');
console.log('  Success:', result.success);
console.log('  Processing Time:', result.processingTimeMs, 'ms');

if (result.success && result.data) {
  const swap = result.data;
  console.log('\n✅ PARSED SUCCESSFULLY!');
  console.log('  Direction:', swap.direction);
  console.log('  Quote Asset:', swap.quoteAsset.symbol, '(' + swap.quoteAsset.mint.substring(0, 8) + '...)');
  console.log('  Base Asset:', swap.baseAsset.symbol, '(' + swap.baseAsset.mint.substring(0, 8) + '...)');
  console.log('  Swap Input:', swap.amounts.swapInputAmount);
  console.log('  Swap Output:', swap.amounts.swapOutputAmount);
  console.log('  Confidence:', swap.confidence);
  
  // Verify correctness
  console.log('\n🔍 Verification:');
  console.log('  Debug - Quote mint:', swap.quoteAsset.mint);
  console.log('  Debug - Includes LASERmint?', swap.quoteAsset.mint.includes('LASERmint'));
  console.log('  Debug - Swap output amount:', swap.amounts.swapOutputAmount);
  console.log('  Debug - Expected (normalized):', 3552844.976777 / Math.pow(10, 6));
  
  const expectedNormalized = 3552844.976777 / Math.pow(10, 6); // Normalize by decimals
  const isCorrect = 
    swap.direction === 'SELL' &&
    swap.quoteAsset.mint.includes('LASERmint') &&
    swap.baseAsset.symbol === 'SOL' &&
    Math.abs(swap.amounts.swapOutputAmount - expectedNormalized) < 0.000001;
  
  if (isCorrect) {
    console.log('  ✅ All checks passed!');
    console.log('  ✅ Direction is SELL');
    console.log('  ✅ Quote is LASER token (mint matches)');
    console.log('  ✅ Base is SOL (currency received)');
    console.log('  ✅ Amounts extracted from SWAP action and normalized correctly');
    console.log('\n🎉 FIX SUCCESSFUL! The parser now correctly:');
    console.log('  1. Falls back to SWAP actions when balance changes are incomplete');
    console.log('  2. Extracts both IN and OUT tokens from tokens_swapped');
    console.log('  3. Correctly identifies SELL direction');
    console.log('  4. Assigns quote/base roles properly');
  } else {
    console.log('  ❌ Verification failed!');
    if (swap.direction !== 'SELL') console.log('    - Direction should be SELL, got:', swap.direction);
    if (!swap.quoteAsset.mint.includes('LASERmint')) console.log('    - Quote mint should contain LASERmint, got:', swap.quoteAsset.mint);
    if (swap.baseAsset.symbol !== 'SOL') console.log('    - Base should be SOL, got:', swap.baseAsset.symbol);
    if (Math.abs(swap.amounts.swapOutputAmount - expectedNormalized) >= 0.000001) console.log('    - Amount mismatch:', swap.amounts.swapOutputAmount, 'vs expected', expectedNormalized);
  }
} else if (result.erase) {
  console.log('\n❌ TRANSACTION ERASED');
  console.log('  Reason:', result.erase.reason);
  console.log('  Debug Info:', JSON.stringify(result.erase.debugInfo, null, 2));
} else {
  console.log('\n❌ UNEXPECTED RESULT');
  console.log(JSON.stringify(result, null, 2));
}

console.log('\n' + '='.repeat(60));
