/**
 * Database Index Verification Script
 * 
 * Verifies that all required indexes are created for the PlatformTrade model
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI not set in environment variables');
  process.exit(1);
}

async function verifyIndexes() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Database Index Verification');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get PlatformTrade collection
    const db = mongoose.connection.db;
    const collection = db.collection('platformtrades');

    // Check if collection exists
    const collections = await db.listCollections({ name: 'platformtrades' }).toArray();
    
    if (collections.length === 0) {
      console.log('⚠️  PlatformTrade collection does not exist yet');
      console.log('   This is normal if no trades have been tracked yet\n');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Get indexes
    console.log('📊 Checking indexes on PlatformTrade collection...\n');
    const indexes = await collection.indexes();

    console.log('Found indexes:');
    indexes.forEach((index, i) => {
      console.log(`\n${i + 1}. ${index.name}`);
      console.log(`   Keys: ${JSON.stringify(index.key)}`);
      if (index.unique) {
        console.log(`   Unique: true`);
      }
    });

    // Verify required indexes
    console.log('\n🔍 Verifying required indexes...\n');

    const requiredIndexes = [
      { name: 'signature', key: { signature: 1 }, unique: true },
      { name: 'walletAddress', key: { walletAddress: 1 } },
      { name: 'timestamp', key: { timestamp: 1 } },
      { name: 'compound', key: { walletAddress: 1, timestamp: -1 } },
    ];

    let allIndexesPresent = true;

    for (const required of requiredIndexes) {
      const found = indexes.find(idx => {
        const keyMatch = JSON.stringify(idx.key) === JSON.stringify(required.key);
        const uniqueMatch = required.unique ? idx.unique === true : true;
        return keyMatch && uniqueMatch;
      });

      if (found) {
        console.log(`✅ ${required.name} index: PRESENT`);
      } else {
        console.log(`❌ ${required.name} index: MISSING`);
        allIndexesPresent = false;
      }
    }

    console.log('\n═══════════════════════════════════════════════════════');
    if (allIndexesPresent) {
      console.log('  ✅ ALL REQUIRED INDEXES ARE PRESENT');
    } else {
      console.log('  ⚠️  SOME INDEXES ARE MISSING');
      console.log('     Indexes will be created automatically when the');
      console.log('     server starts and the model is initialized');
    }
    console.log('═══════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

verifyIndexes();
