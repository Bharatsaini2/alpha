/**
 * List all collections in the database
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function listCollections() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    console.log('📊 Collections in database:');
    console.log('='.repeat(80));
    
    for (const collection of collections) {
      const count = await db.collection(collection.name).countDocuments();
      console.log(`\n📁 ${collection.name}`);
      console.log(`   Documents: ${count}`);
      
      if (count > 0) {
        // Get a sample document
        const sample = await db.collection(collection.name).findOne();
        console.log(`   Sample keys: ${Object.keys(sample).slice(0, 10).join(', ')}`);
      }
    }

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

listCollections();
