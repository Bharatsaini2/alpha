// Check how Telegram users have their wallet addresses saved
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function checkWalletFormats() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));

    // Find users with Telegram connected
    const telegramUsers = await User.find({
      telegramChatId: { $exists: true, $ne: null }
    }).lean();

    console.log(`📊 Found ${telegramUsers.length} users with Telegram\n`);
    console.log('═'.repeat(80));

    let withOriginal = 0;
    let withoutOriginal = 0;
    let withBoth = 0;

    telegramUsers.forEach((user, index) => {
      const hasWalletAddress = !!user.walletAddress;
      const hasWalletAddressOriginal = !!user.walletAddressOriginal;
      
      if (hasWalletAddressOriginal) withOriginal++;
      if (!hasWalletAddressOriginal) withoutOriginal++;
      if (hasWalletAddress && hasWalletAddressOriginal) withBoth++;

      if (index < 5) { // Show first 5 as examples
        console.log(`\n👤 User ${index + 1}: ${user.telegramUsername || user.telegramFirstName || 'Unknown'}`);
        console.log(`   walletAddress: ${user.walletAddress || 'NOT SET'}`);
        console.log(`   walletAddressOriginal: ${user.walletAddressOriginal || 'NOT SET'}`);
        
        if (user.walletAddress && user.walletAddressOriginal) {
          const isSame = user.walletAddress === user.walletAddressOriginal.toLowerCase();
          console.log(`   Match: ${isSame ? '✅ lowercase matches' : '❌ different'}`);
        }
      }
    });

    console.log('\n' + '═'.repeat(80));
    console.log('\n📈 SUMMARY:');
    console.log(`   Total Telegram users: ${telegramUsers.length}`);
    console.log(`   With walletAddressOriginal: ${withOriginal}`);
    console.log(`   Without walletAddressOriginal: ${withoutOriginal}`);
    console.log(`   With both fields: ${withBoth}`);

    // Now check a few users WITHOUT telegram to compare
    console.log('\n' + '═'.repeat(80));
    console.log('\n🔍 Checking users WITHOUT Telegram for comparison:\n');

    const nonTelegramUsers = await User.find({
      walletAddress: { $exists: true, $ne: null },
      $or: [
        { telegramChatId: { $exists: false } },
        { telegramChatId: null }
      ]
    }).limit(5).lean();

    nonTelegramUsers.forEach((user, index) => {
      console.log(`\n👤 Non-Telegram User ${index + 1}:`);
      console.log(`   Email: ${user.email || 'N/A'}`);
      console.log(`   walletAddress: ${user.walletAddress || 'NOT SET'}`);
      console.log(`   walletAddressOriginal: ${user.walletAddressOriginal || 'NOT SET'}`);
    });

    await mongoose.disconnect();
    console.log('\n\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkWalletFormats();
