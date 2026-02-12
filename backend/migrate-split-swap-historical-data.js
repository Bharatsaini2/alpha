/**
 * Migration Script: Split Swap Historical Data Fix
 * 
 * Purpose: Convert historical type="both" split swap records into separate SELL and BUY records
 * 
 * This script:
 * 1. Identifies all type="both" records with split swap indicators
 * 2. Splits each into two separate records (SELL and BUY)
 * 3. Restores actual token amounts to amount fields
 * 4. Sets SOL fields to null for non-SOL swaps
 * 5. Uses MongoDB transactions for atomic operations
 * 6. Provides dry-run mode and rollback capability
 * 
 * Safety Features:
 * - Idempotency: Can be run multiple times safely
 * - Atomic transactions: Both records created or neither
 * - Backup creation: Automatic backup before migration
 * - Dry-run mode: Preview changes without committing
 * - Progress tracking: Metrics and logging every 100 records
 * 
 * Usage:
 *   node migrate-split-swap-historical-data.js --dry-run    # Preview changes
 *   node migrate-split-swap-historical-data.js              # Run migration
 *   node migrate-split-swap-historical-data.js --rollback   # Restore from backup
 */

require('dotenv').config()
const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Import model
const whaleAllTransactionModelV2 = require('./src/models/whaleAllTransactionsV2.model').default

// Import utilities
const { PRIORITY_ASSETS } = require('./src/utils/shyftParserV2.types')
const logger = require('./src/utils/logger').default

// Migration configuration
const CONFIG = {
  DRY_RUN: process.argv.includes('--dry-run'),
  ROLLBACK: process.argv.includes('--rollback'),
  BATCH_SIZE: 100, // Process records in batches
  PROGRESS_LOG_INTERVAL: 100, // Log progress every N records
  BACKUP_DIR: path.join(__dirname, 'migration-backups'),
  BACKUP_FILE: `split-swap-migration-backup-${Date.now()}.json`,
}

// Migration metrics
const metrics = {
  recordsFound: 0,
  recordsProcessed: 0,
  recordsSkipped: 0,
  recordsCreated: 0,
  recordsDeleted: 0,
  transactionFailures: 0,
  skipReasons: {
    alreadyMigrated: 0,
    missingData: 0,
    invalidData: 0,
  },
}

/**
 * Task 9.1: Migration Identification Logic
 * 
 * Identifies records that need migration:
 * - type="both" records
 * - classificationSource contains "v2_parser_split" OR bothType indicates split swap
 * - Idempotency check: skip if signature + type="sell"/"buy" already exist
 */
async function identifyRecordsToMigrate() {
  logger.info('🔍 Task 9.1: Identifying records to migrate...')
  
  // Find all type="both" records that are split swaps
  const query = {
    type: 'both',
    $or: [
      { classificationSource: { $regex: /v2_parser_split/i } },
      { 'bothType.0.buyType': true, 'bothType.0.sellType': true },
    ],
  }
  
  const bothRecords = await whaleAllTransactionModelV2.find(query).lean()
  
  logger.info(`Found ${bothRecords.length} type="both" records with split swap indicators`)
  metrics.recordsFound = bothRecords.length
  
  // Filter out records that have already been migrated (idempotency check)
  const recordsToMigrate = []
  
  for (const record of bothRecords) {
    const shouldMigrate = await shouldMigrateRecord(record.signature)
    
    if (shouldMigrate) {
      recordsToMigrate.push(record)
    } else {
      metrics.recordsSkipped++
      metrics.skipReasons.alreadyMigrated++
      logger.debug(
        { signature: record.signature },
        'Skipping record - already migrated (split records exist)'
      )
    }
  }
  
  logger.info(
    `✅ Task 9.1 Complete: ${recordsToMigrate.length} records need migration, ` +
    `${metrics.recordsSkipped} already migrated`
  )
  
  return recordsToMigrate
}

/**
 * Idempotency check: Determine if a record should be migrated
 * 
 * Returns false if signature + type="sell"/"buy" already exist
 * (indicating the record has already been migrated)
 */
async function shouldMigrateRecord(signature) {
  const existingRecords = await whaleAllTransactionModelV2.find({
    signature,
    type: { $in: ['sell', 'buy'] },
  }).lean()
  
  if (existingRecords.length > 0) {
    logger.debug(
      { signature, existingCount: existingRecords.length },
      'Split records already exist, skipping migration'
    )
    return false
  }
  
  return true
}

/**
 * Task 9.2: Record Splitting Logic
 * 
 * Splits a type="both" record into SELL and BUY records
 * Maps transaction.tokenIn and transaction.tokenOut to correct fields
 * Restores actual token amounts to amount fields
 * Sets SOL fields to null for non-SOL swaps
 * Uses MongoDB transactions for atomic operations
 */
async function splitBothRecord(bothRecord, session) {
  logger.debug({ signature: bothRecord.signature }, 'Splitting "both" record...')
  
  // Validate required data
  if (!bothRecord.transaction?.tokenIn || !bothRecord.transaction?.tokenOut) {
    metrics.recordsSkipped++
    metrics.skipReasons.missingData++
    logger.warn(
      { signature: bothRecord.signature },
      'Skipping record - missing transaction.tokenIn or transaction.tokenOut'
    )
    return { success: false, reason: 'missing_transaction_data' }
  }
  
  try {
    // Create SELL record
    const sellRecord = createSellRecordFromBoth(bothRecord)
    const sellDoc = new whaleAllTransactionModelV2(sellRecord)
    await sellDoc.save({ session })
    metrics.recordsCreated++
    
    logger.debug(
      { signature: bothRecord.signature, type: 'sell' },
      'Created SELL record'
    )
    
    // Create BUY record
    const buyRecord = createBuyRecordFromBoth(bothRecord)
    const buyDoc = new whaleAllTransactionModelV2(buyRecord)
    await buyDoc.save({ session })
    metrics.recordsCreated++
    
    logger.debug(
      { signature: bothRecord.signature, type: 'buy' },
      'Created BUY record'
    )
    
    // Delete original "both" record
    await whaleAllTransactionModelV2.deleteOne(
      { _id: bothRecord._id },
      { session }
    )
    metrics.recordsDeleted++
    
    logger.debug(
      { signature: bothRecord.signature },
      'Deleted original "both" record'
    )
    
    metrics.recordsProcessed++
    
    return { success: true }
  } catch (error) {
    logger.error(
      {
        signature: bothRecord.signature,
        error: error.message,
        stack: error.stack,
      },
      'Failed to split record'
    )
    
    return { success: false, reason: 'split_error', error: error.message }
  }
}

/**
 * Task 9.2: Create SELL record from "both" record
 * 
 * Maps fields correctly:
 * - type: "sell"
 * - amount.sellAmount: actual tokens sold (from transaction.tokenOut.amount)
 * - amount.buyAmount: 0 (not applicable for pure SELL)
 * - solAmount: null if SOL not involved, actual SOL delta if involved
 * - classificationSource: "v2_parser_split_sell_migrated"
 */
function createSellRecordFromBoth(bothRecord) {
  const tokenOutAddress = bothRecord.transaction.tokenOut.address
  const tokenInAddress = bothRecord.transaction.tokenIn.address
  
  // Check if SOL is involved
  const isTokenOutSOL = 
    tokenOutAddress === PRIORITY_ASSETS.SOL ||
    tokenOutAddress === PRIORITY_ASSETS.WSOL
  const isTokenInSOL = 
    tokenInAddress === PRIORITY_ASSETS.SOL ||
    tokenInAddress === PRIORITY_ASSETS.WSOL
  
  // For SELL record:
  // - We're selling tokenOut (what went out of wallet)
  // - We're receiving tokenIn (what came into wallet)
  const sellAmount = bothRecord.transaction.tokenOut.amount || '0'
  const buyAmount = '0' // Not applicable for pure SELL
  
  // SOL amounts: only populate if SOL is actually involved
  const sellSolAmount = isTokenOutSOL ? sellAmount : null
  const buySolAmount = null // Not applicable for SELL record
  
  const sellRecord = {
    ...bothRecord,
    _id: undefined, // Let MongoDB generate new ID
    type: 'sell',
    amount: {
      buyAmount,
      sellAmount,
    },
    solAmount: {
      buySolAmount,
      sellSolAmount,
    },
    bothType: [
      {
        buyType: false,
        sellType: true,
      },
    ],
    classificationSource: 'v2_parser_split_sell_migrated',
    // Preserve all other fields
  }
  
  return sellRecord
}

/**
 * Task 9.2: Create BUY record from "both" record
 * 
 * Maps fields correctly:
 * - type: "buy"
 * - amount.buyAmount: actual tokens bought (from transaction.tokenIn.amount)
 * - amount.sellAmount: 0 (not applicable for pure BUY)
 * - solAmount: null if SOL not involved, actual SOL delta if involved
 * - classificationSource: "v2_parser_split_buy_migrated"
 */
function createBuyRecordFromBoth(bothRecord) {
  const tokenOutAddress = bothRecord.transaction.tokenOut.address
  const tokenInAddress = bothRecord.transaction.tokenIn.address
  
  // Check if SOL is involved
  const isTokenOutSOL = 
    tokenOutAddress === PRIORITY_ASSETS.SOL ||
    tokenOutAddress === PRIORITY_ASSETS.WSOL
  const isTokenInSOL = 
    tokenInAddress === PRIORITY_ASSETS.SOL ||
    tokenInAddress === PRIORITY_ASSETS.WSOL
  
  // For BUY record:
  // - We're buying tokenIn (what came into wallet)
  // - We're spending tokenOut (what went out of wallet)
  const buyAmount = bothRecord.transaction.tokenIn.amount || '0'
  const sellAmount = '0' // Not applicable for pure BUY
  
  // SOL amounts: only populate if SOL is actually involved
  const buySolAmount = isTokenInSOL ? buyAmount : null
  const sellSolAmount = null // Not applicable for BUY record
  
  const buyRecord = {
    ...bothRecord,
    _id: undefined, // Let MongoDB generate new ID
    type: 'buy',
    amount: {
      buyAmount,
      sellAmount,
    },
    solAmount: {
      buySolAmount,
      sellSolAmount,
    },
    bothType: [
      {
        buyType: true,
        sellType: false,
      },
    ],
    classificationSource: 'v2_parser_split_buy_migrated',
    // Preserve all other fields
  }
  
  return buyRecord
}

/**
 * Task 9.4: Dry-run mode
 * 
 * Logs what would be changed without committing
 * Provides summary statistics
 */
async function runDryRun(recordsToMigrate) {
  logger.info('🔍 DRY RUN MODE: Previewing migration changes...')
  logger.info(`Would migrate ${recordsToMigrate.length} records`)
  
  // Sample first 5 records to show what would happen
  const sampleSize = Math.min(5, recordsToMigrate.length)
  
  for (let i = 0; i < sampleSize; i++) {
    const record = recordsToMigrate[i]
    
    logger.info(`\n--- Sample Record ${i + 1} ---`)
    logger.info(`Signature: ${record.signature}`)
    logger.info(`Current type: ${record.type}`)
    logger.info(`Classification: ${record.classificationSource}`)
    logger.info(`TokenIn: ${record.transaction.tokenIn.symbol} (${record.transaction.tokenIn.amount})`)
    logger.info(`TokenOut: ${record.transaction.tokenOut.symbol} (${record.transaction.tokenOut.amount})`)
    
    // Show what SELL record would look like
    const sellRecord = createSellRecordFromBoth(record)
    logger.info(`\nWould create SELL record:`)
    logger.info(`  - type: ${sellRecord.type}`)
    logger.info(`  - amount.sellAmount: ${sellRecord.amount.sellAmount}`)
    logger.info(`  - amount.buyAmount: ${sellRecord.amount.buyAmount}`)
    logger.info(`  - solAmount.sellSolAmount: ${sellRecord.solAmount.sellSolAmount}`)
    logger.info(`  - solAmount.buySolAmount: ${sellRecord.solAmount.buySolAmount}`)
    
    // Show what BUY record would look like
    const buyRecord = createBuyRecordFromBoth(record)
    logger.info(`\nWould create BUY record:`)
    logger.info(`  - type: ${buyRecord.type}`)
    logger.info(`  - amount.buyAmount: ${buyRecord.amount.buyAmount}`)
    logger.info(`  - amount.sellAmount: ${buyRecord.amount.sellAmount}`)
    logger.info(`  - solAmount.buySolAmount: ${buyRecord.solAmount.buySolAmount}`)
    logger.info(`  - solAmount.sellSolAmount: ${buyRecord.solAmount.sellSolAmount}`)
    
    logger.info(`\nWould delete original "both" record`)
  }
  
  logger.info(`\n✅ DRY RUN COMPLETE`)
  logger.info(`Total records to migrate: ${recordsToMigrate.length}`)
  logger.info(`Records would be created: ${recordsToMigrate.length * 2}`)
  logger.info(`Records would be deleted: ${recordsToMigrate.length}`)
}

/**
 * Task 9.5: Backup creation
 * 
 * Creates backup of all records before migration
 * Allows rollback if needed
 */
async function createBackup(recordsToMigrate) {
  logger.info('💾 Creating backup before migration...')
  
  // Ensure backup directory exists
  if (!fs.existsSync(CONFIG.BACKUP_DIR)) {
    fs.mkdirSync(CONFIG.BACKUP_DIR, { recursive: true })
  }
  
  const backupPath = path.join(CONFIG.BACKUP_DIR, CONFIG.BACKUP_FILE)
  
  const backup = {
    timestamp: new Date().toISOString(),
    recordCount: recordsToMigrate.length,
    records: recordsToMigrate,
  }
  
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2))
  
  logger.info(`✅ Backup created: ${backupPath}`)
  logger.info(`Backed up ${recordsToMigrate.length} records`)
  
  return backupPath
}

/**
 * Task 9.5: Rollback capability
 * 
 * Restores records from backup
 * Deletes migrated split records
 * Restores original "both" records
 */
async function rollbackMigration() {
  logger.info('🔄 ROLLBACK MODE: Restoring from backup...')
  
  // Find most recent backup
  const backupFiles = fs.readdirSync(CONFIG.BACKUP_DIR)
    .filter(f => f.startsWith('split-swap-migration-backup-'))
    .sort()
    .reverse()
  
  if (backupFiles.length === 0) {
    logger.error('No backup files found!')
    return
  }
  
  const latestBackup = backupFiles[0]
  const backupPath = path.join(CONFIG.BACKUP_DIR, latestBackup)
  
  logger.info(`Using backup: ${backupPath}`)
  
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
  
  logger.info(`Backup contains ${backup.recordCount} records from ${backup.timestamp}`)
  
  let restored = 0
  let deleted = 0
  
  for (const record of backup.records) {
    const session = await mongoose.startSession()
    
    try {
      await session.startTransaction()
      
      // Delete migrated split records
      await whaleAllTransactionModelV2.deleteMany(
        {
          signature: record.signature,
          type: { $in: ['sell', 'buy'] },
          classificationSource: { $regex: /migrated/ },
        },
        { session }
      )
      deleted += 2
      
      // Restore original "both" record
      const restoredDoc = new whaleAllTransactionModelV2(record)
      await restoredDoc.save({ session })
      restored++
      
      await session.commitTransaction()
      
      logger.debug({ signature: record.signature }, 'Restored record from backup')
    } catch (error) {
      await session.abortTransaction()
      
      logger.error(
        {
          signature: record.signature,
          error: error.message,
        },
        'Failed to restore record'
      )
    } finally {
      session.endSession()
    }
  }
  
  logger.info(`✅ ROLLBACK COMPLETE`)
  logger.info(`Restored ${restored} "both" records`)
  logger.info(`Deleted ${deleted} migrated split records`)
}

/**
 * Main migration execution
 * 
 * Processes records in batches with atomic transactions
 * Logs progress every 100 records
 * Tracks metrics for observability
 */
async function runMigration(recordsToMigrate) {
  logger.info(`🚀 Starting migration of ${recordsToMigrate.length} records...`)
  
  for (let i = 0; i < recordsToMigrate.length; i++) {
    const record = recordsToMigrate[i]
    const session = await mongoose.startSession()
    
    try {
      await session.startTransaction()
      
      const result = await splitBothRecord(record, session)
      
      if (result.success) {
        await session.commitTransaction()
      } else {
        await session.abortTransaction()
        metrics.transactionFailures++
      }
      
      // Log progress every 100 records
      if ((i + 1) % CONFIG.PROGRESS_LOG_INTERVAL === 0) {
        logger.info(
          `Progress: ${i + 1}/${recordsToMigrate.length} records processed ` +
          `(${Math.round(((i + 1) / recordsToMigrate.length) * 100)}%)`
        )
      }
    } catch (error) {
      await session.abortTransaction()
      metrics.transactionFailures++
      
      logger.error(
        {
          signature: record.signature,
          error: error.message,
          stack: error.stack,
        },
        'Transaction failed'
      )
    } finally {
      session.endSession()
    }
  }
  
  logger.info(`✅ MIGRATION COMPLETE`)
}

/**
 * Task 9.6: Migration observability metrics
 * 
 * Logs comprehensive metrics:
 * - migration_records_processed
 * - migration_records_skipped (with reasons)
 * - migration_transaction_failures
 * - Progress logged every 100 records
 */
function logMigrationMetrics() {
  logger.info('\n📊 MIGRATION METRICS:')
  logger.info(`Records found: ${metrics.recordsFound}`)
  logger.info(`Records processed: ${metrics.recordsProcessed}`)
  logger.info(`Records skipped: ${metrics.recordsSkipped}`)
  logger.info(`  - Already migrated: ${metrics.skipReasons.alreadyMigrated}`)
  logger.info(`  - Missing data: ${metrics.skipReasons.missingData}`)
  logger.info(`  - Invalid data: ${metrics.skipReasons.invalidData}`)
  logger.info(`Records created: ${metrics.recordsCreated}`)
  logger.info(`Records deleted: ${metrics.recordsDeleted}`)
  logger.info(`Transaction failures: ${metrics.transactionFailures}`)
  
  const successRate = metrics.recordsFound > 0
    ? ((metrics.recordsProcessed / metrics.recordsFound) * 100).toFixed(2)
    : 0
  
  logger.info(`Success rate: ${successRate}%`)
}

/**
 * Main execution
 */
async function main() {
  try {
    logger.info('🚀 Split Swap Historical Data Migration')
    logger.info(`Mode: ${CONFIG.DRY_RUN ? 'DRY RUN' : CONFIG.ROLLBACK ? 'ROLLBACK' : 'LIVE MIGRATION'}`)
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI)
    logger.info('✅ Connected to MongoDB')
    
    if (CONFIG.ROLLBACK) {
      // Rollback mode
      await rollbackMigration()
    } else {
      // Migration mode
      const recordsToMigrate = await identifyRecordsToMigrate()
      
      if (recordsToMigrate.length === 0) {
        logger.info('✅ No records to migrate!')
        return
      }
      
      if (CONFIG.DRY_RUN) {
        // Dry-run mode
        await runDryRun(recordsToMigrate)
      } else {
        // Live migration
        const backupPath = await createBackup(recordsToMigrate)
        logger.info(`Backup created at: ${backupPath}`)
        
        await runMigration(recordsToMigrate)
        
        logMigrationMetrics()
      }
    }
    
    logger.info('✅ Script complete')
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Migration failed')
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    logger.info('✅ Disconnected from MongoDB')
  }
}

// Run migration
main()
