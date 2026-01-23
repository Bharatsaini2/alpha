// Test if your running backend has the fix
const axios = require('axios');

async function testLiveBackend() {
  console.log('🧪 Testing if your local backend has the Unknown Token fix\n');
  console.log('='.repeat(80));
  
  // Test token that we know shows as "Unknown" in old code
  const testToken = 'r3fcAzv5NXCPFf2GRPPxEkbAZQJRfaHcR8WQngEpump';
  
  console.log(`\n📝 Test Token: ${testToken}`);
  console.log(`   Expected: Should show "Mr Burns (BURNS)" or contract address`);
  console.log(`   NOT Expected: "Unknown"\n`);
  
  // Check if backend is running
  try {
    const healthCheck = await axios.get('http://localhost:9090/health', { timeout: 3000 });
    console.log('✅ Backend is running!\n');
  } catch (error) {
    console.log('❌ Backend is NOT running on port 9090');
    console.log('   Start it with: cd alpha-tracker-ai/backend && npm start\n');
    return;
  }
  
  // Now test the actual fix by checking logs
  console.log('📊 To confirm the fix is working:\n');
  console.log('1. Watch your backend console/logs');
  console.log('2. Wait for a new transaction with an unknown token');
  console.log('3. Look for these log messages:\n');
  console.log('   🔄 Trying DexScreener fallback for [address]');
  console.log('   ✅ DexScreener found: [symbol] ([name])');
  console.log('   OR');
  console.log('   ⚠️ Using contract address as fallback: [short address]\n');
  
  console.log('='.repeat(80));
  console.log('\n✅ If you see those logs, the fix is working!');
  console.log('❌ If you still see "Unknown" without those logs, the fix is not active\n');
  
  // Alternative: Direct test
  console.log('📌 ALTERNATIVE: Test the function directly:\n');
  console.log('   Run: node test-full-fallback-integration.js\n');
}

testLiveBackend();
