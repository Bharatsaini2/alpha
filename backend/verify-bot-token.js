const axios = require('axios');

async function verifyBot() {
    const botToken = '8172825636:AAELU_xamB9Q5I4OpaGwdHU8oAXKz6Oh14Y';
    
    try {
        console.log('🔍 Verifying bot token...');
        
        // Get bot info
        const botInfo = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`);
        console.log('✅ Bot verified:');
        console.log('   Username:', botInfo.data.result.username);
        console.log('   Name:', botInfo.data.result.first_name);
        console.log('   ID:', botInfo.data.result.id);
        console.log('   Can join groups:', botInfo.data.result.can_join_groups);
        console.log('   Can read messages:', botInfo.data.result.can_read_all_group_messages);
        
        // Try to get webhook info
        const webhookInfo = await axios.get(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
        console.log('\n📡 Webhook info:');
        console.log('   URL:', webhookInfo.data.result.url || 'Not set');
        console.log('   Pending updates:', webhookInfo.data.result.pending_update_count);
        
        // Get updates with offset to clear any pending
        console.log('\n📨 Checking for any pending updates...');
        const updates = await axios.get(`https://api.telegram.org/bot${botToken}/getUpdates?limit=100`);
        console.log('   Pending updates count:', updates.data.result.length);
        
        if (updates.data.result.length > 0) {
            console.log('\n📋 Recent messages:');
            updates.data.result.slice(-5).forEach((update, index) => {
                if (update.message) {
                    console.log(`   ${index + 1}. From: ${update.message.from.first_name} (ID: ${update.message.chat.id})`);
                    console.log(`      Message: "${update.message.text}"`);
                    console.log(`      Date: ${new Date(update.message.date * 1000).toLocaleString()}`);
                }
            });
        }
        
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

verifyBot();