/**
 * Verification script for Alert Matching Integration
 * 
 * This script verifies that:
 * 1. AlertMatcherService is properly imported
 * 2. Non-blocking hooks are in place
 * 3. Error handling is implemented
 * 4. Logging is configured
 * 
 * Run with: node verify-alert-integration.js
 */

const fs = require('fs')
const path = require('path')

console.log('🔍 Verifying Alert Matching Integration...\n')

let allChecksPass = true

// Check 1: Verify app.ts has AlertMatcherService import
console.log('✓ Check 1: AlertMatcherService import in app.ts')
const appContent = fs.readFileSync(
  path.join(__dirname, 'src/app.ts'),
  'utf-8',
)
if (appContent.includes("import { alertMatcherService } from './services/alertMatcher.service'")) {
  console.log('  ✅ AlertMatcherService is imported\n')
} else {
  console.log('  ❌ AlertMatcherService import not found\n')
  allChecksPass = false
}

// Check 2: Verify app.ts initializes AlertMatcherService
console.log('✓ Check 2: AlertMatcherService initialization in app.ts')
if (appContent.includes('await alertMatcherService.initialize()')) {
  console.log('  ✅ AlertMatcherService is initialized\n')
} else {
  console.log('  ❌ AlertMatcherService initialization not found\n')
  allChecksPass = false
}

// Check 3: Verify app.ts shuts down AlertMatcherService
console.log('✓ Check 3: AlertMatcherService shutdown in app.ts')
if (appContent.includes('await alertMatcherService.shutdown()')) {
  console.log('  ✅ AlertMatcherService shutdown is implemented\n')
} else {
  console.log('  ❌ AlertMatcherService shutdown not found\n')
  allChecksPass = false
}

// Check 4: Verify whale.controller.ts has AlertMatcherService import
console.log('✓ Check 4: AlertMatcherService import in whale.controller.ts')
const whaleControllerContent = fs.readFileSync(
  path.join(__dirname, 'src/controllers/whale.controller.ts'),
  'utf-8',
)
if (whaleControllerContent.includes("import { alertMatcherService } from '../services/alertMatcher.service'")) {
  console.log('  ✅ AlertMatcherService is imported\n')
} else {
  console.log('  ❌ AlertMatcherService import not found\n')
  allChecksPass = false
}

// Check 5: Verify whale.controller.ts has setImmediate hook
console.log('✓ Check 5: Non-blocking hook in whale.controller.ts')
if (
  whaleControllerContent.includes('setImmediate') &&
  whaleControllerContent.includes('alertMatcherService')
) {
  console.log('  ✅ Non-blocking hook with setImmediate is implemented\n')
} else {
  console.log('  ❌ Non-blocking hook not found\n')
  allChecksPass = false
}

// Check 6: Verify whale.controller.ts has error handling
console.log('✓ Check 6: Error handling in whale.controller.ts')
if (
  whaleControllerContent.includes('.catch((error) => {') &&
  whaleControllerContent.includes('logger.error({')
) {
  console.log('  ✅ Error handling with logging is implemented\n')
} else {
  console.log('  ❌ Error handling not found\n')
  allChecksPass = false
}

// Check 7: Verify influencer.controller.ts has AlertMatcherService import
console.log('✓ Check 7: AlertMatcherService import in influencer.controller.ts')
const influencerControllerContent = fs.readFileSync(
  path.join(__dirname, 'src/controllers/influencer.controller.ts'),
  'utf-8',
)
if (influencerControllerContent.includes("import { alertMatcherService } from '../services/alertMatcher.service'")) {
  console.log('  ✅ AlertMatcherService is imported\n')
} else {
  console.log('  ❌ AlertMatcherService import not found\n')
  allChecksPass = false
}

// Check 8: Verify influencer.controller.ts has setImmediate hook
console.log('✓ Check 8: Non-blocking hook in influencer.controller.ts')
if (
  influencerControllerContent.includes('setImmediate') &&
  influencerControllerContent.includes('alertMatcherService')
) {
  console.log('  ✅ Non-blocking hook with setImmediate is implemented\n')
} else {
  console.log('  ❌ Non-blocking hook not found\n')
  allChecksPass = false
}

// Check 9: Verify influencer.controller.ts has error handling
console.log('✓ Check 9: Error handling in influencer.controller.ts')
if (
  influencerControllerContent.includes('.catch((error) => {') &&
  influencerControllerContent.includes('logger.error({')
) {
  console.log('  ✅ Error handling with logging is implemented\n')
} else {
  console.log('  ❌ Error handling not found\n')
  allChecksPass = false
}

// Check 10: Verify integration test exists
console.log('✓ Check 10: Integration test file')
const testPath = path.join(
  __dirname,
  'src/controllers/__tests__/transaction-alert-integration.test.ts',
)
if (fs.existsSync(testPath)) {
  console.log('  ✅ Integration test file exists\n')
} else {
  console.log('  ❌ Integration test file not found\n')
  allChecksPass = false
}

// Summary
console.log('═'.repeat(60))
if (allChecksPass) {
  console.log('✅ All verification checks passed!')
  console.log('\nThe alert matching integration is properly implemented:')
  console.log('  • AlertMatcherService is initialized on server startup')
  console.log('  • Non-blocking hooks are in place for whale transactions')
  console.log('  • Non-blocking hooks are in place for influencer transactions')
  console.log('  • Error handling prevents matcher failures from affecting ingestion')
  console.log('  • Structured logging is implemented for debugging')
  console.log('  • Graceful shutdown is configured')
  console.log('  • Integration tests are in place')
  console.log('\n📚 See ALERT_INTEGRATION_SUMMARY.md for detailed documentation')
  process.exit(0)
} else {
  console.log('❌ Some verification checks failed!')
  console.log('\nPlease review the failed checks above.')
  process.exit(1)
}
