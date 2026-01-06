/**
 * Diagnostic script to check Redis and Solana RPC connectivity
 * Run: node diagnose-connections.js
 */

const redis = require('redis');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

// Test wallet address
const TEST_WALLET = '4BBLd5aEoV9qbpKBzeTMFyfLpycmKRbSKQWAe4ZpPBUs';

// Solana RPC URL from .env
const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=ec5b648c-8b02-4fe8-a8c9-b43c9efacb18';

async function checkRedis() {
  console.log('\n🔍 Checking Redis Connection...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const client = redis.createClient({
    host: 'localhost',
    port: 6379,
  });

  return new Promise((resolve) => {
    client.on('error', (err) => {
      console.log('❌ Redis Connection FAILED');
      console.log(`Error: ${err.message}\n`);
      console.log('💡 Fix: Make sure Redis is running');
      console.log('   Windows: Download from https://github.com/microsoftarchive/redis/releases');
      console.log('   Or use Docker: docker run -d -p 6379:6379 redis\n');
      client.quit();
      resolve(false);
    });

    client.on('ready', async () => {
      console.log('✅ Redis Connection SUCCESSFUL');
      
      // Test ping
      client.ping((err, reply) => {
        if (err) {
          console.log(`❌ Redis Ping FAILED: ${err.message}\n`);
          client.quit();
          resolve(false);
        } else {
          console.log(`✅ Redis Ping: ${reply}`);
          console.log('✅ Redis is working properly\n');
          client.quit();
          resolve(true);
        }
      });
    });
  });
}

async function checkSolanaRPC() {
  console.log('🔍 Checking Solana RPC Connection...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`RPC URL: ${RPC_URL}\n`);
  
  try {
    const connection = new Connection(RPC_URL, 'confirmed');
    
    // Test 1: Get version
    console.log('Test 1: Getting Solana version...');
    const version = await connection.getVersion();
    console.log(`✅ Solana Version: ${version['solana-core']}\n`);
    
    // Test 2: Get slot
    console.log('Test 2: Getting current slot...');
    const slot = await connection.getSlot();
    console.log(`✅ Current Slot: ${slot}\n`);
    
    // Test 3: Get balance for test wallet
    console.log(`Test 3: Getting balance for wallet: ${TEST_WALLET}...`);
    const publicKey = new PublicKey(TEST_WALLET);
    const balance = await connection.getBalance(publicKey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;
    console.log(`✅ Balance: ${balanceSOL} SOL\n`);
    
    // Check premium access threshold
    const PREMIUM_THRESHOLD = 0.0006;
    if (balanceSOL >= PREMIUM_THRESHOLD) {
      console.log(`✅ Premium Access: YES (${balanceSOL} >= ${PREMIUM_THRESHOLD} SOL)\n`);
    } else {
      console.log(`❌ Premium Access: NO (${balanceSOL} < ${PREMIUM_THRESHOLD} SOL)`);
      console.log(`   Need ${(PREMIUM_THRESHOLD - balanceSOL).toFixed(6)} more SOL\n`);
    }
    
    console.log('✅ Solana RPC is working properly\n');
    return true;
  } catch (error) {
    console.log('❌ Solana RPC Connection FAILED');
    console.log(`Error: ${error.message}\n`);
    console.log('💡 Possible causes:');
    console.log('   - Invalid API key');
    console.log('   - Network connectivity issues');
    console.log('   - RPC endpoint is down\n');
    return false;
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  Connection Diagnostics Tool          ║');
  console.log('╚════════════════════════════════════════╝');
  
  const redisOk = await checkRedis();
  const solanaOk = await checkSolanaRPC();
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`Redis:       ${redisOk ? '✅ OK' : '❌ FAILED'}`);
  console.log(`Solana RPC:  ${solanaOk ? '✅ OK' : '❌ FAILED'}\n`);
  
  if (redisOk && solanaOk) {
    console.log('✅ All connections are working!');
    console.log('   Premium access checks should work properly.\n');
  } else {
    console.log('⚠️  Some connections failed!');
    console.log('   Premium access checks may not work.\n');
  }
  
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
