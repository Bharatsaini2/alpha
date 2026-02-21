const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

async function createLowThresholdAlert() {
  try {
    console.log('🔔 Creating Low Threshold Alert for Testing...\n');
    
    // Find your user
    const userSchema = new mongoose.Schema({
      email: String,
      walletAddress: String,
      walletAddressOriginal: String,
      telegramChatId: String,
    });
    
    const alertSchema = new mongoose.Schema({
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      type: String,
      priority: String,
      enabled: Boolean,
      config: Object,
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    });
    
    const User = mongoose.model('TestUser2', userSchema);
    const UserAlert = mongoose.model('TestUserAlert2', alertSchema);
    
    const walletAddress = '4BBLd5aEoV9qbpKBzeTMFyfLpycmKRbSKQWAe4ZpPBUs';
    
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
    
    // Create a very low threshold alert to catch any transaction
    const testAlert = new UserAlert({
      userId: user._id,
      type: 'ALPHA_STREAM',
      priority: 'HIGH',
      enabled: true,
      config: {
        hotnessScoreThreshold: 0,    // Any hotness
        walletLabels: [],            // All labels (empty array)
        minBuyAmountUSD: 1           // Just $1 minimum!
      }
    });
    
    await testAlert.save();
    
    console.log('✅ Created test alert:');
    console.log('   ├─ ID:', testAlert._id.toString());
    console.log('   ├─ Type: ALPHA_STREAM');
    console.log('   ├─ Priority: HIGH');
    console.log('   ├─ Hotness Threshold: 0 (any)');
    console.log('   ├─ Wallet Labels: [] (all)');
    console.log('   └─ Min Buy Amount: $1');
    
    console.log('\n🎯 This alert should catch almost ANY whale transaction!');
    console.log('📱 Watch your Telegram (@alphabotdevbot) for alerts');
    console.log('⏰ Alerts should start coming within 1-2 minutes');
    
    console.log('\n💡 To remove this test alert later, run:');
    console.log(`   db.useralerts.deleteOne({_id: ObjectId("${testAlert._id}")})`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

createLowThresholdAlert();