/**
 * Test script to verify whale.controller.ts integration with shyftParser
 * This tests that the parser correctly classifies transactions and sets isBuy/isSell flags
 */

const { parseShyftTransaction } = require('./dist/utils/shyftParser');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing whale.controller.ts parser integration...\n');

// Load a test fixture
const fixturePath = path.join(__dirname, '..', 'shyft_response', 'GETACCOUNTDATASIZE4.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

console.log('📄 Testing with fixture: GETACCOUNTDATASIZE4.json');
console.log('Expected: BUY transaction\n');

// Parse the transaction
console.log('🔍 Parsing transaction...');
const tx = fixture.result || fixture; // Handle both wrapped and unwrapped formats
console.log('Transaction status:', tx.status);
console.log('Fee payer:', tx.fee_payer);
console.log('Signers:', tx.signers);
console.log('Type:', tx.type);

const parsedSwap = parseShyftTransaction(tx);

if (!parsedSwap) {
  console.error('❌ Parser returned null - this would cause the transaction to be skipped');
  process.exit(1);
}

console.log('✅ Parser successfully classified transaction:');
console.log(`   Side: ${parsedSwap.side}`);
console.log(`   Classification Source: ${parsedSwap.classification_source}`);
console.log(`   Confidence: ${parsedSwap.confidence}`);
console.log(`   ATA Created: ${parsedSwap.ata_created}`);

// Simulate the controller logic
const isBuy = parsedSwap.side === 'BUY' || parsedSwap.side === 'SWAP';
const isSell = parsedSwap.side === 'SELL' || parsedSwap.side === 'SWAP';

console.log('\n🎯 Controller flags:');
console.log(`   isBuy: ${isBuy}`);
console.log(`   isSell: ${isSell}`);

// Map classification source
const classificationSource = parsedSwap.classification_source === 'token_balance_changes' 
  ? 'token_balance' 
  : parsedSwap.classification_source === 'tokens_swapped'
  ? 'tokens_swapped'
  : 'event_override';

console.log(`   classificationSource: ${classificationSource}`);
console.log(`   confidence: ${parsedSwap.confidence}`);

// Verify expected results
if (parsedSwap.side === 'BUY' && isBuy && !isSell) {
  console.log('\n✅ Integration test PASSED - BUY transaction correctly classified');
  process.exit(0);
} else {
  console.error('\n❌ Integration test FAILED - unexpected classification');
  process.exit(1);
}
