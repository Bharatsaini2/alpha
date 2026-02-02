// Check how many tokens have been saved since cache cleanup
const { MongoClient } = require('mongodb');

// Server MongoDB URI from .env
const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function checkNewTokens() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    console.log('🔗 Connecting to server MongoDB...');
    await client.connect();
    console.log('✅ Connected to server MongoDB');
    
    const db = client.db();
    const collection = db.collection('tokenmetadatacache');
    
    // Get current count
    const currentCount = await collection.countDocuments();
    console.log(`📊 Current cache entries: ${currentCount}`);
    
    if (currentCount === 0) {
      console.log('⚠️  No tokens cached yet - system might still be processing');
      return;
    }
    
    // Get recent entries (last 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const recentCount = await collection.countDocuments({
      createdAt: { $gte: twoHoursAgo }
    });
    
    console.log(`🆕 New tokens cached in last 2 hours: ${recentCount}`);
    
    // Show sample of recent tokens
    console.log('\n🔍 Sample of recently cached tokens:');
    const samples = await collection.find({
      createdAt: { $gte: twoHoursAgo }
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();
    
    samples.forEach((token, i) => {
      const timeAgo = Math.round((Date.now() - new Date(token.createdAt).getTime()) / (1000 * 60));
      console.log(`  ${i+1}. ${token.symbol} (${token.name}) - ${token.source} - ${timeAgo}min ago`);
    });
    
    // Check sources breakdown
    console.log('\n📈 Sources breakdown:');
    const sources = await collection.aggregate([
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();
    
    sources.forEach(source => {
      console.log(`  - ${source._id}: ${source.count} tokens`);
    });
    
    // Check for any remaining garbage
    console.log('\n🔍 Checking for any remaining garbage symbols...');
    const garbagePatterns = [
      /^[A-Za-z0-9]{3,4}\.\.\.[A-Za-z0-9]{3,4}$/,
      /^Unknown$/i,
      /^localhost$/i,
      /^pump$/i
    ];
    
    let garbageFound = 0;
    for (const pattern of garbagePatterns) {
      const count = await collection.countDocuments({
        symbol: { $regex: pattern }
      });
      if (count > 0) {
        console.log(`  ⚠️  Found ${count} entries matching garbage pattern: ${pattern}`);
        garbageFound += count;
      }
    }
    
    if (garbageFound === 0) {
      console.log('  ✅ No garbage symbols found - validation is working!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

checkNewTokens();