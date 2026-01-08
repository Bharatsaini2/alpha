const axios = require('axios');

async function getChatId() {
    const botToken = '8172825636:AAELU_xamB9Q5I4OpaGwdHU8oAXKz6Oh14Y';
    
    try {
        console.log('🔍 Getting recent updates to find your chat ID...');
        
        const response = await axios.get(`https://api.telegram.org/bot${botToken}/getUpdates`);
        
        if (response.data.result.length === 0) {
            console.log('❌ No recent messages found.');
            console.log('💡 Send a message to @alphabotdevbot first, then run this script again.');
            return;
        }
        
        console.log('✅ Recent chats:');
        response.data.result.forEach((update, index) => {
            if (update.message) {
                console.log(`${index + 1}. Chat ID: ${update.message.chat.id}`);
                console.log(`   From: ${update.message.from.first_name} ${update.message.from.last_name || ''}`);
                console.log(`   Username: @${update.message.from.username || 'N/A'}`);
                console.log(`   Message: "${update.message.text}"`);
                console.log('---');
            }
        });
        
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

getChatId();