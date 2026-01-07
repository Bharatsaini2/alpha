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

// Define user schema
const userSchema = new mongoose.Schema({
  email: String,
  walletAddress: String,
  walletAddressOriginal: String,
  telegramChatId: String,
  telegramLinkToken: String,
  telegramLinkTokenExpiry: Date,
  isActive: { type: Boolean, default: true },
  lastLogin: Date,
});

const User = mongoose.model('User', userSchema);

async function checkChatId() {
  try {
    // Your wallet address
    const walletAddress = '4BBLd5aEoV9qbpKBzeTMFyfLpycmKRbSKQWAe4ZpPBUs';
    
    console.log('\n🔍 Checking current chat ID for wallet:', walletAddress);
    
    // Find user
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
    
    console.log('\n📱 Current Telegram Info:');
    console.log('   Chat ID:', user.telegramChatId || 'Not set');
    console.log('   Link Token:', user.telegramLinkToken || 'Not set');
    console.log('   Token Expiry:', user.telegramLinkTokenExpiry || 'Not set');
    
    // If you want to update the chat ID manually, uncomment and modify this:
    /*
    const newChatId = 'YOUR_NEW_CHAT_ID_HERE';
    await User.updateOne(
      { _id: user._id },
      { telegramChatId: newChatId }
    );
    console.log('\n✅ Updated chat ID to:', newChatId);
    */
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

checkChatId();