// Check ALPHA balance only for users with valid wallet format (walletAddressOriginal)
const mongoose = require('mongoose');
const { Connection, PublicKey } = require('@solana/web3.js');
const fs = require('fs');

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';
const ALPHA_TOKEN_MINT = '3wtGGWZ8wLWW6BqtC5rxmkHdqvM62atUcGTH4cw3pump';
const REQUIRED_BALANCE = 500000; // 500k ALPHA
const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=ef5e9c05-c3bf-4179-91eb-07fd3a8b9b6b';

async function checkValidWalletsOnly() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));

    // Find ONLY users with walletAddressOriginal (valid format like Telegram users)
    const users = await User.find({
      walletAddressOriginal: { $exists: true, $ne: null }
    }).lean();

    console.log(`📊 Found ${users.length} users with valid wallet format (walletAddressOriginal)\n`);
    console.log('🔍 Checking ALPHA balances...\n');

    const connection = new Connection(RPC_URL, 'confirmed');
    const results = [];
    let processed = 0;
    let eligible = 0;
    let notEligible = 0;
    let errors = 0;

    for (const user of users) {
      processed++;
      
      try {
        const walletPubkey = new PublicKey(user.walletAddressOriginal);

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

        const isEligible = alphaBalance >= REQUIRED_BALANCE;
        const hasTelegram = !!user.telegramChatId;

        if (isEligible) eligible++;
        else notEligible++;

        results.push({
          userId: user._id.toString(),
          email: user.email || '',
          walletAddress: user.walletAddress || '',
          walletAddressOriginal: user.walletAddressOriginal,
          alphaBalance: alphaBalance.toFixed(2),
          isEligible: isEligible ? 'YES' : 'NO',
          hasTelegram: hasTelegram ? 'YES' : 'NO',
          telegramUsername: user.telegramUsername || '',
          telegramFirstName: user.telegramFirstName || '',
          displayName: user.displayName || '',
          createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : '',
          lastLogin: user.lastLogin ? new Date(user.lastLogin).toISOString() : ''
        });

        if (processed % 5 === 0) {
          console.log(`Progress: ${processed}/${users.length} (${eligible} eligible, ${notEligible} not eligible, ${errors} errors)`);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 150));

      } catch (error) {
        errors++;
        console.log(`❌ Error checking ${user.walletAddressOriginal}: ${error.message}`);
        results.push({
          userId: user._id.toString(),
          email: user.email || '',
          walletAddress: user.walletAddress || '',
          walletAddressOriginal: user.walletAddressOriginal,
          alphaBalance: 'ERROR',
          isEligible: 'UNKNOWN',
          hasTelegram: user.telegramChatId ? 'YES' : 'NO',
          telegramUsername: user.telegramUsername || '',
          telegramFirstName: user.telegramFirstName || '',
          displayName: user.displayName || '',
          createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : '',
          lastLogin: user.lastLogin ? new Date(user.lastLogin).toISOString() : '',
          error: error.message
        });
      }
    }

    console.log(`\n✅ Processing complete!\n`);

    // Generate CSV
    const timestamp = Date.now();
    const filename = `valid-wallets-alpha-audit-${timestamp}.csv`;
    
    // CSV header
    const header = 'User ID,Email,Wallet Address,Wallet Address Original,ALPHA Balance,Is Eligible (≥500k),Has Telegram,Telegram Username,Telegram First Name,Display Name,Created At,Last Login,Error\n';
    
    // CSV rows
    const rows = results.map(r => 
      `"${r.userId}","${r.email}","${r.walletAddress}","${r.walletAddressOriginal}","${r.alphaBalance}","${r.isEligible}","${r.hasTelegram}","${r.telegramUsername}","${r.telegramFirstName}","${r.displayName}","${r.createdAt}","${r.lastLogin}","${r.error || ''}"`
    ).join('\n');

    fs.writeFileSync(filename, header + rows);

    console.log('═'.repeat(80));
    console.log('\n📈 SUMMARY:');
    console.log(`   Total users checked: ${users.length}`);
    console.log(`   ✅ Eligible (≥${REQUIRED_BALANCE.toLocaleString()} ALPHA): ${eligible}`);
    console.log(`   ❌ Not eligible: ${notEligible}`);
    console.log(`   ⚠️  Errors: ${errors}`);
    console.log(`\n   Users with Telegram: ${results.filter(r => r.hasTelegram === 'YES').length}`);
    console.log(`   Users without Telegram: ${results.filter(r => r.hasTelegram === 'NO').length}`);
    
    // Breakdown by eligibility and Telegram status
    const eligibleWithTelegram = results.filter(r => r.isEligible === 'YES' && r.hasTelegram === 'YES').length;
    const eligibleWithoutTelegram = results.filter(r => r.isEligible === 'YES' && r.hasTelegram === 'NO').length;
    const notEligibleWithTelegram = results.filter(r => r.isEligible === 'NO' && r.hasTelegram === 'YES').length;
    const notEligibleWithoutTelegram = results.filter(r => r.isEligible === 'NO' && r.hasTelegram === 'NO').length;

    console.log(`\n📊 DETAILED BREAKDOWN:`);
    console.log(`   ✅ Eligible + Has Telegram: ${eligibleWithTelegram}`);
    console.log(`   ⚠️  Eligible + NO Telegram: ${eligibleWithoutTelegram} ⚠️`);
    console.log(`   ❌ Not Eligible + Has Telegram: ${notEligibleWithTelegram}`);
    console.log(`   ❌ Not Eligible + NO Telegram: ${notEligibleWithoutTelegram}`);

    if (eligibleWithoutTelegram > 0) {
      console.log(`\n🔴 ALERT: ${eligibleWithoutTelegram} user(s) have sufficient ALPHA but NO Telegram!`);
      console.log(`   These users should be contacted:`);
      results.filter(r => r.isEligible === 'YES' && r.hasTelegram === 'NO').forEach(u => {
        console.log(`   - ${u.email || u.walletAddressOriginal} (${u.alphaBalance} ALPHA)`);
      });
    }

    console.log(`\n💾 CSV Report saved: ${filename}`);
    console.log('═'.repeat(80));

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkValidWalletsOnly();
