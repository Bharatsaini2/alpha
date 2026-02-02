/**
 * Check Token Metadata Cache Statistics
 * Run: node check-cache-stats.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'your-mongodb-uri';

async function checkCacheStats() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected!\n');

    const db = mongoose.connection.db;
    const collection = db.collection('tokenmetadatacache');

    // Total count
    const totalCount = await collection.countDocuments();
    console.log(`📊 Total cached tokens: ${totalCount.toLocaleString()}`);
    console.log('');

    // Count by source
    console.log('📈 Tokens by source:');
    const bySource = await collection.aggregate([
      {
        $group: {
          _id: '$source',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    bySource.forEach(item => {
      console.log(`  ${item._id}: ${item.count.toLocaleString()}`);
    });
    console.log('');

    // Recent additions
    console.log('🕐 Recent cache additions (last 10):');
    const recent = await collection
      .find({})
      .sort({ lastUpdated: -1 })
      .limit(10)
      .toArray();

    recent.forEach(token => {
      const age = Math.floor((Date.now() - new Date(token.lastUpdated).getTime()) / 1000);
      const ageStr = age < 60 ? `${age}s ago` : `${Math.floor(age / 60)}m ago`;
      console.log(`  ${token.symbol.padEnd(15)} | ${token.source.padEnd(12)} | ${ageStr}`);
    });
    console.log('');

    // Check for "Unknown" tokens (shouldn't be cached)
    const unknownCount = await collection.countDocuments({ symbol: 'Unknown' });
    if (unknownCount > 0) {
      console.log(`⚠️  WARNING: ${unknownCount} tokens with "Unknown" symbol in cache (should be 0)`);
    } else {
      console.log('✅ No "Unknown" tokens in cache (good!)');
    }
    console.log('');

    // Sample tokens
    console.log('📝 Sample cached tokens:');
    const samples = await collection.find({}).limit(5).toArray();
    samples.forEach(token => {
      console.log(`  ${token.tokenAddress.slice(0, 8)}... → ${token.symbol} (${token.name}) [${token.source}]`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkCacheStats();
