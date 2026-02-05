const { getShyftParserAdapterService } = require('./dist/services/shyft-parser-adapter.service');
require('dotenv').config();

async function fixParserConfig() {
  console.log('🔧 Fixing Parser Configuration...\n');
  
  try {
    const parserAdapter = getShyftParserAdapterService();
    
    console.log('📊 Current Configuration:');
    const currentConfig = parserAdapter.getConfigurationSummary();
    console.log(`  Version: ${currentConfig.version}`);
    console.log(`  V2 Features Enabled: ${Object.values(currentConfig.v2Features).filter(Boolean).length}/${Object.keys(currentConfig.v2Features).length}`);
    
    console.log('\n🔧 Applying Fixes...');
    
    // Enable V2 parser with hybrid mode for safety
    console.log('  1. Enabling hybrid mode (v1 + v2 comparison)...');
    parserAdapter.setParserVersion('hybrid');
    
    // Enable V2 features gradually
    console.log('  2. Enabling V2 features...');
    parserAdapter.enableV2Features({
      relayerProofIdentification: true,
      rentRefundFiltering: true,
      multiHopCollapse: true,
      enhancedAmountNormalization: true,
      tokenToTokenSplitProtocol: true,
      eraseValidation: true,
    });
    
    // Enable core token suppression for SOL/WSOL filtering
    console.log('  3. Enabling core token suppression...');
    parserAdapter.setFeatureFlag('enableCoreTokenSuppression', true);
    
    // Enable side-by-side comparison for monitoring
    console.log('  4. Enabling side-by-side comparison...');
    parserAdapter.setFeatureFlag('enableSideBySideComparison', true);
    
    // Set rollout percentage to 50% for gradual deployment
    console.log('  5. Setting rollout percentage to 50%...');
    parserAdapter.updateConfiguration({
      migration_settings: {
        rollout_percentage: 50,
        comparison_mode: true,
        rollback_threshold_error_rate: 0.05,
        rollback_threshold_performance_degradation: 0.2,
      }
    });
    
    console.log('\n✅ Configuration Updated!');
    
    // Show new configuration
    const newConfig = parserAdapter.getConfigurationSummary();
    console.log('\n📊 New Configuration:');
    console.log(`  Version: ${newConfig.version}`);
    console.log(`  Core Token Suppression: ${newConfig.suppressionEnabled ? '✅' : '❌'}`);
    console.log(`  Rollout Percentage: ${newConfig.rolloutPercentage}%`);
    
    console.log('\n🎛️ V2 Features:');
    Object.entries(newConfig.v2Features).forEach(([feature, enabled]) => {
      console.log(`  ${feature}: ${enabled ? '✅' : '❌'}`);
    });
    
    // Check production readiness
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
    
    console.log('\n🎯 Expected Improvements:');
    console.log('  ✅ SOL/WSOL transactions will be properly handled');
    console.log('  ✅ Stable coin transactions will be split correctly');
    console.log('  ✅ Amount calculations will be more accurate');
    console.log('  ✅ Wrong transactions will be filtered out');
    console.log('  ✅ Unknown tokens will be reduced');
    
    console.log('\n⚠️  Important Notes:');
    console.log('  - Parser is now in HYBRID mode (50% V2, 50% V1)');
    console.log('  - Monitor performance metrics for any issues');
    console.log('  - Can increase rollout percentage gradually');
    console.log('  - Can rollback to V1 if needed');
    
  } catch (error) {
    console.error('❌ Error fixing parser config:', error.message);
    console.error(error.stack);
  }
  
  console.log('\n✅ Parser configuration fix complete!');
}

fixParserConfig().catch(console.error);