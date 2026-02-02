/**
 * List all MongoDB collections
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/test';

async function listCollections() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected!\n');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    console.log(`📊 Total collections: ${collections.length}\n`);
    console.log('Collections containing "whale" or "transaction":');
    
    for (const col of collections) {
      const name = col.name;
      if (name.toLowerCase().includes('whale') || name.toLowerCase().includes('transaction')) {
        const collection = db.collection(name);
        const count = await collection.countDocuments();
        console.log(`  ${name.padEnd(40)} | ${count.toLocaleString().padStart(10)} docs`);
      }
    }

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

listCollections();
