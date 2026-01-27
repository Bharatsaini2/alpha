const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/alpha-tracker';
const TX_HASH = '2VN8uJHYKLpUs7WpupJHu2qE9bnRHESCLMN9Dz7wSGDYtnHawkDhWHPE3R7TUhsPBPBbhQGEwG5ee6WA1R1jvStE';

async function checkTransaction() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const influencerWhaleTransactionsModelV2 = require('./dist/models/influencerWhaleTransactionsV2.model').default;

    // Find transaction by signature
    const tx = await influencerWhaleTransactionsModelV2
      .findOne({ signature: TX_HASH })
      .lean();

    if (!tx) {
      console.log(`❌ Transaction not found: ${TX_HASH}\n`);
      console.log('This transaction might not be in the database yet.');
      return;
    }

    console.log(`🔍 Transaction Found: ${TX_HASH}\n`);
    console.log('═'.repeat(80));
    
    console.log('\n📊 Basic Info:');
    console.log(`   Type: ${tx.type}`);
    console.log(`   Created: ${tx.createdAt}`);
    console.log(`   Timestamp: ${tx.timestamp}`);
    
    console.log('\n💰 Token In:');
    console.log(`   Symbol: ${tx.transaction?.tokenIn?.symbol || tx.tokenInSymbol || 'N/A'}`);
    console.log(`   Name: ${tx.transaction?.tokenIn?.name || 'N/A'}`);
    console.log(`   Address: ${tx.transaction?.tokenIn?.address || tx.tokenInAddress || 'N/A'}`);
    console.log(`   Amount: ${tx.transaction?.tokenIn?.amount || 'N/A'}`);
    console.log(`   USD Amount: ${tx.transaction?.tokenIn?.usdAmount || 'N/A'}`);
    
    console.log('\n💰 Token Out:');
    console.log(`   Symbol: ${tx.transaction?.tokenOut?.symbol || tx.tokenOutSymbol || 'N/A'}`);
    console.log(`   Name: ${tx.transaction?.tokenOut?.name || 'N/A'}`);
    console.log(`   Address: ${tx.transaction?.tokenOut?.address || tx.tokenOutAddress || 'N/A'}`);
    console.log(`   Amount: ${tx.transaction?.tokenOut?.amount || 'N/A'}`);
    console.log(`   USD Amount: ${tx.transaction?.tokenOut?.usdAmount || 'N/A'}`);
    
    console.log('\n🔍 Analysis:');
    
    // Check for Unknown tokens
    const tokenInSymbol = tx.transaction?.tokenIn?.symbol || tx.tokenInSymbol;
    const tokenOutSymbol = tx.transaction?.tokenOut?.symbol || tx.tokenOutSymbol;
    
    if (tokenInSymbol === 'Unknown') {
      console.log(`   ⚠️  TokenIn is "Unknown"`);
      console.log(`   Address: ${tx.transaction?.tokenIn?.address || tx.tokenInAddress}`);
    }
    
    if (tokenOutSymbol === 'Unknown') {
      console.log(`   ⚠️  TokenOut is "Unknown"`);
      console.log(`   Address: ${tx.transaction?.tokenOut?.address || tx.tokenOutAddress}`);
    }
    
    // Check for shortened address format
    if (tokenInSymbol?.includes('...')) {
      console.log(`   ⚠️  TokenIn using shortened address: ${tokenInSymbol}`);
    }
    
    if (tokenOutSymbol?.includes('...')) {
      console.log(`   ⚠️  TokenOut using shortened address: ${tokenOutSymbol}`);
    }
    
    if (tokenInSymbol !== 'Unknown' && !tokenInSymbol?.includes('...') && tokenInSymbol !== 'SOL' && tokenInSymbol !== 'USDC') {
      console.log(`   ✅ TokenIn has valid symbol: ${tokenInSymbol}`);
    }
    
    if (tokenOutSymbol !== 'Unknown' && !tokenOutSymbol?.includes('...') && tokenOutSymbol !== 'SOL' && tokenOutSymbol !== 'USDC') {
      console.log(`   ✅ TokenOut has valid symbol: ${tokenOutSymbol}`);
    }
    
    console.log('\n' + '═'.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkTransaction();
