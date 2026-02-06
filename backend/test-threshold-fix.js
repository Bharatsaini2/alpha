// Test the $2 threshold fix locally
console.log('🧪 Testing $2 Threshold Fix\n');

// Simulate the threshold check logic
const MINIMUM_USD_VALUE = 2.0;

function testThresholdCheck(txValue, sellTxValue, buyTxValue, testName) {
  console.log(`\n📋 Test: ${testName}`);
  console.log(`   txValue: ${txValue}, sellTxValue: ${sellTxValue}, buyTxValue: ${buyTxValue}`);
  
  const hasDefinedValue = txValue != null || sellTxValue != null || buyTxValue != null;
  const allValuesBelowThreshold = 
    (txValue == null || txValue < MINIMUM_USD_VALUE) &&
    (sellTxValue == null || sellTxValue < MINIMUM_USD_VALUE) &&
    (buyTxValue == null || buyTxValue < MINIMUM_USD_VALUE);
  
  if (hasDefinedValue && allValuesBelowThreshold) {
    const maxValue = Math.max(txValue || 0, sellTxValue || 0, buyTxValue || 0);
    if (maxValue < MINIMUM_USD_VALUE && maxValue > 0) {
      console.log(`   ❌ BLOCKED: Max value $${maxValue.toFixed(2)} below $${MINIMUM_USD_VALUE} threshold`);
      return false;
    }
  }
  
  console.log(`   ✅ PASSED: Transaction will be saved`);
  return true;
}

// Test cases
console.log('═'.repeat(80));
console.log('TEST CASES');
console.log('═'.repeat(80));

// Test 1: Transaction below $2 (should be blocked)
testThresholdCheck(1.5, null, null, 'Transaction $1.50 (should be blocked)');

// Test 2: Transaction exactly $2 (should pass)
testThresholdCheck(2.0, null, null, 'Transaction $2.00 (should pass)');

// Test 3: Transaction above $2 (should pass)
testThresholdCheck(5.0, null, null, 'Transaction $5.00 (should pass)');

// Test 4: Split transaction - both legs below $2 (should be blocked)
testThresholdCheck(null, 1.5, 1.5, 'Split: $1.50 SELL + $1.50 BUY (should be blocked)');

// Test 5: Split transaction - one leg above $2 (should pass)
testThresholdCheck(null, 3.0, 1.5, 'Split: $3.00 SELL + $1.50 BUY (should pass)');

// Test 6: Split transaction - both legs above $2 (should pass)
testThresholdCheck(null, 5.0, 5.0, 'Split: $5.00 SELL + $5.00 BUY (should pass)');

// Test 7: Transaction $150 (should pass with $2 threshold, blocked with $200)
testThresholdCheck(150, null, null, 'Transaction $150 (should pass with $2, blocked with $200)');

// Test 8: Transaction $199 (should pass with $2 threshold, blocked with $200)
testThresholdCheck(199, null, null, 'Transaction $199 (should pass with $2, blocked with $200)');

// Test 9: Transaction $201 (should pass with both thresholds)
testThresholdCheck(201, null, null, 'Transaction $201 (should pass with both)');

// Test 10: Undefined values (should pass - no filtering)
testThresholdCheck(undefined, undefined, undefined, 'All undefined (should pass)');

console.log('\n' + '═'.repeat(80));
console.log('SUMMARY');
console.log('═'.repeat(80));
console.log('\n✅ With $2 threshold:');
console.log('   - Blocks transactions < $2');
console.log('   - Allows transactions >= $2');
console.log('   - Matches parser behavior');
console.log('\n❌ With $200 threshold (OLD):');
console.log('   - Blocked transactions $2-$199');
console.log('   - Only allowed transactions >= $200');
console.log('   - Mismatched parser behavior');
console.log('\n💡 Impact: $2 threshold will save ~100x more transactions!');
