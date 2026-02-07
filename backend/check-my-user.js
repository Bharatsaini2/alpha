/**
 * Check what data the API returns for your user
 */

const axios = require('axios');

const API_URL = 'https://api.alpha-block.ai/api/v1';
// const API_URL = 'http://localhost:9090/api/v1';

async function checkUser() {
  try {
    console.log('🔍 Checking user data from API...\n');
    
    // You need to provide your auth token
    const token = process.argv[2];
    
    if (!token) {
      console.log('❌ Please provide your auth token:');
      console.log('   node check-my-user.js YOUR_TOKEN\n');
      console.log('Get your token from browser:');
      console.log('1. Open https://app.alpha-block.ai');
      console.log('2. Open DevTools (F12)');
      console.log('3. Go to Application > Local Storage');
      console.log('4. Copy the "token" value\n');
      return;
    }

    const response = await axios.get(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const user = response.data.data.user;

    console.log('📊 User Data from API:\n');
    console.log('═'.repeat(60));
    console.log(`Email: ${user.email || 'N/A'}`);
    console.log(`Display Name: ${user.displayName || 'N/A'}`);
    console.log(`Wallet: ${user.walletAddress || 'N/A'}`);
    console.log('─'.repeat(60));
    console.log(`Telegram Chat ID: ${user.telegramChatId || '❌ NOT CONNECTED'}`);
    console.log(`Telegram Username: ${user.telegramUsername ? '@' + user.telegramUsername : '❌ NOT SET'}`);
    console.log(`Telegram First Name: ${user.telegramFirstName || '❌ NOT SET'}`);
    console.log('═'.repeat(60));

    console.log('\n🎯 What frontend will show:');
    if (user.telegramUsername) {
      console.log(`   @${user.telegramUsername}`);
    } else if (user.telegramFirstName) {
      console.log(`   ${user.telegramFirstName} (first name fallback)`);
    } else {
      console.log(`   User (default fallback)`);
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

checkUser();
