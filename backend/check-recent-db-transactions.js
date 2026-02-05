const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function checkRecentTransactions() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');
    
    // Check what collections exist
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\nAvailable collections:');
    collections.forEach(col => {
      console.log(`  - ${col.name}`);
    });
    
    // Get the most recent transactions from each collection
    console.log('\n=== RECENT WHALE TRANSACTIONS ===');
    const whaleTransactions = await mongoose.connection.db.collection('whale_transactions')
      .find({})
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();
    
    console.log(`Found ${whaleTransactions.length} whale transactions`);
    whaleTransactions.forEach((tx, i) => {
      console.log(`${i + 1}. ${tx.signature} - ${tx.type} - ${tx.token_symbol} - ${tx.amount} - ${new Date(tx.timestamp * 1000).toISOString()}`);
    });
    
    console.log('\n=== RECENT KOL TRANSACTIONS ===');
    const kolTransactions = await mongoose.connection.db.collection('kol_transactions')
      .find({})
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();
    
    console.log(`Found ${kolTransactions.length} KOL transactions`);
    kolTransactions.forEach((tx, i) => {
      console.log(`${i + 1}. ${tx.signature} - ${tx.type} - ${tx.token_symbol} - ${tx.amount} - ${new Date(tx.timestamp * 1000).toISOString()}`);
    });
    
    // Check for any transactions with SWAP type and non-stable tokens
    console.log('\n=== SWAP TRANSACTIONS WITH NON-STABLE TOKENS ===');
    const swapTransactions = await mongoose.connection.db.collection('whale_transactions')
      .find({
        type: 'SWAP',
        token_symbol: { $nin: ['SOL', 'USDC', 'USDT', 'WSOL'] }
      })
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();
    
    console.log(`Found ${swapTransactions.length} SWAP transactions with non-stable tokens (should be split)`);
    swapTransactions.forEach((tx, i) => {
      console.log(`${i + 1}. ${tx.signature} - ${tx.token_symbol} - ${tx.amount} - ${new Date(tx.timestamp * 1000).toISOString()}`);
    });
    
    // Check KOL swaps too
    const kolSwapTransactions = await mongoose.connection.db.collection('kol_transactions')
      .find({
        type: 'SWAP',
        token_symbol: { $nin: ['SOL', 'USDC', 'USDT', 'WSOL'] }
      })
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();
    
    console.log(`\nFound ${kolSwapTransactions.length} KOL SWAP transactions with non-stable tokens (should be split)`);
    kolSwapTransactions.forEach((tx, i) => {
      console.log(`${i + 1}. ${tx.signature} - ${tx.token_symbol} - ${tx.amount} - ${new Date(tx.timestamp * 1000).toISOString()}`);
    });
    
    // Check for transactions with suspicious amounts
    console.log('\n=== TRANSACTIONS WITH SUSPICIOUS AMOUNTS ===');
    const suspiciousTransactions = await mongoose.connection.db.collection('whale_transactions')
      .find({
        $or: [
          { amount: { $lt: 0.001 } },
          { amount: { $gt: 1000000 } },
          { amount: { $exists: false } },
          { amount: null }
        ]
      })
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();
    
    console.log(`Found ${suspiciousTransactions.length} whale transactions with suspicious amounts`);
    suspiciousTransactions.forEach((tx, i) => {
      console.log(`${i + 1}. ${tx.signature} - ${tx.token_symbol} - Amount: ${tx.amount} - ${new Date(tx.timestamp * 1000).toISOString()}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkRecentTransactions().catch(console.error);