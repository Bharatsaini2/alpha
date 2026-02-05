const { getShyftParserAdapterService } = require('./dist/services/shyft-parser-adapter.service');
require('dotenv').config();

async function checkParserConfig() {
  console.log('🔍 Checking Parser Configuration...\n');
  
  try {
    const parserAdapter = getShyftParserAdapterService();
    const config = parserAdapter.getConfigurationSummary();
    
    console.log('📊 Current Parser Configuration:');
    console.log(`  Version: ${config.version}`);
    console.log(`  Core Tokens Count: ${config.coreTokensCount}`);
    console.log(`  Suppression Enabled: ${config.suppressionEnabled}`);
    console.log(`  Performance Tracking: ${config.performanceTrackingEnabled}`);
    console.log(`  Rollout Percentage: ${config.rolloutPercentage}%`);
    
    console.log('\n🎛️ V2 Features:');
    Object.entries(config.v2Features).forEach(([feature, enabled]) => {
      console.log(`  ${feature}: ${enabled ? '✅' : '❌'}`);
    });
    
    // Check if ready for production
    const readiness = parserAdapter.isReadyForProduction();
    console.log('\n🚀 Production Readiness:');
    console.log(`  Ready: ${readiness.ready ? '✅' : '❌'}`);
    
    if (readiness.issues.length > 0) {
      console.log('  Issues:');
      readiness.issues.forEach(issue => console.log(`    - ${issue}`));
    }
    
    if (readiness.recommendations.length > 0) {
      console.log('  Recommendations:');
      readiness.recommendations.forEach(rec => console.log(`    - ${rec}`));
    }
    
    // Get performance metrics
    const metrics = parserAdapter.getPerformanceMetrics();
    console.log('\n📈 Performance Metrics:');
    console.log(`  V1 Success Rate: ${(metrics.v1.successRate * 100).toFixed(1)}%`);
    console.log(`  V2 Success Rate: ${(metrics.v2.successRate * 100).toFixed(1)}%`);
    console.log(`  Average Processing Time: ${metrics.v1.averageProcessingTime.toFixed(2)}ms`);
    
    if (metrics.comparison.totalComparisons > 0) {
      console.log(`  Parser Match Rate: ${(metrics.comparison.matchRate * 100).toFixed(1)}%`);
    }
    
  } catch (error) {
    console.error('❌ Error checking parser config:', error.message);
  }
  
  console.log('\n✅ Configuration check complete!');
}

checkParserConfig().catch(console.error);