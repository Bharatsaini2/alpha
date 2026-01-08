const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI);

// User model (simplified)
const userSchema = new mongoose.Schema({
  walletAddress: String,
  walletAddressOriginal: String,
  telegramChatId: String,
  email: String,
  createdAt: Date,
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);

async function disconnectTelegram() {
  try {
    console.log('🔍 Disconnecting Telegram from email account...\n');
    
    // Find the user with the email account
    const targetEmail = 'test@alphablock.ai';
    const targetChatId = '1831671028';
    
    const user = await User.findOne({ 
      email: targetEmail,
      telegramChatId: targetChatId
    });
    
    if (user) {
      console.log('✅ Found email account with Telegram connection:');
      console.log('📧 Email:', user.email);
      console.log('💰 Wallet:', user.walletAddress || 'Not set');
      console.log('📱 Telegram Chat ID:', user.telegramChatId);
      
      // Remove the telegram connection
      const result = await User.updateOne(
        { _id: user._id },
        { 
          $unset: { 
            telegramChatId: 1 
          } 
        }
      );
      
      if (result.modifiedCount > 0) {
        console.log('✅ Successfully disconnected Telegram from email account!');
        console.log('🎉 Your Telegram is now free to connect to a new wallet');
        console.log('\n📝 Next steps:');
        console.log('1. Go to your website');
        console.log('2. Connect your new wallet');
        console.log('3. Click "Connect Telegram" to link to new wallet');
      } else {
        console.log('❌ Failed to disconnect Telegram');
      }
    } else {
      console.log('❌ Email account with Telegram connection not found');
      
      // Let's check what we have
      const emailUser = await User.findOne({ email: targetEmail });
      const chatUser = await User.findOne({ telegramChatId: targetChatId });
      
      if (emailUser) {
        console.log('📧 Found email account but no Telegram connection');
      }
      if (chatUser) {
        console.log('📱 Found Telegram chat ID but different account');
        console.log('   Email:', chatUser.email || 'Not set');
        console.log('   Wallet:', chatUser.walletAddress || 'Not set');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

disconnectTelegram();