// Check the tokendatas collection for recent token metadata
const { MongoClient } = require('mongodb');

// Server MongoDB URI from .env
const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function checkTokenDatasDetails() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    console.log('🔗 Connecting to server MongoDB...');
    await client.connect();
    console.log('✅ Connected to server MongoDB');
    
    const db = client.db();
    const collection = db.collection('tokendatas');
    
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    // Get recent entries with full details
    console.log('🆕 Recent token entries (last hour):');
    const recentTokens = await collection.find({
      createdAt: { $gte: oneHourAgo }
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();
    
    console.log(`Found ${recentTokens.length} recent tokens:`);
    
    recentTokens.forEach((token, i) => {
      const timeAgo = Math.round((Date.now() - new Date(token.createdAt).getTime()) / (1000 * 60));
      console.log(`\n${i+1}. Token Address: ${token.tokenAddress}`);
      console.log(`   Created: ${timeAgo} minutes ago`);
      
      // Check what fields this token has
      const fields = Object.keys(token);
      console.log(`   Fields: ${fields.join(', ')}`);
      
      // Show relevant metadata if available
      if (token.symbol) console.log(`   Symbol: ${token.symbol}`);
      if (token.name) console.log(`   Name: ${token.name}`);
      if (token.imageUrl) console.log(`   Image: ${token.imageUrl ? 'Yes' : 'No'}`);
      if (token.price) console.log(`   Price: $${token.price}`);
      if (token.marketCap) console.log(`   Market Cap: $${token.marketCap}`);
    });
    
    // Check if there's a separate metadata cache collection that might be named differently
    console.log('\n🔍 Checking for other possible cache collections...');
    const collections = await db.listCollections().toArray();
    const cacheCollections = collections.filter(c => 
      c.name.toLowerCase().includes('cache') || 
      c.name.toLowerCase().includes('metadata')
    );
    
    for (const coll of cacheCollections) {
      const count = await db.collection(coll.name).countDocuments();
      const recentCount = await db.collection(coll.name).countDocuments({
        $or: [
          { createdAt: { $gte: oneHourAgo } },
          { lastUpdated: { $gte: oneHourAgo } }
        ]
      });
      console.log(`   ${coll.name}: ${count} total, ${recentCount} recent`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

checkTokenDatasDetails();