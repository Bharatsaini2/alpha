const axios = require('axios');

const BASE_URL = 'http://localhost:5000'; // Adjust port as needed

async function testFilters() {
  console.log('🧪 Testing server-side filters...\n');

  const tests = [
    {
      name: 'Basic pagination',
      params: { page: 1, limit: 10 }
    },
    {
      name: 'Search filter',
      params: { page: 1, limit: 10, search: 'SOL' }
    },
    {
      name: 'Transaction type filter',
      params: { page: 1, limit: 10, type: 'buy' }
    },
    {
      name: 'Hotness filter',
      params: { page: 1, limit: 10, hotness: 'high' }
    },
    {
      name: 'Amount filter',
      params: { page: 1, limit: 10, amount: '1000' }
    },
    {
      name: 'Tags filter',
      params: { page: 1, limit: 10, tags: 'SMART MONEY,HEAVY ACCUMULATOR' }
    },
    {
      name: 'Combined filters',
      params: { 
        page: 1, 
        limit: 10, 
        type: 'buy', 
        hotness: 'high',
        amount: '5000'
      }
    }
  ];

  for (const test of tests) {
    try {
      console.log(`📋 Testing: ${test.name}`);
      
      const queryParams = new URLSearchParams(test.params);
      const response = await axios.get(`${BASE_URL}/whale/whale-transactions?${queryParams}`);
      
      console.log(`✅ Success: ${response.data.transactions.length} transactions found`);
      console.log(`📊 Total: ${response.data.total}, Pages: ${response.data.totalPages}`);
      if (response.data.queryTime) {
        console.log(`⏱️ Query time: ${response.data.queryTime}ms`);
      }
      console.log('---\n');
    } catch (error) {
      console.error(`❌ Error in ${test.name}:`, error.response?.data || error.message);
      console.log('---\n');
    }
  }
}

// Run the tests
testFilters().catch(console.error); 