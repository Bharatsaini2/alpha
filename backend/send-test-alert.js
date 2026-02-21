const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Import the TelegramService
const { telegramService } = require('./dist/services/telegram.service');

async function sendTestAlert() {
  try {
    console.log('🧪 Sending Test Alert...\n');
    
    // Your wallet address
    const walletAddress = '4BBLd5aEoV9qbpKBzeTMFyfLpycmKRbSKQWAe4ZpPBUs';
    
    // Find your user
    const userSchema = new mongoose.Schema({
      email: String,
      walletAddress: String,
      walletAddressOriginal: String,
      telegramChatId: String,
    });
    const User = mongoose.model('User', userSchema);
    
    const user = await User.findOne({
      $or: [
        { walletAddress: walletAddress.toLowerCase() },
        { walletAddressOriginal: walletAddress }
      ]
    });
    
    if (!user) {
      console.log('❌ User not found');
      process.exit(1);
    }
    
    console.log('👤 Found user:', user._id.toString());
    console.log('📱 Chat ID:', user.telegramChatId);
    
    // Create a test alert message
    const testMessage = `🐋 TEST WHALE ALERT 🚨

🔥 Hotness Score: 6/10
💰 Buy Amount: $8,489.12
🏷️ Token: TEST
📊 Wallet: Smart Money Whale
🔗 Signature: 47WtvWZN...eCRi

⏰ ${new Date().toLocaleString()}

This is a test alert to verify your whale alert system is working!`;

    // Queue the alert using TelegramService
    console.log('📤 Queueing test alert...');
    const queued = await telegramService.queueAlert(
      user._id.toString(),
      'ALPHA_STREAM',
      'test-' + Date.now(),
      testMessage,
      'HIGH'
    );
    
    if (queued) {
      console.log('✅ Test alert queued successfully!');
      console.log('📱 Check your Telegram (@alphabotdevbot) for the message');
      
      // Wait a moment for the message to be sent
      console.log('⏳ Waiting 3 seconds for message delivery...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } else {
      console.log('❌ Failed to queue test alert');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

sendTestAlert();