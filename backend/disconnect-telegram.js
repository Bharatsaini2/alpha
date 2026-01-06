/**
 * Script to disconnect Telegram account from database
 * Run this with: node disconnect-telegram.js YOUR_EMAIL_OR_WALLET_ADDRESS
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// User schema (simplified)
const userSchema = new mongoose.Schema({
  email: String,
  walletAddress: String,
  telegramChatId: String,
  telegramLinkToken: String,
  telegramLinkTokenExpiry: Date,
}, { collection: 'users', strict: false }); // Allow extra fields

const User = mongoose.model('User', userSchema);

// Main function
const disconnectTelegram = async (identifier) => {
  try {
    await connectDB();

    console.log('🔍 Searching for user with:', identifier);

    // Find user by email first
    let user = await User.findOne({ email: identifier });

    // If not found by email, try wallet address (case insensitive)
    if (!user) {
      user = await User.findOne({ 
        walletAddress: { $regex: new RegExp(`^${identifier}$`, 'i') }
      });
    }

    // If still not found, try any field that might contain the identifier
    if (!user) {
      user = await User.findOne({
        $or: [
          { email: { $regex: new RegExp(identifier, 'i') } },
          { walletAddress: { $regex: new RegExp(identifier, 'i') } }
        ]
      });
    }

    if (!user) {
      console.log('❌ User not found with identifier:', identifier);
      console.log('\n💡 Let me search by email instead...');
      
      // Try to find any user with telegram connected to debug
      const anyUser = await User.findOne({ email: { $exists: true } }).limit(1);
      if (anyUser) {
        console.log('📋 Sample user structure:', {
          email: anyUser.email,
          walletAddress: anyUser.walletAddress,
          hasWallet: !!anyUser.walletAddress,
          walletType: typeof anyUser.walletAddress
        });
      }
      
      process.exit(1);
    }

    console.log('📋 Found user:', {
      _id: user._id,
      email: user.email,
      walletAddress: user.walletAddress,
      telegramChatId: user.telegramChatId ? '✅ Connected' : '❌ Not connected'
    });

    if (!user.telegramChatId) {
      console.log('ℹ️  Telegram is already disconnected');
      process.exit(0);
    }

    // Clear Telegram fields
    await User.updateOne(
      { _id: user._id },
      {
        $unset: {
          telegramChatId: 1,
          telegramLinkToken: 1,
          telegramLinkTokenExpiry: 1
        }
      }
    );

    console.log('✅ Telegram account disconnected successfully!');
    console.log('ℹ️  You can now reconnect with a fresh link');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

// Get identifier from command line
const identifier = process.argv[2];

if (!identifier) {
  console.log('❌ Usage: node disconnect-telegram.js YOUR_EMAIL_OR_WALLET_ADDRESS');
  console.log('Example: node disconnect-telegram.js user@example.com');
  console.log('Example: node disconnect-telegram.js 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU');
  process.exit(1);
}

disconnectTelegram(identifier);
