const mongoose = require('mongoose');
require('dotenv').config();

const WALLET_ADDRESS = '4BBLd5aEoV9qbpKBzeTMFyfLpycmKRbSKQWAe4ZpPBUs';

async function monitorAlerts() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find user
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
    const user = await User.findOne({ 
      $or: [
        { walletAddress: WALLET_ADDRESS.toLowerCase() },
        { walletAddressOriginal: WALLET_ADDRESS }
      ]
    });

    if (!user) {
      console.log('❌ User not found');
      process.exit(1);
    }

    console.log('✅ Found user:', user._id);
    console.log('');

    // Watch for changes
    const UserAlert = mongoose.model('UserAlert', new mongoose.Schema({}, { strict: false }), 'useralerts');
    
    console.log('👀 Watching for new alerts...');
    console.log('Create an alert from the UI now!\n');

    const changeStream = UserAlert.watch([
      { $match: { 'fullDocument.userId': user._id } }
    ]);

    changeStream.on('change', (change) => {
      console.log('\n🔔 NEW ALERT DETECTED!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Operation:', change.operationType);
      console.log('Alert ID:', change.fullDocument?._id);
      console.log('Type:', change.fullDocument?.type);
      console.log('Config:', JSON.stringify(change.fullDocument?.config, null, 2));
      console.log('Enabled:', change.fullDocument?.enabled);
      console.log('Created:', change.fullDocument?.createdAt);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    });

    // Keep script running
    console.log('Press Ctrl+C to stop monitoring\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

monitorAlerts();
