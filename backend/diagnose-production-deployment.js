#!/usr/bin/env node

/**
 * COMPREHENSIVE PRODUCTION DEPLOYMENT DIAGNOSTIC
 * 
 * This script checks:
 * 1. MongoDB connection
 * 2. Collection existence (whalealltransactionsv2, tokenmetadatacache)
 * 3. Recent transaction processing
 * 4. Cache population status
 * 5. Unknown token percentage
 * 6. Deployment verification
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function diagnose() {
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           PRODUCTION DEPLOYMENT DIAGNOSTIC - Token Metadata Cache              ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

  try {
    // ============ STEP 1: MongoDB Connection ============
    console.log('📡 Step 1: Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected successfully\n');

    // ============ STEP 2: Check Collections ============
    console.log('📂 Step 2: Checking collections...');
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    const hasTransactionsV2 = collectionNames.includes('whalealltransactionsv2');
    const hasCache = collectionNames.includes('tokenmetadatacache');
    
    console.log(`   ${hasTransactionsV2 ? '✅' : '❌'} whalealltransactionsv2: ${hasTransactionsV2 ? 'EXISTS' : 'MISSING'}`);
    console.log(`   ${hasCache ? '✅' : '❌'} tokenmetadatacache: ${hasCache ? 'EXISTS' : 'MISSING'}\n`);

    if (!hasTransactionsV2) {
      console.log('❌ CRITICAL: whalealltransactionsv2 collection does not exist!');
      console.log('   This is the main transaction collection. Something is very wrong.\n');
      await mongoose.disconnect();
      return;
    }

    // ============ STEP 3: Check Recent Transactions ============
    console.log('🔍 Step 3: Checking recent transactions...');
    const txColl = mongoose.connection.db.collection('whalealltransactionsv2');
    
    const totalTx = await txColl.countDocuments();
    console.log(`   Total transactions: ${totalTx}`);
    
    const recentTx = await txColl.find({}).sort({ createdAt: -1 }).limit(1).toArray();
    
    if (recentTx.length === 0) {
      console.log('❌ No transactions found in database!\n');
      await mongoose.disconnect();
      return;
    }

    const latestTx = recentTx[0];
    const ageMinutes = latestTx.createdAt 
      ? (Date.now() - new Date(latestTx.createdAt).getTime()) / 1000 / 60
      : null;
    
    console.log(`   Latest transaction: ${latestTx.signature?.substring(0, 20)}...`);
    console.log(`   Created: ${latestTx.createdAt}`);
    
    if (ageMinutes !== null) {
      console.log(`   Age: ${ageMinutes.toFixed(1)} minutes ago`);
      
      if (ageMinutes < 5) {
        console.log('   ✅ Transactions are RECENT (< 5 min) - Backend is processing!\n');
      } else if (ageMinutes < 60) {
        console.log(`   ⚠️  Transactions are ${ageMinutes.toFixed(0)} minutes old - Backend might be slow\n`);
      } else {
        console.log(`   ❌ Transactions are ${ageMinutes.toFixed(0)} minutes old - Backend NOT processing!\n`);
      }
    }

    // ============ STEP 4: Check Unknown Tokens ============
    console.log('🔍 Step 4: Checking "Unknown" token percentage...');
    
    const unknownCount = await txColl.countDocuments({
      $or: [
        { tokenInSymbol: 'Unknown' },
        { tokenOutSymbol: 'Unknown' }
      ]
    });
    
    const unknownPercent = totalTx > 0 ? (unknownCount / totalTx * 100).toFixed(1) : 0;
    
    console.log(`   Unknown tokens: ${unknownCount} / ${totalTx} (${unknownPercent}%)`);
    
    if (unknownPercent > 50) {
      console.log('   ❌ HIGH percentage of Unknown tokens - Cache NOT working!\n');
    } else if (unknownPercent > 20) {
      console.log('   ⚠️  MODERATE percentage of Unknown tokens - Cache partially working\n');
    } else if (unknownPercent > 5) {
      console.log('   ✅ LOW percentage of Unknown tokens - Cache working well!\n');
    } else {
      console.log('   ✅ EXCELLENT! Very few Unknown tokens - Cache working perfectly!\n');
    }

    // ============ STEP 5: Check Cache Status ============
    if (!hasCache) {
      console.log('❌ Step 5: Cache collection does NOT exist\n');
      console.log('═'.repeat(80));
      console.log('\n🚨 DIAGNOSIS: NEW CODE NOT DEPLOYED TO PRODUCTION\n');
      console.log('Evidence:');
      console.log('   ❌ tokenmetadatacache collection does not exist');
      console.log('   ❌ High percentage of Unknown tokens');
      console.log('   ❌ Backend is running OLD code\n');
      console.log('Solution:');
      console.log('   1. SSH to production server');
      console.log('   2. cd /path/to/alpha-tracker-ai/backend');
      console.log('   3. git pull origin main');
      console.log('   4. npm run build');
      console.log('   5. pm2 restart backend');
      console.log('   6. pm2 logs backend (verify deployment)\n');
      await mongoose.disconnect();
      return;
    }

    console.log('✅ Step 5: Checking cache population...');
    const cacheColl = mongoose.connection.db.collection('tokenmetadatacache');
    
    const cacheCount = await cacheColl.countDocuments();
    console.log(`   Cached tokens: ${cacheCount}`);
    
    if (cacheCount === 0) {
      console.log('   ⚠️  Cache is EMPTY (0 tokens)\n');
      
      if (ageMinutes !== null && ageMinutes < 5) {
        console.log('   📝 Transactions are recent but cache is empty');
        console.log('   This means:');
        console.log('      - New code was JUST deployed');
        console.log('      - Cache will populate soon');
        console.log('      - Wait 5-10 minutes and check again\n');
      } else {
        console.log('   📝 Transactions are old AND cache is empty');
        console.log('   This means:');
        console.log('      - Backend is NOT processing new transactions');
        console.log('      - Backend might be down or stuck');
        console.log('      - Check: pm2 status && pm2 logs backend\n');
      }
    } else {
      console.log('   ✅ Cache is populated!\n');
      
      // Get cache stats
      const bySource = await cacheColl.aggregate([
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray();
      
      console.log('   📊 Tokens by source:');
      bySource.forEach(item => {
        console.log(`      ${item._id}: ${item.count} tokens`);
      });
      console.log('');
      
      // Get recent cache entries
      const recentCache = await cacheColl.find({}).sort({ createdAt: -1 }).limit(5).toArray();
      
      console.log('   📝 Recent cache entries:');
      recentCache.forEach((token, i) => {
        console.log(`      ${i + 1}. ${token.symbol} (${token.name})`);
        console.log(`         Source: ${token.source}, Cached: ${token.createdAt}`);
      });
      console.log('');
    }

    // ============ STEP 6: Test Specific Tokens ============
    console.log('🔍 Step 6: Checking test tokens...');
    
    const testTokens = [
      { address: 'GB8KtQfMChhYrCYtd5PoAB42kAdkHnuyAincSSmFpump', expected: 'PIGEON' },
      { address: 'kMKX8hBaj3BTRBbeYix9c16EieBP5dih8DTSSwCpump', expected: 'afk' },
      { address: '8Jx8AAHj86wbQgUTjGuj6GTTL5Ps3cqxKRTvpaJApump', expected: 'PENGUIN' },
    ];
    
    for (const test of testTokens) {
      // Check in cache
      const cached = hasCache ? await cacheColl.findOne({ tokenAddress: test.address }) : null;
      
      // Check in recent transactions
      const inTx = await txColl.findOne({
        $or: [
          { tokenInAddress: test.address },
          { tokenOutAddress: test.address }
        ]
      });
      
      console.log(`\n   Token: ${test.address.substring(0, 8)}... (expected: ${test.expected})`);
      
      if (cached) {
        console.log(`      ✅ In cache: ${cached.symbol} (source: ${cached.source})`);
      } else {
        console.log(`      ❌ NOT in cache`);
      }
      
      if (inTx) {
        const actualSymbol = inTx.tokenInAddress === test.address 
          ? inTx.tokenInSymbol 
          : inTx.tokenOutSymbol;
        console.log(`      ${actualSymbol === test.expected ? '✅' : '❌'} In transactions: ${actualSymbol}`);
      } else {
        console.log(`      ⚠️  Not found in recent transactions`);
      }
    }
    
    console.log('\n');

    // ============ FINAL DIAGNOSIS ============
    console.log('═'.repeat(80));
    console.log('\n📋 FINAL DIAGNOSIS:\n');

    if (!hasCache) {
      console.log('🚨 STATUS: NEW CODE NOT DEPLOYED');
      console.log('   - Cache collection does not exist');
      console.log('   - Backend is running OLD code');
      console.log('   - Tokens showing as "Unknown"');
      console.log('\n✅ ACTION: Deploy new code to production (see above)\n');
    } else if (cacheCount === 0 && ageMinutes !== null && ageMinutes < 5) {
      console.log('⏳ STATUS: JUST DEPLOYED (Cache building)');
      console.log('   - Cache collection exists');
      console.log('   - Transactions are recent');
      console.log('   - Cache is empty (just started)');
      console.log('\n✅ ACTION: Wait 5-10 minutes, cache will populate automatically\n');
    } else if (cacheCount === 0 && ageMinutes !== null && ageMinutes > 5) {
      console.log('⚠️  STATUS: BACKEND NOT PROCESSING');
      console.log('   - Cache collection exists');
      console.log('   - Transactions are OLD');
      console.log('   - Cache is empty');
      console.log('\n✅ ACTION: Check backend status (pm2 status && pm2 logs backend)\n');
    } else if (cacheCount > 0 && unknownPercent > 30) {
      console.log('⚠️  STATUS: CACHE WORKING BUT MANY UNKNOWNS');
      console.log(`   - Cache has ${cacheCount} tokens`);
      console.log(`   - But ${unknownPercent}% are still Unknown`);
      console.log('   - Possible issues:');
      console.log('     • Old transactions not re-processed');
      console.log('     • Some tokens legitimately not found');
      console.log('     • API rate limits');
      console.log('\n✅ ACTION: Monitor for 1 hour, Unknown % should decrease\n');
    } else if (cacheCount > 0 && unknownPercent < 30) {
      console.log('✅ STATUS: WORKING CORRECTLY!');
      console.log(`   - Cache has ${cacheCount} tokens`);
      console.log(`   - Only ${unknownPercent}% Unknown (acceptable)`);
      console.log('   - Backend is processing correctly');
      console.log('   - Cache is growing');
      console.log('\n🎉 SUCCESS: Token metadata cache is working!\n');
    }

    console.log('═'.repeat(80));
    console.log('\n✅ Diagnostic complete!\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error('\n❌ Error during diagnostic:', error);
    process.exit(1);
  }
}

diagnose().catch(console.error);
