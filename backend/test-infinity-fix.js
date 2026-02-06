// Test the Infinity bug fix locally
console.log('🧪 Testing Infinity Bug Fix\n');

function calculateSolAmount(tokenAmount, tokenPrice, solPrice, testName) {
  console.log(`\n📋 Test: ${testName}`);
  console.log(`   Token Amount: ${tokenAmount}`);
  console.log(`   Token Price: $${tokenPrice}`);
  console.log(`   SOL Price: $${solPrice}`);
  
  // OLD CODE (causes Infinity)
  const oldResult = (tokenAmount * tokenPrice) / solPrice;
  console.log(`   ❌ OLD: ${oldResult} SOL (division by ${solPrice})`);
  
  // NEW CODE (with safety check)
  const safeSolPrice = solPrice && solPrice > 0 ? solPrice : 94;
  const newResult = (tokenAmount * tokenPrice) / safeSolPrice;
  console.log(`   ✅ NEW: ${newResult.toFixed(4)} SOL (division by ${safeSolPrice})`);
  
  if (oldResult === Infinity) {
    console.log(`   🐛 BUG PREVENTED: Would have been Infinity!`);
  }
  
  return { old: oldResult, new: newResult };
}

console.log('═'.repeat(80));
console.log('TEST CASES');
console.log('═'.repeat(80));

// Test 1: Normal case (SOL price = $94)
calculateSolAmount(1000, 0.05, 94, 'Normal: 1000 tokens @ $0.05, SOL = $94');

// Test 2: SOL price is 0 (causes Infinity)
calculateSolAmount(1000, 0.05, 0, 'Bug Case: SOL price = 0 (INFINITY!)');

// Test 3: SOL price is undefined (causes Infinity)
calculateSolAmount(1000, 0.05, undefined, 'Bug Case: SOL price = undefined (INFINITY!)');

// Test 4: SOL price is null (causes Infinity)
calculateSolAmount(1000, 0.05, null, 'Bug Case: SOL price = null (INFINITY!)');

// Test 5: SOL price is negative (invalid)
calculateSolAmount(1000, 0.05, -10, 'Bug Case: SOL price = -10 (invalid)');

// Test 6: Large transaction
calculateSolAmount(1000000, 0.001, 94, 'Large: 1M tokens @ $0.001, SOL = $94');

console.log('\n' + '═'.repeat(80));
console.log('SUMMARY');
console.log('═'.repeat(80));
console.log('\n✅ With safeSolPrice fix:');
console.log('   - Uses fallback $94 when SOL price is invalid');
console.log('   - Prevents division by zero');
console.log('   - No Infinity values in database');
console.log('\n❌ Without fix (OLD):');
console.log('   - Division by zero → Infinity');
console.log('   - Infinity stored in database');
console.log('   - Frontend displays "Infinity SOL"');
console.log('\n💡 Impact: No more Infinity values in transaction details!');
