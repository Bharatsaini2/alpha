// Simple test - call the backend API to trigger alert processing
const axios = require('axios');

async function testAlerts() {
    try {
        console.log('🧪 Testing alert processing via API...');
        
        // Call your local backend to trigger alert processing
        const response = await axios.post('http://localhost:9090/api/v1/test-alerts', {
            // This will be a new endpoint we create
        });
        
        console.log('✅ Response:', response.data);
        
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

testAlerts();