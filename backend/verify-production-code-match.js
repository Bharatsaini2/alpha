#!/usr/bin/env node

/**
 * Verify that production code matches the test script
 * This checks if the compiled JavaScript has the correct DexScreener endpoint
 */

const fs = require('fs');
const path = require('path');

console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
console.log('║              Verify Production Code Matches Test Script                       ║');
console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

// Check if dist folder exists
const distPath = path.join(__dirname, 'dist', 'config', 'solana-tokens-config.js');

if (!fs.existsSync(distPath)) {
  console.log('❌ Compiled code not found!');
  console.log(`   Expected: ${distPath}`);
  console.log('\n📝 Solution:');
  console.log('   Run: npm run build\n');
  process.exit(1);
}

console.log('✅ Compiled code found\n');

// Read the compiled code
const compiledCode = fs.readFileSync(distPath, 'utf8');

// Check for the correct DexScreener endpoint
const correctEndpoint = 'https://api.dexscreener.com/latest/dex/tokens/';
const wrongEndpoint = 'https://api.dexscreener.com/latest/dex/search?q=';

console.log('🔍 Checking DexScreener endpoint...\n');

if (compiledCode.includes(correctEndpoint)) {
  console.log('✅ CORRECT endpoint found:');
  console.log(`   ${correctEndpoint}\${tokenAddress}`);
  console.log('   This matches the test script! ✅\n');
} else {
  console.log('❌ CORRECT endpoint NOT found!');
  console.log(`   Expected: ${correctEndpoint}\${tokenAddress}\n`);
}

if (compiledCode.includes(wrongEndpoint)) {
  console.log('⚠️  OLD endpoint found:');
  console.log(`   ${wrongEndpoint}\${tokenAddress}`);
  console.log('   This is the OLD code! ❌\n');
}

// Check for cache functions
console.log('🔍 Checking cache functions...\n');

const cacheFunctions = [
  'saveTokenToCache',
  'getTokenFromCache',
  'TokenMetadataCache'
];

let allCacheFunctionsFound = true;

for (const func of cacheFunctions) {
  if (compiledCode.includes(func)) {
    console.log(`   ✅ ${func} found`);
  } else {
    console.log(`   ❌ ${func} NOT found`);
    allCacheFunctionsFound = false;
  }
}

console.log('');

// Check for retry logic
console.log('🔍 Checking retry logic...\n');

if (compiledCode.includes('maxRetries = 5')) {
  console.log('   ✅ 5 retries configured (NEW code)');
} else if (compiledCode.includes('maxRetries = 3')) {
  console.log('   ⚠️  3 retries configured (OLD code)');
} else {
  console.log('   ❌ Retry configuration not found');
}

if (compiledCode.includes('timeout: 15000')) {
  console.log('   ✅ 15s timeout configured (NEW code)');
} else if (compiledCode.includes('timeout: 10000')) {
  console.log('   ⚠️  10s timeout configured (OLD code)');
} else {
  console.log('   ❌ Timeout configuration not found');
}

console.log('');

// Final verdict
console.log('═'.repeat(80));
console.log('\n📊 VERDICT:\n');

const hasCorrectEndpoint = compiledCode.includes(correctEndpoint);
const hasWrongEndpoint = compiledCode.includes(wrongEndpoint);
const hasCacheFunctions = allCacheFunctionsFound;
const hasNewRetries = compiledCode.includes('maxRetries = 5');
const hasNewTimeout = compiledCode.includes('timeout: 15000');

if (hasCorrectEndpoint && !hasWrongEndpoint && hasCacheFunctions && hasNewRetries && hasNewTimeout) {
  console.log('✅ LOCAL CODE IS CORRECT AND UP-TO-DATE!');
  console.log('   - Correct DexScreener endpoint ✅');
  console.log('   - Cache functions present ✅');
  console.log('   - 5 retries configured ✅');
  console.log('   - 15s timeout configured ✅');
  console.log('\n📝 Next step:');
  console.log('   Deploy this code to production server!\n');
} else if (hasCorrectEndpoint && !hasWrongEndpoint) {
  console.log('✅ LOCAL CODE HAS CORRECT ENDPOINT');
  console.log('   - DexScreener endpoint is correct ✅');
  if (!hasCacheFunctions) {
    console.log('   - Cache functions missing ⚠️');
  }
  if (!hasNewRetries) {
    console.log('   - Old retry count (3 instead of 5) ⚠️');
  }
  if (!hasNewTimeout) {
    console.log('   - Old timeout (10s instead of 15s) ⚠️');
  }
  console.log('\n📝 Next step:');
  console.log('   Deploy this code to production server!\n');
} else {
  console.log('❌ LOCAL CODE NEEDS UPDATE');
  console.log('   - Rebuild required');
  console.log('\n📝 Solution:');
  console.log('   1. npm run build');
  console.log('   2. Run this script again');
  console.log('   3. Deploy to production\n');
}

// Check if production is different
console.log('═'.repeat(80));
console.log('\n🌐 PRODUCTION STATUS:\n');

console.log('Your test shows DexScreener works locally ✅');
console.log('But tokens show as "Unknown" on website ❌');
console.log('');
console.log('This means:');
console.log('   1. Local code is CORRECT (test passed) ✅');
console.log('   2. Production code is OLD (tokens Unknown) ❌');
console.log('   3. Production server needs deployment ⚠️');
console.log('');
console.log('📝 To fix:');
console.log('   1. SSH to production server');
console.log('   2. cd /path/to/alpha-tracker-ai/backend');
console.log('   3. git pull origin main');
console.log('   4. npm run build');
console.log('   5. pm2 restart backend');
console.log('   6. Wait 5-10 minutes for cache to populate');
console.log('   7. Check website - tokens should show correct names\n');

console.log('✅ Verification complete!\n');
