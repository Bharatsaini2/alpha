// Clear the correct cache collection from server
const { MongoClient } = require('mongodb');

// Server MongoDB URI from .env
const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function clearCorrectCache() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    console.log('🔗 Connecting to server MongoDB...');
    await client.connect();
    console.log('✅ Connected to server MongoDB');
    
    const db = client.db();
    const collection = db.collection('tokenmetadatacache'); // Correct collection name (singular)
    
    // Get count before deletion
    const countBefore = await collection.countDocuments();
    console.log(`📊 Found ${countBefore} cache entries in 'tokenmetadatacache'`);
    
    if (countBefore === 0) {
      console.log('✅ Cache is already empty');
      return;
    }
    
    // Show a few sample entries before clearing
    console.log('\n🔍 Sample cache entries to be cleared:');
    const samples = await collection.find({}).limit(3).toArray();
    samples.forEach((sample, i) => {
      console.log(`  ${i+1}. ${sample.tokenAddress} -> ${sample.symbol} (${sample.source})`);
    });
    
    // Clear ALL cache entries
    const result = await collection.deleteMany({});
    
    console.log(`\n🗑️  Cleared ${result.deletedCount} cache entries from server`);
    console.log('✅ Server token metadata cache completely cleared!');
    console.log('🚀 Fresh token metadata will be fetched and cached properly now');
    
  } catch (error) {
    console.error('❌ Error clearing server cache:', error.message);
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

clearCorrectCache();