const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkDbStructure() {
  console.log('🔍 Checking Database Structure...\n');
  
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  
  // List all databases
  const adminDb = client.db().admin();
  const databases = await adminDb.listDatabases();
  
  console.log('📊 Available Databases:');
  databases.databases.forEach(db => {
    console.log(`  - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
  });
  
  // Check alpha-tracker database
  const db = client.db('alpha-tracker');
  const collections = await db.listCollections().toArray();
  
  console.log('\n📊 Collections in alpha-tracker:');
  for (const collection of collections) {
    const count = await db.collection(collection.name).countDocuments();
    console.log(`  - ${collection.name}: ${count.toLocaleString()} documents`);
  }
  
  // Check whale-tracker database
  const db2 = client.db('whale-tracker');
  try {
    const collections2 = await db2.listCollections().toArray();
    
    console.log('\n📊 Collections in whale-tracker:');
    for (const collection of collections2) {
      const count = await db2.collection(collection.name).countDocuments();
      console.log(`  - ${collection.name}: ${count.toLocaleString()} documents`);
    }
  } catch (error) {
    console.log('\n⚠️  whale-tracker database not found or empty');
  }
  
  // Check alpha-whale-tracker database
  const db3 = client.db('alpha-whale-tracker');
  try {
    const collections3 = await db3.listCollections().toArray();
    
    console.log('\n📊 Collections in alpha-whale-tracker:');
    for (const collection of collections3) {
      const count = await db3.collection(collection.name).countDocuments();
      console.log(`  - ${collection.name}: ${count.toLocaleString()} documents`);
    }
  } catch (error) {
    console.log('\n⚠️  alpha-whale-tracker database not found or empty');
  }
  
  await client.close();
  console.log('\n✅ Database structure check complete!');
}

checkDbStructure().catch(console.error);