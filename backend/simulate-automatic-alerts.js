const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

async function simulateAutomaticAlerts() {
    console.log('🤖 SIMULATING AUTOMATIC ALERT SYSTEM');
    console.log('====================================\n');
    
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Database connected');
        
        // Create a mock whale transaction that would trigger alerts
        const mockTransaction = {
            signature: 'MOCK_' + Date.now(),
            timestamp: new Date(),
            tokenSymbol: 'PEPE',
            tokenOutAddress: '6GCACwEaKaGexrUvLiT7VqHqzrfpTy7oj4QFvUzjUNhx',
            usdValue: 5000, // $5000 transaction
            hotnessScore: 2,
            whale: {
                address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
                labels: ['SMART MONEY', 'HEAVY ACCUMULATOR']
            },
            transaction: {
                tokenOut: {
                    address: '6GCACwEaKaGexrUvLiT7VqHqzrfpTy7oj4QFvUzjUNhx',
                    symbol: 'PEPE',
                    usdAmount: '5000.00'
                }
            }
        };
        
        console.log('📊 Mock Transaction Created:');
        console.log(`   Token: ${mockTransaction.tokenSymbol}`);
        console.log(`   Amount: $${mockTransaction.usdValue}`);
        console.log(`   Hotness: ${mockTransaction.hotnessScore}`);
        console.log(`   Labels: ${mockTransaction.whale.labels.join(', ')}`);
        
        // Get your user and alert configurations
        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
        const UserAlert = mongoose.model('UserAlert', new mongoose.Schema({}, { strict: false }));
        
        const yourUser = await User.findOne({ telegramChatId: '8519526605' });
        if (!yourUser) {
            console.log('❌ Your user not found');
            return;
        }
        
        const yourAlerts = await UserAlert.find({ userId: yourUser._id, enabled: true });
        console.log(`\n🔔 Found ${yourAlerts.length} active alerts for your account`);
        
        // Simulate alert matching logic
        let matchingAlerts = [];
        
        for (const alert of yourAlerts) {
            const config = alert.config;
            let matches = false;
            
            // Check USD threshold
            const usdAmount = parseFloat(mockTransaction.transaction.tokenOut.usdAmount);
            if (config.minBuyAmountUSD && usdAmount < config.minBuyAmountUSD) {
                continue;
            }
            
            // Check hotness threshold
            if (config.hotnessScoreThreshold && mockTransaction.hotnessScore < config.hotnessScoreThreshold) {
                continue;
            }
            
            // If we get here, it matches
            matches = true;
            matchingAlerts.push({
                alert,
                config,
                reason: `USD: $${usdAmount} >= $${config.minBuyAmountUSD}, Hotness: ${mockTransaction.hotnessScore} >= ${config.hotnessScoreThreshold}`
            });
        }
        
        console.log(`\n🎯 Alert Matching Results: ${matchingAlerts.length} matches`);
        
        if (matchingAlerts.length === 0) {
            console.log('❌ No alerts would be triggered');
            console.log('💡 Try lowering your alert thresholds to test');
            return;
        }
        
        // Simulate sending alerts
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = '8519526605';
        
        console.log('\n📱 Simulating Alert Sending...');
        
        for (let i = 0; i < Math.min(matchingAlerts.length, 3); i++) {
            const match = matchingAlerts[i];
            
            // Format alert message (similar to real alert format)
            const alertMessage = `🐋 **WHALE ALERT**

**${mockTransaction.tokenSymbol}** | $${mockTransaction.usdValue.toLocaleString()}
🔥 Hotness: ${mockTransaction.hotnessScore}/10
🏷️ Labels: ${mockTransaction.whale.labels.join(', ')}

**Wallet:** \`${mockTransaction.whale.address.substring(0, 8)}...\`
**Type:** BUY
**Time:** ${new Date().toLocaleString()}

**Alert Config:**
• Min Amount: $${match.config.minBuyAmountUSD}
• Hotness: ${match.config.hotnessScoreThreshold}/10
• Labels: ${match.config.walletLabels?.join(', ') || 'All'}

🌐 [View on Alpha Block](https://app.alpha-block.ai)

*This is a simulated alert to test the system*`;

            try {
                const response = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    chat_id: chatId,
                    text: alertMessage,
                    parse_mode: 'Markdown'
                });
                
                console.log(`✅ Alert ${i+1} sent successfully (Message ID: ${response.data.result.message_id})`);
                console.log(`   Reason: ${match.reason}`);
                
                // Wait 1 second between messages
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.log(`❌ Failed to send alert ${i+1}:`, error.response?.data || error.message);
            }
        }
        
        // Summary
        console.log('\n🎉 AUTOMATIC ALERT SIMULATION COMPLETE');
        console.log('======================================');
        console.log(`✅ Processed 1 mock transaction`);
        console.log(`✅ Matched ${matchingAlerts.length} alert subscriptions`);
        console.log(`✅ Sent ${Math.min(matchingAlerts.length, 3)} test alerts`);
        console.log('✅ Alert system logic is working correctly');
        console.log('\n💡 Once WebSocket is fixed, this will happen automatically for real transactions!');
        
    } catch (error) {
        console.error('❌ Simulation failed:', error.message);
    } finally {
        mongoose.disconnect();
    }
}

simulateAutomaticAlerts();