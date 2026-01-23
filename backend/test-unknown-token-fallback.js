const mongoose = require('mongoose');
const axios = require('axios');

const MONGODB_URI = "mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker";

// Test the specific unknown transactions
const signatures = [
  '5uEqpKMs82Q1U4QA7YkMGhQXz4xgTgXrj5pTvdTWYvkBK9WJski5XmhWx5CnARvyrFDMXe5eB1x8SyXLjKHNSRDr',
  'Cz7MxubwfqFgSuSZb7CruiUbkRuLE6dJgbqiWcZPMAbw',
  'Bc7aomJAsvEY5D7s8hxXp2h2Px7BvYCfWhVbJfDt3yg'
];

async function testFallbackMechanism() {
  try {
    console.log('🔍 Testing Unknown Token Fallback Mechanism\n');
    console.log('='.repeat(80));
    
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const KOLTransactions = mongoose.model('InfluencerWhaleTransactionsV2', 
      new mongoose.Schema({}, { strict: false, collection: 'influencerwhaletransactionsv2' })
    );

    const WhaleTransactions = mongoose.model('WhaleAllTransactionsV2', 
      new mongoose.Schema({}, { strict: false, collection: 'whalealltransactionsv2' })
    );

    for (const signature of signatures) {
      console.log(`\n📝 Transaction: ${signature.substring(0, 20)}...${signature.substring(signature.length - 10)}\n`);
      
      // Find transaction
      let tx = await KOLTransactions.findOne({ signature }).lean();
      let collection = 'KOL';
      
      if (!tx) {
        tx = await WhaleTransactions.findOne({ signature }).lean();
        collection = 'WHALE';
      }
      
      if (!tx) {
        console.log('❌ Transaction not found\n');
        continue;
      }
      
      console.log(`✅ Found in ${collection} collection`);
      console.log(`   Type: ${tx.type}`);
      
      // Determine which token is unknown
      const tokenInSymbol = tx.transaction?.tokenIn?.symbol || tx.tokenInSymbol;
      const tokenOutSymbol = tx.transaction?.tokenOut?.symbol || tx.tokenOutSymbol;
      const tokenInAddress = tx.transaction?.tokenIn?.address || tx.tokenInAddress;
      const tokenOutAddress = tx.transaction?.tokenOut?.address || tx.tokenOutAddress;
      
      console.log(`   TokenIn: ${tokenInSymbol} (${tokenInAddress?.slice(0, 8)}...)`);
      console.log(`   TokenOut: ${tokenOutSymbol} (${tokenOutAddress?.slice(0, 8)}...)`);
      
      // Test fallback for unknown tokens
      const unknownTokenAddress = tokenInSymbol === 'Unknown' ? tokenInAddress : 
                                   tokenOutSymbol === 'Unknown' ? tokenOutAddress : null;
      
      if (unknownTokenAddress) {
        console.log(`\n🔄 Testing fallback for: ${unknownTokenAddress}\n`);
        
        // Test DexScreener API
        try {
          const dexResponse = await axios.get(
            `https://api.dexscreener.com/latest/dex/tokens/${unknownTokenAddress}`,
            { timeout: 5000 }
          );
          
          if (dexResponse.data?.pairs && dexResponse.data.pairs.length > 0) {
            const pair = dexResponse.data.pairs[0];
            console.log('   ✅ DexScreener Fallback:');
            console.log(`      Symbol: ${pair.baseToken?.symbol || 'N/A'}`);
            console.log(`      Name: ${pair.baseToken?.name || 'N/A'}`);
            console.log(`      Price: $${pair.priceUsd || 'N/A'}`);
          } else {
            console.log('   ⚠️ DexScreener: No pairs found');
            console.log(`   📋 Contract Address Fallback: ${unknownTokenAddress.slice(0, 4)}...${unknownTokenAddress.slice(-4)}`);
          }
        } catch (error) {
          console.log(`   ❌ DexScreener error: ${error.message}`);
          console.log(`   📋 Contract Address Fallback: ${unknownTokenAddress.slice(0, 4)}...${unknownTokenAddress.slice(-4)}`);
        }
      } else {
        console.log('\n✅ No unknown tokens in this transaction');
      }
      
      console.log('\n' + '-'.repeat(80));
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Test complete!\n');
    console.log('📌 Summary:');
    console.log('   1. RPC metadata fetch (primary)');
    console.log('   2. DexScreener API (fallback 1)');
    console.log('   3. Contract address display (fallback 2)');
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testFallbackMechanism();
