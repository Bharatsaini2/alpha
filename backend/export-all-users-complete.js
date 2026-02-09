/**
 * Export All Users with Complete Details
 * - Wallet addresses
 * - Telegram connection status
 * - ALPHA token balance
 * - Login methods (legacy)
 * - Alert subscriptions
 */

const mongoose = require('mongoose');
const { Connection, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const ALPHA_TOKEN_MINT = 'ALPHAjGVt8J3USjg9xhePGW7UuMcRWWqjKRtDkGDdBFV';

// Initialize Solana connection
const connection = new Connection(RPC_URL, 'confirmed');

async function getAlphaBalance(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    const tokenMint = new PublicKey(ALPHA_TOKEN_MINT);
    
    // Get token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPubkey,
      { mint: tokenMint }
    );
    
    if (tokenAccounts.value.length === 0) {
      return 0;
    }
    
    // Sum all token account balances
    let totalBalance = 0;
    for (const account of tokenAccounts.value) {
      const balance = account.account.data.parsed.info.tokenAmount.uiAmount;
      totalBalance += balance || 0;
    }
    
    return totalBalance;
  } catch (error) {
    console.error(`Error fetching balance for ${walletAddress}:`, error.message);
    return 'ERROR';
  }
}

async function exportUsers() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Get User model
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
    const UserAlert = mongoose.model('UserAlert', new mongoose.Schema({}, { strict: false }), 'useralerts');
    
    console.log('📊 Fetching all users...');
    const users = await User.find({}).lean();
    console.log(`Found ${users.length} users\n`);
    
    console.log('📊 Fetching alert subscriptions...');
    const alerts = await UserAlert.find({ enabled: true }).lean();
    const alertsByUser = {};
    alerts.forEach(alert => {
      const userId = alert.userId.toString();
      if (!alertsByUser[userId]) {
        alertsByUser[userId] = [];
      }
      alertsByUser[userId].push(alert.type);
    });
    console.log(`Found ${alerts.length} active alert subscriptions\n`);
    
    console.log('💰 Fetching ALPHA token balances...\n');
    
    const results = [];
    let processed = 0;
    
    for (const user of users) {
      processed++;
      console.log(`Processing ${processed}/${users.length}: ${user.walletAddress || user.email || user._id}`);
      
      // Get ALPHA balance
      let alphaBalance = 'N/A';
      if (user.walletAddress) {
        alphaBalance = await getAlphaBalance(user.walletAddress);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Get alert subscriptions
      const userAlerts = alertsByUser[user._id.toString()] || [];
      
      results.push({
        userId: user._id.toString(),
        walletAddress: user.walletAddress || '',
        walletAddressOriginal: user.walletAddressOriginal || '',
        displayName: user.displayName || '',
        email: user.email || '',
        
        // Telegram
        telegramConnected: user.telegramChatId ? 'Yes' : 'No',
        telegramChatId: user.telegramChatId || '',
        telegramUsername: user.telegramUsername || '',
        telegramFirstName: user.telegramFirstName || '',
        
        // Legacy login methods
        googleId: user.googleId || '',
        twitterId: user.twitterId || '',
        
        // ALPHA balance
        alphaBalance: alphaBalance,
        
        // Alert subscriptions
        alertCount: userAlerts.length,
        alertTypes: userAlerts.join(', '),
        
        // Metadata
        createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : '',
        lastLogin: user.lastLogin ? new Date(user.lastLogin).toISOString() : '',
        joinDate: user.joinDate ? new Date(user.joinDate).toISOString() : '',
      });
    }
    
    // Sort by ALPHA balance (highest first)
    results.sort((a, b) => {
      const balanceA = typeof a.alphaBalance === 'number' ? a.alphaBalance : 0;
      const balanceB = typeof b.alphaBalance === 'number' ? b.alphaBalance : 0;
      return balanceB - balanceA;
    });
    
    // Generate CSV
    const timestamp = Date.now();
    const filename = `all-users-export-${timestamp}.csv`;
    
    const headers = [
      'User ID',
      'Wallet Address',
      'Wallet Address (Original Case)',
      'Display Name',
      'Email',
      'Telegram Connected',
      'Telegram Chat ID',
      'Telegram Username',
      'Telegram First Name',
      'Google ID',
      'Twitter ID',
      'ALPHA Balance',
      'Alert Count',
      'Alert Types',
      'Created At',
      'Last Login',
      'Join Date'
    ];
    
    const csvRows = [headers.join(',')];
    
    for (const row of results) {
      const values = [
        row.userId,
        row.walletAddress,
        row.walletAddressOriginal,
        `"${row.displayName}"`,
        row.email,
        row.telegramConnected,
        row.telegramChatId,
        row.telegramUsername,
        `"${row.telegramFirstName}"`,
        row.googleId,
        row.twitterId,
        row.alphaBalance,
        row.alertCount,
        `"${row.alertTypes}"`,
        row.createdAt,
        row.lastLogin,
        row.joinDate
      ];
      csvRows.push(values.join(','));
    }
    
    const csv = csvRows.join('\n');
    fs.writeFileSync(filename, csv);
    
    console.log('\n✅ Export complete!');
    console.log(`📄 File: ${filename}`);
    console.log(`📊 Total users: ${results.length}`);
    
    // Summary statistics
    const withWallet = results.filter(r => r.walletAddress).length;
    const withTelegram = results.filter(r => r.telegramConnected === 'Yes').length;
    const withAlerts = results.filter(r => r.alertCount > 0).length;
    const withAlpha = results.filter(r => typeof r.alphaBalance === 'number' && r.alphaBalance > 0).length;
    const withGoogle = results.filter(r => r.googleId).length;
    const withTwitter = results.filter(r => r.twitterId).length;
    
    console.log('\n📈 Summary:');
    console.log(`   Users with wallet: ${withWallet}`);
    console.log(`   Users with Telegram: ${withTelegram}`);
    console.log(`   Users with alerts: ${withAlerts}`);
    console.log(`   Users with ALPHA tokens: ${withAlpha}`);
    console.log(`   Users with Google login: ${withGoogle}`);
    console.log(`   Users with Twitter login: ${withTwitter}`);
    
    // Top 10 ALPHA holders
    console.log('\n🏆 Top 10 ALPHA Token Holders:');
    results
      .filter(r => typeof r.alphaBalance === 'number' && r.alphaBalance > 0)
      .slice(0, 10)
      .forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.walletAddress.substring(0, 8)}... - ${r.alphaBalance.toLocaleString()} ALPHA`);
      });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

exportUsers();
