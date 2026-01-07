// Test script to manually trigger alert processing on recent transactions
import mongoose from 'mongoose';
import { AlertMatcherService } from './src/services/alertMatcher.service';
import whaleAllTransactionModelV2 from './src/models/whaleAllTransactionsV2.model';
import { User } from './src/models/user.model';
import { UserAlert } from './src/models/userAlert.model';

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function testAlertProcessing() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('🔗 Connected to MongoDB');
        
        // Initialize AlertMatcherService
        console.log('🚀 Initializing AlertMatcherService...');
        const alertMatcher = new AlertMatcherService();
        await alertMatcher.initialize();
        console.log('✅ AlertMatcherService initialized');
        
        // Get recent transactions that should match alerts
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        console.log(`\n🔍 Finding recent transactions since ${fiveMinutesAgo.toISOString()}...`);
        
        const recentTx = await whaleAllTransactionModelV2
            .find({ 
                timestamp: { $gte: fiveMinutesAgo },
                whale: { $exists: true }
            })
            .sort({ timestamp: -1 })
            .limit(5)
            .lean();
            
        console.log(`Found ${recentTx.length} recent whale transactions to process`);
        
        // Process each transaction through AlertMatcherService
        for (const tx of recentTx) {
            console.log(`\n📤 Processing transaction: ${tx.signature}`);
            console.log(`   Time: ${tx.timestamp}`);
            console.log(`   Hotness: ${tx.hotnessScore || 'N/A'}`);
            console.log(`   USD: $${tx.transaction?.tokenOut?.usdAmount || 'N/A'}`);
            console.log(`   Labels: ${JSON.stringify(tx.whale?.labels || [])}`);
            
            try {
                // This will trigger the actual alert matching and Telegram sending
                await alertMatcher.processTransaction(tx);
                console.log(`   ✅ Processed successfully`);
            } catch (error) {
                console.log(`   ❌ Error processing: ${error}`);
            }
        }
        
        console.log('\n🎯 Test complete! Check your Telegram for alerts.');
        console.log('If you received alerts, the system is working correctly.');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

testAlertProcessing().catch(console.error);