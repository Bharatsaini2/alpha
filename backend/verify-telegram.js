/**
 * Script to verify Telegram connection in database
 * Run this with: node verify-telegram.js YOUR_EMAIL_OR_WALLET
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
  displayName: String,
}, { collection: 'users', strict: false });

const User = mongoose.model('User', userSchema);

// Main function
const verifyTelegram = async (identifier) => {
  try {
    await connectDB();

    console.log('🔍 Searching for user with:', identifier);

    // Try to find by email or wallet address
    let user = await User.findOne({
      $or: [
        { email: identifier },
        { walletAddress: identifier },
        { walletAddress: { $regex: new RegExp(`^${identifier}$`, 'i') } }
      ]
    });

    if (!user) {
      console.log('❌ User not found with identifier:', identifier);
      console.log('\n💡 Trying to find all users with wallet addresses...');
      
      const usersWithWallets = await User.find({ 
        walletAddress: { $exists: true, $ne: null } 
      }).limit(5);
      
      if (usersWithWallets.length > 0) {
        console.log('\n📋 Sample users with wallets:');
        usersWithWallets.forEach((u, i) => {
          console.log(`${i + 1}. Wallet: ${u.walletAddress}`);
          console.log(`   Email: ${u.email || 'None'}`);
          console.log(`   Telegram: ${u.telegramChatId ? 'Connected' : 'Not connected'}`);
        });
      }
      
      process.exit(1);
    }

    console.log('\n📋 User Details:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('User ID:', user._id);
    console.log('Email:', user.email || 'Not set');
    console.log('Display Name:', user.displayName || 'Not set');
    console.log('Wallet Address:', user.walletAddress || 'Not connected');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('\n📱 Telegram Connection Status:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (user.telegramChatId) {
      console.log('✅ TELEGRAM IS CONNECTED');
      console.log('Chat ID:', user.telegramChatId);
      console.log('Status: Ready to receive alerts! 🎉');
    } else {
      console.log('❌ TELEGRAM IS NOT CONNECTED');
      console.log('Status: No chat ID found in database');
      
      if (user.telegramLinkToken) {
        console.log('\n⚠️  Link Token Found:', user.telegramLinkToken);
        console.log('Token Expiry:', user.telegramLinkTokenExpiry);
        console.log('💡 Token exists but chat ID is missing - connection may have failed');
      } else {
        console.log('\n💡 No link token found - user has not attempted to connect');
      }
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Check for alerts
    const AlertSchema = new mongoose.Schema({}, { collection: 'useralerts', strict: false });
    const Alert = mongoose.model('Alert', AlertSchema);
    
    const alerts = await Alert.find({ userId: user._id, enabled: true });
    
    console.log('📢 Alert Subscriptions:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (alerts.length > 0) {
      console.log(`✅ ${alerts.length} active alert(s) found`);
      alerts.forEach((alert, index) => {
        console.log(`\n${index + 1}. Type: ${alert.type}`);
        console.log(`   Priority: ${alert.priority}`);
        console.log(`   Config:`, JSON.stringify(alert.config, null, 2));
      });
    } else {
      console.log('❌ No active alerts found');
      console.log('💡 User needs to create alert subscriptions');
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Summary
    console.log('📊 Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const canReceiveAlerts = user.telegramChatId && alerts.length > 0;
    
    if (canReceiveAlerts) {
      console.log('✅ User CAN receive Telegram alerts');
      console.log('   - Telegram connected: ✅');
      console.log('   - Active alerts: ✅');
    } else {
      console.log('❌ User CANNOT receive Telegram alerts');
      console.log(`   - Telegram connected: ${user.telegramChatId ? '✅' : '❌'}`);
      console.log(`   - Active alerts: ${alerts.length > 0 ? '✅' : '❌'}`);
      
      if (!user.telegramChatId) {
        console.log('\n💡 Action needed: Connect Telegram account');
      }
      if (alerts.length === 0) {
        console.log('💡 Action needed: Create alert subscriptions');
      }
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

// Get identifier from command line
const identifier = process.argv[2];

if (!identifier) {
  console.log('❌ Usage: node verify-telegram.js YOUR_EMAIL_OR_WALLET');
  console.log('Example: node verify-telegram.js user@example.com');
  console.log('Example: node verify-telegram.js 4BBLd5aEoV9qbpKBzeTMFyfLpycmKRbSKQWAe4ZpPBUs');
  process.exit(1);
}

verifyTelegram(identifier);
