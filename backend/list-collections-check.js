require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGO_URI;
const DB_NAME = 'alpha-whale-tracker';

async function listCollections() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    
    // List all collections
    const collections = await db.listCollections().toArray();
    
    console.log('📊 Collections in database:');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    for (const coll of collections) {
      const count = await db.collection(coll.name).countDocuments();
      console.log(`${coll.name}: ${count} documents`);
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    
    // Now check for transactions in the test window
    const startTime = new Date('2026-02-01T14:28:16.642Z');
    const endTime = new Date('2026-02-01T14:33:16.647Z');
    
    console.log('\n📊 Checking for transactions in test window:');
    console.log(`Start: ${startTime.toISOString()}`);
    console.log(`End: ${endTime.toISOString()}\n`);
    
    for (const coll of collections) {
      if (coll.name.toLowerCase().includes('transaction')) {
        // Try different timestamp field patterns
        const patterns = [
          { timestamp: { $gte: startTime, $lte: endTime } },
          { 'transaction.timestamp': { $gte: startTime, $lte: endTime } },
          { createdAt: { $gte: startTime, $lte: endTime } },
          { updatedAt: { $gte: startTime, $lte: endTime } }
        ];
        
        for (const pattern of patterns) {
          const count = await db.collection(coll.name).countDocuments(pattern);
          if (count > 0) {
            console.log(`✅ ${coll.name} with ${JSON.stringify(pattern)}: ${count} documents`);
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

listCollections();
