// Check what collections exist in the server database
const { MongoClient } = require('mongodb');

// Server MongoDB URI from .env
const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function checkCollections() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    console.log('🔗 Connecting to server MongoDB...');
    await client.connect();
    console.log('✅ Connected to server MongoDB');
    
    const db = client.db();
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('\n📋 Available collections:');
    
    for (const collection of collections) {
      const count = await db.collection(collection.name).countDocuments();
      console.log(`  - ${collection.name}: ${count} documents`);
    }
    
    // Check specifically for token-related collections
    const tokenCollections = collections.filter(c => 
      c.name.toLowerCase().includes('token') || 
      c.name.toLowerCase().includes('cache') ||
      c.name.toLowerCase().includes('metadata')
    );
    
    if (tokenCollections.length > 0) {
      console.log('\n🎯 Token-related collections:');
      for (const collection of tokenCollections) {
        const count = await db.collection(collection.name).countDocuments();
        console.log(`  - ${collection.name}: ${count} documents`);
        
        if (count > 0) {
          // Show a sample document
          const sample = await db.collection(collection.name).findOne();
          console.log(`    Sample: ${JSON.stringify(sample, null, 2).substring(0, 200)}...`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

checkCollections();