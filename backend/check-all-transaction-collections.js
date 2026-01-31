#!/usr/bin/env node

/**
 * Check ALL transaction collections to find where transactions are stored
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function checkAllCollections() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                  Check ALL Transaction Collections                             ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  // Get all collections
  const collections = await mongoose.connection.db.listCollections().toArray();
  
  console.log('📂 All Collections in Database:\n');
  
  // Look for transaction-related collections
  const txCollections = collections.filter(c => 
    c.name.toLowerCase().includes('transaction') || 
    c.name.toLowerCase().includes('whale')
  );
  
  if (txCollections.length === 0) {
    console.log('❌ No transaction collections found!\n');
  } else {
    console.log('🔍 Transaction-related collections:\n');
    
    for (const coll of txCollections) {
      const count = await mongoose.connection.db.collection(coll.name).countDocuments();
      console.log(`   ${coll.name}: ${count} documents`);
      
      if (count > 0) {
        // Get most recent document
        const recent = await mongoose.connection.db.collection(coll.name)
          .find({})
          .sort({ createdAt: -1 })
          .limit(1)
          .toArray();
        
        if (recent.length > 0 && recent[0].createdAt) {
          const ageMinutes = (Date.now() - new Date(recent[0].createdAt).getTime()) / 1000 / 60;
          console.log(`      Latest: ${recent[0].createdAt} (${ageMinutes.toFixed(1)} min ago)`);
          
          // Show token symbols if available
          if (recent[0].tokenInSymbol || recent[0].tokenOutSymbol) {
            console.log(`      Tokens: ${recent[0].tokenInSymbol || '?'} → ${recent[0].tokenOutSymbol || '?'}`);
          }
        }
      }
      console.log('');
    }
  }

  // Check for cache collections
  console.log('─'.repeat(80));
  console.log('\n🔍 Cache-related collections:\n');
  
  const cacheCollections = collections.filter(c => 
    c.name.toLowerCase().includes('cache') || 
    c.name.toLowerCase().includes('token')
  );
  
  for (const coll of cacheCollections) {
    const count = await mongoose.connection.db.collection(coll.name).countDocuments();
    console.log(`   ${coll.name}: ${count} documents`);
  }
  
  console.log('\n');
  console.log('─'.repeat(80));
  console.log('\n📊 Summary:\n');
  
  // Find the collection with most recent transactions
  let mostRecentColl = null;
  let mostRecentAge = Infinity;
  
  for (const coll of txCollections) {
    const count = await mongoose.connection.db.collection(coll.name).countDocuments();
    if (count > 0) {
      const recent = await mongoose.connection.db.collection(coll.name)
        .find({})
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();
      
      if (recent.length > 0 && recent[0].createdAt) {
        const ageMinutes = (Date.now() - new Date(recent[0].createdAt).getTime()) / 1000 / 60;
        if (ageMinutes < mostRecentAge) {
          mostRecentAge = ageMinutes;
          mostRecentColl = coll.name;
        }
      }
    }
  }
  
  if (mostRecentColl) {
    console.log(`   ✅ Most recent transactions in: ${mostRecentColl}`);
    console.log(`   ⏰ Latest transaction: ${mostRecentAge.toFixed(1)} minutes ago`);
    
    if (mostRecentAge < 5) {
      console.log(`   ✅ Backend IS processing transactions!`);
    } else if (mostRecentAge < 60) {
      console.log(`   ⚠️  Backend might be slow`);
    } else {
      console.log(`   ❌ Backend NOT processing new transactions`);
    }
  } else {
    console.log(`   ❌ No recent transactions found in any collection!`);
  }
  
  console.log('\n');
  console.log('─'.repeat(80));
  console.log('\n💡 Recommendation:\n');
  
  if (mostRecentColl && mostRecentColl !== 'whalealltransactionsv2') {
    console.log(`   ⚠️  Transactions are in: ${mostRecentColl}`);
    console.log(`   ⚠️  But code expects: whalealltransactionsv2`);
    console.log(`   ⚠️  This is a MISMATCH!`);
    console.log('');
    console.log(`   📝 Solution:`);
    console.log(`      1. Update code to use: ${mostRecentColl}`);
    console.log(`      2. Or migrate data to: whalealltransactionsv2`);
  } else if (!mostRecentColl) {
    console.log(`   ❌ No transactions found in database!`);
    console.log(`   ❌ Backend is NOT processing whale transactions`);
    console.log('');
    console.log(`   📝 Solution:`);
    console.log(`      1. Check if backend is running: pm2 status`);
    console.log(`      2. Check backend logs: pm2 logs backend`);
    console.log(`      3. Check WebSocket connection to Shyft`);
  } else {
    console.log(`   ✅ Transactions are in correct collection: ${mostRecentColl}`);
  }
  
  console.log('\n✅ Check complete!\n');
  
  await mongoose.disconnect();
}

checkAllCollections().catch(console.error);
