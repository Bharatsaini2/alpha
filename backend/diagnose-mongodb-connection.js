#!/usr/bin/env node

/**
 * Diagnose MongoDB connection issues
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function diagnose() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    MongoDB Connection Diagnosis                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  // Check if URI is configured
  console.log('1️⃣ Checking MongoDB URI configuration...\n');
  
  if (!MONGODB_URI) {
    console.log('❌ MONGODB_URI is NOT configured!');
    console.log('   Check your .env file for MONGO_URI or MONGODB_URI');
    return;
  }
  
  // Mask the password in the URI for display
  const maskedURI = MONGODB_URI.replace(/:[^:@]+@/, ':****@');
  console.log(`✅ MongoDB URI found: ${maskedURI}\n`);

  // Try to connect
  console.log('2️⃣ Attempting to connect to MongoDB...\n');
  
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000, // 10 second timeout
    });
    
    console.log('✅ Successfully connected to MongoDB!\n');
    
    // Get database info
    console.log('3️⃣ Database Information:\n');
    const dbName = mongoose.connection.db.databaseName;
    console.log(`   Database name: ${dbName}`);
    console.log(`   Connection state: ${mongoose.connection.readyState}`);
    console.log(`   (0=disconnected, 1=connected, 2=connecting, 3=disconnecting)\n`);
    
    // List collections
    console.log('4️⃣ Checking collections...\n');
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    console.log(`   Total collections: ${collections.length}\n`);
    
    // Check for our collections
    const hasTokenDatas = collections.some(col => col.name === 'tokendatas');
    const hasTokenMetadataCache = collections.some(col => col.name === 'tokenmetadatacache');
    const hasWhaleTransactions = collections.some(col => col.name === 'whalesalltransactionsv2s');
    
    console.log('   Key Collections:');
    console.log(`   ${hasTokenDatas ? '✅' : '❌'} tokendatas (image cache)`);
    console.log(`   ${hasTokenMetadataCache ? '✅' : '❌'} tokenmetadatacache (NEW symbol/name cache)`);
    console.log(`   ${hasWhaleTransactions ? '✅' : '❌'} whalesalltransactionsv2s (transactions)`);
    console.log('');
    
    if (!hasTokenMetadataCache) {
      console.log('⚠️  tokenmetadatacache collection does NOT exist!\n');
      console.log('📝 Possible reasons:');
      console.log('   1. Backend is running but no transactions have been processed yet');
      console.log('   2. The new code is deployed but backend hasn\'t been restarted');
      console.log('   3. MongoDB connection works but collection hasn\'t been created yet');
      console.log('');
      console.log('✅ Solution:');
      console.log('   1. Restart backend: pm2 restart backend');
      console.log('   2. Wait for a transaction to be processed');
      console.log('   3. Collection will be created automatically on first token resolution');
      console.log('');
    } else {
      console.log('✅ tokenmetadatacache collection EXISTS!\n');
      
      // Count documents
      const TokenMetadataCacheModel = mongoose.model('TokenMetadataCache', new mongoose.Schema({}, { collection: 'tokenmetadatacache' }));
      const count = await TokenMetadataCacheModel.countDocuments();
      console.log(`   📊 Cached tokens: ${count}\n`);
      
      if (count === 0) {
        console.log('   ⚠️  Collection exists but is EMPTY');
        console.log('   📝 This means:');
        console.log('      - Collection was created');
        console.log('      - But no tokens have been cached yet');
        console.log('      - Wait for transactions to be processed');
      } else {
        console.log(`   ✅ Cache is working! ${count} tokens cached`);
      }
    }
    
    // Check if backend is using this connection
    console.log('─'.repeat(80));
    console.log('\n5️⃣ Backend Connection Check:\n');
    
    console.log('   To verify backend is using this MongoDB:');
    console.log('   1. Check backend logs: pm2 logs backend');
    console.log('   2. Look for: "✅ Connected to MongoDB"');
    console.log('   3. Look for: "MongoDB not connected, skipping cache"');
    console.log('');
    
    await mongoose.disconnect();
    console.log('✅ Diagnosis complete!\n');
    
  } catch (error) {
    console.log('❌ Failed to connect to MongoDB!\n');
    console.log('Error:', error.message);
    console.log('');
    console.log('📝 Common issues:');
    console.log('   1. Wrong connection string in .env');
    console.log('   2. MongoDB server is down');
    console.log('   3. Network/firewall blocking connection');
    console.log('   4. IP not whitelisted in MongoDB Atlas');
    console.log('   5. Wrong username/password');
    console.log('');
    console.log('✅ Solutions:');
    console.log('   1. Check .env file has correct MONGO_URI');
    console.log('   2. Test connection: mongo "your-connection-string"');
    console.log('   3. Check MongoDB Atlas IP whitelist');
    console.log('   4. Verify username/password are correct');
  }
}

diagnose().catch(console.error);
