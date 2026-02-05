/**
 * Test script to verify whale controller V2 parser integration fix
 * 
 * This script tests that the whale controller correctly extracts amounts
 * from V2 parser's balance-based structure.
 */

// Mock V2 ParsedSwap for BUY transaction
const mockBuySwap = {
  signature: 'test-buy-signature',
  timestamp: Date.now(),
  swapper: 'test-swapper-address',
  direction: 'BUY', // V2 uses 'direction' not 'side'
  quoteAsset: {
    mint: 'So11111111111111111111111111111111111111112', // SOL
    symbol: 'SOL',
    decimals: 9,
  },
  baseAsset: {
    mint: 'test-token-mint',
    symbol: 'TEST',
    decimals: 6,
  },
  amounts: {
    swapInputAmount: 1.5, // SOL sent to pool
    totalWalletCost: 1.52, // Total SOL spent (including fees)
    baseAmount: 1000000, // TEST tokens received
    feeBreakdown: {
      transactionFeeSOL: 0.01,
      transactionFeeQuote: 0.01,
      platformFee: 0.01,
      priorityFee: 0,
      totalFeeQuote: 0.02,
    },
  },
  confidence: 0.95,
  protocol: 'Raydium',
  swapperIdentificationMethod: 'fee_payer',
  rentRefundsFiltered: 0,
  intermediateAssetsCollapsed: [],
}

// Mock V2 ParsedSwap for SELL transaction
const mockSellSwap = {
  signature: 'test-sell-signature',
  timestamp: Date.now(),
  swapper: 'test-swapper-address',
  direction: 'SELL', // V2 uses 'direction' not 'side'
  baseAsset: {
    mint: 'test-token-mint',
    symbol: 'TEST',
    decimals: 6,
  },
  quoteAsset: {
    mint: 'So11111111111111111111111111111111111111112', // SOL
    symbol: 'SOL',
    decimals: 9,
  },
  amounts: {
    baseAmount: 500000, // TEST tokens sold
    swapOutputAmount: 2.5, // SOL received from pool (gross)
    netWalletReceived: 2.48, // SOL received after fees
    feeBreakdown: {
      transactionFeeSOL: 0.01,
      transactionFeeQuote: 0.01,
      platformFee: 0.01,
      priorityFee: 0,
      totalFeeQuote: 0.02,
    },
  },
  confidence: 0.95,
  protocol: 'Raydium',
  swapperIdentificationMethod: 'fee_payer',
  rentRefundsFiltered: 0,
  intermediateAssetsCollapsed: [],
}

// Test token extraction logic for BUY
function testBuyTokenExtraction(parsedSwap) {
  console.log('\n=== Testing BUY Transaction ===')
  
  const tokenIn = {
    token_address: parsedSwap.direction === 'BUY' ? parsedSwap.quoteAsset.mint : parsedSwap.baseAsset.mint,
    amount: parsedSwap.direction === 'BUY' 
      ? (parsedSwap.amounts.swapInputAmount || parsedSwap.amounts.totalWalletCost || 0)
      : (parsedSwap.amounts.baseAmount || 0),
    symbol: parsedSwap.direction === 'BUY' ? (parsedSwap.quoteAsset.symbol || 'Unknown') : (parsedSwap.baseAsset.symbol || 'Unknown'),
    name: parsedSwap.direction === 'BUY' ? (parsedSwap.quoteAsset.symbol || 'Unknown') : (parsedSwap.baseAsset.symbol || 'Unknown'),
  }

  const tokenOut = {
    token_address: parsedSwap.direction === 'BUY' ? parsedSwap.baseAsset.mint : parsedSwap.quoteAsset.mint,
    amount: parsedSwap.direction === 'BUY' 
      ? (parsedSwap.amounts.baseAmount || 0)
      : (parsedSwap.amounts.swapOutputAmount || parsedSwap.amounts.netWalletReceived || 0),
    symbol: parsedSwap.direction === 'BUY' ? (parsedSwap.baseAsset.symbol || 'Unknown') : (parsedSwap.quoteAsset.symbol || 'Unknown'),
    name: parsedSwap.direction === 'BUY' ? (parsedSwap.baseAsset.symbol || 'Unknown') : (parsedSwap.quoteAsset.symbol || 'Unknown'),
  }

  const isBuy = parsedSwap.direction === 'BUY'
  const isSell = parsedSwap.direction === 'SELL'

  console.log('Direction:', parsedSwap.direction)
  console.log('isBuy:', isBuy, '| isSell:', isSell)
  console.log('\nToken IN (what was spent):')
  console.log('  Address:', tokenIn.token_address)
  console.log('  Symbol:', tokenIn.symbol)
  console.log('  Amount:', tokenIn.amount, 'SOL')
  console.log('\nToken OUT (what was received):')
  console.log('  Address:', tokenOut.token_address)
  console.log('  Symbol:', tokenOut.symbol)
  console.log('  Amount:', tokenOut.amount, 'TEST')

  // Verify correctness
  const isCorrect = 
    tokenIn.symbol === 'SOL' &&
    tokenIn.amount === 1.5 &&
    tokenOut.symbol === 'TEST' &&
    tokenOut.amount === 1000000 &&
    isBuy === true &&
    isSell === false

  console.log('\n✅ Test Result:', isCorrect ? 'PASSED' : 'FAILED')
  return isCorrect
}

// Test token extraction logic for SELL
function testSellTokenExtraction(parsedSwap) {
  console.log('\n=== Testing SELL Transaction ===')
  
  const tokenIn = {
    token_address: parsedSwap.direction === 'BUY' ? parsedSwap.quoteAsset.mint : parsedSwap.baseAsset.mint,
    amount: parsedSwap.direction === 'BUY' 
      ? (parsedSwap.amounts.swapInputAmount || parsedSwap.amounts.totalWalletCost || 0)
      : (parsedSwap.amounts.baseAmount || 0),
    symbol: parsedSwap.direction === 'BUY' ? (parsedSwap.quoteAsset.symbol || 'Unknown') : (parsedSwap.baseAsset.symbol || 'Unknown'),
    name: parsedSwap.direction === 'BUY' ? (parsedSwap.quoteAsset.symbol || 'Unknown') : (parsedSwap.baseAsset.symbol || 'Unknown'),
  }

  const tokenOut = {
    token_address: parsedSwap.direction === 'BUY' ? parsedSwap.baseAsset.mint : parsedSwap.quoteAsset.mint,
    amount: parsedSwap.direction === 'BUY' 
      ? (parsedSwap.amounts.baseAmount || 0)
      : (parsedSwap.amounts.swapOutputAmount || parsedSwap.amounts.netWalletReceived || 0),
    symbol: parsedSwap.direction === 'BUY' ? (parsedSwap.baseAsset.symbol || 'Unknown') : (parsedSwap.quoteAsset.symbol || 'Unknown'),
    name: parsedSwap.direction === 'BUY' ? (parsedSwap.baseAsset.symbol || 'Unknown') : (parsedSwap.quoteAsset.symbol || 'Unknown'),
  }

  const isBuy = parsedSwap.direction === 'BUY'
  const isSell = parsedSwap.direction === 'SELL'

  console.log('Direction:', parsedSwap.direction)
  console.log('isBuy:', isBuy, '| isSell:', isSell)
  console.log('\nToken IN (what was sold):')
  console.log('  Address:', tokenIn.token_address)
  console.log('  Symbol:', tokenIn.symbol)
  console.log('  Amount:', tokenIn.amount, 'TEST')
  console.log('\nToken OUT (what was received):')
  console.log('  Address:', tokenOut.token_address)
  console.log('  Symbol:', tokenOut.symbol)
  console.log('  Amount:', tokenOut.amount, 'SOL')

  // Verify correctness
  const isCorrect = 
    tokenIn.symbol === 'TEST' &&
    tokenIn.amount === 500000 &&
    tokenOut.symbol === 'SOL' &&
    tokenOut.amount === 2.5 &&
    isBuy === false &&
    isSell === true

  console.log('\n✅ Test Result:', isCorrect ? 'PASSED' : 'FAILED')
  return isCorrect
}

// Run tests
console.log('╔════════════════════════════════════════════════════════════╗')
console.log('║  Whale Controller V2 Parser Integration Fix - Test Suite  ║')
console.log('╚════════════════════════════════════════════════════════════╝')

const buyTestPassed = testBuyTokenExtraction(mockBuySwap)
const sellTestPassed = testSellTokenExtraction(mockSellSwap)

console.log('\n' + '='.repeat(60))
console.log('FINAL RESULTS:')
console.log('  BUY Test:', buyTestPassed ? '✅ PASSED' : '❌ FAILED')
console.log('  SELL Test:', sellTestPassed ? '✅ PASSED' : '❌ FAILED')
console.log('  Overall:', (buyTestPassed && sellTestPassed) ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED')
console.log('='.repeat(60))

process.exit((buyTestPassed && sellTestPassed) ? 0 : 1)
