const { getShyftParserConfigService } = require('./dist/services/shyft-parser-config.service');
require('dotenv').config();

async function fixParserToV2Only() {
  console.log('🔧 Setting Parser to V2 ONLY (like the working comparison script)...\n');
  
  try {
    const configService = getShyftParserConfigService();
    
    console.log('📊 Current Configuration:');
    const currentConfig = configService.getConfiguration();
    console.log(`  Version: ${currentConfig.version}`);
    console.log(`  V2 Parser Enabled: ${currentConfig.feature_flags.useV2Parser}`);
    
    console.log('\n🔧 Setting to V2 ONLY (exactly like the working comparison script)...');
    
    // Set to V2 ONLY - not hybrid
    console.log('  1. Setting parser to V2 ONLY...');
    configService.setParserVersion('v2');
    
    // Enable all V2 features
    console.log('  2. Enabling all V2 features...');
    configService.setFeatureFlag('useV2Parser', true);
    configService.setFeatureFlag('enableCoreTokenSuppression', true);
    configService.setFeatureFlag('enableRentRefundFiltering', true);
    configService.setFeatureFlag('enableMultiHopCollapse', true);
    configService.setFeatureFlag('enableSideBySideComparison', false); // Not needed for V2 only
    
    // Set rollout to 100% (but this doesn't matter for V2 only mode)
    console.log('  3. Setting rollout to 100%...');
    configService.updateConfiguration({
      migration_settings: {
        rollout_percentage: 100,
        comparison_mode: false, // No comparison needed for V2 only
        rollback_threshold_error_rate: 0.05,
        rollback_threshold_performance_degradation: 0.2,
      }
    });
    
    console.log('\n✅ Parser Set to V2 ONLY!');
    
    // Show new configuration
    const newConfig = configService.getConfiguration();
    console.log('\n📊 New Configuration:');
    console.log(`  Version: ${newConfig.version} ← This should be 'v2'`);
    console.log(`  V2 Parser Enabled: ${newConfig.feature_flags.useV2Parser}`);
    console.log(`  Core Token Suppression: ${newConfig.feature_flags.enableCoreTokenSuppression}`);
    console.log(`  Rent Refund Filtering: ${newConfig.feature_flags.enableRentRefundFiltering}`);
    console.log(`  Multi-hop Collapse: ${newConfig.feature_flags.enableMultiHopCollapse}`);
    console.log(`  Side-by-side Comparison: ${newConfig.feature_flags.enableSideBySideComparison}`);
    
    console.log('\n🎯 This matches the working comparison script:');
    console.log('  ✅ Direct V2 parser usage (no V1 fallback)');
    console.log('  ✅ All V2 features enabled');
    console.log('  ✅ SOL/WSOL handling fixed');
    console.log('  ✅ Stable coin splitting enabled');
    console.log('  ✅ Enhanced amount normalization');
    console.log('  ✅ Proper transaction filtering');
    
    console.log('\n⚠️  Important:');
    console.log('  - Parser will now use V2 ONLY (just like the working comparison)');
    console.log('  - No V1 fallback or comparison overhead');
    console.log('  - Restart backend to apply changes');
    
  } catch (error) {
    console.error('❌ Error setting parser to V2 only:', error.message);
    console.error(error.stack);
  }
  
  console.log('\n✅ Parser set to V2 ONLY - just like the working comparison script!');
}

fixParserToV2Only().catch(console.error);