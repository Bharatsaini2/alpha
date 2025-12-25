/**
 * Test Redis connection
 */

const Redis = require('ioredis');
require('dotenv').config();

async function testRedisConnection() {
  console.log('🔍 Testing Redis connection...\n');
  
  // Determine which configuration to use
  const useUrl = !!process.env.REDIS_URL;
  
  if (useUrl) {
    console.log('📡 Using REDIS_URL (cloud Redis)');
    console.log(`   URL: ${process.env.REDIS_URL.replace(/:[^:@]+@/, ':****@')}\n`);
  } else {
    console.log('🏠 Using local Redis configuration');
    console.log(`   Host: ${process.env.REDIS_HOST || 'localhost'}`);
    console.log(`   Port: ${process.env.REDIS_PORT || '6379'}\n`);
  }
  
  let redis;
  
  try {
    // Create Redis client
    if (useUrl) {
      redis = new Redis(process.env.REDIS_URL, {
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 1000, 3000);
        }
      });
    } else {
      redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 1000, 3000);
        }
      });
    }
    
    // Wait for connection
    await new Promise((resolve, reject) => {
      redis.on('ready', resolve);
      redis.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
    
    console.log('✅ Connected to Redis!\n');
    
    // Test basic operations
    console.log('🧪 Testing basic operations...\n');
    
    // SET
    await redis.set('test:key', 'Hello from AlphaBlock AI');
    console.log('   ✅ SET operation successful');
    
    // GET
    const value = await redis.get('test:key');
    console.log(`   ✅ GET operation successful: "${value}"`);
    
    // DELETE
    await redis.del('test:key');
    console.log('   ✅ DEL operation successful');
    
    // Test with expiry
    await redis.setex('test:expiry', 10, 'expires in 10 seconds');
    const ttl = await redis.ttl('test:expiry');
    console.log(`   ✅ SETEX operation successful (TTL: ${ttl}s)`);
    await redis.del('test:expiry');
    
    console.log('\n✅ All Redis operations working correctly!\n');
    
    // Get Redis info
    const info = await redis.info('server');
    const version = info.match(/redis_version:([^\r\n]+)/)?.[1];
    const mode = info.match(/redis_mode:([^\r\n]+)/)?.[1];
    
    console.log('📊 Redis Server Info:');
    console.log(`   Version: ${version || 'unknown'}`);
    console.log(`   Mode: ${mode || 'unknown'}`);
    
    const memory = await redis.info('memory');
    const usedMemory = memory.match(/used_memory_human:([^\r\n]+)/)?.[1];
    console.log(`   Memory: ${usedMemory || 'unknown'}\n`);
    
    console.log('🎉 Redis is ready for production!\n');
    console.log('🚀 You can now start your server:');
    console.log('   npm run dev\n');
    
    await redis.quit();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Redis connection failed!\n');
    console.error('Error:', error.message);
    console.error('\n💡 Troubleshooting:\n');
    
    if (useUrl) {
      console.error('   1. Check your REDIS_URL is correct');
      console.error('   2. Verify your cloud Redis instance is running');
      console.error('   3. Check firewall/security group settings');
      console.error('   4. Ensure TLS/SSL is properly configured\n');
    } else {
      console.error('   1. Make sure Redis is installed and running');
      console.error('   2. Check Redis is listening on the correct port');
      console.error('   3. Verify REDIS_HOST and REDIS_PORT in .env');
      console.error('   4. Try: redis-cli ping (should return PONG)\n');
      
      console.error('📖 Installation guides:\n');
      console.error('   Windows (WSL2): wsl --install, then sudo apt install redis-server');
      console.error('   Windows (Docker): docker run -d -p 6379:6379 redis:alpine');
      console.error('   macOS: brew install redis && brew services start redis');
      console.error('   Linux: sudo apt install redis-server\n');
      
      console.error('☁️  Or use cloud Redis (recommended):');
      console.error('   Upstash: https://upstash.com/ (free tier available)');
      console.error('   Redis Cloud: https://redis.com/try-free/\n');
    }
    
    if (redis) {
      await redis.quit();
    }
    process.exit(1);
  }
}

testRedisConnection();
