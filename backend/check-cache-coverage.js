/**
 * Check Cache Coverage - Compare recent transaction tokens with cache
 * Run: node check-cache-coverage.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function checkCacheCoverage() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected!\n');

    const db = mongoose.connection.db;
    const txnCollection = db.collection('whalealltransactionsv2s');
    const cacheCollection = db.collection('tokenmetadatacache');

    // Get recent transactions (last 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    
    console.log('📊 Analyzing recent transactions (last 2 hours)...\n');

    // Get distinct token addresses from recent transactions
    const recentTokensIn = await txnCollection.distinct('tokenInAddress', {
      timestamp: { $gte: twoHoursAgo }
    });
    
    const recentTokensOut = await txnCollection.distinct('tokenOutAddress', {
      timestamp: { $gte: twoHoursAgo }
    });

    // Combine and deduplicate
    const allRecentTokens = [...new Set([...recentTokensIn, ...recentTokensOut])];
    
    console.log(`🔍 Found ${allRecentTokens.length} unique tokens in recent transactions`);
    console.log('');

    // Check which are cached
    const cachedTokens = await cacheCollection.find({
      tokenAddress: { $in: allRecentTokens }
    }).toArray();

    const cachedAddresses = new Set(cachedTokens.map(t => t.tokenAddress));
    const uncachedTokens = allRecentTokens.filter(addr => !cachedAddresses.has(addr));

    console.log(`✅ Cached: ${cachedTokens.length} tokens (${Math.round(cachedTokens.length / allRecentTokens.length * 100)}%)`);
    console.log(`❌ Not cached: ${uncachedTokens.length} tokens (${Math.round(uncachedTokens.length / allRecentTokens.length * 100)}%)`);
    console.log('');

    // Show cached tokens breakdown
    if (cachedTokens.length > 0) {
      console.log('📈 Cached tokens by source:');
      const bySource = {};
      cachedTokens.forEach(t => {
        bySource[t.source] = (bySource[t.source] || 0) + 1;
      });
      Object.entries(bySource).sort((a, b) => b[1] - a[1]).forEach(([source, count]) => {
        console.log(`  ${source}: ${count}`);
      });
      console.log('');

      console.log('📝 Sample cached tokens from recent transactions:');
      cachedTokens.slice(0, 10).forEach(t => {
        console.log(`  ${t.symbol.padEnd(15)} | ${t.source.padEnd(12)} | ${t.tokenAddress.slice(0, 8)}...`);
      });
      console.log('');
    }

    // Show uncached tokens
    if (uncachedTokens.length > 0) {
      console.log('⚠️  Uncached tokens (should be cached soon):');
      
      // Get transaction details for uncached tokens to see their symbols
      const uncachedTxns = await txnCollection.find({
        $or: [
          { tokenInAddress: { $in: uncachedTokens } },
          { tokenOutAddress: { $in: uncachedTokens } }
        ],
        timestamp: { $gte: twoHoursAgo }
      }).sort({ timestamp: -1 }).limit(10).toArray();

      const uncachedSymbols = new Map();
      uncachedTxns.forEach(txn => {
        if (uncachedTokens.includes(txn.tokenInAddress)) {
          uncachedSymbols.set(txn.tokenInAddress, txn.tokenInSymbol || 'Unknown');
        }
        if (uncachedTokens.includes(txn.tokenOutAddress)) {
          uncachedSymbols.set(txn.tokenOutAddress, txn.tokenOutSymbol || 'Unknown');
        }
      });

      uncachedTokens.slice(0, 10).forEach(addr => {
        const symbol = uncachedSymbols.get(addr) || 'Unknown';
        console.log(`  ${symbol.padEnd(15)} | ${addr.slice(0, 8)}...`);
      });
      
      if (uncachedTokens.length > 10) {
        console.log(`  ... and ${uncachedTokens.length - 10} more`);
      }
      console.log('');
    }

    // Check total cache size
    const totalCached = await cacheCollection.countDocuments();
    console.log(`💾 Total cache size: ${totalCached} tokens`);
    console.log('');

    // Recent transaction count
    const recentTxnCount = await txnCollection.countDocuments({
      timestamp: { $gte: twoHoursAgo }
    });
    console.log(`📈 Recent transactions: ${recentTxnCount} in last 2 hours`);

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkCacheCoverage();
