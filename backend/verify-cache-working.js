/**
 * Verify if cache is actually working
 * Check if tokens from recent transactions are in cache
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/test';

async function verifyCacheWorking() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected!\n');

    const db = mongoose.connection.db;
    
    // Get last 20 whale transactions
    const whaleCollection = db.collection('whalealltransactionv2');
    const recentWhale = await whaleCollection
      .find({})
      .sort({ timestamp: -1 })
      .limit(20)
      .toArray();
    
    console.log('🔍 Checking last 20 whale transactions...\n');
    
    // Get cache collection
    const cacheCollection = db.collection('tokenmetadatacache');
    
    // Track unique tokens
    const tokensToCheck = new Set();
    
    recentWhale.forEach(tx => {
      if (tx.tokenInAddress) tokensToCheck.add(tx.tokenInAddress);
      if (tx.tokenOutAddress) tokensToCheck.add(tx.tokenOutAddress);
    });
    
    console.log(`📊 Found ${tokensToCheck.size} unique tokens in last 20 transactions\n`);
    
    let inCache = 0;
    let notInCache = 0;
    
    for (const address of tokensToCheck) {
      const cached = await cacheCollection.findOne({ tokenAddress: address });
      
      // Find transaction with this token
      const tx = recentWhale.find(t => 
        t.tokenInAddress === address || t.tokenOutAddress === address
      );
      
      const symbol = tx.tokenInAddress === address 
        ? (tx.tokenInSymbol || tx.transaction?.tokenIn?.symbol)
        : (tx.tokenOutSymbol || tx.transaction?.tokenOut?.symbol);
      
      if (cached) {
        inCache++;
        console.log(`✅ ${symbol?.padEnd(15) || 'Unknown'.padEnd(15)} | ${address.slice(0, 8)}... | IN CACHE (${cached.source})`);
      } else {
        notInCache++;
        console.log(`❌ ${symbol?.padEnd(15) || 'Unknown'.padEnd(15)} | ${address.slice(0, 8)}... | NOT IN CACHE`);
      }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log(`📊 Summary:`);
    console.log(`   ✅ In cache: ${inCache} (${Math.round(inCache / tokensToCheck.size * 100)}%)`);
    console.log(`   ❌ Not in cache: ${notInCache} (${Math.round(notInCache / tokensToCheck.size * 100)}%)`);
    console.log('='.repeat(70));
    
    if (notInCache > 0) {
      console.log('\n⚠️  WARNING: Cache is NOT working properly!');
      console.log('   Tokens from recent transactions should be cached but are not.');
    } else {
      console.log('\n✅ Cache is working perfectly!');
    }

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

verifyCacheWorking();
