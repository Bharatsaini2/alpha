/**
 * Check specific token in cache
 * Run: node check-specific-token.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const TOKEN_ADDRESS = '7EW5dDD6MYJK4PcZ89MGApJQwWeDEeNgH4NCVU4qpump';

async function checkToken() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected!\n');

    const db = mongoose.connection.db;
    const collection = db.collection('tokenmetadatacache');

    console.log(`🔍 Searching for token: ${TOKEN_ADDRESS}\n`);

    const token = await collection.findOne({ tokenAddress: TOKEN_ADDRESS });

    if (token) {
      console.log('✅ Token FOUND in cache:');
      console.log(`  Symbol: ${token.symbol}`);
      console.log(`  Name: ${token.name}`);
      console.log(`  Source: ${token.source}`);
      console.log(`  Last Updated: ${token.lastUpdated}`);
      console.log(`  Created At: ${token.createdAt}`);
    } else {
      console.log('❌ Token NOT found in cache');
      console.log('\nThis means:');
      console.log('  1. Token was never cached (caching failed)');
      console.log('  2. Symbol was "Unknown" so it was skipped');
      console.log('  3. Caching code is not being executed');
    }

    // Check recent transactions with this token
    console.log('\n🔍 Checking recent transactions with this token...');
    const whaleTransactions = db.collection('whaleAllTransactionsV2');
    
    const recentTxs = await whaleTransactions
      .find({
        $or: [
          { tokenInAddress: TOKEN_ADDRESS },
          { tokenOutAddress: TOKEN_ADDRESS }
        ]
      })
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();

    if (recentTxs.length > 0) {
      console.log(`\n📊 Found ${recentTxs.length} recent transactions:`);
      recentTxs.forEach((tx, i) => {
        const isTokenIn = tx.tokenInAddress === TOKEN_ADDRESS;
        const symbol = isTokenIn ? tx.tokenInSymbol : tx.tokenOutSymbol;
        const side = isTokenIn ? 'IN' : 'OUT';
        const age = Math.floor((Date.now() - new Date(tx.timestamp).getTime()) / 1000 / 60);
        console.log(`  [${i + 1}] ${side.padEnd(4)} | Symbol: ${(symbol || 'Unknown').padEnd(15)} | ${age}m ago | ${tx.signature.slice(0, 8)}...`);
      });
    } else {
      console.log('  No transactions found with this token');
    }

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkToken();
