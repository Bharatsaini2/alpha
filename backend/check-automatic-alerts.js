const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

async function checkAutomaticAlerts() {
    console.log('🔍 CHECKING AUTOMATIC ALERT SYSTEM');
    console.log('===================================\n');
    
    try {
        // 1. Check if alert matcher service is initialized
        console.log('1️⃣ Checking Alert Matcher Service Status...');
        try {
            const response = await axios.get('http://localhost:9090/api/v1/alerts/health');
            console.log('✅ Alert service health:', response.data.message || 'OK');
        } catch (error) {
            console.log('❌ Alert service health check failed:', error.message);
            return;
        }

        // 2. Connect to database and check recent transactions
        console.log('\n2️⃣ Checking Recent Transaction Processing...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Database connected');

        // Check recent whale transactions (last 10 minutes)
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        
        // Import the model (we'll use require with the compiled JS version)
        const WhaleModel = mongoose.model('whaleAllTransactionsV2', new mongoose.Schema({}, { strict: false }));
        
        const recentTransactions = await WhaleModel.find({
            timestamp: { $gte: tenMinutesAgo }
        }).sort({ timestamp: -1 }).limit(5);
        
        console.log(`✅ Found ${recentTransactions.length} transactions in last 10 minutes`);
        
        if (recentTransactions.length > 0) {
            console.log('\n📊 Recent Transactions:');
            recentTransactions.forEach((tx, i) => {
                console.log(`   ${i+1}. ${tx.tokenSymbol || 'Unknown'} - $${tx.usdValue?.toFixed(2) || '0'} - ${new Date(tx.timestamp).toLocaleString()}`);
                console.log(`      Signature: ${tx.signature?.substring(0, 12)}...`);
                console.log(`      Whale: ${tx.whale?.address?.substring(0, 8)}...`);
            });
        } else {
            console.log('⚠️ No recent transactions found - this might indicate:');
            console.log('   - Transaction processing is not running');
            console.log('   - WebSocket connection issues');
            console.log('   - No whale activity in last 10 minutes');
        }

        // 3. Check user subscriptions
        console.log('\n3️⃣ Checking User Alert Subscriptions...');
        const UserAlert = mongoose.model('UserAlert', new mongoose.Schema({}, { strict: false, strictPopulate: false }));
        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
        
        const activeAlerts = await UserAlert.find({ enabled: true });
        console.log(`✅ Found ${activeAlerts.length} active alert subscriptions`);
        
        let telegramConnectedUsers = 0;
        for (const alert of activeAlerts) {
            const user = await User.findById(alert.userId);
            if (user && user.telegramChatId) {
                telegramConnectedUsers++;
                console.log(`   Alert: ${alert.type} - User: ${user.email || user._id} - Telegram: ✅`);
            } else {
                console.log(`   Alert: ${alert.type} - User: ${user?.email || user?._id || 'Unknown'} - Telegram: ❌`);
            }
        }
        
        console.log(`\n📱 Users with Telegram connected: ${telegramConnectedUsers}/${activeAlerts.length}`);

        // 4. Check if your specific user has alerts
        console.log('\n4️⃣ Checking Your Alert Configuration...');
        const yourUser = await User.findOne({ telegramChatId: '8519526605' });
        
        if (!yourUser) {
            console.log('❌ Your user (chat ID: 8519526605) not found in database');
            console.log('💡 You need to connect your Telegram account through the UI');
        } else {
            console.log('✅ Your user found:', yourUser.email || yourUser._id);
            
            const yourAlerts = await UserAlert.find({ userId: yourUser._id, enabled: true });
            console.log(`✅ You have ${yourAlerts.length} active alert(s)`);
            
            if (yourAlerts.length > 0) {
                yourAlerts.forEach((alert, i) => {
                    console.log(`   ${i+1}. Type: ${alert.type}`);
                    console.log(`      Config: ${JSON.stringify(alert.config, null, 6)}`);
                });
            } else {
                console.log('⚠️ You have no active alerts configured');
                console.log('💡 Go to the UI and create whale alert subscriptions');
            }
        }

        // 5. Summary and recommendations
        console.log('\n🎯 AUTOMATIC ALERT SYSTEM STATUS');
        console.log('=================================');
        
        const hasRecentTx = recentTransactions.length > 0;
        const hasActiveAlerts = activeAlerts.length > 0;
        const hasTelegramUsers = telegramConnectedUsers > 0;
        const yourUserExists = !!yourUser;
        
        if (hasRecentTx && hasActiveAlerts && hasTelegramUsers && yourUserExists) {
            console.log('🎉 SYSTEM IS WORKING AUTOMATICALLY!');
            console.log('✅ Transactions are being processed');
            console.log('✅ Users have active alert subscriptions');
            console.log('✅ Telegram connections are working');
            console.log('✅ Your account is properly configured');
            console.log('\n🔔 You should be receiving automatic alerts when whale transactions match your criteria!');
        } else {
            console.log('⚠️ SYSTEM NEEDS ATTENTION:');
            if (!hasRecentTx) console.log('❌ No recent transactions - check transaction processing');
            if (!hasActiveAlerts) console.log('❌ No active alerts - users need to create subscriptions');
            if (!hasTelegramUsers) console.log('❌ No Telegram connections - users need to connect Telegram');
            if (!yourUserExists) console.log('❌ Your user not found - connect Telegram through UI');
            
            console.log('\n💡 NEXT STEPS:');
            if (!yourUserExists) {
                console.log('1. Go to the UI and connect your Telegram account');
                console.log('2. Create whale alert subscriptions');
            } else if (yourAlerts.length === 0) {
                console.log('1. Go to the UI and create whale alert subscriptions');
            }
            if (!hasRecentTx) {
                console.log('2. Check if transaction processing WebSocket is running');
                console.log('3. Check backend logs for transaction processing errors');
            }
        }
        
    } catch (error) {
        console.error('❌ Check failed:', error.message);
    } finally {
        mongoose.disconnect();
    }
}

checkAutomaticAlerts();