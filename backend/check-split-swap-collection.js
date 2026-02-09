const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI;

// Define schemas
const whaleTransactionSchema = new mongoose.Schema({}, { strict: false, collection: 'whaletransactions' });
const kolTransactionSchema = new mongoose.Schema({}, { strict: false, collection: 'koltransactions' });

const WhaleTransaction = mongoose.model('WhaleTransaction', whaleTransactionSchema);
const KolTransaction = mongoose.model('KolTransaction', kolTransactionSchema);

async function checkSplitSwapCollections() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check whale transactions
    console.log('=== WHALE TRANSACTIONS (whaletransactions) ===\n');
    
    const whaleCount = await WhaleTransaction.countDocuments({ type: 'both' });
    console.log(`Total split swap transactions: ${whaleCount}\n`);

    if (whaleCount > 0) {
      const latestWhale = await WhaleTransaction.findOne({ type: 'both' })
        .sort({ timestamp: -1 })
        .lean();

      console.log('Latest split swap transaction:');
      console.log('- Signature:', latestWhale.signature);
      console.log('- Timestamp:', new Date(latestWhale.timestamp));
      console.log('- Type:', latestWhale.type);
      console.log('- Wallet:', latestWhale.walletAddress);
      console.log('- Token In:', latestWhale.transaction?.tokenIn?.symbol || 'N/A');
      console.log('- Token Out:', latestWhale.transaction?.tokenOut?.symbol || 'N/A');
      console.log('- Buy Amount:', latestWhale.amount?.buyAmount || 'N/A');
      console.log('- Sell Amount:', latestWhale.amount?.sellAmount || 'N/A');
      console.log('- Collection:', latestWhale.constructor.collection.name);
      console.log('\nFull document structure:');
      console.log(JSON.stringify(latestWhale, null, 2));
    }

    console.log('\n\n=== KOL TRANSACTIONS (koltransactions) ===\n');
    
    const kolCount = await KolTransaction.countDocuments({ type: 'both' });
    console.log(`Total split swap transactions: ${kolCount}\n`);

    if (kolCount > 0) {
      const latestKol = await KolTransaction.findOne({ type: 'both' })
        .sort({ timestamp: -1 })
        .lean();

      console.log('Latest split swap transaction:');
      console.log('- Signature:', latestKol.signature);
      console.log('- Timestamp:', new Date(latestKol.timestamp));
      console.log('- Type:', latestKol.type);
      console.log('- Wallet:', latestKol.walletAddress);
      console.log('- Token In:', latestKol.transaction?.tokenIn?.symbol || 'N/A');
      console.log('- Token Out:', latestKol.transaction?.tokenOut?.symbol || 'N/A');
      console.log('- Buy Amount:', latestKol.amount?.buyAmount || 'N/A');
      console.log('- Sell Amount:', latestKol.amount?.sellAmount || 'N/A');
      console.log('- Collection:', latestKol.constructor.collection.name);
      console.log('\nFull document structure:');
      console.log(JSON.stringify(latestKol, null, 2));
    }

    // Check collection names in database
    console.log('\n\n=== DATABASE COLLECTIONS ===\n');
    const collections = await mongoose.connection.db.listCollections().toArray();
    const relevantCollections = collections.filter(c => 
      c.name.toLowerCase().includes('transaction') || 
      c.name.toLowerCase().includes('whale') || 
      c.name.toLowerCase().includes('kol')
    );
    
    console.log('Relevant collections found:');
    relevantCollections.forEach(c => {
      console.log(`- ${c.name}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkSplitSwapCollections();
