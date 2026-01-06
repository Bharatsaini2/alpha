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

// Define schemas
const userAlertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true },
  priority: { type: String, default: 'LOW' },
  enabled: { type: Boolean, default: true },
  config: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

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

const UserAlert = mongoose.model('UserAlert', userAlertSchema);
const User = mongoose.model('User', userSchema);

async function verifyAlerts() {
  try {
    // Your wallet address
    const walletAddress = '4BBLd5aEoV9qbpKBzeTMFyfLpycmKRbSKQWAe4ZpPBUs';
    
    console.log('\n🔍 Searching for user with wallet:', walletAddress);
    
    // Find user (check both lowercase and original)
    const user = await User.findOne({
      $or: [
        { walletAddress: walletAddress.toLowerCase() },
        { walletAddressOriginal: walletAddress }
      ]
    });
    
    if (!user) {
      console.log('❌ User not found with wallet address:', walletAddress);
      process.exit(1);
    }
    
    console.log('\n✅ User found:');
    console.log('   User ID:', user._id.toString());
    console.log('   Wallet Address:', user.walletAddress);
    console.log('   Wallet Address Original:', user.walletAddressOriginal);
    console.log('   Telegram Chat ID:', user.telegramChatId || 'Not connected');
    console.log('   Last Login:', user.lastLogin);
    
    // Find all alerts for this user
    const alerts = await UserAlert.find({ userId: user._id, enabled: true });
    
    console.log('\n📋 Active Alerts:', alerts.length);
    
    if (alerts.length === 0) {
      console.log('   No active alerts found');
    } else {
      alerts.forEach((alert, index) => {
        console.log(`\n   Alert #${index + 1}:`);
        console.log('   ├─ ID:', alert._id.toString());
        console.log('   ├─ Type:', alert.type);
        console.log('   ├─ Priority:', alert.priority);
        console.log('   ├─ Enabled:', alert.enabled);
        console.log('   ├─ Config:');
        console.log('   │  ├─ Hotness Threshold:', alert.config.hotnessScoreThreshold);
        console.log('   │  ├─ Wallet Labels:', alert.config.walletLabels?.join(', '));
        console.log('   │  └─ Min Buy Amount USD:', alert.config.minBuyAmountUSD);
        console.log('   ├─ Created:', alert.createdAt);
        console.log('   └─ Updated:', alert.updatedAt);
      });
    }
    
    console.log('\n✅ Verification complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

verifyAlerts();
