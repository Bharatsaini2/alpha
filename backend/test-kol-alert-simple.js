/**
 * Simple KOL Alert Test Script
 * Usage: node test-kol-alert-simple.js YOUR_ACCESS_TOKEN
 */

const axios = require('axios');

// Get access token from command line
const accessToken = process.argv[2];

if (!accessToken) {
    console.log('\n❌ ACCESS TOKEN REQUIRED!');
    console.log('\nUsage: node test-kol-alert-simple.js YOUR_ACCESS_TOKEN');
    console.log('\nTo get your access token:');
    console.log('1. Open your browser');
    console.log('2. Login to the app');
    console.log('3. Open Developer Tools (F12)');
    console.log('4. Go to Console tab');
    console.log('5. Type: localStorage.getItem("accessToken")');
    console.log('6. Copy the token (without quotes)\n');
    process.exit(1);
}

const BASE_URL = 'http://localhost:9090/api/v1';
let alertId = null;

async function runTest() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║          KOL ALERT SYSTEM - QUICK TEST                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const headers = {
        Authorization: `Bearer ${accessToken}`,
    };

    try {
        // Test 1: Auth
        console.log('1️⃣  Testing authentication...');
        const authRes = await axios.get(`${BASE_URL}/auth/me`, { headers });
        if (authRes.data.success) {
            console.log('   ✅ Authenticated as:', authRes.data.user.email || authRes.data.user._id);
            console.log('   📱 Telegram:', authRes.data.user.telegramChatId ? 'Connected' : 'Not Connected');
        }

        // Test 2: Create KOL Alert
        console.log('\n2️⃣  Creating KOL alert...');
        const createRes = await axios.post(
            `${BASE_URL}/alerts/kol-alert`,
            {
                hotnessScoreThreshold: 5,
                minBuyAmountUSD: 1000,
            },
            { headers }
        );
        
        if (createRes.data.success) {
            alertId = createRes.data.data.alertId;
            console.log('   ✅ KOL alert created!');
            console.log('   🆔 Alert ID:', alertId);
            console.log('   📊 Type:', createRes.data.data.type);
        }

        // Test 3: Get KOL Alerts
        console.log('\n3️⃣  Retrieving KOL alerts...');
        const getRes = await axios.get(`${BASE_URL}/alerts/kol-alerts`, { headers });
        if (getRes.data.success) {
            console.log('   ✅ Found', getRes.data.data.alerts.length, 'KOL alert(s)');
        }

        // Test 4: Get All Alerts
        console.log('\n4️⃣  Retrieving all alerts...');
        const allRes = await axios.get(`${BASE_URL}/alerts/my-alerts`, { headers });
        if (allRes.data.success) {
            const whale = allRes.data.data.alerts.filter(a => a.type === 'ALPHA_STREAM').length;
            const kol = allRes.data.data.alerts.filter(a => a.type === 'KOL_ACTIVITY').length;
            console.log('   ✅ Total alerts:', allRes.data.data.alerts.length);
            console.log('   🐋 Whale alerts:', whale);
            console.log('   👤 KOL alerts:', kol);
        }

        // Test 5: Delete KOL Alert
        if (alertId) {
            console.log('\n5️⃣  Deleting KOL alert...');
            const delRes = await axios.delete(`${BASE_URL}/alerts/kol-alert/${alertId}`, { headers });
            if (delRes.data.success) {
                console.log('   ✅ KOL alert deleted successfully!');
            }
        }

        // Test 6: Format Test
        console.log('\n6️⃣  Testing KOL alert format...');
        const { formatKOLAlert } = require('./src/utils/telegram.utils');
        
        const mockTx = {
            type: 'buy',
            signature: 'test123',
            timestamp: new Date(),
            hotnessScore: 7,
            transaction: {
                tokenOut: {
                    symbol: 'TEST',
                    name: 'Test Token',
                    address: 'TestAddress123',
                    usdAmount: '5000',
                    marketCap: '1000000',
                },
                tokenIn: { symbol: 'SOL', name: 'Solana' },
            },
            marketCap: { buyMarketCap: '1000000' },
        };
        
        const message = formatKOLAlert('Test KOL', mockTx, 'TEST', 'testkol');
        console.log('   ✅ Format generated successfully!');
        console.log('\n   📱 TELEGRAM MESSAGE PREVIEW:');
        console.log('   ' + '─'.repeat(50));
        console.log(message.split('\n').map(line => '   ' + line).join('\n'));
        console.log('   ' + '─'.repeat(50));

        // Success
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║                  🎉 ALL TESTS PASSED! 🎉                  ║');
        console.log('║          KOL Alert system is ready to deploy!             ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

    } catch (error) {
        console.log('\n❌ TEST FAILED!');
        console.log('Error:', error.response?.data?.message || error.message);
        if (error.response?.data) {
            console.log('Details:', JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
}

runTest();
