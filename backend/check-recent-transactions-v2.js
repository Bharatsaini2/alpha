#!/usr/bin/env node

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function checkTransactions() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                  Recent Transactions Check (V2 Collection)                     ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  const coll = mongoose.connection.db.collection('whalealltransactionsv2');
  
  // Count total
  const total = await coll.countDocuments();
  console.log(`📊 Total transactions in whalealltransactionsv2: ${total}\n`);

  // Get most recent
  const recent = await coll.find({}).sort({ createdAt: -1 }).limit(10).toArray();
  
  if (recent.length === 0) {
    console.log('❌ No transactions found in whalealltransactionsv2!');
    await mongoose.disconnect();
    return;
  }

  console.log('📝 Last 10 Transactions:\n');
  
  recent.forEach((tx, i) => {
    const age = tx.createdAt ? (Date.now() - new Date(tx.createdAt).getTime()) / 1000 / 60 : null;
    console.log(`${i + 1}. ${tx.signature?.substring(0, 20)}...`);
    console.log(`   Token In: ${tx.tokenInSymbol || 'Unknown'}`);
    console.log(`   Token Out: ${tx.tokenOutSymbol || 'Unknown'}`);
    console.log(`   Created: ${tx.createdAt || 'N/A'}`);
    if (age !== null) {
      console.log(`   Age: ${age.toFixed(1)} minutes ago`);
    }
    console.log('');
  });

  // Check for "Unknown" tokens
  const unknownCount = await coll.countDocuments({
    $or: [
      { tokenInSymbol: 'Unknown' },
      { tokenOutSymbol: 'Unknown' }
    ]
  });

  console.log('─'.repeat(80));
  console.log(`\n⚠️  Transactions with "Unknown" tokens: ${unknownCount} out of ${total}`);
  console.log(`   That's ${((unknownCount / total) * 100).toFixed(1)}% of all transactions\n`);

  // Check if transactions are recent
  const latestTx = recent[0];
  if (latestTx && latestTx.createdAt) {
    const ageMinutes = (Date.now() - new Date(latestTx.createdAt).getTime()) / 1000 / 60;
    
    if (ageMinutes < 5) {
      console.log('✅ Transactions are RECENT (< 5 minutes old)');
      console.log('   Backend is processing new transactions!');
    } else if (ageMinutes < 60) {
      console.log(`⚠️  Latest transaction is ${ageMinutes.toFixed(1)} minutes old`);
      console.log('   Backend might be slow or having issues');
    } else {
      console.log(`❌ Latest transaction is ${ageMinutes.toFixed(1)} minutes old`);
      console.log('   Backend is NOT processing new transactions!');
    }
  }

  console.log('\n✅ Check complete!\n');
  await mongoose.disconnect();
}

checkTransactions().catch(console.error);
