// Debug script to check alerts and recent transactions
import mongoose from 'mongoose';
import { UserAlert } from './src/models/userAlert.model';
import { User } from './src/models/user.model';
import whaleAllTransactionModelV2 from './src/models/whaleAllTransactionsV2.model';

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function debugAlerts() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('🔗 Connected to MongoDB');
        
        // 1. Check your alert subscriptions
        console.log('\n📋 YOUR ALERT SUBSCRIPTIONS:');
        const alerts = await UserAlert.find({ enabled: true }).lean();
        
        for (const alert of alerts) {
            console.log(`Alert ID: ${alert._id}`);
            console.log(`User ID: ${alert.userId}`);
            console.log(`Type: ${alert.type}`);
            console.log(`Config:`, JSON.stringify(alert.config, null, 2));
            
            // Get user info separately
            const user = await User.findById(alert.userId).lean();
            console.log(`Telegram Chat ID: ${user?.telegramChatId || 'Not connected'}`);
            console.log(`Wallet: ${user?.walletAddress || 'Not connected'}`);
            console.log('---');
        }
        
        // 2. Check recent transactions (last 5 minutes for better chance)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        console.log(`\n🕐 RECENT TRANSACTIONS (since ${fiveMinutesAgo.toISOString()}):`);
        
        const recentTx = await whaleAllTransactionModelV2
            .find({ 
                timestamp: { $gte: fiveMinutesAgo },
                whale: { $exists: true }
            })
            .sort({ timestamp: -1 })
            .limit(10)
            .lean();
            
        console.log(`Found ${recentTx.length} recent whale transactions:`);
        
        for (const tx of recentTx) {
            console.log(`\nTransaction: ${tx.signature}`);
            console.log(`Time: ${tx.timestamp}`);
            console.log(`Hotness: ${tx.hotnessScore || 'N/A'}`);
            console.log(`USD Amount: ${tx.transaction?.tokenOut?.usdAmount || 'N/A'}`);
            console.log(`Whale Address: ${tx.whale?.address || 'N/A'}`);
            console.log(`Whale Labels: ${JSON.stringify(tx.whale?.labels || [])}`);
            
            // Check if this transaction matches any alert
            for (const alert of alerts) {
                const config = alert.config;
                let matches = true;
                let reasons = [];
                
                // Check hotness
                if (config.hotnessScoreThreshold !== undefined) {
                    if ((tx.hotnessScore || 0) < config.hotnessScoreThreshold) {
                        matches = false;
                        reasons.push(`Hotness ${tx.hotnessScore || 0} < ${config.hotnessScoreThreshold}`);
                    }
                }
                
                // Check USD amount
                if (config.minBuyAmountUSD !== undefined) {
                    const usdAmount = parseFloat(tx.transaction?.tokenOut?.usdAmount || '0');
                    if (usdAmount < config.minBuyAmountUSD) {
                        matches = false;
                        reasons.push(`USD ${usdAmount} < ${config.minBuyAmountUSD}`);
                    }
                }
                
                // Check labels (empty array = accept all)
                if (config.walletLabels && config.walletLabels.length > 0) {
                    const txLabels = tx.whale?.labels || [];
                    const hasMatchingLabel = config.walletLabels.some(label => 
                        txLabels.includes(label)
                    );
                    if (!hasMatchingLabel) {
                        matches = false;
                        reasons.push(`Labels ${JSON.stringify(txLabels)} not in ${JSON.stringify(config.walletLabels)}`);
                    }
                }
                
                console.log(`  → Matches Alert ${alert._id}: ${matches ? '✅ YES' : '❌ NO'}`);
                if (!matches && reasons.length > 0) {
                    console.log(`    Reasons: ${reasons.join(', ')}`);
                }
            }
        }
        
        // 3. Show alert criteria summary
        console.log('\n🎯 YOUR ALERT CRITERIA:');
        for (const alert of alerts) {
            console.log(`Alert ${alert._id}:`);
            console.log(`- Hotness >= ${alert.config.hotnessScoreThreshold || 0}`);
            console.log(`- USD Amount >= $${alert.config.minBuyAmountUSD || 0}`);
            console.log(`- Labels: ${alert.config.walletLabels?.length ? alert.config.walletLabels.join(', ') : 'ALL (empty array - accepts any)'}`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

debugAlerts().catch(console.error);