/**
 * Diagnose KOL Tracking Issues
 * 
 * This script checks:
 * 1. How many KOL addresses we have
 * 2. Recent KOL transactions in database
 * 3. WebSocket subscription status
 * 4. Sample KOL addresses for testing
 */

const dotenv = require('dotenv');
const mongoose = require('mongoose');
const InfluencerWhaleTransactionsV2Model = require('./dist/models/influencerWhaleTransactionsV2.model').default;

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';

// Color helpers
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  white: (text) => `\x1b[37m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
};

async function diagnoseKolTracking() {
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')));
  console.log(colors.cyan(colors.bold('║                    KOL Tracking Diagnostic                                ║')));
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')));

  // Connect to MongoDB
  console.log(colors.cyan('📊 Connecting to MongoDB...'));
  await mongoose.connect(MONGO_URI);
  console.log(colors.green('✅ Connected to MongoDB\n'));

  // 1. Check total KOL transactions
  console.log(colors.cyan('1️⃣ Checking total KOL transactions in database...'));
  const totalKolTransactions = await InfluencerWhaleTransactionsV2Model.countDocuments();
  console.log(colors.white(`   Total KOL transactions: ${totalKolTransactions.toLocaleString()}\n`));

  // 2. Get distinct KOL addresses
  console.log(colors.cyan('2️⃣ Getting distinct KOL addresses...'));
  const kolAddresses = await InfluencerWhaleTransactionsV2Model.distinct('whaleAddress');
  console.log(colors.white(`   Distinct KOL addresses: ${kolAddresses.length}\n`));

  // 3. Check recent KOL transactions (last 24 hours)
  console.log(colors.cyan('3️⃣ Checking recent KOL transactions (last 24 hours)...'));
  const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentTransactions = await InfluencerWhaleTransactionsV2Model.find({
    'transaction.timestamp': { $gte: last24Hours }
  }).sort({ 'transaction.timestamp': -1 }).limit(10).lean();

  console.log(colors.white(`   Recent transactions (last 24h): ${recentTransactions.length}`));
  
  if (recentTransactions.length > 0) {
    console.log(colors.green('\n   📋 Sample recent transactions:'));
    recentTransactions.slice(0, 5).forEach((tx, i) => {
      const timestamp = new Date(tx.transaction.timestamp).toISOString();
      console.log(colors.gray(`   ${i + 1}. ${tx.signature}`));
      console.log(colors.gray(`      KOL: ${tx.whaleAddress.substring(0, 8)}...`));
      console.log(colors.gray(`      Time: ${timestamp}`));
      console.log(colors.gray(`      Type: ${tx.type} | ${tx.transaction.tokenIn.symbol} → ${tx.transaction.tokenOut.symbol}`));
      console.log('');
    });
  } else {
    console.log(colors.red('   ⚠️  No recent KOL transactions found in last 24 hours'));
  }

  // 4. Check very recent transactions (last 1 hour)
  console.log(colors.cyan('4️⃣ Checking very recent KOL transactions (last 1 hour)...'));
  const lastHour = new Date(Date.now() - 60 * 60 * 1000);
  const veryRecentTransactions = await InfluencerWhaleTransactionsV2Model.find({
    'transaction.timestamp': { $gte: lastHour }
  }).sort({ 'transaction.timestamp': -1 }).limit(5).lean();

  console.log(colors.white(`   Very recent transactions (last 1h): ${veryRecentTransactions.length}`));
  
  if (veryRecentTransactions.length > 0) {
    console.log(colors.green('\n   🔥 Very recent transactions:'));
    veryRecentTransactions.forEach((tx, i) => {
      const timestamp = new Date(tx.transaction.timestamp).toISOString();
      const minutesAgo = Math.round((Date.now() - new Date(tx.transaction.timestamp).getTime()) / (1000 * 60));
      console.log(colors.gray(`   ${i + 1}. ${tx.signature}`));
      console.log(colors.gray(`      KOL: ${tx.whaleAddress.substring(0, 8)}...`));
      console.log(colors.gray(`      Time: ${timestamp} (${minutesAgo} minutes ago)`));
      console.log(colors.gray(`      Type: ${tx.type} | ${tx.transaction.tokenIn.symbol} → ${tx.transaction.tokenOut.symbol}`));
      console.log('');
    });
  } else {
    console.log(colors.red('   ⚠️  No KOL transactions in the last hour'));
  }

  // 5. Get most active KOL addresses (for testing)
  console.log(colors.cyan('5️⃣ Finding most active KOL addresses (for WebSocket testing)...'));
  const activeKols = await InfluencerWhaleTransactionsV2Model.aggregate([
    {
      $match: {
        'transaction.timestamp': { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
      }
    },
    {
      $group: {
        _id: '$whaleAddress',
        transactionCount: { $sum: 1 },
        lastTransaction: { $max: '$transaction.timestamp' },
        influencerName: { $first: '$influencerName' },
        influencerUsername: { $first: '$influencerUsername' }
      }
    },
    {
      $sort: { transactionCount: -1 }
    },
    {
      $limit: 10
    }
  ]);

  console.log(colors.white(`   Most active KOLs (last 7 days): ${activeKols.length}`));
  
  if (activeKols.length > 0) {
    console.log(colors.green('\n   🎯 Top active KOL addresses for testing:'));
    activeKols.forEach((kol, i) => {
      const lastTx = new Date(kol.lastTransaction).toISOString();
      console.log(colors.gray(`   ${i + 1}. ${kol._id.substring(0, 8)}...`));
      console.log(colors.gray(`      Name: ${kol.influencerName || 'Unknown'} (@${kol.influencerUsername || 'unknown'})`));
      console.log(colors.gray(`      Transactions: ${kol.transactionCount} | Last: ${lastTx}`));
      console.log('');
    });

    // Save top 5 addresses for focused testing
    const topKolAddresses = activeKols.slice(0, 5).map(kol => kol._id);
    console.log(colors.yellow('🎯 Recommended KOL addresses for focused testing:'));
    topKolAddresses.forEach((addr, i) => {
      console.log(colors.yellow(`   ${i + 1}. ${addr}`));
    });
  }

  // 6. Check transaction timestamp distribution
  console.log(colors.cyan('\n6️⃣ Checking transaction timestamp distribution...'));
  const timestampStats = await InfluencerWhaleTransactionsV2Model.aggregate([
    {
      $group: {
        _id: null,
        oldestTransaction: { $min: '$transaction.timestamp' },
        newestTransaction: { $max: '$transaction.timestamp' },
        totalTransactions: { $sum: 1 }
      }
    }
  ]);

  if (timestampStats.length > 0) {
    const stats = timestampStats[0];
    const oldest = new Date(stats.oldestTransaction).toISOString();
    const newest = new Date(stats.newestTransaction).toISOString();
    const hoursAgo = Math.round((Date.now() - new Date(stats.newestTransaction).getTime()) / (1000 * 60 * 60));
    
    console.log(colors.white(`   Oldest transaction: ${oldest}`));
    console.log(colors.white(`   Newest transaction: ${newest} (${hoursAgo} hours ago)`));
    console.log(colors.white(`   Total transactions: ${stats.totalTransactions.toLocaleString()}`));
  }

  // 7. Recommendations
  console.log(colors.cyan('\n7️⃣ Diagnostic Summary & Recommendations:'));
  
  if (veryRecentTransactions.length === 0) {
    console.log(colors.red('   ❌ ISSUE: No KOL transactions in the last hour'));
    console.log(colors.yellow('   💡 This suggests either:'));
    console.log(colors.yellow('      - KOL addresses are not actively trading'));
    console.log(colors.yellow('      - WebSocket is not capturing live transactions'));
    console.log(colors.yellow('      - There\'s a delay in database updates'));
  } else {
    console.log(colors.green('   ✅ KOL transactions are being recorded recently'));
  }

  if (kolAddresses.length < 100) {
    console.log(colors.yellow('   ⚠️  Relatively few KOL addresses tracked'));
  } else {
    console.log(colors.green(`   ✅ Good number of KOL addresses tracked (${kolAddresses.length})`));
  }

  console.log(colors.cyan('\n' + '═'.repeat(80)));
  console.log(colors.cyan(colors.bold('NEXT STEPS FOR TESTING:')));
  console.log(colors.cyan('═'.repeat(80)));
  
  if (activeKols.length > 0) {
    console.log(colors.white('1. Use the top active KOL addresses for focused WebSocket testing'));
    console.log(colors.white('2. Run a shorter test (2-3 minutes) with just the most active KOLs'));
    console.log(colors.white('3. Check if WebSocket notifications are coming through for these addresses'));
  } else {
    console.log(colors.red('1. No active KOLs found - may need to check data source'));
    console.log(colors.red('2. Consider using whale addresses instead for testing'));
  }

  await mongoose.disconnect();
  console.log(colors.green('\n✅ Disconnected from MongoDB'));
}

diagnoseKolTracking().catch((error) => {
  console.error(colors.red('💥 Diagnostic Error:'), error);
  process.exit(1);
});