require('dotenv').config();
const mongoose = require('mongoose');

const TRANSACTION_HASH = '4VfdyPU5UxpSeVfJ3D69d3zFsgFAxiZh9pJywLALaDpw4QJjoBt84s52q3JuVfDjG79PM8VZo3eLQhLP4ED4gJr3';

// Define the schema (minimal, just for querying)
const whaleAllTransactionsV2Schema = new mongoose.Schema({}, { 
  strict: false, 
  collection: 'whalealltransactionsv2' 
});

const WhaleAllTransactionsV2 = mongoose.model('WhaleAllTransactionsV2', whaleAllTransactionsV2Schema);

async function checkTransaction() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log(`🔎 Searching for transaction: ${TRANSACTION_HASH}\n`);

    // Search by signature field
    const transaction = await WhaleAllTransactionsV2.findOne({ 
      signature: TRANSACTION_HASH 
    }).lean();

    if (transaction) {
      console.log('✅ Transaction found in database!\n');
      console.log('📄 Full Document:');
      console.log('='.repeat(80));
      console.log(JSON.stringify(transaction, null, 2));
      console.log('='.repeat(80));
      
      console.log('\n📊 Key Fields Summary:');
      console.log('─'.repeat(80));
      console.log(`Signature: ${transaction.signature}`);
      console.log(`Wallet Address: ${transaction.walletAddress}`);
      console.log(`Token Address: ${transaction.tokenAddress}`);
      console.log(`Token Symbol: ${transaction.tokenSymbol}`);
      console.log(`Action: ${transaction.action}`);
      console.log(`Amount: ${transaction.amount}`);
      console.log(`Amount USD: $${transaction.amountUSD}`);
      console.log(`Timestamp: ${transaction.timestamp}`);
      console.log(`Created At: ${transaction.createdAt}`);
      console.log(`Parser Version: ${transaction.parserVersion || 'N/A'}`);
      console.log('─'.repeat(80));
    } else {
      console.log('❌ Transaction NOT found in database');
      console.log('\n🔍 Checking if any similar transactions exist...');
      
      const count = await WhaleAllTransactionsV2.countDocuments();
      console.log(`Total documents in collection: ${count}`);
      
      // Check for partial match
      const partialMatch = await WhaleAllTransactionsV2.findOne({
        signature: { $regex: TRANSACTION_HASH.substring(0, 20) }
      }).lean();
      
      if (partialMatch) {
        console.log('\n⚠️ Found a partial match:');
        console.log(JSON.stringify(partialMatch, null, 2));
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

checkTransaction();
