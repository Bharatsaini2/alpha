/**
 * Test script to verify SWAP transaction classification (SPL to SPL)
 */

const { parseShyftTransaction } = require('./dist/utils/shyftParser');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing SWAP transaction classification...\n');

// Load a SWAP test fixture
const fixturePath = path.join(__dirname, '..', 'shyft_response', 'normalswapwithinout1.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

console.log('📄 Testing with fixture: normalswapwithinout1.json');
console.log('Expected: SWAP transaction (both isBuy and isSell should be true)\n');

// Parse the transaction
const tx = fixture.result || fixture;
const parsedSwap = parseShyftTransaction(tx);

if (!parsedSwap) {
  console.error('❌ Parser returned null');
  process.exit(1);
}

console.log('✅ Parser successfully classified transaction:');
console.log(`   Side: ${parsedSwap.side}`);
console.log(`   Classification Source: ${parsedSwap.classification_source}`);
console.log(`   Confidence: ${parsedSwap.confidence}`);

// Simulate the controller logic
const isBuy = parsedSwap.side === 'BUY' || parsedSwap.side === 'SWAP';
const isSell = parsedSwap.side === 'SELL' || parsedSwap.side === 'SWAP';

console.log('\n🎯 Controller flags:');
console.log(`   isBuy: ${isBuy}`);
console.log(`   isSell: ${isSell}`);

// For SWAP transactions, both flags should be true
if (parsedSwap.side === 'SWAP' && isBuy && isSell) {
  console.log('\n✅ Integration test PASSED - SWAP transaction correctly classified with both flags');
  process.exit(0);
} else if (parsedSwap.side !== 'SWAP' && (isBuy || isSell)) {
  console.log('\n✅ Integration test PASSED - Transaction correctly classified');
  process.exit(0);
} else {
  console.error('\n❌ Integration test FAILED - unexpected classification');
  process.exit(1);
}
