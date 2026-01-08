const axios = require('axios');

async function testTelegramBot() {
    const botToken = '8172825636:AAELU_xamB9Q5I4OpaGwdHU8oAXKz6Oh14Y';
    const chatId = '8519526605'; // Your chat ID
    
    try {
        console.log('🤖 Testing Telegram bot connection...');
        
        // Test bot info
        const botInfo = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`);
        console.log('✅ Bot info:', botInfo.data.result.username);
        
        // Send test message
        const message = `🧪 **Alert System Test**
        
Time: ${new Date().toLocaleString()}
Status: Redis Fixed ✅
Backend: Active ✅
Monitoring: Running ✅

This is a test message to verify the alert system is working properly.`;

        const response = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
        });
        
        console.log('✅ Test message sent successfully!');
        console.log('Message ID:', response.data.result.message_id);
        
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

testTelegramBot();