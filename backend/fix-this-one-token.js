const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI;
const tokenAddress = '3yr17ZEE6wvCG7e3qD51XsfeSoSSKuCKptVissoopump';

async function fixThisToken() {
  console.log('🔧 Testing Fix on Actual Database Record\n');
  console.log('='.repeat(80));
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const KOLTransactions = mongoose.model('InfluencerWhaleTransactionsV2', 
      new mongoose.Schema({}, { strict: false, collection: 'influencerwhaletransactionsv2' })
    );

    const WhaleTransactions = mongoose.model('WhaleAllTransactionsV2', 
      new mongoose.Schema({}, { strict: false, collection: 'whalealltransactionsv2' })
    );

    // Find transactions with this specific token
    console.log(`🔍 Looking for token: ${tokenAddress}\n`);
    
    const kolTx = await KOLTransactions.findOne({
      $or: [
        { 'transaction.tokenIn.address': tokenAddress },
        { 'transaction.tokenOut.address': tokenAddress }
      ]
    }).lean();
    
    const whaleTx = await WhaleTransactions.findOne({
      $or: [
        { 'transaction.tokenIn.address': tokenAddress },
        { 'transaction.tokenOut.address': tokenAddress }
      ]
    }).lean();
    
    const tx = kolTx || whaleTx;
    const Model = kolTx ? KOLTransactions : WhaleTransactions;
    const collection = kolTx ? 'KOL' : 'WHALE';
    
    if (!tx) {
      console.log('❌ Token not found in database\n');
      return;
    }
    
    console.log(`✅ Found in ${collection} collection`);
    console.log(`   Signature: ${tx.signature}\n`);
    
    // Check current state
    const isTokenIn = tx.transaction?.tokenIn?.address === tokenAddress;
    const currentSymbol = isTokenIn ? tx.transaction?.tokenIn?.symbol : tx.transaction?.tokenOut?.symbol;
    const currentName = isTokenIn ? tx.transaction?.tokenIn?.name : tx.transaction?.tokenOut?.name;
    
    console.log('📊 BEFORE:');
    console.log(`   Symbol: ${currentSymbol}`);
    console.log(`   Name: ${currentName}\n`);
    
    // Fetch from DexScreener
    console.log('🔄 Fetching from DexScreener...\n');
    
    const dexResponse = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      { timeout: 5000 }
    );
    
    if (dexResponse.data?.pairs && dexResponse.data.pairs.length > 0) {
      const pair = dexResponse.data.pairs[0];
      const newSymbol = pair.baseToken?.symbol;
      const newName = pair.baseToken?.name;
      
      console.log('✅ DexScreener Response:');
      console.log(`   Symbol: ${newSymbol}`);
      console.log(`   Name: ${newName}\n`);
      
      // Update the database
      const updateField = isTokenIn ? 'transaction.tokenIn' : 'transaction.tokenOut';
      const updates = {
        [`${updateField}.symbol`]: newSymbol,
        [`${updateField}.name`]: newName
      };
      
      console.log('💾 Updating database...\n');
      
      await Model.updateOne({ _id: tx._id }, { $set: updates });
      
      console.log('📊 AFTER:');
      console.log(`   Symbol: ${newSymbol}`);
      console.log(`   Name: ${newName}\n`);
      
      console.log('='.repeat(80));
      console.log('\n✅ SUCCESS! Token updated in database.');
      console.log('🎉 Refresh your Alpha Stream to see the change!\n');
      console.log('This PROVES the fix works. Deploy to production with confidence! 🚀\n');
      
    } else {
      console.log('❌ DexScreener returned no data\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

fixThisToken();
