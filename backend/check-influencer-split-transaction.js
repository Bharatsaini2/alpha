require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

const influencerWhaleTransactionsV2Schema = new mongoose.Schema({
  signature: { type: String, required: true, index: true },
  timestamp: { type: Date, required: true },
  type: { type: String, required: true },
  amount: {
    buyAmount: { type: String },
    sellAmount: { type: String },
  },
  transaction: {
    tokenIn: {
      symbol: { type: String },
      address: { type: String },
      amount: String,
    },
    tokenOut: {
      symbol: { type: String },
      address: { type: String },
      amount: String,
    },
    platform: { type: String },
    timestamp: Date,
  },
  whale: {
    address: { type: String, required: true },
  },
  classificationSource: { type: String },
}, { timestamps: true });

const InfluencerWhaleTransactionsV2 = mongoose.model('influencerWhaleTransactionV2', influencerWhaleTransactionsV2Schema);

async function checkInfluencerSplitTransaction() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const signature = '4uooDQdF2pXMWEod84Snv6hPn9Ahp7jie1GxEjirbqWrrEYd8bkNZTgrv5Ua6jtnd2yHRAU1T8S3Jvsn8mzVj9eF';
    
    console.log(`🔍 Searching InfluencerWhaleTransactionsV2 for: ${signature}\n`);
    console.log('='.repeat(100) + '\n');
    
    const transactions = await InfluencerWhaleTransactionsV2.find({ signature }).lean();
    
    console.log(`📊 RESULT: Found ${transactions.length} record(s) in InfluencerWhaleTransactionsV2\n`);
    
    if (transactions.length === 0) {
      console.log('❌ No transactions found with this signature in InfluencerWhaleTransactionsV2');
    } else if (transactions.length === 1) {
      console.log('⚠️  SINGLE RECORD FOUND');
      console.log('    This could be either:');
      console.log('    1. A regular (non-split) transaction ✅');
      console.log('    2. A split swap incorrectly stored as single record ❌\n');
      
      console.log('='.repeat(100));
      console.log('TRANSACTION DETAILS:');
      console.log('='.repeat(100));
      
      const txn = transactions[0];
      console.log(`\n📝 Basic Info:`);
      console.log(`   ID: ${txn._id}`);
      console.log(`   Type: ${txn.type}`);
      console.log(`   Classification Source: ${txn.classificationSource || 'N/A'}`);
      console.log(`   Timestamp: ${txn.timestamp}`);
      console.log(`   Created At: ${txn.createdAt}`);
      
      console.log(`\n💰 Amounts:`);
      console.log(`   Buy Amount: ${txn.amount?.buyAmount || 'N/A'}`);
      console.log(`   Sell Amount: ${txn.amount?.sellAmount || 'N/A'}`);
      
      console.log(`\n🪙 Token In:`);
      console.log(`   Symbol: ${txn.transaction?.tokenIn?.symbol || 'N/A'}`);
      console.log(`   Address: ${txn.transaction?.tokenIn?.address || 'N/A'}`);
      console.log(`   Amount: ${txn.transaction?.tokenIn?.amount || 'N/A'}`);
      
      console.log(`\n🪙 Token Out:`);
      console.log(`   Symbol: ${txn.transaction?.tokenOut?.symbol || 'N/A'}`);
      console.log(`   Address: ${txn.transaction?.tokenOut?.address || 'N/A'}`);
      console.log(`   Amount: ${txn.transaction?.tokenOut?.amount || 'N/A'}`);
      
      console.log(`\n🐋 Whale:`);
      console.log(`   Address: ${txn.whale?.address || 'N/A'}`);
      
      // Check if this looks like a split swap
      const isSplitSwapSource = txn.classificationSource?.includes('split');
      if (isSplitSwapSource) {
        console.log(`\n⚠️  WARNING: Classification source indicates this is a SPLIT SWAP!`);
        console.log(`   Expected: 2 records (one buy, one sell)`);
        console.log(`   Found: 1 record`);
        console.log(`   Status: ❌ INCORRECT STORAGE - Split swap should have 2 separate records`);
      }
      
    } else {
      console.log('✅ MULTIPLE RECORDS FOUND (Expected for split swaps)');
      console.log(`   Total Records: ${transactions.length}\n`);
      
      console.log('='.repeat(100));
      console.log('ANALYZING SPLIT SWAP STORAGE:');
      console.log('='.repeat(100));
      
      transactions.forEach((txn, idx) => {
        console.log(`\n📋 Record ${idx + 1} of ${transactions.length}:`);
        console.log('-'.repeat(100));
        console.log(`   ID: ${txn._id}`);
        console.log(`   Type: ${txn.type}`);
        console.log(`   Classification Source: ${txn.classificationSource || 'N/A'}`);
        console.log(`   Created At: ${txn.createdAt}`);
        
        console.log(`\n   💰 Amounts:`);
        console.log(`      Buy Amount: ${txn.amount?.buyAmount || 'N/A'}`);
        console.log(`      Sell Amount: ${txn.amount?.sellAmount || 'N/A'}`);
        
        console.log(`\n   🪙 Token In: ${txn.transaction?.tokenIn?.symbol || 'N/A'} (${txn.transaction?.tokenIn?.address || 'N/A'})`);
        console.log(`      Amount: ${txn.transaction?.tokenIn?.amount || 'N/A'}`);
        
        console.log(`\n   🪙 Token Out: ${txn.transaction?.tokenOut?.symbol || 'N/A'} (${txn.transaction?.tokenOut?.address || 'N/A'})`);
        console.log(`      Amount: ${txn.transaction?.tokenOut?.amount || 'N/A'}`);
      });
      
      // Validate split swap storage
      console.log('\n' + '='.repeat(100));
      console.log('VALIDATION:');
      console.log('='.repeat(100));
      
      const types = transactions.map(t => t.type);
      const hasBuy = types.includes('buy');
      const hasSell = types.includes('sell');
      const hasBoth = types.includes('both');
      
      console.log(`\n   Types found: ${types.join(', ')}`);
      console.log(`   Has 'buy': ${hasBuy ? '✅' : '❌'}`);
      console.log(`   Has 'sell': ${hasSell ? '✅' : '❌'}`);
      console.log(`   Has 'both': ${hasBoth ? (hasBoth ? '⚠️  (Should not exist for split swaps)' : '✅') : '✅'}`);
      
      if (transactions.length === 2 && hasBuy && hasSell && !hasBoth) {
        console.log(`\n   ✅ CORRECT: Split swap stored as 2 separate records (buy + sell)`);
      } else {
        console.log(`\n   ❌ INCORRECT: Unexpected storage pattern for split swap`);
      }
    }
    
    console.log('\n' + '='.repeat(100));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkInfluencerSplitTransaction();
