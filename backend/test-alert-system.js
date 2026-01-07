const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Import the AlertMatcherService
const { alertMatcherService } = require('./dist/src/services/alertMatcher.service');

// Define schemas
const whaleTransactionSchema = new mongoose.Schema({}, { strict: false });
const WhaleTransaction = mongoose.model('WhaleAllTransactionV2', whaleTransactionSchema, 'whalealltransactionv2');

async function testAlertSystem() {
  try {
    console.log('🧪 Testing Alert System...\n');
    
    // Initialize the AlertMatcherService
    console.log('🔄 Initializing AlertMatcherService...');
    await alertMatcherService.initialize();
    console.log('✅ AlertMatcherService initialized\n');
    
    // Get a recent whale transaction that should match your alert
    console.log('🔍 Finding a recent whale transaction...');
    const recentTx = await WhaleTransaction.findOne({
      'whale.address': { $exists: true },
      'transaction.tokenOut.usdAmount': { $gte: 1000 }, // At least $1000
      hotnessScore: { $gte: 0 }, // Any hotness score
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    }).sort({ timestamp: -1 });
    
    if (!recentTx) {
      console.log('❌ No recent whale transactions found matching criteria');
      console.log('   Looking for any recent transaction...');
      
      const anyTx = await WhaleTransaction.findOne({
        'whale.address': { $exists: true }
      }).sort({ timestamp: -1 });
      
      if (anyTx) {
        console.log('📊 Found transaction:');
        console.log('   ├─ Signature:', anyTx.signature);
        console.log('   ├─ USD Amount:', anyTx.transaction?.tokenOut?.usdAmount || 'N/A');
        console.log('   ├─ Hotness Score:', anyTx.hotnessScore || 'N/A');
        console.log('   └─ Timestamp:', anyTx.timestamp);
        
        console.log('\n🧪 Processing this transaction through AlertMatcherService...');
        await alertMatcherService.processTransaction(anyTx);
        console.log('✅ Transaction processed');
      } else {
        console.log('❌ No whale transactions found at all');
      }
    } else {
      console.log('📊 Found matching transaction:');
      console.log('   ├─ Signature:', recentTx.signature);
      console.log('   ├─ Whale Address:', recentTx.whale.address);
      console.log('   ├─ USD Amount:', recentTx.transaction.tokenOut.usdAmount);
      console.log('   ├─ Hotness Score:', recentTx.hotnessScore);
      console.log('   ├─ Labels:', recentTx.whale.labels?.join(', ') || 'None');
      console.log('   └─ Timestamp:', recentTx.timestamp);
      
      console.log('\n🧪 Processing this transaction through AlertMatcherService...');
      await alertMatcherService.processTransaction(recentTx);
      console.log('✅ Transaction processed - check your Telegram for alert!');
    }
    
    // Get metrics
    console.log('\n📊 AlertMatcherService Metrics:');
    const metrics = alertMatcherService.getMetrics();
    console.log('   ├─ Total Matches:', metrics.matching.totalMatches);
    console.log('   ├─ Total Processed:', metrics.matching.totalProcessed);
    console.log('   ├─ Alpha Stream Subscriptions:', metrics.caches.subscription.alphaStreamCount);
    console.log('   └─ Average Latency:', metrics.matching.averageLatencyMs + 'ms');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await alertMatcherService.shutdown();
    await mongoose.connection.close();
    process.exit(0);
  }
}

testAlertSystem();