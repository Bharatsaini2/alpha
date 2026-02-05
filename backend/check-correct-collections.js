const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function checkCorrectCollections() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');
    
    // Check the correct collection names based on what we see
    const collectionsToCheck = [
      'whalealltransactionv2',
      'whaletransactions', 
      'influencerwhaletransactionsv2',
      'influencerwhalealltransactions'
    ];
    
    for (const collectionName of collectionsToCheck) {
      console.log(`\n=== CHECKING ${collectionName.toUpperCase()} ===`);
      
      const count = await mongoose.connection.db.collection(collectionName).countDocuments();
      console.log(`Total documents: ${count}`);
      
      if (count > 0) {
        const recent = await mongoose.connection.db.collection(collectionName)
          .find({})
          .sort({ timestamp: -1 })
          .limit(3)
          .toArray();
        
        console.log(`Recent transactions:`);
        recent.forEach((tx, i) => {
          console.log(`${i + 1}. Signature: ${tx.signature || tx.transaction?.signature || 'N/A'}`);
          console.log(`   Type: ${tx.type || 'N/A'}`);
          console.log(`   Token: ${tx.token_symbol || tx.transaction?.tokenOut?.symbol || 'N/A'}`);
          console.log(`   Amount: ${tx.amount || tx.transaction?.tokenOut?.amount || 'N/A'}`);
          console.log(`   Timestamp: ${tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : 'N/A'}`);
          console.log(`   Address: ${tx.address || tx.whale?.address || 'N/A'}`);
          console.log('');
        });
        
        // Check for SWAP transactions with non-stable tokens
        const swapCount = await mongoose.connection.db.collection(collectionName)
          .countDocuments({
            type: 'SWAP',
            $or: [
              { token_symbol: { $nin: ['SOL', 'USDC', 'USDT', 'WSOL'] } },
              { 'transaction.tokenOut.symbol': { $nin: ['SOL', 'USDC', 'USDT', 'WSOL'] } }
            ]
          });
        
        console.log(`SWAP transactions with non-stable tokens: ${swapCount}`);
        
        if (swapCount > 0) {
          const swapSamples = await mongoose.connection.db.collection(collectionName)
            .find({
              type: 'SWAP',
              $or: [
                { token_symbol: { $nin: ['SOL', 'USDC', 'USDT', 'WSOL'] } },
                { 'transaction.tokenOut.symbol': { $nin: ['SOL', 'USDC', 'USDT', 'WSOL'] } }
              ]
            })
            .sort({ timestamp: -1 })
            .limit(3)
            .toArray();
          
          console.log(`Sample SWAP transactions that should be split:`);
          swapSamples.forEach((tx, i) => {
            console.log(`${i + 1}. ${tx.signature || tx.transaction?.signature}`);
            console.log(`   Token: ${tx.token_symbol || tx.transaction?.tokenOut?.symbol}`);
            console.log(`   Amount: ${tx.amount || tx.transaction?.tokenOut?.amount}`);
          });
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkCorrectCollections().catch(console.error);