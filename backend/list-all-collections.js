#!/usr/bin/env node

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function listCollections() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                         All MongoDB Collections                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  const collections = await mongoose.connection.db.listCollections().toArray();
  
  console.log(`Total collections: ${collections.length}\n`);
  console.log('─'.repeat(80));
  
  // Group collections by type
  const transactionCollections = [];
  const tokenCollections = [];
  const otherCollections = [];
  
  collections.forEach(col => {
    if (col.name.includes('transaction') || col.name.includes('whale')) {
      transactionCollections.push(col.name);
    } else if (col.name.includes('token')) {
      tokenCollections.push(col.name);
    } else {
      otherCollections.push(col.name);
    }
  });
  
  console.log('\n📊 Transaction/Whale Collections:');
  transactionCollections.sort().forEach(name => {
    console.log(`   - ${name}`);
  });
  
  console.log('\n🪙 Token Collections:');
  tokenCollections.sort().forEach(name => {
    console.log(`   - ${name}`);
  });
  
  console.log('\n📁 Other Collections:');
  otherCollections.sort().forEach(name => {
    console.log(`   - ${name}`);
  });
  
  // Check for recent transactions
  console.log('\n─'.repeat(80));
  console.log('\n🔍 Checking for Recent Transactions:\n');
  
  const possibleTransactionCollections = [
    'whalesalltransactionsv2s',
    'whalesalltransactions',
    'whalealltransactions',
    'transactions'
  ];
  
  for (const collName of possibleTransactionCollections) {
    try {
      const coll = mongoose.connection.db.collection(collName);
      const count = await coll.countDocuments();
      
      if (count > 0) {
        console.log(`✅ ${collName}: ${count} documents`);
        
        // Get most recent transaction
        const recent = await coll.findOne({}, { sort: { createdAt: -1 } });
        if (recent && recent.createdAt) {
          const age = (Date.now() - new Date(recent.createdAt).getTime()) / 1000 / 60;
          console.log(`   Latest transaction: ${age.toFixed(1)} minutes ago`);
        }
      }
    } catch (e) {
      // Collection doesn't exist
    }
  }
  
  console.log('\n✅ Done!\n');
  await mongoose.disconnect();
}

listCollections().catch(console.error);
