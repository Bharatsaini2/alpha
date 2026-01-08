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

async function checkTelegramConnection() {
  try {
    console.log('🔍 Checking Telegram connections...\n');
    
    // The chat ID from the URL you provided
    const targetChatId = '8361697087';
    
    // Find user with this chat ID
    const user = await User.findOne({ telegramChatId: targetChatId });
    
    if (user) {
      console.log('✅ Found user connected to this Telegram chat ID:');
      console.log('📧 Email:', user.email || 'Not set');
      console.log('💰 Wallet Address:', user.walletAddress || 'Not set');
      console.log('💰 Original Wallet:', user.walletAddressOriginal || 'Not set');
      console.log('📱 Telegram Chat ID:', user.telegramChatId);
      console.log('📅 Created:', user.createdAt);
      console.log('\n🔧 To disconnect this user:');
      console.log('1. Go to @AlphaBlockAIbot in Telegram');
      console.log('2. Send: /disconnect');
      console.log('3. Or manually update database to remove telegramChatId');
    } else {
      console.log('❌ No user found with Telegram chat ID:', targetChatId);
      console.log('\n🔍 Let me check all users with Telegram connections:');
      
      const allTelegramUsers = await User.find({ 
        telegramChatId: { $exists: true, $ne: null } 
      }).select('email walletAddress telegramChatId createdAt');
      
      if (allTelegramUsers.length > 0) {
        console.log(`\n📱 Found ${allTelegramUsers.length} users with Telegram connections:`);
        allTelegramUsers.forEach((user, index) => {
          console.log(`\n${index + 1}. Email: ${user.email || 'Not set'}`);
          console.log(`   Wallet: ${user.walletAddress || 'Not set'}`);
          console.log(`   Chat ID: ${user.telegramChatId}`);
          console.log(`   Created: ${user.createdAt}`);
        });
      } else {
        console.log('❌ No users found with Telegram connections');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

checkTelegramConnection();