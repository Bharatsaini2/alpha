/**
 * Test WSOL Amount Doubling Fix
 * 
 * This script tests the fix for WSOL amounts being multiplied by 2
 * when both token_balance_changes and actions contain SOL transfers.
 */

const { parseShyftTransactionV2 } = require('./dist/utils/shyftParserV2');

console.log('🧪 Testing WSOL Amount Doubling Fix');
console.log('═'.repeat(60));

// Test case: Transaction with both token_balance_changes and SOL transfer actions
const wsolTransaction = {
  signature: 'test_wsol_signature',
  timestamp: Date.now(),
  status: 'Success',
  fee: 5000,
  fee_payer: 'TestWallet123456789',
  signers: ['TestWallet123456789'],
  protocol: { name: 'Jupiter', version: '6' },
  token_balance_changes: [
    {
      address: 'TestWallet123456789',
      mint: 'So11111111111111111111111111111111111111112', // SOL/WSOL
      decimals: 9,
      change_amount: -1000000000, // -1 SOL
      pre_balance: 2000000000,
      post_balance: 1000000000,
      owner: 'TestWallet123456789'
    },
    {
      address: 'TestWallet123456789',
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      decimals: 6,
      change_amount: 50000000, // +50 USDC
      pre_balance: 0,
      post_balance: 50000000,
      owner: 'TestWallet123456789'
    }
  ],
  actions: [
    {
      type: 'TOKEN_TRANSFER',
      info: {
        sender: 'TestWallet123456789',
        receiver: 'PoolAddress123456789',
        token_address: 'So11111111111111111111111111111111111111112',
        amount_raw: 1000000000 // 1 SOL (this should NOT be added to token_balance_changes)
      }
    },
    {
      type: 'TOKEN_TRANSFER', 
      info: {
        sender: 'PoolAddress123456789',
        receiver: 'TestWallet123456789',
        token_address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount_raw: 50000000 // 50 USDC
      }
    }
  ]
};

console.log('\n🔍 Test Case: WSOL Transaction with Both Balance Changes and Actions');
console.log('─'.repeat(50));
console.log('Expected: SOL amount should be 1.0 (not 2.0)');
console.log('Expected: USDC amount should be 50.0');

const result = parseShyftTransactionV2(wsolTransaction);

if (result.success && result.data) {
  const swapData = result.data;
  
  console.log('\n✅ TRANSACTION PARSED SUCCESSFULLY');
  console.log(`Direction: ${swapData.direction}`);
  console.log(`Quote Asset: ${swapData.quoteAsset.symbol} (${swapData.quoteAsset.mint.substring(0, 8)}...)`);
  console.log(`Base Asset: ${swapData.baseAsset.symbol} (${swapData.baseAsset.mint.substring(0, 8)}...)`);
  
  // Check amounts
  const inputAmount = swapData.direction === 'SELL' ? 
    swapData.amounts.baseAmount : 
    swapData.amounts.swapInputAmount || swapData.amounts.totalWalletCost;
  const outputAmount = swapData.direction === 'SELL' ? 
    swapData.amounts.swapOutputAmount || swapData.amounts.netWalletReceived : 
    swapData.amounts.baseAmount;
    
  console.log(`\nAmount Analysis:`);
  console.log(`Input Amount: ${Math.abs(inputAmount).toFixed(6)}`);
  console.log(`Output Amount: ${Math.abs(outputAmount).toFixed(6)}`);
  
  // Verify WSOL fix
  const solAmount = swapData.direction === 'SELL' ? outputAmount : inputAmount;
  const expectedSolAmount = 1.0;
  const actualSolAmount = Math.abs(solAmount);
  
  console.log(`\n🔍 WSOL Fix Verification:`);
  console.log(`Expected SOL Amount: ${expectedSolAmount}`);
  console.log(`Actual SOL Amount: ${actualSolAmount}`);
  
  if (Math.abs(actualSolAmount - expectedSolAmount) < 0.001) {
    console.log(`✅ WSOL FIX WORKING: Amount is correct (${actualSolAmount})`);
  } else {
    console.log(`❌ WSOL FIX FAILED: Amount is wrong (expected ${expectedSolAmount}, got ${actualSolAmount})`);
  }
  
} else {
  console.log('\n❌ TRANSACTION PARSING FAILED');
  console.log(`Reason: ${result.erase?.reason || 'unknown'}`);
  console.log('This might indicate an issue with the parser');
}

// Test case 2: Core-to-core suppression
console.log('\n\n🔍 Test Case 2: Core-to-Core Suppression (USDC → USDT)');
console.log('─'.repeat(50));
console.log('Expected: Transaction should be SUPPRESSED');

const coreToCore = {
  signature: 'test_core_to_core',
  timestamp: Date.now(),
  status: 'Success',
  fee: 5000,
  fee_payer: 'TestWallet123456789',
  signers: ['TestWallet123456789'],
  protocol: { name: 'Jupiter', version: '6' },
  token_balance_changes: [
    {
      address: 'TestWallet123456789',
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      decimals: 6,
      change_amount: -100000000, // -100 USDC
      pre_balance: 200000000,
      post_balance: 100000000,
      owner: 'TestWallet123456789'
    },
    {
      address: 'TestWallet123456789',
      mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
      decimals: 6,
      change_amount: 99500000, // +99.5 USDT
      pre_balance: 0,
      post_balance: 99500000,
      owner: 'TestWallet123456789'
    }
  ],
  actions: []
};

const coreResult = parseShyftTransactionV2(coreToCore);

if (!coreResult.success && coreResult.erase) {
  console.log(`✅ CORE-TO-CORE SUPPRESSION WORKING: ${coreResult.erase.reason}`);
  if (coreResult.erase.reason === 'core_to_core_suppressed') {
    console.log('✅ Correct suppression reason detected');
  } else {
    console.log(`⚠️  Different suppression reason: ${coreResult.erase.reason}`);
  }
} else {
  console.log('❌ CORE-TO-CORE SUPPRESSION FAILED: Transaction was not suppressed');
  if (coreResult.success) {
    console.log('Transaction was parsed as a valid swap (should be suppressed)');
  }
}

console.log('\n═'.repeat(60));
console.log('✅ WSOL Amount Fix Testing Complete');
console.log('✅ Core-to-Core Suppression Testing Complete');
console.log('═'.repeat(60));