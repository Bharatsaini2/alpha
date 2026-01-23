const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI;

// DexScreener fallback function
async function getTokenNameFromDexScreener(tokenAddress) {
  try {
    const dexResponse = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      { timeout: 5000 }
    );
    
    if (dexResponse.data?.pairs && dexResponse.data.pairs.length > 0) {
      const pair = dexResponse.data.pairs[0];
      const symbol = pair.baseToken?.symbol;
      const name = pair.baseToken?.name;
      
      if (symbol && symbol !== 'Unknown') {
        return { symbol, name: name || symbol };
      }
    }
  } catch (error) {
    // Silently fail
  }
  
  // Fallback to contract address
  const shortAddress = `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`;
  return { symbol: shortAddress, name: tokenAddress };
}

async function fixExistingUnknownTokens() {
  console.log('🔧 Fixing Existing Unknown Tokens in Database\n');
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

    // Find transactions with Unknown tokens
    console.log('🔍 Finding transactions with Unknown tokens...\n');
    
    const unknownKOL = await KOLTransactions.find({
      $or: [
        { 'transaction.tokenIn.symbol': 'Unknown' },
        { 'transaction.tokenOut.symbol': 'Unknown' }
      ]
    }).limit(100).lean();
    
    const unknownWhale = await WhaleTransactions.find({
      $or: [
        { 'transaction.tokenIn.symbol': 'Unknown' },
        { 'transaction.tokenOut.symbol': 'Unknown' }
      ]
    }).limit(100).lean();
    
    console.log(`   Found ${unknownKOL.length} KOL transactions`);
    console.log(`   Found ${unknownWhale.length} Whale transactions\n`);
    
    const allUnknown = [...unknownKOL, ...unknownWhale];
    
    if (allUnknown.length === 0) {
      console.log('✅ No Unknown tokens found! All good.\n');
      return;
    }
    
    console.log('='.repeat(80));
    console.log('\n🔄 Updating transactions...\n');
    
    let updated = 0;
    let failed = 0;
    
    for (const tx of allUnknown) {
      try {
        let needsUpdate = false;
        const updates = {};
        
        // Check tokenIn
        if (tx.transaction?.tokenIn?.symbol === 'Unknown') {
          const tokenAddress = tx.transaction.tokenIn.address;
          console.log(`   Fixing tokenIn: ${tokenAddress.slice(0, 8)}...`);
          
          const metadata = await getTokenNameFromDexScreener(tokenAddress);
          updates['transaction.tokenIn.symbol'] = metadata.symbol;
          updates['transaction.tokenIn.name'] = metadata.name;
          needsUpdate = true;
          
          console.log(`      ✅ ${metadata.symbol} (${metadata.name})`);
          
          // Rate limit protection
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Check tokenOut
        if (tx.transaction?.tokenOut?.symbol === 'Unknown') {
          const tokenAddress = tx.transaction.tokenOut.address;
          console.log(`   Fixing tokenOut: ${tokenAddress.slice(0, 8)}...`);
          
          const metadata = await getTokenNameFromDexScreener(tokenAddress);
          updates['transaction.tokenOut.symbol'] = metadata.symbol;
          updates['transaction.tokenOut.name'] = metadata.name;
          needsUpdate = true;
          
          console.log(`      ✅ ${metadata.symbol} (${metadata.name})`);
          
          // Rate limit protection
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Update the transaction
        if (needsUpdate) {
          const Model = unknownKOL.includes(tx) ? KOLTransactions : WhaleTransactions;
          await Model.updateOne({ _id: tx._id }, { $set: updates });
          updated++;
        }
        
      } catch (error) {
        console.log(`      ❌ Failed: ${error.message}`);
        failed++;
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 Results:');
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📝 Total: ${allUnknown.length}\n`);
    
    console.log('✅ Migration complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run with confirmation
console.log('⚠️  WARNING: This will update existing transactions in the database.\n');
console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

setTimeout(() => {
  fixExistingUnknownTokens();
}, 5000);
