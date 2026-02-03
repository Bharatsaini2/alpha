/**
 * Check Actual KOL Addresses vs Subscription Addresses
 * 
 * This script compares:
 * 1. KOL addresses we're subscribing to (from distinct whaleAddress)
 * 2. Actual addresses in recent KOL transactions
 * 3. Find the mismatch causing WebSocket to miss transactions
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

async function checkActualKolAddresses() {
  console.log(colors.cyan(colors.bold('\n╔════════════════════════════════════════════════════════════════════════════╗')));
  console.log(colors.cyan(colors.bold('║                Check Actual KOL Addresses vs Subscription                ║')));
  console.log(colors.cyan(colors.bold('╚════════════════════════════════════════════════════════════════════════════╝\n')));

  // Connect to MongoDB
  console.log(colors.cyan('📊 Connecting to MongoDB...'));
  await mongoose.connect(MONGO_URI);
  console.log(colors.green('✅ Connected to MongoDB\n'));

  // 1. Get addresses we're currently subscribing to (distinct whaleAddress)
  console.log(colors.cyan('1️⃣ Getting addresses we subscribe to (distinct whaleAddress)...'));
  const subscriptionAddresses = await InfluencerWhaleTransactionsV2Model.distinct('whaleAddress');
  console.log(colors.white(`   Subscription addresses: ${subscriptionAddresses.length}\n`));

  // 2. Get recent KOL transactions (last 10 minutes)
  console.log(colors.cyan('2️⃣ Getting recent KOL transactions (last 10 minutes)...'));
  const last10Minutes = new Date(Date.now() - 10 * 60 * 1000);
  const recentTransactions = await InfluencerWhaleTransactionsV2Model.find({
    'transaction.timestamp': { $gte: last10Minutes }
  }).sort({ 'transaction.timestamp': -1 }).limit(20).lean();

  console.log(colors.white(`   Recent transactions: ${recentTransactions.length}\n`));

  if (recentTransactions.length === 0) {
    console.log(colors.red('❌ No recent KOL transactions found in last 10 minutes'));
    console.log(colors.yellow('💡 This might explain why WebSocket isn\'t receiving notifications\n'));
  } else {
    console.log(colors.green('📋 Recent KOL transactions:'));
    recentTransactions.forEach((tx, i) => {
      const timestamp = new Date(tx.transaction.timestamp).toISOString();
      const minutesAgo = Math.round((Date.now() - new Date(tx.transaction.timestamp).getTime()) / (1000 * 60));
      console.log(colors.gray(`   ${i + 1}. ${tx.signature}`));
      console.log(colors.gray(`      KOL: ${tx.whaleAddress} (${tx.influencerName})`));
      console.log(colors.gray(`      Time: ${timestamp} (${minutesAgo} min ago)`));
      console.log(colors.gray(`      Type: ${tx.type} | ${tx.transaction.tokenIn.symbol} → ${tx.transaction.tokenOut.symbol}`));
      console.log('');
    });
  }

  // 3. Extract unique addresses from recent transactions
  const recentAddresses = [...new Set(recentTransactions.map(tx => tx.whaleAddress))];
  console.log(colors.cyan('3️⃣ Unique addresses in recent transactions:'));
  console.log(colors.white(`   Recent unique addresses: ${recentAddresses.length}\n`));

  if (recentAddresses.length > 0) {
    console.log(colors.green('🎯 Recent active KOL addresses:'));
    recentAddresses.forEach((addr, i) => {
      const txCount = recentTransactions.filter(tx => tx.whaleAddress === addr).length;
      const isInSubscription = subscriptionAddresses.includes(addr);
      console.log(colors.gray(`   ${i + 1}. ${addr.substring(0, 8)}...${addr.substring(addr.length - 4)}`));
      console.log(colors.gray(`      Transactions: ${txCount} | In subscription: ${isInSubscription ? '✅ YES' : '❌ NO'}`));
    });
    console.log('');
  }

  // 4. Check for address mismatches
  console.log(colors.cyan('4️⃣ Checking for address mismatches...'));
  const missingFromSubscription = recentAddresses.filter(addr => !subscriptionAddresses.includes(addr));
  const subscriptionNotActive = subscriptionAddresses.filter(addr => !recentAddresses.includes(addr));

  console.log(colors.white(`   Addresses missing from subscription: ${missingFromSubscription.length}`));
  console.log(colors.white(`   Subscription addresses not recently active: ${subscriptionNotActive.length}\n`));

  if (missingFromSubscription.length > 0) {
    console.log(colors.red('❌ CRITICAL: Recent KOL addresses NOT in our subscription:'));
    missingFromSubscription.forEach((addr, i) => {
      const txCount = recentTransactions.filter(tx => tx.whaleAddress === addr).length;
      const kolName = recentTransactions.find(tx => tx.whaleAddress === addr)?.influencerName || 'Unknown';
      console.log(colors.red(`   ${i + 1}. ${addr} (${kolName}) - ${txCount} recent transactions`));
    });
    console.log(colors.yellow('\n💡 This explains why WebSocket is missing transactions!'));
  } else {
    console.log(colors.green('✅ All recent KOL addresses are in our subscription'));
  }

  // 5. Get the most active addresses for focused testing
  console.log(colors.cyan('\n5️⃣ Most active KOL addresses (last 30 minutes for WebSocket testing)...'));
  const last30Minutes = new Date(Date.now() - 30 * 60 * 1000);
  const activeTransactions = await InfluencerWhaleTransactionsV2Model.find({
    'transaction.timestamp': { $gte: last30Minutes }
  }).lean();

  const addressActivity = {};
  activeTransactions.forEach(tx => {
    const addr = tx.whaleAddress;
    if (!addressActivity[addr]) {
      addressActivity[addr] = {
        count: 0,
        name: tx.influencerName,
        lastTransaction: tx.transaction.timestamp
      };
    }
    addressActivity[addr].count++;
    if (new Date(tx.transaction.timestamp) > new Date(addressActivity[addr].lastTransaction)) {
      addressActivity[addr].lastTransaction = tx.transaction.timestamp;
    }
  });

  const sortedActive = Object.entries(addressActivity)
    .sort(([,a], [,b]) => b.count - a.count)
    .slice(0, 10);

  if (sortedActive.length > 0) {
    console.log(colors.green('🔥 Top 10 most active KOL addresses (last 30 min):'));
    sortedActive.forEach(([addr, data], i) => {
      const minutesAgo = Math.round((Date.now() - new Date(data.lastTransaction).getTime()) / (1000 * 60));
      console.log(colors.gray(`   ${i + 1}. ${addr.substring(0, 8)}...${addr.substring(addr.length - 4)}`));
      console.log(colors.gray(`      Name: ${data.name} | Transactions: ${data.count} | Last: ${minutesAgo} min ago`));
    });

    // Provide focused test addresses
    const topActiveAddresses = sortedActive.slice(0, 5).map(([addr]) => addr);
    console.log(colors.yellow('\n🎯 RECOMMENDED: Use these addresses for focused WebSocket test:'));
    topActiveAddresses.forEach((addr, i) => {
      console.log(colors.yellow(`   ${i + 1}. ${addr}`));
    });
  } else {
    console.log(colors.red('❌ No active KOL addresses found in last 30 minutes'));
  }

  // 6. Summary and recommendations
  console.log(colors.cyan('\n' + '═'.repeat(80)));
  console.log(colors.cyan(colors.bold('SUMMARY & RECOMMENDATIONS')));
  console.log(colors.cyan('═'.repeat(80)));

  if (recentTransactions.length === 0) {
    console.log(colors.red('❌ ISSUE: No recent KOL transactions in database'));
    console.log(colors.yellow('   Possible causes:'));
    console.log(colors.yellow('   - KOL tracking system is down'));
    console.log(colors.yellow('   - Database updates are delayed'));
    console.log(colors.yellow('   - KOLs are not actively trading'));
  } else if (missingFromSubscription.length > 0) {
    console.log(colors.red('❌ ISSUE: WebSocket subscription missing active KOL addresses'));
    console.log(colors.yellow('   Solution: Update subscription to include missing addresses'));
  } else {
    console.log(colors.green('✅ WebSocket subscription addresses look correct'));
    console.log(colors.yellow('   Issue might be:'));
    console.log(colors.yellow('   - WebSocket connection problems'));
    console.log(colors.yellow('   - Timing delays between live transactions and database updates'));
  }

  await mongoose.disconnect();
  console.log(colors.green('\n✅ Disconnected from MongoDB'));
}

checkActualKolAddresses().catch((error) => {
  console.error(colors.red('💥 Error:'), error);
  process.exit(1);
});