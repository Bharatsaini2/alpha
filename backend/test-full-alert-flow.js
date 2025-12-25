const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const MONGODB_URI = process.env.MONGO_URI;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const YOUR_CHAT_ID = '1831671028';

// Define schemas (simplified versions)
const UserAlertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  telegramChatId: String,
  type: { type: String, enum: ['WHALE_CLUSTER', 'ALPHA_STREAM', 'KOL_ACTIVITY'] },
  enabled: { type: Boolean, default: true },
  config: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
});

const UserSchema = new mongoose.Schema({
  email: String,
  telegramChatId: String,
  createdAt: { type: Date, default: Date.now }
});

async function setupTestData() {
  console.log('🔧 Setting up test environment...\n');
  
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const UserAlert = mongoose.model('UserAlert', UserAlertSchema, 'user_alerts');
    const User = mongoose.model('User', UserSchema, 'users');
    
    // 1. Create or find test user
    console.log('1️⃣ Creating test user...');
    let testUser = await User.findOne({ email: 'test@alphablock.ai' });
    
    if (!testUser) {
      testUser = await User.create({
        email: 'test@alphablock.ai',
        telegramChatId: YOUR_CHAT_ID
      });
      console.log(`✅ Created test user: ${testUser._id}\n`);
    } else {
      // Update chat ID if needed
      testUser.telegramChatId = YOUR_CHAT_ID;
      await testUser.save();
      console.log(`✅ Found existing test user: ${testUser._id}\n`);
    }
    
    // 2. Create alert subscriptions
    console.log('2️⃣ Creating alert subscriptions...\n');
    
    // Clear existing alerts for this user
    await UserAlert.deleteMany({ userId: testUser._id });
    
    // Create WHALE_CLUSTER alert
    const whaleAlert = await UserAlert.create({
      userId: testUser._id,
      telegramChatId: YOUR_CHAT_ID,
      type: 'WHALE_CLUSTER',
      enabled: true,
      config: {
        minTransactionValue: 10000, // $10k minimum
        minWhaleCount: 3,
        timeWindowMinutes: 60
      }
    });
    console.log('   ✅ WHALE_CLUSTER alert created');
    console.log(`      - Min transaction: $10,000`);
    console.log(`      - Min whales: 3`);
    console.log(`      - Time window: 60 minutes\n`);
    
    // Create ALPHA_STREAM alert
    const alphaAlert = await UserAlert.create({
      userId: testUser._id,
      telegramChatId: YOUR_CHAT_ID,
      type: 'ALPHA_STREAM',
      enabled: true,
      config: {
        minTransactionValue: 50000, // $50k minimum
        walletLabels: ['smart_money', 'heavy_accumulator']
      }
    });
    console.log('   ✅ ALPHA_STREAM alert created');
    console.log(`      - Min transaction: $50,000`);
    console.log(`      - Labels: smart_money, heavy_accumulator\n`);
    
    // Create KOL_ACTIVITY alert
    const kolAlert = await UserAlert.create({
      userId: testUser._id,
      telegramChatId: YOUR_CHAT_ID,
      type: 'KOL_ACTIVITY',
      enabled: true,
      config: {
        minTransactionValue: 5000, // $5k minimum
        influencerNames: ['CryptoWhale', 'SolanaKing']
      }
    });
    console.log('   ✅ KOL_ACTIVITY alert created');
    console.log(`      - Min transaction: $5,000`);
    console.log(`      - Tracking: CryptoWhale, SolanaKing\n`);
    
    console.log('3️⃣ Sending test alerts to Telegram...\n');
    
    // Send test messages for each alert type
    await sendTestMessage('WHALE_CLUSTER', YOUR_CHAT_ID);
    await sendTestMessage('ALPHA_STREAM', YOUR_CHAT_ID);
    await sendTestMessage('KOL_ACTIVITY', YOUR_CHAT_ID);
    
    console.log('\n✅ Setup complete!\n');
    console.log('📊 Summary:');
    console.log(`   User ID: ${testUser._id}`);
    console.log(`   Chat ID: ${YOUR_CHAT_ID}`);
    console.log(`   Active Alerts: 3`);
    console.log('\n🚀 Next Steps:');
    console.log('   1. Start your server: npm run dev');
    console.log('   2. Real transactions will now trigger alerts');
    console.log('   3. Check your Telegram for incoming alerts\n');
    
    await mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
  }
}

async function sendTestMessage(alertType, chatId) {
  const messages = {
    WHALE_CLUSTER: `🐋 *WHALE CLUSTER DETECTED*

*Token:* BONK
*Symbol:* BONK/USDC
*Price:* $0.000025

📊 *Cluster Activity:*
• 5 whales active
• Total volume: $125,000
• Time window: 15 minutes

🔗 [View Token](https://dexscreener.com/solana/bonk)

⚡️ _Test Alert - Your subscription is active_`,

    ALPHA_STREAM: `💎 *ALPHA STREAM ALERT*

*Wallet:* 7xKX...9pQm
*Label:* Smart Money 🧠
*Action:* BUY

*Token:* JUP
*Amount:* $75,000
*Price:* $1.23

📈 *Wallet Stats:*
• Win Rate: 78%
• ROI: +245%
• Total Trades: 156

🔗 [View Transaction](https://solscan.io/tx/test)

⚡️ _Test Alert - Your subscription is active_`,

    KOL_ACTIVITY: `⭐️ *KOL ACTIVITY ALERT*

*Influencer:* CryptoWhale
*Followers:* 250K
*Action:* BUY

*Token:* ORCA
*Amount:* $15,000
*Price:* $3.45

💼 *KOL Stats:*
• Recent Trades: 12
• Avg Position: $25K
• Success Rate: 65%

🔗 [View Wallet](https://solscan.io/account/test)

⚡️ _Test Alert - Your subscription is active_`
  };

  try {
    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: messages[alertType],
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      }
    );
    console.log(`   ✅ ${alertType} test message sent`);
  } catch (error) {
    console.error(`   ❌ Failed to send ${alertType}:`, error.response?.data || error.message);
  }
}

setupTestData();
