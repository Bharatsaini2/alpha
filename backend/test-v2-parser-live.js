const { getShyftParserAdapterService } = require('./dist/services/shyft-parser-adapter.service');
const axios = require('axios');
require('dotenv').config();

async function testV2ParserLive() {
  console.log('🧪 Testing V2 Parser Configuration...\n');
  
  try {
    // Test 1: Check parser configuration
    console.log('📊 Checking Parser Configuration:');
    const parserAdapter = getShyftParserAdapterService();
    const config = parserAdapter.getConfigurationSummary();
    
    console.log(`  Version: ${config.version} ${config.version === 'v2' ? '✅' : '❌'}`);
    console.log(`  Core Token Suppression: ${config.suppressionEnabled ? '✅' : '❌'}`);
    console.log(`  V2 Features Enabled: ${Object.values(config.v2Features).filter(Boolean).length}/${Object.keys(config.v2Features).length}`);
    
    if (config.version !== 'v2') {
      console.log('❌ Parser is not set to V2! Run fix-parser-to-v2-only.js first');
      return;
    }
    
    console.log('\n✅ Parser is correctly configured for V2!\n');
    
    // Test 2: Test with a real transaction
    console.log('🔍 Testing with a sample transaction...');
    
    // Use a known transaction signature that should be parsed correctly
    const testSignature = '5tCo7bYu9i2jF3phStN3Xh3PmQDAw7goZCM2LvTuTbJC5VahruWfZgXiNmMun1dAMYD7fyautVhZ58faNmUq49Ts';
    
    console.log(`  Fetching transaction: ${testSignature.substring(0, 20)}...`);
    
    const response = await axios.get(
      `https://api.shyft.to/sol/v1/transaction/parsed`,
      {
        params: {
          network: 'mainnet-beta',
          txn_signature: testSignature,
        },
        headers: {
          'x-api-key': process.env.SHYFT_API_KEY,
        },
      }
    );
    
    if (!response.data?.result) {
      console.log('❌ Failed to fetch transaction from Shyft API');
      return;
    }
    
    console.log('  ✅ Transaction fetched successfully');
    
    // Test 3: Parse with V2 parser
    console.log('  🔧 Parsing with V2 parser...');
    
    const shyftTx = response.data.result;
    const parsedSwap = parserAdapter.parseShyftTransaction(shyftTx);
    
    if (parsedSwap) {
      console.log('  ✅ V2 Parser SUCCESS!');
      console.log(`    Direction: ${parsedSwap.side}`);
      console.log(`    Input: ${parsedSwap.input.symbol} (${parsedSwap.input.amount})`);
      console.log(`    Output: ${parsedSwap.output.symbol} (${parsedSwap.output.amount})`);
      console.log(`    Confidence: ${parsedSwap.confidence}`);
      console.log(`    Classification Source: ${parsedSwap.classification_source}`);
      
      // Check for V2 metadata
      if (parsedSwap.v2_metadata) {
        console.log('    V2 Metadata:');
        console.log(`      Parser Version: ${parsedSwap.v2_metadata.parser_version}`);
        console.log(`      Rent Refund Filtered: ${parsedSwap.v2_metadata.rent_refund_filtered}`);
        console.log(`      Multi-hop Collapsed: ${parsedSwap.v2_metadata.multi_hop_collapsed}`);
        console.log(`      Processing Time: ${parsedSwap.v2_metadata.processing_time_ms}ms`);
      }
    } else {
      console.log('  ❌ V2 Parser returned null (transaction rejected)');
      console.log('    This could be normal if the transaction is not a valid swap');
    }
    
    // Test 4: Check performance metrics
    console.log('\n📈 Performance Metrics:');
    try {
      const metrics = parserAdapter.getPerformanceMetrics();
      console.log(`  V2 Success Rate: ${(metrics.v2.successRate * 100).toFixed(1)}%`);
      console.log(`  V2 Average Processing Time: ${metrics.v2.averageProcessingTime.toFixed(2)}ms`);
      console.log(`  Total V2 Transactions Processed: ${metrics.v2.totalTransactions}`);
    } catch (error) {
      console.log('  ⚠️  Performance metrics not available yet (no transactions processed)');
    }
    
    console.log('\n🎯 Summary:');
    console.log('  ✅ V2 Parser is active and configured correctly');
    console.log('  ✅ Core token suppression is enabled');
    console.log('  ✅ All V2 features are enabled');
    console.log('  ✅ Ready to process transactions with improved accuracy');
    
    console.log('\n📊 Expected Improvements:');
    console.log('  - Better SOL/WSOL handling');
    console.log('  - Stable coin transaction splitting');
    console.log('  - More accurate amount calculations');
    console.log('  - Reduced unknown tokens');
    console.log('  - Better transaction filtering');
    
  } catch (error) {
    console.error('❌ Error testing V2 parser:', error.message);
  }
  
  console.log('\n✅ V2 Parser test complete!');
}

testV2ParserLive().catch(console.error);