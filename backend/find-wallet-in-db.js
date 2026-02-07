// Find how this wallet is stored in the database
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';
const SEARCH_WALLET = '5ATM1ywJ5fz24MSZC7WfGL8hfy1xV3yfAjAAugky5WYJ';

async function findWallet() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));

    // Search for this wallet (case-insensitive)
    const searchLower = SEARCH_WALLET.toLowerCase();
    
    const user = await User.findOne({
      $or: [
        { walletAddress: searchLower },
        { walletAddressOriginal: SEARCH_WALLET }
      ]
    }).lean();

    if (!user) {
      console.log('❌ Wallet not found in database');
      console.log(`   Searched for: ${SEARCH_WALLET}`);
      console.log(`   Also searched lowercase: ${searchLower}`);
    } else {
      console.log('✅ Found user with this wallet!\n');
      console.log('═'.repeat(80));
      console.log(`User ID: ${user._id}`);
      console.log(`Email: ${user.email || 'N/A'}`);
      console.log(`\n📝 Wallet Storage:`);
      console.log(`   walletAddress (lowercase): ${user.walletAddress || 'NOT SET'}`);
      console.log(`   walletAddressOriginal: ${user.walletAddressOriginal || 'NOT SET'}`);
      console.log(`\n🔍 Comparison:`);
      console.log(`   Actual address: ${SEARCH_WALLET}`);
      console.log(`   Stored original: ${user.walletAddressOriginal || 'NOT SET'}`);
      console.log(`   Match: ${user.walletAddressOriginal === SEARCH_WALLET ? '✅ EXACT MATCH' : '❌ DIFFERENT'}`);
      
      if (user.walletAddressOriginal && user.walletAddressOriginal !== SEARCH_WALLET) {
        console.log(`\n⚠️  MISMATCH DETAILS:`);
        console.log(`   Expected: ${SEARCH_WALLET}`);
        console.log(`   Got:      ${user.walletAddressOriginal}`);
        console.log(`   Length expected: ${SEARCH_WALLET.length}`);
        console.log(`   Length got:      ${user.walletAddressOriginal.length}`);
      }
      
      console.log(`\n📱 Telegram:`);
      console.log(`   Has Telegram: ${user.telegramChatId ? 'YES' : 'NO'}`);
      console.log(`   Username: ${user.telegramUsername || 'N/A'}`);
      console.log(`   First Name: ${user.telegramFirstName || 'N/A'}`);
      console.log('═'.repeat(80));
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

findWallet();
