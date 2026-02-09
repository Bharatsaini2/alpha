const { MongoClient } = require('mongodb');
require('dotenv').config({ path: './alpha-tracker-ai/backend/.env' });

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'alphaTrackerDB';

async function checkLatestSplitSwaps() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    
    // Check KOL transactions
    console.log('='.repeat(80));
    console.log('CHECKING KOL TRANSACTIONS COLLECTION');
    console.log('='.repeat(80));
    
    const kolCollection = db.collection('koltransactions');
    
    // Find latest split swap in KOL
    const latestKolSplitSwap = await kolCollection
      .find({ 
        type: 'both',
        'bothType.buyType': { $exists: true },
        'bothType.sellType': { $exists: true }
      })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();
    
    if (latestKolSplitSwap.length > 0) {
      const tx = latestKolSplitSwap[0];
      console.log('\n✅ LATEST SPLIT SWAP FOUND IN KOL:');
      console.log('-'.repeat(80));
      console.log('Signature:', tx.signature);
      console.log('Timestamp:', new Date(tx.timestamp).toISOString());
      console.log('Type:', tx.type);
      console.log('KOL Address:', tx.walletAddress);
      console.log('KOL Label:', tx.whaleLabel);
      console.log('\nBoth Type:');
      console.log('  Buy Type:', tx.bothType?.buyType);
      console.log('  Sell Type:', tx.bothType?.sellType);
      console.log('\nAmounts:');
      console.log('  Buy Amount:', tx.amount?.buyAmount);
      console.log('  Sell Amount:', tx.amount?.sellAmount);
      console.log('\nTokens:');
      console.log('  Token In (Sell):', tx.transaction?.tokenIn?.symbol, '-', tx.tokenInAddress);
      console.log('  Token Out (Buy):', tx.transaction?.tokenOut?.symbol, '-', tx.tokenOutAddress);
      console.log('\nFull bothType object:', JSON.stringify(tx.bothType, null, 2));
    } else {
      console.log('\n❌ NO SPLIT SWAP FOUND IN KOL COLLECTION');
    }
    
    // Count total split swaps in KOL
    const kolSplitSwapCount = await kolCollection.countDocuments({
      type: 'both',
      'bothType.buyType': { $exists: true },
      'bothType.sellType': { $exists: true }
    });
    console.log('\nTotal split swaps in KOL collection:', kolSplitSwapCount);
    
    // Check WHALE transactions
    console.log('\n' + '='.repeat(80));
    console.log('CHECKING WHALE TRANSACTIONS COLLECTION');
    console.log('='.repeat(80));
    
    const whaleCollection = db.collection('whaletransactions');
    
    // Find latest split swap in WHALE
    const latestWhaleSplitSwap = await whaleCollection
      .find({ 
        type: 'both',
        'bothType.buyType': { $exists: true },
        'bothType.sellType': { $exists: true }
      })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();
    
    if (latestWhaleSplitSwap.length > 0) {
      const tx = latestWhaleSplitSwap[0];
      console.log('\n✅ LATEST SPLIT SWAP FOUND IN WHALE:');
      console.log('-'.repeat(80));
      console.log('Signature:', tx.signature);
      console.log('Timestamp:', new Date(tx.timestamp).toISOString());
      console.log('Type:', tx.type);
      console.log('Whale Address:', tx.walletAddress);
      console.log('Whale Label:', tx.whaleLabel);
      console.log('\nBoth Type:');
      console.log('  Buy Type:', tx.bothType?.buyType);
      console.log('  Sell Type:', tx.bothType?.sellType);
      console.log('\nAmounts:');
      console.log('  Buy Amount:', tx.amount?.buyAmount);
      console.log('  Sell Amount:', tx.amount?.sellAmount);
      console.log('\nTokens:');
      console.log('  Token In (Sell):', tx.transaction?.tokenIn?.symbol, '-', tx.tokenInAddress);
      console.log('  Token Out (Buy):', tx.transaction?.tokenOut?.symbol, '-', tx.tokenOutAddress);
      console.log('\nFull bothType object:', JSON.stringify(tx.bothType, null, 2));
    } else {
      console.log('\n❌ NO SPLIT SWAP FOUND IN WHALE COLLECTION');
    }
    
    // Count total split swaps in WHALE
    const whaleSplitSwapCount = await whaleCollection.countDocuments({
      type: 'both',
      'bothType.buyType': { $exists: true },
      'bothType.sellType': { $exists: true }
    });
    console.log('\nTotal split swaps in WHALE collection:', whaleSplitSwapCount);
    
    // Check for recent 'both' type transactions (last 24 hours)
    console.log('\n' + '='.repeat(80));
    console.log('RECENT "BOTH" TYPE TRANSACTIONS (LAST 24 HOURS)');
    console.log('='.repeat(80));
    
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    const recentKolBoth = await kolCollection
      .find({ 
        type: 'both',
        timestamp: { $gte: oneDayAgo }
      })
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();
    
    console.log(`\nKOL - Recent "both" transactions: ${recentKolBoth.length}`);
    recentKolBoth.forEach((tx, i) => {
      console.log(`\n${i + 1}. ${tx.signature.substring(0, 20)}...`);
      console.log(`   Time: ${new Date(tx.timestamp).toISOString()}`);
      console.log(`   Has bothType: ${!!tx.bothType}`);
      console.log(`   bothType.buyType: ${tx.bothType?.buyType || 'N/A'}`);
      console.log(`   bothType.sellType: ${tx.bothType?.sellType || 'N/A'}`);
    });
    
    const recentWhaleBoth = await whaleCollection
      .find({ 
        type: 'both',
        timestamp: { $gte: oneDayAgo }
      })
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();
    
    console.log(`\nWHALE - Recent "both" transactions: ${recentWhaleBoth.length}`);
    recentWhaleBoth.forEach((tx, i) => {
      console.log(`\n${i + 1}. ${tx.signature.substring(0, 20)}...`);
      console.log(`   Time: ${new Date(tx.timestamp).toISOString()}`);
      console.log(`   Has bothType: ${!!tx.bothType}`);
      console.log(`   bothType.buyType: ${tx.bothType?.buyType || 'N/A'}`);
      console.log(`   bothType.sellType: ${tx.bothType?.sellType || 'N/A'}`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`KOL split swaps: ${kolSplitSwapCount}`);
    console.log(`WHALE split swaps: ${whaleSplitSwapCount}`);
    console.log(`Recent KOL "both" (24h): ${recentKolBoth.length}`);
    console.log(`Recent WHALE "both" (24h): ${recentWhaleBoth.length}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

checkLatestSplitSwaps();
