const WebSocket = require('ws');

async function testNewWebSocketConnection() {
    console.log('🔍 TESTING NEW HELIUS API KEY');
    console.log('==============================\n');
    
    const newApiKey = '3eaf0aa2-c391-4a54-822c-e0ec4c38eed5';
    const wsUrl = `wss://atlas-mainnet.helius-rpc.com/?api-key=${newApiKey}`;
    
    console.log(`🧪 Testing new API key: ${newApiKey.substring(0, 8)}...`);
    
    try {
        await testSingleConnection(wsUrl, newApiKey);
        console.log('\n🎉 SUCCESS! New API key works for WebSocket connection!');
        console.log('✅ Transaction processing should now work automatically');
        console.log('✅ Whale alerts will be sent when transactions match your criteria');
    } catch (error) {
        console.log(`\n❌ FAILED: ${error.message}`);
        console.log('💡 You may need to check the API key permissions or try a different endpoint');
    }
}

function testSingleConnection(wsUrl, apiKey) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        let resolved = false;
        
        // Set timeout
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                ws.close();
                reject(new Error('Connection timeout (10 seconds)'));
            }
        }, 10000);
        
        ws.on('open', () => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                console.log(`✅ WebSocket connection successful!`);
                
                // Send ping to test
                ws.send(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'ping' }));
                console.log('📤 Sent ping message');
                
                setTimeout(() => {
                    ws.close();
                    resolve();
                }, 3000);
            }
        });
        
        ws.on('error', (error) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                console.log(`❌ WebSocket connection failed: ${error.message}`);
                reject(error);
            }
        });
        
        ws.on('message', (data) => {
            console.log(`📨 Received response: ${data.toString()}`);
        });
        
        ws.on('close', (code, reason) => {
            console.log(`🔌 Connection closed: ${code} - ${reason || 'No reason'}`);
        });
    });
}

testNewWebSocketConnection();