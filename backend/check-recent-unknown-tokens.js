const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/alpha-tracker';

async function checkUnknownTokens() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Import the model (use dist for compiled version)
    const influencerWhaleTransactionsModelV2 = require('./dist/models/influencerWhaleTransactionsV2.model').default;

    // Find recent transactions with unknown tokens
    const unknownTokens = await influencerWhaleTransactionsModelV2
      .find({
        $or: [
          { 'transaction.tokenIn.symbol': 'Unknown' },
          { 'transaction.tokenOut.symbol': 'Unknown' },
          { 'transaction.tokenIn.symbol': /^[A-Za-z0-9]{4}\.\.\./ }, // Fallback format
          { 'transaction.tokenOut.symbol': /^[A-Za-z0-9]{4}\.\.\./ },
        ]
      })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    console.log(`\n📊 Found ${unknownTokens.length} transactions with unknown tokens:\n`);

    unknownTokens.forEach((tx, idx) => {
      console.log(`${idx + 1}. Signature: ${tx.signature}`);
      console.log(`   Type: ${tx.type}`);
      console.log(`   TokenIn: ${tx.transaction.tokenIn.symbol} (${tx.transaction.tokenIn.address})`);
      console.log(`   TokenOut: ${tx.transaction.tokenOut.symbol} (${tx.transaction.tokenOut.address})`);
      console.log(`   Created: ${tx.createdAt}`);
      console.log('');
    });

    // Check if there's a pattern
    const unknownInCount = unknownTokens.filter(tx => tx.transaction.tokenIn.symbol === 'Unknown').length;
    const unknownOutCount = unknownTokens.filter(tx => tx.transaction.tokenOut.symbol === 'Unknown').length;
    const fallbackCount = unknownTokens.filter(tx => 
      tx.transaction.tokenIn.symbol?.match(/^[A-Za-z0-9]{4}\.\.\./) ||
      tx.transaction.tokenOut.symbol?.match(/^[A-Za-z0-9]{4}\.\.\./)
    ).length;

    console.log(`\n📈 Summary:`);
    console.log(`   Unknown tokens: ${unknownInCount + unknownOutCount}`);
    console.log(`   Fallback format: ${fallbackCount}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkUnknownTokens();
