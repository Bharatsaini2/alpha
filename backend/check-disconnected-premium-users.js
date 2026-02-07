// Check if any users with sufficient ALPHA balance got disconnected
const mongoose = require('mongoose');
const { Connection, PublicKey } = require('@solana/web3.js');

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';
const ALPHA_TOKEN_MINT = '3wtGGWZ8wLWW6BqtC5rxmkHdqvM62atUcGTH4cw3pump';
const REQUIRED_BALANCE = 500000; // 500k ALPHA
const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=ef5e9c05-c3bf-4179-91eb-07fd3a8b9b6b';

async function checkDisconnectedUsers() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));
    const UserAlert = mongoose.model('UserAlert', new mongoose.Schema({}, { strict: false, collection: 'useralerts' }));

    // Find users who:
    // 1. Have a wallet address
    // 2. DON'T have Telegram connected (telegramChatId is null/undefined)
    const disconnectedUsers = await User.find({
      walletAddress: { $exists: true, $ne: null },
      $or: [
        { telegramChatId: { $exists: false } },
        { telegramChatId: null }
      ]
    }).lean();

    console.log(`📊 Found ${disconnectedUsers.length} users without Telegram connected\n`);
    console.log('🔍 Checking their ALPHA balances...\n');
    console.log('═'.repeat(80));

    const connection = new Connection(RPC_URL, 'confirmed');
    const usersWithSufficientBalance = [];

    for (const user of disconnectedUsers) {
      try {
        // Use walletAddressOriginal if available, otherwise walletAddress
        const walletToCheck = user.walletAddressOriginal || user.walletAddress;
        const walletPubkey = new PublicKey(walletToCheck);

        // Get token accounts
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          walletPubkey,
          { mint: new PublicKey(ALPHA_TOKEN_MINT) }
        );

        let alphaBalance = 0;
        if (tokenAccounts.value.length > 0) {
          const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount;
          alphaBalance = balance.uiAmount || 0;
        }

        if (alphaBalance >= REQUIRED_BALANCE) {
          usersWithSufficientBalance.push({
            ...user,
            alphaBalance
          });

          console.log(`\n⚠️  USER WITH SUFFICIENT BALANCE BUT NO TELEGRAM:`);
          console.log(`   User ID: ${user._id}`);
          console.log(`   Email: ${user.email || 'N/A'}`);
          console.log(`   Wallet: ${user.walletAddress}`);
          console.log(`   ALPHA Balance: ${alphaBalance.toLocaleString()} (Required: ${REQUIRED_BALANCE.toLocaleString()})`);
          console.log(`   Last Login: ${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'N/A'}`);
          console.log(`   Created: ${new Date(user.createdAt).toLocaleString()}`);
          
          // Check if they had Telegram before
          if (user.telegramUsername || user.telegramFirstName) {
            console.log(`   🔴 HAD TELEGRAM BEFORE:`);
            console.log(`      Username: ${user.telegramUsername || 'N/A'}`);
            console.log(`      First Name: ${user.telegramFirstName || 'N/A'}`);
          }

          // Check if they have any alerts
          const alerts = await UserAlert.find({ userId: user._id }).lean();
          console.log(`   Alerts: ${alerts.length}`);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.log(`\n❌ Error checking wallet ${user.walletAddress}: ${error.message}`);
      }
    }

    console.log('\n' + '═'.repeat(80));
    console.log(`\n📈 SUMMARY:`);
    console.log(`   Total disconnected users: ${disconnectedUsers.length}`);
    console.log(`   Users with ≥${REQUIRED_BALANCE.toLocaleString()} ALPHA but no Telegram: ${usersWithSufficientBalance.length}`);

    if (usersWithSufficientBalance.length > 0) {
      console.log(`\n🔴 ISSUE FOUND: ${usersWithSufficientBalance.length} user(s) have sufficient balance but no Telegram connection!`);
      console.log(`   This could indicate:`);
      console.log(`   1. They manually disconnected`);
      console.log(`   2. They were disconnected due to a bug`);
      console.log(`   3. They never connected Telegram despite having balance`);
    } else {
      console.log(`\n✅ No issues found - all users with sufficient balance have Telegram connected`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkDisconnectedUsers();
