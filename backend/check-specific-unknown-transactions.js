const mongoose = require('mongoose');
const axios = require('axios');

const MONGODB_URI = "mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker";

const signatures = [
  '5U1Q5nuWscdx5HRCuYBBYZU1FRtjUJJkxrh1vXEPYWi9LSYojEvGPjboUnB6PnuCFvyJ9MG5n9gK2hi63LKJ4iHa',
  '5iM5yeHZ32Y8Ku8fUegmGCe5H7xupKYqFRhUpxrE42EizAgbCHc5QVcEQN9xqXQbgSoVp7VzoeCaQyHJeudJFxv9',
  '3x19h7WBVGdDGNdQFMyFLLcibYRj6WA2Af7M3SBj8GxFEW1phhW3t7XXHpznJ6o7sXn8Com752HBUuCMAo1NLXCB'
];

async function checkTransactions() {
  try {
    console.log('🔍 Connecting to MongoDB...\n');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');
    
    const KOLTransactions = mongoose.model('InfluencerWhaleTransactionsV2', 
      new mongoose.Schema({}, { strict: false, collection: 'influencerwhaletransactionsv2' })
    );

    const WhaleTransactions = mongoose.model('WhaleAllTransactionsV2', 
      new mongoose.Schema({}, { strict: false, collection: 'whalealltransactionsv2' })
    );

    for (const signature of signatures) {
      console.log('='.repeat(80));
      console.log(`\n🔍 Checking transaction: ${signature.substring(0, 20)}...${signature.substring(signature.length - 10)}\n`);
      
      // Check KOL collection
      let tx = await KOLTransactions.findOne({ signature }).lean();
      let collection = 'KOL';
      
      if (!tx) {
        // Check Whale collection
        tx = await WhaleTransactions.findOne({ signature }).lean();
        collection = 'WHALE';
      }
      
      if (!tx) {
        console.log('❌ Transaction not found in either collection\n');
        continue;
      }
      
      console.log(`✅ Found in ${collection} collection\n`);
      console.log('📊 Transaction Data:');
      console.log(`   Type: ${tx.type}`);
      console.log(`   Timestamp: ${new Date(tx.timestamp).toLocaleString()}`);
      console.log(`   tokenInSymbol: ${tx.tokenInSymbol || 'N/A'}`);
      console.log(`   tokenInAddress: ${tx.tokenInAddress || 'N/A'}`);
      console.log(`   tokenOutSymbol: ${tx.tokenOutSymbol || 'N/A'}`);
      console.log(`   tokenOutAddress: ${tx.tokenOutAddress || 'N/A'}`);
      
      if (tx.transaction) {
        console.log(`\n   transaction.tokenIn.symbol: ${tx.transaction.tokenIn?.symbol || 'N/A'}`);
        console.log(`   transaction.tokenIn.name: ${tx.transaction.tokenIn?.name || 'N/A'}`);
        console.log(`   transaction.tokenOut.symbol: ${tx.transaction.tokenOut?.symbol || 'N/A'}`);
        console.log(`   transaction.tokenOut.name: ${tx.transaction.tokenOut?.name || 'N/A'}`);
      }
      
      // Check which token is Unknown
      const unknownTokenAddress = tx.tokenInSymbol === 'Unknown' ? tx.tokenInAddress : 
                                   tx.tokenOutSymbol === 'Unknown' ? tx.tokenOutAddress : null;
      
      if (unknownTokenAddress) {
        console.log(`\n🔍 Checking Unknown token: ${unknownTokenAddress}\n`);
        
        // Check DexScreener
        try {
          const dexResponse = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${unknownTokenAddress}`);
          if (dexResponse.data && dexResponse.data.pairs && dexResponse.data.pairs.length > 0) {
            const pair = dexResponse.data.pairs[0];
            console.log('   DexScreener Response:');
            console.log(`   ✅ Symbol: ${pair.baseToken?.symbol || 'N/A'}`);
            console.log(`   ✅ Name: ${pair.baseToken?.name || 'N/A'}`);
            console.log(`   ✅ Price: $${pair.priceUsd || 'N/A'}`);
          } else {
            console.log('   ❌ DexScreener: No pairs found');
          }
        } catch (error) {
          console.log(`   ❌ DexScreener error: ${error.message}`);
        }
        
        // Check Jupiter
        try {
          const jupResponse = await axios.get(`https://price.jup.ag/v4/price?ids=${unknownTokenAddress}`);
          if (jupResponse.data && jupResponse.data.data && jupResponse.data.data[unknownTokenAddress]) {
            const tokenData = jupResponse.data.data[unknownTokenAddress];
            console.log(`   ✅ Jupiter: Price $${tokenData.price || 'N/A'}`);
          } else {
            console.log('   ❌ Jupiter: Not found');
          }
        } catch (error) {
          console.log(`   ❌ Jupiter error: ${error.message}`);
        }
      }
      
      console.log('');
    }
    
    console.log('='.repeat(80));
    console.log('\n✅ Check complete\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkTransactions();
