// Test Telegram service directly
import mongoose from 'mongoose';
import { telegramService } from './src/services/telegram.service';
import { AlertType, Priority } from './src/types/alert.types';

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function testTelegramDirect() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('🔗 Connected to MongoDB');
        
        // Test sending a direct alert
        console.log('📤 Testing direct Telegram alert...');
        
        const testMessage = `🐋 TEST ALERT
Wallet: A4DC...hXgL
Token: TEST
Amount: 100 TEST
USD Value: $849.57
Type: BUY
This is a test message to verify Telegram works.`;

        // Use your user ID from the logs: 695caab996612f706c3ad96b
        const result = await telegramService.queueAlert(
            '695caab996612f706c3ad96b',
            AlertType.ALPHA_STREAM,
            'test-signature-123',
            testMessage,
            Priority.HIGH
        );
        
        console.log('📊 Result:', result);
        
        if (result) {
            console.log('✅ Alert queued successfully!');
            console.log('🔍 Check your Telegram dev bot (@alphabotdevbot) for the test message.');
        } else {
            console.log('❌ Alert failed to queue');
        }
        
        // Wait a bit for processing
        console.log('⏳ Waiting 5 seconds for message processing...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

testTelegramDirect().catch(console.error);