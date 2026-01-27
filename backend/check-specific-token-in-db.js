const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/alpha-tracker';
const TOKEN_ADDRESS = 'a3W4qutoEJA4232T2gwZUfgYJTetr96pU4SJMwppump';

async function checkToken() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const influencerWhaleTransactionsModelV2 = require('./dist/models/influencerWhaleTransactionsV2.model').default;

    // Find transactions with this token
    const transactions = await influencerWhaleTransactionsModelV2
      .find({
        $or: [
          { tokenInAddress: TOKEN_ADDRESS },
          { tokenOutAddress: TOKEN_ADDRESS },
          { 'transaction.tokenIn.address': TOKEN_ADDRESS },
          { 'transaction.tokenOut.address': TOKEN_ADDRESS }
        ]
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    console.log(`🔍 Found ${transactions.length} transactions with token ${TOKEN_ADDRESS}\n`);

    if (transactions.length === 0) {
      console.log('ℹ️  No transactions found with this token in database');
      console.log('   This might be a new token or not traded by tracked wallets\n');
    } else {
      transactions.forEach((tx, idx) => {
        console.log(`${idx + 1}. Signature: ${tx.signature}`);
        console.log(`   Type: ${tx.type}`);
        console.log(`   Created: ${tx.createdAt}`);
        
        // Check tokenIn
        if (tx.tokenInAddress === TOKEN_ADDRESS || tx.transaction?.tokenIn?.address === TOKEN_ADDRESS) {
          console.log(`   TokenIn Symbol: ${tx.transaction?.tokenIn?.symbol || tx.tokenInSymbol || 'N/A'}`);
          console.log(`   TokenIn Name: ${tx.transaction?.tokenIn?.name || 'N/A'}`);
        }
        
        // Check tokenOut
        if (tx.tokenOutAddress === TOKEN_ADDRESS || tx.transaction?.tokenOut?.address === TOKEN_ADDRESS) {
          console.log(`   TokenOut Symbol: ${tx.transaction?.tokenOut?.symbol || tx.tokenOutSymbol || 'N/A'}`);
          console.log(`   TokenOut Name: ${tx.transaction?.tokenOut?.name || 'N/A'}`);
        }
        
        console.log('');
      });
    }

    console.log('📊 Expected values (from DexScreener):');
    console.log('   Symbol: WhiteWhale');
    console.log('   Name: The White Whale');
    console.log('   Price: $0.08036');
    console.log('   MarketCap: $76.3M\n');

    console.log('✅ If symbol shows as "Unknown" or "a3W4...pump", the fix will help!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkToken();
