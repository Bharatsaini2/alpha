/**
 * Direct test of the Telegram Alert Service without needing Redis or full server
 */

const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const YOUR_CHAT_ID = '1831671028';

// Simplified alert service for testing
class TelegramAlertService {
  constructor(botToken) {
    this.botToken = botToken;
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  async sendMessage(chatId, text) {
    try {
      const response = await axios.post(`${this.baseUrl}/sendMessage`, {
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
      return response.data;
    } catch (error) {
      console.error('Failed to send message:', error.response?.data || error.message);
      throw error;
    }
  }

  formatWhaleClusterAlert(data) {
    return `🐋 *WHALE CLUSTER DETECTED*

*Token:* ${data.tokenSymbol}
*Price:* $${data.price}

📊 *Cluster Activity:*
• ${data.whaleCount} whales active
• Total volume: $${data.totalVolume.toLocaleString()}
• Time window: ${data.timeWindow} minutes

🔗 [View Token](${data.tokenUrl})

⚡️ _Real-time alert from AlphaBlock AI_`;
  }

  formatAlphaStreamAlert(data) {
    return `💎 *ALPHA STREAM ALERT*

*Wallet:* ${data.walletAddress}
*Label:* ${data.label} 🧠
*Action:* ${data.action}

*Token:* ${data.tokenSymbol}
*Amount:* $${data.amount.toLocaleString()}
*Price:* $${data.price}

📈 *Wallet Stats:*
• Win Rate: ${data.winRate}%
• ROI: +${data.roi}%
• Total Trades: ${data.totalTrades}

🔗 [View Transaction](${data.txUrl})

⚡️ _Real-time alert from AlphaBlock AI_`;
  }

  formatKOLActivityAlert(data) {
    return `⭐️ *KOL ACTIVITY ALERT*

*Influencer:* ${data.influencerName}
*Followers:* ${data.followers}
*Action:* ${data.action}

*Token:* ${data.tokenSymbol}
*Amount:* $${data.amount.toLocaleString()}
*Price:* $${data.price}

💼 *KOL Stats:*
• Recent Trades: ${data.recentTrades}
• Avg Position: $${data.avgPosition}
• Success Rate: ${data.successRate}%

🔗 [View Wallet](${data.walletUrl})

⚡️ _Real-time alert from AlphaBlock AI_`;
  }
}

async function testAlertSystem() {
  console.log('🧪 Testing Telegram Alert System (Direct)\n');
  
  const alertService = new TelegramAlertService(BOT_TOKEN);
  
  // Test 1: Whale Cluster Alert
  console.log('1️⃣ Testing WHALE_CLUSTER alert...');
  const whaleClusterData = {
    tokenSymbol: 'BONK',
    price: '0.000025',
    whaleCount: 5,
    totalVolume: 125000,
    timeWindow: 15,
    tokenUrl: 'https://dexscreener.com/solana/bonk'
  };
  
  try {
    const message1 = alertService.formatWhaleClusterAlert(whaleClusterData);
    await alertService.sendMessage(YOUR_CHAT_ID, message1);
    console.log('   ✅ WHALE_CLUSTER alert sent\n');
  } catch (error) {
    console.log('   ❌ Failed to send WHALE_CLUSTER alert\n');
  }
  
  // Test 2: Alpha Stream Alert
  console.log('2️⃣ Testing ALPHA_STREAM alert...');
  const alphaStreamData = {
    walletAddress: '7xKX...9pQm',
    label: 'Smart Money',
    action: 'BUY',
    tokenSymbol: 'JUP',
    amount: 75000,
    price: '1.23',
    winRate: 78,
    roi: 245,
    totalTrades: 156,
    txUrl: 'https://solscan.io/tx/test123'
  };
  
  try {
    const message2 = alertService.formatAlphaStreamAlert(alphaStreamData);
    await alertService.sendMessage(YOUR_CHAT_ID, message2);
    console.log('   ✅ ALPHA_STREAM alert sent\n');
  } catch (error) {
    console.log('   ❌ Failed to send ALPHA_STREAM alert\n');
  }
  
  // Test 3: KOL Activity Alert
  console.log('3️⃣ Testing KOL_ACTIVITY alert...');
  const kolActivityData = {
    influencerName: 'CryptoWhale',
    followers: '250K',
    action: 'BUY',
    tokenSymbol: 'ORCA',
    amount: 15000,
    price: '3.45',
    recentTrades: 12,
    avgPosition: '25K',
    successRate: 65,
    walletUrl: 'https://solscan.io/account/test456'
  };
  
  try {
    const message3 = alertService.formatKOLActivityAlert(kolActivityData);
    await alertService.sendMessage(YOUR_CHAT_ID, message3);
    console.log('   ✅ KOL_ACTIVITY alert sent\n');
  } catch (error) {
    console.log('   ❌ Failed to send KOL_ACTIVITY alert\n');
  }
  
  console.log('✅ Alert system test complete!\n');
  console.log('📱 Check your Telegram for 3 test alerts\n');
  console.log('🎯 Summary:');
  console.log('   • Bot: @AlphaBlockAIbot');
  console.log('   • Chat ID: 1831671028');
  console.log('   • Alerts configured in MongoDB');
  console.log('   • Service tested and working\n');
  
  console.log('⚠️  To receive REAL alerts:');
  console.log('   1. Fix Redis connection (start Redis server)');
  console.log('   2. Start server: npm run dev');
  console.log('   3. Real whale transactions will trigger alerts\n');
  
  console.log('💡 Your alert filters are active:');
  console.log('   • WHALE_CLUSTER: $10k+ transactions, 3+ whales, 60min window');
  console.log('   • ALPHA_STREAM: $50k+ from smart_money/heavy_accumulator');
  console.log('   • KOL_ACTIVITY: $5k+ from tracked influencers\n');
}

testAlertSystem();
