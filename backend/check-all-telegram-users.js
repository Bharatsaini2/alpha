// Check all Telegram users in the database
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function checkAllTelegramUsers() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));

    // Find all users with Telegram connected
    const telegramUsers = await User.find({ 
      telegramChatId: { $exists: true, $ne: null } 
    }).lean();

    console.log(`📊 Total Telegram Users: ${telegramUsers.length}\n`);
    console.log('═'.repeat(80));

    telegramUsers.forEach((user, index) => {
      console.log(`\n👤 User ${index + 1}:`);
      console.log(`   ID: ${user._id}`);
      console.log(`   Email: ${user.email || 'N/A'}`);
      console.log(`   Wallet: ${user.walletAddress || 'N/A'}`);
      console.log(`   Telegram Chat ID: ${user.telegramChatId}`);
      console.log(`   Telegram Username: ${user.telegramUsername ? '@' + user.telegramUsername : '❌ NOT SET'}`);
      console.log(`   Telegram First Name: ${user.telegramFirstName || '❌ NOT SET'}`);
      console.log(`   Display Name: ${user.displayName || 'N/A'}`);
      
      // Determine what will be shown in UI
      let displayInUI;
      if (user.telegramUsername) {
        displayInUI = `@${user.telegramUsername}`;
      } else if (user.telegramFirstName) {
        displayInUI = user.telegramFirstName;
      } else {
        displayInUI = 'User';
      }
      console.log(`   🎯 Will Display As: ${displayInUI}`);
    });

    console.log('\n' + '═'.repeat(80));
    console.log('\n📈 Summary:');
    
    const withUsername = telegramUsers.filter(u => u.telegramUsername).length;
    const withFirstName = telegramUsers.filter(u => !u.telegramUsername && u.telegramFirstName).length;
    const withNeither = telegramUsers.filter(u => !u.telegramUsername && !u.telegramFirstName).length;
    
    console.log(`   ✅ With Username: ${withUsername}`);
    console.log(`   ⚠️  With First Name Only: ${withFirstName}`);
    console.log(`   ❌ With Neither (will show "User"): ${withNeither}`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkAllTelegramUsers();
