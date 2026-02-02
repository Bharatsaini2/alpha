// Debug token resolution to see what's happening
const { MongoClient } = require('mongodb');

// Server MongoDB URI from .env
const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function debugTokenResolution() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    console.log('🔗 Connecting to server MongoDB...');
    await client.connect();
    console.log('✅ Connected to server MongoDB');
    
    const db = client.db();
    
    // Get some recent whale transactions to see what tokens are being processed
    const whaleCollection = db.collection('whalealltransactionv2');
    const recentWhales = await whaleCollection.find({})
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray();
    
    console.log('\n🐋 Recent whale transactions:');
    recentWhales.forEach((tx, i) => {
      console.log(`\n${i+1}. Transaction: ${tx.signature?.slice(0, 8)}...`);
      console.log(`   TokenIn: ${tx.tokenInAddress} -> ${tx.tokenInSymbol || 'Unknown'}`);
      console.log(`   TokenOut: ${tx.tokenOutAddress} -> ${tx.tokenOutSymbol || 'Unknown'}`);
      console.log(`   Created: ${tx.createdAt}`);
    });
    
    // Check if there are any failed resolution entries
    console.log('\n🔍 Checking for failed resolution tracking...');
    const collections = await db.listCollections().toArray();
    const failedCollections = collections.filter(c => 
      c.name.toLowerCase().includes('failed') || 
      c.name.toLowerCase().includes('resolution')
    );
    
    if (failedCollections.length > 0) {
      for (const coll of failedCollections) {
        const count = await db.collection(coll.name).countDocuments();
        console.log(`   ${coll.name}: ${count} entries`);
        
        if (count > 0) {
          const samples = await db.collection(coll.name).find({}).limit(3).toArray();
          samples.forEach(sample => {
            console.log(`     - ${JSON.stringify(sample).substring(0, 100)}...`);
          });
        }
      }
    } else {
      console.log('   No failed resolution collections found');
    }
    
    // Check the actual cache collection structure
    console.log('\n🔍 Checking tokenmetadatacache structure...');
    const cacheCollection = db.collection('tokenmetadatacache');
    
    // Try to find any documents at all
    const anyCacheDoc = await cacheCollection.findOne({});
    if (anyCacheDoc) {
      console.log('   Sample cache document structure:');
      console.log(`   ${JSON.stringify(anyCacheDoc, null, 2)}`);
    } else {
      console.log('   ❌ No documents found in tokenmetadatacache');
      
      // Check if there's a different cache collection name
      const allCollections = await db.listCollections().toArray();
      console.log('\n📋 All collections containing "token" or "cache":');
      allCollections
        .filter(c => c.name.toLowerCase().includes('token') || c.name.toLowerCase().includes('cache'))
        .forEach(c => console.log(`   - ${c.name}`));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

debugTokenResolution();