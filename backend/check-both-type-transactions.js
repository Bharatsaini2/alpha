const mongoose = require('mongoose');

const MONGODB_URI = "mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker";

async function checkTransaction() {
  try {
    const signature = "XXvrbx5h8jFer9QkcrPgHUqxUeLCoAJG3sen2brcKW65azGCVMgMeWVo8CGVgAGt7yWiZkJT3h5dr2JLdMKNjtj";
    
    console.log(`🔍 Checking transaction: ${signature}\n`);
    
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check KOL transactions
    const InfluencerWhaleTransactionsV2 = mongoose.model(
      'InfluencerWhaleTransactionsV2',
      new mongoose.Schema({}, { strict: false, collection: 'influencerwhaletransactionsv2' })
    );

    const tx = await InfluencerWhaleTransactionsV2.findOne({ signature }).lean();

    if (!tx) {
      console.log('❌ Transaction not found in KOL collection\n');
      
      // Check whale collection
      const WhaleAllTransactionsV2 = mongoose.model(
        'WhaleAllTransactionsV2',
        new mongoose.Schema({}, { strict: false, collection: 'whalealltransactionsv2' })
      );
      
      const whaleTx = await WhaleAllTransactionsV2.findOne({ signature }).lean();
      
      if (whaleTx) {
        console.log('✅ Found in WHALE collection\n');
        console.log('Transaction Details:');
        console.log('===================');
        console.log(`Type: ${whaleTx.type}`);
        console.log(`Whale Address: ${whaleTx.whale?.address || whaleTx.whaleAddress || 'N/A'}`);
        console.log(`Has whale object: ${!!whaleTx.whale}`);
        console.log(`Token: ${whaleTx.tokenOutSymbol || 'N/A'}`);
        console.log(`Buy Amount: $${whaleTx.amount?.buyAmount || 0}`);
        console.log(`Sell Amount: $${whaleTx.amount?.sellAmount || 0}`);
        console.log(`Hotness: ${whaleTx.hotnessScore || 0}/10`);
        console.log(`Timestamp: ${whaleTx.timestamp}`);
      } else {
        console.log('❌ Transaction not found in either collection\n');
      }
    } else {
      console.log('✅ Found in KOL collection\n');
      console.log('Transaction Details:');
      console.log('===================');
      console.log(`Type: ${tx.type}`);
      console.log(`KOL: ${tx.influencerUsername || 'N/A'}`);
      console.log(`KOL Address: ${tx.kolAddress || 'N/A'}`);
      console.log(`Whale Address: ${tx.whaleAddress || 'N/A'}`);
      console.log(`Has whale object: ${!!tx.whale}`);
      if (tx.whale) {
        console.log(`  whale.address: ${tx.whale.address}`);
        console.log(`  whale.labels: ${tx.whale.labels?.length || 0}`);
      }
      console.log(`Token: ${tx.tokenOutSymbol || 'N/A'}`);
      console.log(`Buy Amount: $${tx.amount?.buyAmount || 0}`);
      console.log(`Sell Amount: $${tx.amount?.sellAmount || 0}`);
      console.log(`Hotness: ${tx.hotnessScore || 0}/10`);
      console.log(`Timestamp: ${tx.timestamp}`);
      console.log('');
      
      // Check if it would pass alert matcher
      console.log('Alert Matcher Check:');
      console.log('===================');
      
      if (!tx.whale || !tx.whale.address) {
        console.log('❌ WOULD BE SKIPPED - No whale object');
        console.log('   This transaction will NOT trigger alerts');
      } else {
        console.log('✅ HAS whale object - would be processed');
        
        if (tx.type === 'sell') {
          console.log('❌ WOULD BE SKIPPED - Type is "sell"');
          console.log('   Only buy and both types trigger alerts');
        } else {
          console.log(`✅ Type is "${tx.type}" - would pass type check`);
          console.log('   This transaction WOULD trigger alerts (if filters match)');
        }
      }
    }

    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkTransaction();
