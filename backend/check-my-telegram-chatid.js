const mongoose = require('mongoose');
require('dotenv').config();

const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const User = mongoose.model('User', userSchema);

const alertSchema = new mongoose.Schema({}, { strict: false, collection: 'useralerts' });
const UserAlert = mongoose.model('UserAlert', alertSchema);

async function checkTelegramChatId() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('🔗 Connected to MongoDB\n');

    // Find user by wallet address
    const wallet = '4bbld5aeov9qbpkbzetmfyflpycmkrbskqwae4zppbus';
    const user = await User.findOne({ walletAddress: wallet });

    if (!user) {
      console.log('❌ User not found with wallet:', wallet);
      process.exit(1);
    }

    console.log('👤 USER INFO:');
    console.log('User ID:', user._id.toString());
    console.log('Wallet:', user.walletAddress);
    console.log('Telegram Chat ID:', user.telegramChatId || 'NOT SET');
    console.log('Telegram Username:', user.telegramUsername || 'NOT SET');
    console.log('Telegram First Name:', user.telegramFirstName || 'NOT SET');

    // Check alerts for this user
    const alerts = await UserAlert.find({ userId: user._id, enabled: true });
    console.log('\n📋 ACTIVE ALERTS:', alerts.length);
    
    for (const alert of alerts) {
      console.log('\nAlert ID:', alert._id.toString());
      console.log('Type:', alert.type);
      console.log('Enabled:', alert.enabled);
      console.log('Config:', JSON.stringify(alert.config, null, 2));
    }

    // Check if there are any other users with the same Telegram Chat ID
    if (user.telegramChatId) {
      const duplicates = await User.find({ 
        telegramChatId: user.telegramChatId,
        _id: { $ne: user._id }
      });
      
      if (duplicates.length > 0) {
        console.log('\n⚠️  WARNING: Found', duplicates.length, 'other user(s) with same Telegram Chat ID:');
        for (const dup of duplicates) {
          console.log('  - User ID:', dup._id.toString(), 'Wallet:', dup.walletAddress);
        }
      } else {
        console.log('\n✅ No duplicate Telegram Chat IDs found');
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkTelegramChatId();
