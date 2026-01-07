// Test with production bot using your current chat ID
import axios from 'axios';

async function testProductionBot() {
    try {
        console.log('📤 Testing production bot directly...');
        
        const botToken = '8361697087:AAHMcvc85_HrASQkwgBKQ_E9CUt3jL5cEt8'; // Production bot
        const chatId = '8519526605'; // Your current chat ID
        
        const message = `🧪 TEST ALERT - Production Bot
This is a test to verify Telegram messaging works.
Time: ${new Date().toLocaleString()}`;

        const response = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
        });
        
        console.log('✅ Message sent successfully!');
        console.log('📱 Check your Telegram (@AlphaBlockAIbot) for the test message.');
        console.log('Response:', response.data);
        
    } catch (error: any) {
        console.error('❌ Error sending message:', error.response?.data || error.message);
    }
}

testProductionBot().catch(console.error);