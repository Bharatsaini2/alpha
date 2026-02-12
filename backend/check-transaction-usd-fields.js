/**
 * Check if transactions have USD amount fields populated
 * This helps diagnose why transaction cards show token amounts instead of USD
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGO_URI;

// Define minimal schema for whale_all_transactions_v2
const transactionSchema = new mongoose.Schema({}, { strict: false, collection: 'whale_all_transactions_v2' });
const Transaction = mongoose.model('WhaleAllTransactionsV2Check', transactionSchema);

// Define minimal schema for influencer_whale_transactions_v2
const kolTransactionSchema = new mongoose.Schema({}, { strict: false, collection: 'influencer_whale_transactions_v2' });
const KolTransaction = mongoose.model('InfluencerWhaleTransactionsV2Check', kolTransactionSchema);

async function checkUSDFields() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get recent transactions
    const transactions = await Transaction.find({})
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();

    console.log(`📊 Checking ${transactions.length} recent transactions:\n`);

    let hasUSDFields = 0;
    let missingUSDFields = 0;

    transactions.forEach((tx, index) => {
      console.log(`\n--- Transaction ${index + 1} ---`);
      console.log(`Signature: ${tx.signature?.substring(0, 20)}...`);
      console.log(`Type: ${tx.type}`);
      console.log(`Classification: ${tx.classificationSource}`);
      
      // Check amount fields
      console.log(`\nAmount fields:`);
      console.log(`  buyAmount: ${tx.amount?.buyAmount}`);
      console.log(`  sellAmount: ${tx.amount?.sellAmount}`);
      
      // Check transaction.tokenIn
      console.log(`\nTransaction.tokenIn:`);
      if (tx.transaction?.tokenIn) {
        console.log(`  symbol: ${tx.transaction.tokenIn.symbol}`);
        console.log(`  amount: ${tx.transaction.tokenIn.amount}`);
        console.log(`  usdAmount: ${tx.transaction.tokenIn.usdAmount} ${tx.transaction.tokenIn.usdAmount ? '✅' : '❌'}`);
      } else {
        console.log(`  ❌ tokenIn not found`);
      }
      
      // Check transaction.tokenOut
      console.log(`\nTransaction.tokenOut:`);
      if (tx.transaction?.tokenOut) {
        console.log(`  symbol: ${tx.transaction.tokenOut.symbol}`);
        console.log(`  amount: ${tx.transaction.tokenOut.amount}`);
        console.log(`  usdAmount: ${tx.transaction.tokenOut.usdAmount} ${tx.transaction.tokenOut.usdAmount ? '✅' : '❌'}`);
      } else {
        console.log(`  ❌ tokenOut not found`);
      }
      
      // Check if USD fields exist
      const hasUSD = tx.transaction?.tokenIn?.usdAmount && tx.transaction?.tokenOut?.usdAmount;
      if (hasUSD) {
        hasUSDFields++;
        console.log(`\n✅ USD fields present`);
      } else {
        missingUSDFields++;
        console.log(`\n❌ USD fields missing`);
      }
    });

    console.log(`\n\n📈 SUMMARY:`);
    console.log(`Total transactions checked: ${transactions.length}`);
    console.log(`✅ With USD fields: ${hasUSDFields}`);
    console.log(`❌ Missing USD fields: ${missingUSDFields}`);
    
    if (missingUSDFields > 0) {
      console.log(`\n⚠️  WARNING: Some transactions are missing USD amount fields!`);
      console.log(`This is why the frontend shows token amounts instead of USD amounts.`);
      console.log(`\nPossible causes:`);
      console.log(`1. Old transactions created before USD fields were added`);
      console.log(`2. Token price lookup failed during transaction processing`);
      console.log(`3. Backend not populating USD fields correctly`);
    } else {
      console.log(`\n✅ All transactions have USD fields!`);
      console.log(`If frontend still shows token amounts, rebuild the frontend:`);
      console.log(`  cd client && npm run build`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkUSDFields();
