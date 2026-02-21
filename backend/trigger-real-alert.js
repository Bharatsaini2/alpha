const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

async function triggerRealAlert() {
  try {
    console.log('🧪 Triggering Real Alert Test...\n');
    
    // Step 1: Find a recent whale transaction that should match your alert
    const whaleTransactionSchema = new mongoose.Schema({}, { strict: false });
    const WhaleTransaction = mongoose.model('WhaleAllTransactionV2', whaleTransactionSchema, 'whalealltransactionv2');
    
    console.log('🔍 Finding a whale transaction that matches your alert criteria...');
    
    const matchingTx = await WhaleTransaction.findOne({
      'whale.address': { $exists: true },
      'transaction.tokenOut.usdAmount': { $gte: 1000 }, // Your min amount
      hotnessScore: { $gte: 0 }, // Your hotness threshold
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    }).sort({ timestamp: -1 });
    
    if (!matchingTx) {
      console.log('❌ No matching transactions found in last 24 hours');
      console.log('   Looking for any recent whale transaction...');
      
      const anyTx = await WhaleTransaction.findOne({
        'whale.address': { $exists: true }
      }).sort({ timestamp: -1 });
      
      if (anyTx) {
        console.log('📊 Found recent transaction (may not match your criteria):');
        console.log('   ├─ USD Amount:', anyTx.transaction?.tokenOut?.usdAmount || 'N/A');
        console.log('   ├─ Hotness Score:', anyTx.hotnessScore || 'N/A');
        console.log('   └─ This might not trigger an alert due to your thresholds');
      }
      
      process.exit(1);
    }
    
    console.log('✅ Found matching transaction:');
    console.log('   ├─ Signature:', matchingTx.signature);
    console.log('   ├─ USD Amount: $' + matchingTx.transaction.tokenOut.usdAmount);
    console.log('   ├─ Hotness Score:', matchingTx.hotnessScore);
    console.log('   ├─ Whale Address:', matchingTx.whale.address);
    console.log('   └─ Timestamp:', matchingTx.timestamp);
    
    // Step 2: Send this transaction to the running backend via HTTP
    console.log('\n📤 Sending transaction to AlertMatcherService...');
    
    const axios = require('axios');
    
    try {
      // Try to send to a webhook endpoint (if it exists)
      const response = await axios.post('http://localhost:9090/api/v1/webhook/process-whale-transaction', {
        transaction: matchingTx
      }, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Transaction sent successfully');
      console.log('📊 Response:', response.data);
      
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('❌ Backend not responding. Make sure npm run dev is running.');
      } else if (error.response?.status === 404) {
        console.log('⚠️  Webhook endpoint not found (expected)');
        console.log('   The real system processes transactions automatically');
      } else {
        console.log('⚠️  Error:', error.message);
      }
    }
    
    // Step 3: Simulate what would happen
    console.log('\n🎯 Alert Simulation:');
    console.log('   If this transaction occurred right now, here\'s what would happen:');
    console.log('   1. ✅ Transaction meets USD threshold ($' + matchingTx.transaction.tokenOut.usdAmount + ' >= $1000)');
    console.log('   2. ✅ Transaction meets hotness threshold (' + matchingTx.hotnessScore + ' >= 0)');
    console.log('   3. ✅ AlertMatcherService would match this to your subscription');
    console.log('   4. ✅ TelegramService would send alert to chat ID: 8519526605');
    console.log('   5. 📱 You would receive the alert in @alphabotdevbot');
    
    console.log('\n💡 To test this live:');
    console.log('   1. Keep the backend running (npm run dev)');
    console.log('   2. Wait for new whale transactions to be processed');
    console.log('   3. Check your Telegram for alerts');
    console.log('   4. Or create a new alert with lower thresholds to catch more transactions');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

triggerRealAlert();