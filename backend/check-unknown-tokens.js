const mongoose = require('mongoose');

const MONGODB_URI = "mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker";

async function diagnoseUnknownTokens() {
  try {
    console.log('🔍 Connecting to MongoDB...\n');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');
    
    const WhaleTransactions = mongoose.model('WhaleAllTransactionsV2', 
      new mongoose.Schema({}, { strict: false, collection: 'whalealltransactionsv2' })
    );

    const KOLTransactions = mongoose.model('InfluencerWhaleTransactionsV2', 
      new mongoose.Schema({}, { strict: false, collection: 'influencerwhaletransactionsv2' })
    );

    // Count unknown tokens in whale transactions
    console.log('📊 WHALE TRANSACTIONS - Unknown Token Statistics:');
    console.log('='.repeat(60));
    
    const whaleUnknownInCount = await WhaleTransactions.countDocuments({ tokenInSymbol: 'Unknown' });
    const whaleUnknownOutCount = await WhaleTransactions.countDocuments({ tokenOutSymbol: 'Unknown' });
    const whaleMissingInCount = await WhaleTransactions.countDocuments({ tokenInSymbol: { $exists: false } });
    const whaleMissingOutCount = await WhaleTransactions.countDocuments({ tokenOutSymbol: { $exists: false } });
    const whaleTotal = await WhaleTransactions.countDocuments({});

    console.log(`   Total transactions: ${whaleTotal}`);
    console.log(`   tokenInSymbol = "Unknown": ${whaleUnknownInCount} (${((whaleUnknownInCount/whaleTotal)*100).toFixed(2)}%)`);
    console.log(`   tokenOutSymbol = "Unknown": ${whaleUnknownOutCount} (${((whaleUnknownOutCount/whaleTotal)*100).toFixed(2)}%)`);
    console.log(`   tokenInSymbol missing: ${whaleMissingInCount}`);
    console.log(`   tokenOutSymbol missing: ${whaleMissingOutCount}`);

    // Count unknown tokens in KOL transactions
    console.log('\n📊 KOL TRANSACTIONS - Unknown Token Statistics:');
    console.log('='.repeat(60));
    
    const kolUnknownInCount = await KOLTransactions.countDocuments({ tokenInSymbol: 'Unknown' });
    const kolUnknownOutCount = await KOLTransactions.countDocuments({ tokenOutSymbol: 'Unknown' });
    const kolMissingInCount = await KOLTransactions.countDocuments({ tokenInSymbol: { $exists: false } });
    const kolMissingOutCount = await KOLTransactions.countDocuments({ tokenOutSymbol: { $exists: false } });
    const kolTotal = await KOLTransactions.countDocuments({});

    console.log(`   Total transactions: ${kolTotal}`);
    console.log(`   tokenInSymbol = "Unknown": ${kolUnknownInCount} (${((kolUnknownInCount/kolTotal)*100).toFixed(2)}%)`);
    console.log(`   tokenOutSymbol = "Unknown": ${kolUnknownOutCount} (${((kolUnknownOutCount/kolTotal)*100).toFixed(2)}%)`);
    console.log(`   tokenInSymbol missing: ${kolMissingInCount}`);
    console.log(`   tokenOutSymbol missing: ${kolMissingOutCount}`);

    // Get sample unknown tokens from whale transactions
    console.log('\n📝 Sample Unknown Tokens (WHALE):');
    console.log('='.repeat(60));
    
    const whaleSamples = await WhaleTransactions.find({
      $or: [
        { tokenInSymbol: 'Unknown' },
        { tokenOutSymbol: 'Unknown' }
      ]
    }).sort({ timestamp: -1 }).limit(5).lean();

    whaleSamples.forEach((tx, i) => {
      console.log(`\n${i + 1}. Transaction:`);
      console.log(`   Signature: ${tx.signature}`);
      console.log(`   Type: ${tx.type}`);
      console.log(`   tokenInSymbol: ${tx.tokenInSymbol || 'N/A'}`);
      console.log(`   tokenInAddress: ${tx.tokenInAddress || 'N/A'}`);
      console.log(`   tokenOutSymbol: ${tx.tokenOutSymbol || 'N/A'}`);
      console.log(`   tokenOutAddress: ${tx.tokenOutAddress || 'N/A'}`);
      console.log(`   Has transaction.tokenIn: ${!!tx.transaction?.tokenIn}`);
      console.log(`   Has transaction.tokenOut: ${!!tx.transaction?.tokenOut}`);
      if (tx.transaction?.tokenIn) {
        console.log(`   transaction.tokenIn.symbol: ${tx.transaction.tokenIn.symbol || 'N/A'}`);
      }
      if (tx.transaction?.tokenOut) {
        console.log(`   transaction.tokenOut.symbol: ${tx.transaction.tokenOut.symbol || 'N/A'}`);
      }
      console.log(`   Timestamp: ${new Date(tx.timestamp).toLocaleString()}`);
    });

    // Get sample unknown tokens from KOL transactions
    console.log('\n\n📝 Sample Unknown Tokens (KOL):');
    console.log('='.repeat(60));
    
    const kolSamples = await KOLTransactions.find({
      $or: [
        { tokenInSymbol: 'Unknown' },
        { tokenOutSymbol: 'Unknown' }
      ]
    }).sort({ timestamp: -1 }).limit(5).lean();

    kolSamples.forEach((tx, i) => {
      console.log(`\n${i + 1}. Transaction:`);
      console.log(`   Signature: ${tx.signature}`);
      console.log(`   Type: ${tx.type}`);
      console.log(`   KOL: ${tx.influencerUsername || 'N/A'}`);
      console.log(`   tokenInSymbol: ${tx.tokenInSymbol || 'N/A'}`);
      console.log(`   tokenInAddress: ${tx.tokenInAddress || 'N/A'}`);
      console.log(`   tokenOutSymbol: ${tx.tokenOutSymbol || 'N/A'}`);
      console.log(`   tokenOutAddress: ${tx.tokenOutAddress || 'N/A'}`);
      console.log(`   Has transaction.tokenIn: ${!!tx.transaction?.tokenIn}`);
      console.log(`   Has transaction.tokenOut: ${!!tx.transaction?.tokenOut}`);
      if (tx.transaction?.tokenIn) {
        console.log(`   transaction.tokenIn.symbol: ${tx.transaction.tokenIn.symbol || 'N/A'}`);
      }
      if (tx.transaction?.tokenOut) {
        console.log(`   transaction.tokenOut.symbol: ${tx.transaction.tokenOut.symbol || 'N/A'}`);
      }
      console.log(`   Timestamp: ${new Date(tx.timestamp).toLocaleString()}`);
    });

    // Check recent transactions (last 24 hours)
    console.log('\n\n📅 Recent Transactions (Last 24 Hours):');
    console.log('='.repeat(60));
    
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const recentWhaleTotal = await WhaleTransactions.countDocuments({ timestamp: { $gte: yesterday } });
    const recentWhaleUnknown = await WhaleTransactions.countDocuments({ 
      timestamp: { $gte: yesterday },
      $or: [
        { tokenInSymbol: 'Unknown' },
        { tokenOutSymbol: 'Unknown' }
      ]
    });

    const recentKOLTotal = await KOLTransactions.countDocuments({ timestamp: { $gte: yesterday } });
    const recentKOLUnknown = await KOLTransactions.countDocuments({ 
      timestamp: { $gte: yesterday },
      $or: [
        { tokenInSymbol: 'Unknown' },
        { tokenOutSymbol: 'Unknown' }
      ]
    });

    console.log(`   Whale transactions: ${recentWhaleTotal}`);
    console.log(`   Whale with Unknown: ${recentWhaleUnknown} (${((recentWhaleUnknown/recentWhaleTotal)*100).toFixed(2)}%)`);
    console.log(`   KOL transactions: ${recentKOLTotal}`);
    console.log(`   KOL with Unknown: ${recentKOLUnknown} (${((recentKOLUnknown/recentKOLTotal)*100).toFixed(2)}%)`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Diagnosis complete\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

diagnoseUnknownTokens();
