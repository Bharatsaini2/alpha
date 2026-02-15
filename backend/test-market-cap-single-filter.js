/**
 * Market Cap Filter Test - Single Filter Scenarios
 * Tests what happens when only MIN or only MAX is set
 */

// Test the market cap filtering logic
function testMarketCapFilter(tokenMarketCap, minMarketCapUSD, maxMarketCapUSD) {
  // If no filter is set, accept all
  if (minMarketCapUSD === undefined && maxMarketCapUSD === undefined) {
    return true;
  }

  const marketCap = parseFloat(tokenMarketCap || '0');

  // Check minimum market cap
  if (minMarketCapUSD !== undefined && marketCap < minMarketCapUSD) {
    return false;
  }

  // Check maximum market cap (50M+ means no upper limit)
  if (maxMarketCapUSD !== undefined && maxMarketCapUSD < 50000000) {
    if (marketCap > maxMarketCapUSD) {
      return false;
    }
  }
  // If maxMarketCapUSD >= 50M, accept all (no upper limit)

  return true;
}

function formatMarketCap(value) {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value}`;
}

console.log('\n');
console.log('╔═══════════════════════════════════════════════════════╗');
console.log('║   MARKET CAP FILTER - SINGLE FILTER TEST              ║');
console.log('╚═══════════════════════════════════════════════════════╝');
console.log('\n');

let totalPassed = 0;
let totalFailed = 0;

// Test tokens
const testTokens = [
  { name: '500 USD (below 1K)', marketCap: 500 },
  { name: '5K USD', marketCap: 5000 },
  { name: '100K USD', marketCap: 100000 },
  { name: '1M USD', marketCap: 1000000 },
  { name: '10M USD', marketCap: 10000000 },
  { name: '100M USD', marketCap: 100000000 },
];

// ============================================================
// SCENARIO 1: Only MIN is set (no MAX)
// ============================================================
console.log('═══════════════════════════════════════════════════════');
console.log('SCENARIO 1: Only MIN is set (min=100K, max=undefined)');
console.log('Expected: Accept all tokens >= 100K, reject below 100K');
console.log('═══════════════════════════════════════════════════════\n');

const minOnly = 100000;
const maxUndefined = undefined;

for (const token of testTokens) {
  const result = testMarketCapFilter(token.marketCap.toString(), minOnly, maxUndefined);
  const expected = token.marketCap >= minOnly;
  const status = result === expected ? '✅ PASS' : '❌ FAIL';
  
  if (result === expected) {
    totalPassed++;
  } else {
    totalFailed++;
  }
  
  console.log(`  ${status} | ${formatMarketCap(token.marketCap).padEnd(10)} | Expected: ${expected ? 'ACCEPT' : 'REJECT'} | Got: ${result ? 'ACCEPT' : 'REJECT'}`);
}

// ============================================================
// SCENARIO 2: Only MAX is set (no MIN)
// ============================================================
console.log('\n═══════════════════════════════════════════════════════');
console.log('SCENARIO 2: Only MAX is set (min=undefined, max=10M)');
console.log('Expected: Accept all tokens <= 10M, reject above 10M');
console.log('═══════════════════════════════════════════════════════\n');

const minUndefined = undefined;
const maxOnly = 10000000;

for (const token of testTokens) {
  const result = testMarketCapFilter(token.marketCap.toString(), minUndefined, maxOnly);
  const expected = token.marketCap <= maxOnly;
  const status = result === expected ? '✅ PASS' : '❌ FAIL';
  
  if (result === expected) {
    totalPassed++;
  } else {
    totalFailed++;
  }
  
  console.log(`  ${status} | ${formatMarketCap(token.marketCap).padEnd(10)} | Expected: ${expected ? 'ACCEPT' : 'REJECT'} | Got: ${result ? 'ACCEPT' : 'REJECT'}`);
}

// ============================================================
// SCENARIO 3: Only MAX is set to 50M+ (unlimited)
// ============================================================
console.log('\n═══════════════════════════════════════════════════════');
console.log('SCENARIO 3: Only MAX is set to 50M+ (min=undefined, max=50M)');
console.log('Expected: Accept ALL tokens (50M+ means unlimited)');
console.log('═══════════════════════════════════════════════════════\n');

const maxUnlimited = 50000000;

for (const token of testTokens) {
  const result = testMarketCapFilter(token.marketCap.toString(), minUndefined, maxUnlimited);
  const expected = true; // Should accept all when max is 50M+
  const status = result === expected ? '✅ PASS' : '❌ FAIL';
  
  if (result === expected) {
    totalPassed++;
  } else {
    totalFailed++;
  }
  
  console.log(`  ${status} | ${formatMarketCap(token.marketCap).padEnd(10)} | Expected: ${expected ? 'ACCEPT' : 'REJECT'} | Got: ${result ? 'ACCEPT' : 'REJECT'}`);
}

// ============================================================
// SCENARIO 4: Both MIN and MAX set
// ============================================================
console.log('\n═══════════════════════════════════════════════════════');
console.log('SCENARIO 4: Both set (min=100K, max=10M)');
console.log('Expected: Accept only tokens between 100K and 10M');
console.log('═══════════════════════════════════════════════════════\n');

const minBoth = 100000;
const maxBoth = 10000000;

for (const token of testTokens) {
  const result = testMarketCapFilter(token.marketCap.toString(), minBoth, maxBoth);
  const expected = token.marketCap >= minBoth && token.marketCap <= maxBoth;
  const status = result === expected ? '✅ PASS' : '❌ FAIL';
  
  if (result === expected) {
    totalPassed++;
  } else {
    totalFailed++;
  }
  
  console.log(`  ${status} | ${formatMarketCap(token.marketCap).padEnd(10)} | Expected: ${expected ? 'ACCEPT' : 'REJECT'} | Got: ${result ? 'ACCEPT' : 'REJECT'}`);
}

// ============================================================
// SCENARIO 5: Neither set (both undefined)
// ============================================================
console.log('\n═══════════════════════════════════════════════════════');
console.log('SCENARIO 5: Neither set (min=undefined, max=undefined)');
console.log('Expected: Accept ALL tokens (no filtering)');
console.log('═══════════════════════════════════════════════════════\n');

for (const token of testTokens) {
  const result = testMarketCapFilter(token.marketCap.toString(), undefined, undefined);
  const expected = true; // Should accept all when no filter
  const status = result === expected ? '✅ PASS' : '❌ FAIL';
  
  if (result === expected) {
    totalPassed++;
  } else {
    totalFailed++;
  }
  
  console.log(`  ${status} | ${formatMarketCap(token.marketCap).padEnd(10)} | Expected: ${expected ? 'ACCEPT' : 'REJECT'} | Got: ${result ? 'ACCEPT' : 'REJECT'}`);
}

// ============================================================
// SUMMARY
// ============================================================
const totalTests = totalPassed + totalFailed;

console.log('\n\n╔═══════════════════════════════════════════════════════╗');
console.log('║                    FINAL SUMMARY                      ║');
console.log('╚═══════════════════════════════════════════════════════╝\n');
console.log(`  Total Tests:  ${totalTests}`);
console.log(`  ✅ Passed:     ${totalPassed}`);
console.log(`  ❌ Failed:     ${totalFailed}`);
console.log(`  Success Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);
console.log('\n');

if (totalFailed === 0) {
  console.log('🎉 ALL TESTS PASSED! Single filter logic works correctly.\n');
  console.log('✅ CONFIRMED: You can set ONLY min, ONLY max, or BOTH!\n');
} else {
  console.log('⚠️  SOME TESTS FAILED. Please review the results above.\n');
}

process.exit(totalFailed === 0 ? 0 : 1);
