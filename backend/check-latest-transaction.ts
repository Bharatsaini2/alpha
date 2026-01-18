// Check the latest transaction and see why it didn't match alerts
import mongoose from 'mongoose';
import { UserAlert } from './src/models/userAlert.model';
import whaleAllTransactionModelV2 from './src/models/whaleAllTransactionsV2.model';

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function checkLatestTransaction() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('🔗 Connected to MongoDB');
        
        // Get the very latest transaction
        const latestTx = await whaleAllTransactionModelV2
            .findOne({ whale: { $exists: true } })
            .sort({ timestamp: -1 })
            .lean();
            
        if (!latestTx) {
            console.log('❌ No whale transactions found');
            return;
        }
        
        console.log('\n🔍 LATEST TRANSACTION:');
        console.log(`Signature: ${latestTx.signature}`);
        console.log(`Time: ${latestTx.timestamp}`);
        console.log(`Hotness: ${latestTx.hotnessScore || 'N/A'}`);
        console.log(`USD Amount: ${latestTx.transaction?.tokenOut?.usdAmount || 'N/A'}`);
        console.log(`Whale Address: ${latestTx.whale?.address || 'N/A'}`);
        console.log(`Whale Labels: ${JSON.stringify(latestTx.whale?.labels || [])}`);
        console.log(`Type: ${latestTx.type || 'N/A'}`);
        
        // Get your alerts with Telegram chat ID 8519526605 (your dev bot)
        const yourAlerts = await UserAlert.find({ 
            enabled: true,
            // Add filter for your user if needed
        }).lean();
        
        console.log(`\n📋 CHECKING AGAINST ${yourAlerts.length} ALERTS:`);
        
        for (const alert of yourAlerts) {
            const config = alert.config;
            let matches = true;
            let reasons = [];
            
            console.log(`\nAlert ${alert._id}:`);
            console.log(`- Hotness >= ${config.hotnessScoreThreshold || 0}`);
            console.log(`- USD >= $${config.minBuyAmountUSD || 0}`);
            console.log(`- Labels: ${config.walletLabels?.length ? config.walletLabels.join(', ') : 'ALL (empty array)'}`);
            
            // Check hotness
            if (config.hotnessScoreThreshold !== undefined) {
                const txHotness = latestTx.hotnessScore || 0;
                if (txHotness < config.hotnessScoreThreshold) {
                    matches = false;
                    reasons.push(`Hotness ${txHotness} < ${config.hotnessScoreThreshold}`);
                }
            }
            
            // Check USD amount
            if (config.minBuyAmountUSD !== undefined) {
                const usdAmount = parseFloat(latestTx.transaction?.tokenOut?.usdAmount || '0');
                if (usdAmount < config.minBuyAmountUSD) {
                    matches = false;
                    reasons.push(`USD ${usdAmount} < ${config.minBuyAmountUSD}`);
                }
            }
            
            // Check labels (empty array = accept all)
            if (config.walletLabels && config.walletLabels.length > 0) {
                const txLabels = latestTx.whale?.labels || [];
                const hasMatchingLabel = config.walletLabels.some(label => 
                    txLabels.includes(label)
                );
                if (!hasMatchingLabel) {
                    matches = false;
                    reasons.push(`Labels ${JSON.stringify(txLabels)} not in ${JSON.stringify(config.walletLabels)}`);
                }
            }
            
            // Check if it's a whale transaction (not KOL)
            if (!latestTx.whale || !latestTx.whale.address) {
                matches = false;
                reasons.push('Not a whale transaction (no whale object)');
            }
            
            console.log(`Result: ${matches ? '✅ SHOULD MATCH' : '❌ NO MATCH'}`);
            if (!matches) {
                console.log(`Reasons: ${reasons.join(', ')}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkLatestTransaction().catch(console.error);