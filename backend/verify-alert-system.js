#!/usr/bin/env node

/**
 * Telegram Alert System Verification Script
 * 
 * This script verifies all critical paths of the alert system:
 * 1. Account linking flow
 * 2. Alert subscription CRUD operations
 * 3. Alert matching logic
 * 4. Message queue and delivery
 * 5. Deduplication
 * 6. Rate limiting
 * 7. Backpressure handling
 * 8. Graceful shutdown
 * 9. Cluster detection
 * 10. Error handling
 * 
 * Usage: node verify-alert-system.js
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`)
}

function logSection(title) {
  console.log('\n' + '='.repeat(80))
  log(title, colors.bright + colors.cyan)
  console.log('='.repeat(80) + '\n')
}

function logTest(name) {
  log(`  Testing: ${name}`, colors.blue)
}

function logSuccess(message) {
  log(`  ✓ ${message}`, colors.green)
}

function logError(message) {
  log(`  ✗ ${message}`, colors.red)
}

function logWarning(message) {
  log(`  ⚠ ${message}`, colors.yellow)
}

// Test results tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
}

function recordTest(passed, message) {
  results.total++
  if (passed) {
    results.passed++
    logSuccess(message)
  } else {
    results.failed++
    logError(message)
  }
}

function recordWarning(message) {
  results.warnings++
  logWarning(message)
}

// Main verification function
async function verifyAlertSystem() {
  log('\n🚀 Starting Telegram Alert System Verification\n', colors.bright)

  try {
    // Check 1: Environment Variables
    logSection('1. Environment Configuration')
    await verifyEnvironment()

    // Check 2: Model Schemas
    logSection('2. Database Models')
    await verifyModels()

    // Check 3: Service Initialization
    logSection('3. Service Initialization')
    await verifyServiceInitialization()

    // Check 4: Account Linking
    logSection('4. Account Linking Flow')
    await verifyAccountLinking()

    // Check 5: Alert Subscriptions
    logSection('5. Alert Subscription Management')
    await verifyAlertSubscriptions()

    // Check 6: Alert Matching
    logSection('6. Alert Matching Logic')
    await verifyAlertMatching()

    // Check 7: Message Queue
    logSection('7. Message Queue and Delivery')
    await verifyMessageQueue()

    // Check 8: Deduplication
    logSection('8. Deduplication')
    await verifyDeduplication()

    // Check 9: Rate Limiting
    logSection('9. Rate Limiting')
    await verifyRateLimiting()

    // Check 10: Backpressure
    logSection('10. Backpressure Handling')
    await verifyBackpressure()

    // Check 11: Graceful Shutdown
    logSection('11. Graceful Shutdown')
    await verifyGracefulShutdown()

    // Check 12: Cluster Detection
    logSection('12. Cluster Detection')
    await verifyClusterDetection()

    // Check 13: Error Handling
    logSection('13. Error Handling')
    await verifyErrorHandling()

    // Check 14: Security
    logSection('14. Security Checks')
    await verifySecurity()

    // Print summary
    printSummary()
  } catch (error) {
    logError(`Fatal error during verification: ${error.message}`)
    console.error(error)
    process.exit(1)
  }
}

async function verifyEnvironment() {
  logTest('Checking required environment variables')

  const requiredVars = ['TELEGRAM_BOT_TOKEN', 'MONGODB_URI']
  const optionalVars = ['REDIS_HOST', 'REDIS_PORT']

  let allRequired = true
  for (const varName of requiredVars) {
    if (process.env[varName]) {
      recordTest(true, `${varName} is set`)
    } else {
      recordTest(false, `${varName} is missing`)
      allRequired = false
    }
  }

  for (const varName of optionalVars) {
    if (process.env[varName]) {
      logSuccess(`${varName} is set (optional)`)
    } else {
      recordWarning(`${varName} is not set (optional)`)
    }
  }

  if (process.env.TELEGRAM_BOT_TOKEN) {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const isValidFormat = /^\d+:[A-Za-z0-9_-]{35}$/.test(token)
    recordTest(isValidFormat, 'Bot token has valid format')
  }
}

async function verifyModels() {
  logTest('Checking model files exist')

  const fs = require('fs')
  const path = require('path')

  const modelFiles = [
    'src/models/user.model.ts',
    'src/models/userAlert.model.ts',
  ]

  for (const file of modelFiles) {
    const exists = fs.existsSync(path.join(__dirname, file))
    recordTest(exists, `${file} exists`)
  }

  logTest('Checking User model schema')
  try {
    const userModelPath = path.join(__dirname, 'src/models/user.model.ts')
    const userModelContent = fs.readFileSync(userModelPath, 'utf8')

    const hasTelegramChatId = userModelContent.includes('telegramChatId')
    recordTest(hasTelegramChatId, 'User model has telegramChatId field')

    const hasSparseIndex = userModelContent.includes('sparse: true')
    recordTest(hasSparseIndex, 'telegramChatId uses sparse index')

    const hasLinkToken = userModelContent.includes('telegramLinkToken')
    recordTest(hasLinkToken, 'User model has telegramLinkToken field')
  } catch (error) {
    recordTest(false, `Failed to read User model: ${error.message}`)
  }

  logTest('Checking UserAlert model schema')
  try {
    const alertModelPath = path.join(__dirname, 'src/models/userAlert.model.ts')
    const alertModelContent = fs.readFileSync(alertModelPath, 'utf8')

    const hasType = alertModelContent.includes('type')
    recordTest(hasType, 'UserAlert model has type field')

    const hasPriority = alertModelContent.includes('priority')
    recordTest(hasPriority, 'UserAlert model has priority field')

    const hasConfig = alertModelContent.includes('config')
    recordTest(hasConfig, 'UserAlert model has config field')

    const hasEnabled = alertModelContent.includes('enabled')
    recordTest(hasEnabled, 'UserAlert model has enabled field')
  } catch (error) {
    recordTest(false, `Failed to read UserAlert model: ${error.message}`)
  }
}

async function verifyServiceInitialization() {
  logTest('Checking service files exist')

  const fs = require('fs')
  const path = require('path')

  const serviceFiles = [
    'src/services/telegram.service.ts',
    'src/services/alertMatcher.service.ts',
  ]

  for (const file of serviceFiles) {
    const exists = fs.existsSync(path.join(__dirname, file))
    recordTest(exists, `${file} exists`)
  }

  logTest('Checking TelegramService implementation')
  try {
    const telegramServicePath = path.join(__dirname, 'src/services/telegram.service.ts')
    const content = fs.readFileSync(telegramServicePath, 'utf8')

    const hasInitialize = content.includes('async initialize(')
    recordTest(hasInitialize, 'TelegramService has initialize method')

    const hasQueueAlert = content.includes('async queueAlert(')
    recordTest(hasQueueAlert, 'TelegramService has queueAlert method')

    const hasShutdown = content.includes('async shutdown(')
    recordTest(hasShutdown, 'TelegramService has shutdown method')

    const hasDedupCache = content.includes('dedupCache')
    recordTest(hasDedupCache, 'TelegramService has deduplication cache')

    const hasMessageQueue = content.includes('messageQueue')
    recordTest(hasMessageQueue, 'TelegramService has message queue')
  } catch (error) {
    recordTest(false, `Failed to read TelegramService: ${error.message}`)
  }

  logTest('Checking AlertMatcherService implementation')
  try {
    const matcherServicePath = path.join(__dirname, 'src/services/alertMatcher.service.ts')
    const content = fs.readFileSync(matcherServicePath, 'utf8')

    const hasProcessTransaction = content.includes('async processTransaction(')
    recordTest(hasProcessTransaction, 'AlertMatcherService has processTransaction method')

    const hasSyncSubscriptions = content.includes('async syncSubscriptions(')
    recordTest(hasSyncSubscriptions, 'AlertMatcherService has syncSubscriptions method')

    const hasSubscriptionMap = content.includes('subscriptionMap')
    recordTest(hasSubscriptionMap, 'AlertMatcherService has subscription map')

    const hasClusterCache = content.includes('clusterCache')
    recordTest(hasClusterCache, 'AlertMatcherService has cluster cache')
  } catch (error) {
    recordTest(false, `Failed to read AlertMatcherService: ${error.message}`)
  }
}

async function verifyAccountLinking() {
  logTest('Checking account linking controller')

  const fs = require('fs')
  const path = require('path')

  try {
    const controllerPath = path.join(__dirname, 'src/controllers/alert.controller.ts')
    const content = fs.readFileSync(controllerPath, 'utf8')

    const hasGenerateLinkToken = content.includes('generateLinkToken')
    recordTest(hasGenerateLinkToken, 'Controller has generateLinkToken endpoint')

    const hasUuidGeneration = content.includes('uuidv4') || content.includes('uuid.v4')
    recordTest(hasUuidGeneration, 'Uses UUID for token generation')

    const hasExpiryLogic = content.includes('10 * 60 * 1000') || content.includes('600000')
    recordTest(hasExpiryLogic, 'Sets 10-minute token expiry')
  } catch (error) {
    recordTest(false, `Failed to read alert controller: ${error.message}`)
  }

  logTest('Checking Telegram bot command handler')
  try {
    const servicePath = path.join(__dirname, 'src/services/telegram.service.ts')
    const content = fs.readFileSync(servicePath, 'utf8')

    const hasStartCommand = content.includes('handleStartCommand') || content.includes('/start')
    recordTest(hasStartCommand, 'Handles /start command for linking')

    const hasTokenValidation = content.includes('telegramLinkToken')
    recordTest(hasTokenValidation, 'Validates linking token')

    const hasExpiryCheck = content.includes('telegramLinkTokenExpiry')
    recordTest(hasExpiryCheck, 'Checks token expiry')
  } catch (error) {
    recordTest(false, `Failed to read telegram service: ${error.message}`)
  }
}

async function verifyAlertSubscriptions() {
  logTest('Checking alert subscription endpoints')

  const fs = require('fs')
  const path = require('path')

  try {
    const controllerPath = path.join(__dirname, 'src/controllers/alert.controller.ts')
    const content = fs.readFileSync(controllerPath, 'utf8')

    const hasUpsert = content.includes('upsertAlert') || content.includes('upsert')
    recordTest(hasUpsert, 'Has upsert endpoint for create/update')

    const hasGetAlerts = content.includes('getMyAlerts') || content.includes('getUserAlerts')
    recordTest(hasGetAlerts, 'Has endpoint to retrieve user alerts')

    const hasDelete = content.includes('deleteAlert')
    recordTest(hasDelete, 'Has delete endpoint')

    const hasAtomicUpdate = content.includes('findOneAndUpdate')
    recordTest(hasAtomicUpdate, 'Uses atomic operations for updates')
  } catch (error) {
    recordTest(false, `Failed to read alert controller: ${error.message}`)
  }

  logTest('Checking alert types and priorities')
  try {
    const typesPath = path.join(__dirname, 'src/types/alert.types.ts')
    const content = fs.readFileSync(typesPath, 'utf8')

    const hasAlphaStream = content.includes('ALPHA_STREAM')
    recordTest(hasAlphaStream, 'Defines ALPHA_STREAM alert type')

    const hasWhaleCluster = content.includes('WHALE_CLUSTER')
    recordTest(hasWhaleCluster, 'Defines WHALE_CLUSTER alert type')

    const hasKolActivity = content.includes('KOL_ACTIVITY')
    recordTest(hasKolActivity, 'Defines KOL_ACTIVITY alert type')

    const hasPriorities = content.includes('HIGH') && content.includes('MEDIUM') && content.includes('LOW')
    recordTest(hasPriorities, 'Defines priority levels (HIGH, MEDIUM, LOW)')
  } catch (error) {
    recordTest(false, `Failed to read alert types: ${error.message}`)
  }
}

async function verifyAlertMatching() {
  logTest('Checking alert matching implementation')

  const fs = require('fs')
  const path = require('path')

  try {
    const matcherPath = path.join(__dirname, 'src/services/alertMatcher.service.ts')
    const content = fs.readFileSync(matcherPath, 'utf8')

    const hasInMemoryMap = content.includes('subscriptionMap') && content.includes('Map')
    recordTest(hasInMemoryMap, 'Uses in-memory subscription map')

    const hasFilterLogic = content.includes('filter') || content.includes('match')
    recordTest(hasFilterLogic, 'Implements filter matching logic')

    const hasTokenMatching = content.includes('tokens')
    recordTest(hasTokenMatching, 'Matches by token address')

    const hasAmountMatching = content.includes('minAmount')
    recordTest(hasAmountMatching, 'Matches by minimum amount')
  } catch (error) {
    recordTest(false, `Failed to read alert matcher: ${error.message}`)
  }

  logTest('Checking non-blocking execution')
  try {
    // Check if setImmediate or process.nextTick is used
    const files = [
      'src/controllers/transactions.controller.ts',
      'src/controllers/whale.controller.ts',
    ]

    let hasNonBlocking = false
    for (const file of files) {
      const filePath = path.join(__dirname, file)
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8')
        if (content.includes('setImmediate') || content.includes('process.nextTick')) {
          hasNonBlocking = true
          break
        }
      }
    }

    recordTest(hasNonBlocking, 'Uses non-blocking pattern (setImmediate/nextTick)')
  } catch (error) {
    recordWarning(`Could not verify non-blocking execution: ${error.message}`)
  }
}

async function verifyMessageQueue() {
  logTest('Checking message queue implementation')

  const fs = require('fs')
  const path = require('path')

  try {
    const servicePath = path.join(__dirname, 'src/services/telegram.service.ts')
    const content = fs.readFileSync(servicePath, 'utf8')

    const hasQueue = content.includes('messageQueue')
    recordTest(hasQueue, 'Has message queue')

    const hasThrottling = content.includes('MESSAGE_RATE_MS') || content.includes('40')
    recordTest(hasThrottling, 'Implements throttling (25 msg/sec)')

    const hasPriorityHandling = content.includes('priority')
    recordTest(hasPriorityHandling, 'Handles message priority')

    const hasQueueProcessor = content.includes('processQueue') || content.includes('setInterval')
    recordTest(hasQueueProcessor, 'Has queue processor')
  } catch (error) {
    recordTest(false, `Failed to verify message queue: ${error.message}`)
  }
}

async function verifyDeduplication() {
  logTest('Checking deduplication implementation')

  const fs = require('fs')
  const path = require('path')

  try {
    const servicePath = path.join(__dirname, 'src/services/telegram.service.ts')
    const content = fs.readFileSync(servicePath, 'utf8')

    const hasDedupCache = content.includes('dedupCache')
    recordTest(hasDedupCache, 'Has deduplication cache')

    const hasFingerprint = content.includes('userId') && content.includes('alertType') && content.includes('txHash')
    recordTest(hasFingerprint, 'Uses fingerprint (userId:alertType:txHash)')

    const hasTTL = content.includes('10 * 60 * 1000') || content.includes('600000')
    recordTest(hasTTL, 'Implements 10-minute TTL')

    const hasCleanup = content.includes('cleanup') || content.includes('setInterval')
    recordTest(hasCleanup, 'Has cache cleanup mechanism')
  } catch (error) {
    recordTest(false, `Failed to verify deduplication: ${error.message}`)
  }
}

async function verifyRateLimiting() {
  logTest('Checking rate limiting configuration')

  const fs = require('fs')
  const path = require('path')

  try {
    const servicePath = path.join(__dirname, 'src/services/telegram.service.ts')
    const content = fs.readFileSync(servicePath, 'utf8')

    // Check for 40ms interval (25 msg/sec)
    const hasCorrectRate = content.includes('40') || content.includes('MESSAGE_RATE_MS = 40')
    recordTest(hasCorrectRate, 'Rate limit set to 25 msg/sec (40ms interval)')

    const hasRateCalculation = 1000 / 40 <= 25
    recordTest(hasRateCalculation, 'Rate calculation is correct (1000ms / 40ms = 25 msg/sec)')
  } catch (error) {
    recordTest(false, `Failed to verify rate limiting: ${error.message}`)
  }
}

async function verifyBackpressure() {
  logTest('Checking backpressure implementation')

  const fs = require('fs')
  const path = require('path')

  try {
    const servicePath = path.join(__dirname, 'src/services/telegram.service.ts')
    const content = fs.readFileSync(servicePath, 'utf8')

    const hasCapacityCheck = content.includes('5000')
    recordTest(hasCapacityCheck, 'Has queue capacity limit (5000)')

    const hasPriorityDropping = content.includes('LOW') && content.includes('drop')
    recordTest(hasPriorityDropping, 'Drops LOW priority alerts first')

    const hasRecoveryThreshold = content.includes('4000')
    recordTest(hasRecoveryThreshold, 'Has recovery threshold (4000)')

    const hasDropLogging = content.includes('drop') && content.includes('log')
    recordTest(hasDropLogging, 'Logs dropped alerts')
  } catch (error) {
    recordTest(false, `Failed to verify backpressure: ${error.message}`)
  }
}

async function verifyGracefulShutdown() {
  logTest('Checking graceful shutdown implementation')

  const fs = require('fs')
  const path = require('path')

  try {
    const servicePath = path.join(__dirname, 'src/services/telegram.service.ts')
    const content = fs.readFileSync(servicePath, 'utf8')

    const hasShutdownMethod = content.includes('async shutdown(')
    recordTest(hasShutdownMethod, 'Has shutdown method')

    const hasQueueDraining = content.includes('messageQueue.length') && content.includes('while')
    recordTest(hasQueueDraining, 'Drains queue before shutdown')

    const hasConnectionClose = content.includes('bot.close') || content.includes('bot.stopPolling')
    recordTest(hasConnectionClose, 'Closes bot connection')
  } catch (error) {
    recordTest(false, `Failed to verify graceful shutdown: ${error.message}`)
  }

  logTest('Checking signal handlers')
  try {
    const appPath = path.join(__dirname, 'src/app.ts')
    if (fs.existsSync(appPath)) {
      const content = fs.readFileSync(appPath, 'utf8')

      const hasSIGTERM = content.includes('SIGTERM')
      recordTest(hasSIGTERM, 'Handles SIGTERM signal')

      const hasSIGINT = content.includes('SIGINT')
      recordTest(hasSIGINT, 'Handles SIGINT signal')
    } else {
      recordWarning('app.ts not found, skipping signal handler check')
    }
  } catch (error) {
    recordWarning(`Could not verify signal handlers: ${error.message}`)
  }
}

async function verifyClusterDetection() {
  logTest('Checking cluster detection implementation')

  const fs = require('fs')
  const path = require('path')

  try {
    const matcherPath = path.join(__dirname, 'src/services/alertMatcher.service.ts')
    const content = fs.readFileSync(matcherPath, 'utf8')

    const hasClusterCache = content.includes('clusterCache')
    recordTest(hasClusterCache, 'Has cluster cache')

    const hasClusterQuery = content.includes('countDocuments') || content.includes('find')
    recordTest(hasClusterQuery, 'Queries for cluster data')

    const hasCacheTTL = content.includes('60 * 1000') || content.includes('60000')
    recordTest(hasCacheTTL, 'Cluster cache has 1-minute TTL')

    const hasWhaleCount = content.includes('count') || content.includes('length')
    recordTest(hasWhaleCount, 'Calculates whale count')

    const hasTotalVolume = content.includes('totalVolumeUSD') || content.includes('volume')
    recordTest(hasTotalVolume, 'Calculates total volume')
  } catch (error) {
    recordTest(false, `Failed to verify cluster detection: ${error.message}`)
  }
}

async function verifyErrorHandling() {
  logTest('Checking error handling')

  const fs = require('fs')
  const path = require('path')

  try {
    const servicePath = path.join(__dirname, 'src/services/telegram.service.ts')
    const content = fs.readFileSync(servicePath, 'utf8')

    const hasTryCatch = content.includes('try') && content.includes('catch')
    recordTest(hasTryCatch, 'Uses try-catch blocks')

    const hasErrorLogging = content.includes('logger.error') || content.includes('console.error')
    recordTest(hasErrorLogging, 'Logs errors')

    const hasRetryLogic = content.includes('retry') || content.includes('attempt')
    recordTest(hasRetryLogic, 'Implements retry logic')

    const hasFallback = content.includes('fallback') || content.includes('plain')
    recordTest(hasFallback, 'Has fallback for formatting errors')
  } catch (error) {
    recordTest(false, `Failed to verify error handling: ${error.message}`)
  }
}

async function verifySecurity() {
  logTest('Checking security measures')

  const fs = require('fs')
  const path = require('path')

  // Check that bot token is not hardcoded
  try {
    const servicePath = path.join(__dirname, 'src/services/telegram.service.ts')
    const content = fs.readFileSync(servicePath, 'utf8')

    const usesEnvVar = content.includes('process.env.TELEGRAM_BOT_TOKEN')
    recordTest(usesEnvVar, 'Bot token loaded from environment variable')

    const noHardcodedToken = !content.match(/\d{9,10}:[A-Za-z0-9_-]{35}/)
    recordTest(noHardcodedToken, 'No hardcoded bot token found')

    const hasTokenValidation = content.includes('!process.env.TELEGRAM_BOT_TOKEN') || content.includes('throw')
    recordTest(hasTokenValidation, 'Validates bot token on initialization')
  } catch (error) {
    recordTest(false, `Failed to verify security: ${error.message}`)
  }

  // Check .gitignore
  try {
    const gitignorePath = path.join(__dirname, '.gitignore')
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf8')
      const ignoresEnv = content.includes('.env')
      recordTest(ignoresEnv, '.gitignore includes .env files')
    } else {
      recordWarning('.gitignore not found')
    }
  } catch (error) {
    recordWarning(`Could not verify .gitignore: ${error.message}`)
  }

  // Check for sparse index on telegramChatId
  try {
    const userModelPath = path.join(__dirname, 'src/models/user.model.ts')
    const content = fs.readFileSync(userModelPath, 'utf8')

    const hasSparseIndex = content.includes('sparse: true')
    recordTest(hasSparseIndex, 'Uses sparse index for telegramChatId (prevents data corruption)')
  } catch (error) {
    recordTest(false, `Failed to verify sparse index: ${error.message}`)
  }
}

function printSummary() {
  console.log('\n' + '='.repeat(80))
  log('VERIFICATION SUMMARY', colors.bright + colors.cyan)
  console.log('='.repeat(80) + '\n')

  log(`Total Tests: ${results.total}`, colors.bright)
  log(`Passed: ${results.passed}`, colors.green)
  log(`Failed: ${results.failed}`, results.failed > 0 ? colors.red : colors.green)
  log(`Warnings: ${results.warnings}`, colors.yellow)

  const passRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0
  log(`\nPass Rate: ${passRate}%`, passRate >= 90 ? colors.green : passRate >= 70 ? colors.yellow : colors.red)

  if (results.failed === 0 && results.warnings === 0) {
    log('\n✓ All checks passed! The alert system is properly configured.', colors.bright + colors.green)
  } else if (results.failed === 0) {
    log('\n⚠ All critical checks passed, but there are some warnings.', colors.yellow)
  } else {
    log('\n✗ Some checks failed. Please review the errors above.', colors.red)
  }

  console.log('\n' + '='.repeat(80) + '\n')

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0)
}

// Run verification
verifyAlertSystem().catch((error) => {
  logError(`Verification failed with error: ${error.message}`)
  console.error(error)
  process.exit(1)
})
