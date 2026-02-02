// Clear Server Cache from Local Machine
const { MongoClient } = require('mongodb');

// Server MongoDB URI from .env
const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function clearServerCache() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    console.log('🔗 Connecting to server MongoDB...');
    await client.connect();
    console.log('✅ Connected to server MongoDB');
    
    const db = client.db();
    const collection = db.collection('tokenmetadatacaches');
    
    // Get count before deletion
    const countBefore = await collection.countDocuments();
    console.log(`📊 Found ${countBefore} cache entries`);
    
    if (countBefore === 0) {
      console.log('✅ Cache is already empty');
      return;
    }
    
    // Clear ALL cache entries
    const result = await collection.deleteMany({});
    
    console.log(`🗑️  Cleared ${result.deletedCount} cache entries from server`);
    console.log('✅ Server cache completely cleared!');
    console.log('🚀 Fresh token metadata will be fetched and cached properly now');
    
  } catch (error) {
    console.error('❌ Error clearing server cache:', error.message);
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

clearServerCache();