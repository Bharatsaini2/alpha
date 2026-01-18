// Check your actual Telegram chat ID with the dev bot
import mongoose from 'mongoose';
import { User } from './src/models/user.model';

const MONGO_URI = 'mongodb+srv://alphablockx:1DG1MB49WOmOJDfe@whale-tracker.mnwqbs6.mongodb.net/alpha-whale-tracker';

async function checkChatId() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('🔗 Connected to MongoDB');
        
        // Find your user
        const user = await User.findById('695caab996612f706c3ad96b').lean();
        
        if (user) {
            console.log('👤 Your User Info:');
            console.log(`User ID: ${user._id}`);
            console.log(`Wallet: ${user.walletAddress}`);
            console.log(`Telegram Chat ID: ${user.telegramChatId || 'NOT SET'}`);
            console.log(`Email: ${user.email || 'NOT SET'}`);
            
            if (!user.telegramChatId) {
                console.log('\n❌ PROBLEM FOUND: No Telegram Chat ID!');
                console.log('You need to connect your Telegram to the dev bot first.');
                console.log('1. Go to your local website (localhost:5173)');
                console.log('2. Go to Telegram Subscription page');
                console.log('3. Click "Connect Telegram" and follow the dev bot link');
            } else {
                console.log('\n✅ Telegram Chat ID exists');
                console.log('The issue might be with message processing or bot permissions.');
            }
        } else {
            console.log('❌ User not found');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkChatId().catch(console.error);