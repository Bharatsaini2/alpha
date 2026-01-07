// Manually trigger AlertMatcherService on the latest transaction to prove it works
import mongoose from 'mongoose';
import { AlertMatcherService } from './src/services/alertMatcher.service';
import whaleAllTransactionModelV2 from './src/models/whaleAllTransactionsV2.model';

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function manualAlertTest() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('🔗 Connected to MongoDB');
        
        // Get the latest transaction (the one with hotness 4)
        const latestTx = await whaleAllTransactionModelV2
            .findOne({ 
                signature: '4r1xUzfRZamqeNWKLT7gCitGDFb9EWXVLATVzuAYV7xfpdiyaSNiDKnZbdeyp7T7WaeuexZEYBF2mrkUfYCzN8xZ'
            })
            .lean();
            
        if (!latestTx) {
            console.log('❌ Transaction not found');
            return;
        }
        
        console.log('🎯 FOUND TRANSACTION:');
        console.log(`Signature: ${latestTx.signature}`);
        console.log(`Hotness: ${latestTx.hotnessScore}`);
        console.log(`USD: $${latestTx.transaction?.tokenOut?.usdAmount}`);
        console.log(`Labels: ${JSON.stringify(latestTx.whale?.labels)}`);
        
        // Initialize AlertMatcherService
        console.log('\n🚀 Initializing AlertMatcherService...');
        const alertMatcher = new AlertMatcherService();
        await alertMatcher.initialize();
        console.log('✅ AlertMatcherService initialized');
        
        // Manually process this transaction
        console.log('\n📤 Processing transaction through AlertMatcherService...');
        console.log('This should send Telegram alerts if the system works!');
        
        await alertMatcher.processTransaction(latestTx);
        
        console.log('\n✅ Processing complete!');
        console.log('🔍 Check your Telegram dev bot (@alphabotdevbot) NOW!');
        console.log('If you got alerts, the system works perfectly and is ready for production.');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

manualAlertTest().catch(console.error);