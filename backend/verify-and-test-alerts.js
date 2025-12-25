/**
 * Verify MongoDB alerts and manually trigger test alerts through the service
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const YOUR_CHAT_ID = '1831671028';

const UserAlertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  telegramChatId: String,
  type: { type: String, enum: ['WHALE_CLUSTER', 'ALPHA_STREAM', 'KOL_ACTIVITY'] },
  enabled: { type: Boolean, default: true },
  config: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
});

async function verifyAlerts() {
  console.log('🔍 Verifying your alert subscriptions...\n');
  
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const UserAlert = mongoose.model('UserAlert', UserAlertSchema, 'user_alerts');
    
    // Find all alerts for your chat ID
    const alerts = await UserAlert.find({ telegramChatId: YOUR_CHAT_ID });
    
    if (alerts.length === 0) {
      console.log('❌ No alerts found for your chat ID');
      console.log('💡 Run: node test-full-alert-flow.js first\n');
      await mongoose.disconnect();
      return;
    }
    
    console.log(`✅ Found ${alerts.length} active alert subscription(s)\n`);
    
    alerts.forEach((alert, index) => {
      console.log(`📢 Alert ${index + 1}: ${alert.type}`);
      console.log(`   Status: ${alert.enabled ? '🟢 Enabled' : '🔴 Disabled'}`);
      console.log(`   Chat ID: ${alert.telegramChatId}`);
      console.log(`   Config:`, JSON.stringify(alert.config, null, 2));
      console.log('');
    });
    
    console.log('✅ Verification complete!\n');
    console.log('🎯 What happens next:\n');
    console.log('When your server processes transactions:');
    console.log('');
    console.log('1. WHALE_CLUSTER alerts trigger when:');
    console.log('   • 3+ whales buy the same token');
    console.log('   • Within 60 minutes');
    console.log('   • Each transaction ≥ $10,000\n');
    
    console.log('2. ALPHA_STREAM alerts trigger when:');
    console.log('   • Smart money or heavy accumulator wallets');
    console.log('   • Make transactions ≥ $50,000\n');
    
    console.log('3. KOL_ACTIVITY alerts trigger when:');
    console.log('   • Tracked influencers (CryptoWhale, SolanaKing)');
    console.log('   • Make transactions ≥ $5,000\n');
    
    console.log('🚀 To start receiving real alerts:');
    console.log('   npm run dev\n');
    
    console.log('💡 To modify your alert filters:');
    console.log('   • Option 1: Update MongoDB directly');
    console.log('   • Option 2: Use API endpoints (when server is running)');
    console.log('   • Option 3: Wait for frontend UI\n');
    
    // Show example API calls
    console.log('📡 API Endpoints (when server is running):');
    console.log('');
    console.log('   GET /api/v1/telegram-alerts/subscriptions');
    console.log('   → View your subscriptions\n');
    
    console.log('   POST /api/v1/telegram-alerts/subscribe');
    console.log('   → Create new subscription\n');
    
    console.log('   PUT /api/v1/telegram-alerts/subscriptions/:id');
    console.log('   → Update subscription\n');
    
    console.log('   DELETE /api/v1/telegram-alerts/subscriptions/:id');
    console.log('   → Delete subscription\n');
    
    await mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
  }
}

verifyAlerts();
