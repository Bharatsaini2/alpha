/**
 * Check Recent Transactions
 * Run: node check-recent-transactions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/test';

async function checkRecentTransactions() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected!\n');

    const db = mongoose.connection.db;
    
    // Check whale transactions V2
    const whaleCollection = db.collection('whalealltransactionv2');
    const whaleCount = await whaleCollection.countDocuments();
    console.log(`📊 Total whale transactions: ${whaleCount.toLocaleString()}`);
    
    // Get most recent whale transactions
    const recentWhale = await whaleCollection
      .find({})
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();
    
    console.log('\n🐋 Recent whale transactions (last 10):');
    recentWhale.forEach((tx, i) => {
      const age = Math.floor((Date.now() - new Date(tx.timestamp).getTime()) / 1000);
      const ageStr = age < 60 ? `${age}s ago` : age < 3600 ? `${Math.floor(age / 60)}m ago` : `${Math.floor(age / 3600)}h ago`;
      const inSymbol = tx.tokenInSymbol || tx.transaction?.tokenIn?.symbol || 'Unknown';
      const outSymbol = tx.tokenOutSymbol || tx.transaction?.tokenOut?.symbol || 'Unknown';
      console.log(`  [${i + 1}] ${inSymbol.padEnd(12)} -> ${outSymbol.padEnd(12)} | ${ageStr}`);
    });
    
    // Check KOL transactions
    const kolCollection = db.collection('influencerwhaletransactionsv2');
    const kolCount = await kolCollection.countDocuments();
    console.log(`\n📊 Total KOL transactions: ${kolCount.toLocaleString()}`);
    
    const recentKol = await kolCollection
      .find({})
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();
    
    console.log('\n👤 Recent KOL transactions (last 10):');
    recentKol.forEach((tx, i) => {
      const age = Math.floor((Date.now() - new Date(tx.timestamp).getTime()) / 1000);
      const ageStr = age < 60 ? `${age}s ago` : age < 3600 ? `${Math.floor(age / 60)}m ago` : `${Math.floor(age / 3600)}h ago`;
      const inSymbol = tx.tokenInSymbol || tx.transaction?.tokenIn?.symbol || 'Unknown';
      const outSymbol = tx.tokenOutSymbol || tx.transaction?.tokenOut?.symbol || 'Unknown';
      console.log(`  [${i + 1}] ${inSymbol.padEnd(12)} -> ${outSymbol.padEnd(12)} | ${ageStr}`);
    });
    
    // Check for "Unknown" tokens in recent transactions
    const recentUnknown = await whaleCollection
      .find({
        $or: [
          { tokenInSymbol: 'Unknown' },
          { tokenOutSymbol: 'Unknown' },
          { 'transaction.tokenIn.symbol': 'Unknown' },
          { 'transaction.tokenOut.symbol': 'Unknown' }
        ],
        timestamp: { $gte: new Date(Date.now() - 3600000) } // Last hour
      })
      .limit(5)
      .toArray();
    
    console.log(`\n⚠️  Transactions with "Unknown" tokens (last hour): ${recentUnknown.length}`);
    if (recentUnknown.length > 0) {
      console.log('Recent Unknown tokens:');
      recentUnknown.forEach((tx, i) => {
        const inSymbol = tx.tokenInSymbol || tx.transaction?.tokenIn?.symbol || 'Unknown';
        const outSymbol = tx.tokenOutSymbol || tx.transaction?.tokenOut?.symbol || 'Unknown';
        const inAddr = tx.tokenInAddress || tx.transaction?.tokenIn?.address || '';
        const outAddr = tx.tokenOutAddress || tx.transaction?.tokenOut?.address || '';
        console.log(`  [${i + 1}] ${inSymbol} (${inAddr.slice(0, 8)}...) -> ${outSymbol} (${outAddr.slice(0, 8)}...)`);
      });
    }

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkRecentTransactions();
