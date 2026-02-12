require('dotenv').config();
const mongoose = require('mongoose');

const TRANSACTION_HASH = '4VfdyPU5UxpSeVfJ3D69d3zFsgFAxiZh9pJywLALaDpw4QJjoBt84s52q3JuVfDjG79PM8VZo3eLQhLP4ED4gJr3';

async function checkAllCollections() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📚 Available collections:');
    collections.forEach(col => console.log(`  - ${col.name}`));
    console.log('');

    // Search in all transaction-related collections
    const transactionCollections = collections
      .filter(col => col.name.toLowerCase().includes('transaction') || col.name.toLowerCase().includes('whale'))
      .map(col => col.name);

    console.log(`🔎 Searching for transaction in ${transactionCollections.length} collections...\n`);

    for (const collectionName of transactionCollections) {
      const Collection = mongoose.connection.db.collection(collectionName);
      
      // Try to find by signature
      const doc = await Collection.findOne({ signature: TRANSACTION_HASH });
      
      if (doc) {
        console.log(`✅ FOUND in collection: ${collectionName}\n`);
        console.log('📄 Full Document:');
        console.log('='.repeat(80));
        console.log(JSON.stringify(doc, null, 2));
        console.log('='.repeat(80));
        return;
      } else {
        const count = await Collection.countDocuments();
        console.log(`❌ Not in ${collectionName} (${count} documents)`);
      }
    }

    console.log('\n⚠️ Transaction not found in any collection');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

checkAllCollections();
